const express = require('express');
const pool = require('../db');
const { verifyToken, requireRole } = require('../middleware/auth');
const {
  normaliseDay,
  getHourlySlotsInRange,
  sessionDurationHours
} = require('../utils/normalise');
const { createNotification, getUserDisplayName } = require('../utils/notify');
const { getCoordinatorUnitId } = require('../utils/unitAccess');
const { TUTOR_LIKE_ROLES, requiresSuperTutor } = require('../utils/roles');
const { scoreCandidate, sortCandidates } = require('../utils/candidateScoring');
const {
  findOverlappingSessions,
  calcHoursIfAssigned,
  exceedsMaxHours,
  violatesSuperTutorRule,
  findEditClash,
  ACTIVE_COVERS_SQL,
  findCoverConflicts,
  describeCoverConflict
} = require('../utils/allocationRules');
const { findAcceptClash, checkSessionEdit } = require('../utils/sessionRules');

const {
  suggestedTutorCount,
  codePrefixForType,
  nextSessionCode,
  validateSessionInput,
  formatSessionRow,
  formatCoveringSessionRow,
  prepareImportRow,
  buildConfirmationUpdate,
  checkAssignSlot
} = require('../utils/sessionRules');

// Finds the next free code for this unit + type, e.g. if TUT01..TUT03 exist,
// returns TUT04. Scans existing codes with this prefix and picks max+1.
const generateNextSessionCode = async (client, unitId, sessionType) => {
  const prefix = codePrefixForType(sessionType);
  const result = await client.query(
    `
    SELECT session_code FROM sessions
    WHERE unit_id = $1 AND session_code LIKE $2
    `,
    [unitId, `${prefix}%`]
  );
  return nextSessionCode(prefix, result.rows.map(r => r.session_code));
};

// mergeParams lets this router read :unitId from the parent route in server.js
const router = express.Router({ mergeParams: true });

const getOwnedUnitId = async (unitId, coordinatorId) => {
  return getCoordinatorUnitId(unitId, coordinatorId);
};

const isScheduleLocked = async (unitId) => {
  const result = await pool.query('SELECT schedule_locked FROM units WHERE id = $1', [unitId]);
  return result.rows[0]?.schedule_locked || false;
};

// A tutor can see the full unit timetable once the UC has released the draft
// (or finalised/locked the schedule, which counts as released too), OR if the
// UC has switched on early access for that specific tutor.
const canTutorViewTimetable = async (unitId, tutorId) => {
  const unitResult = await pool.query(
    'SELECT schedule_locked, draft_released FROM units WHERE id = $1',
    [unitId]
  );
  const unit = unitResult.rows[0];
  if (!unit) return false;
  if (unit.schedule_locked || unit.draft_released) return true;

  const markerResult = await pool.query(
    'SELECT early_access FROM tutor_unit_markers WHERE unit_id = $1 AND tutor_id = $2',
    [unitId, tutorId]
  );
  return markerResult.rows[0]?.early_access || false;
};

const isTutorLinkedToUnit = async (userId, unitId) => {
  const result = await pool.query(
    `
    SELECT 1 WHERE EXISTS (
      SELECT 1 FROM unit_memberships WHERE user_id = $1 AND unit_id = $2 AND role = ANY($3)
      UNION
      SELECT 1 FROM availability WHERE tutor_id = $1 AND unit_id = $2
      UNION
      SELECT 1 FROM session_tutors st JOIN sessions s ON s.id = st.session_id WHERE st.tutor_id = $1 AND s.unit_id = $2
    )
    `,
    [userId, unitId, TUTOR_LIKE_ROLES]
  );
  return result.rows.length > 0;
};

// A tutor's claimed-but-still-active cover requests: covering periods that
// haven't ended yet. These aren't in session_tutors (that table is the
// permanent weekly assignment) - covering is temporary, so it's layered on
// top of the normal session list at read time instead.
const getActiveCoverSessions = async (tutorId) => {
  const result = await pool.query(
    `
    SELECT
      s.*,
      un.unit_code,
      cb.start_date AS cover_start_date,
      cb.end_date AS cover_end_date
    FROM cover_requests cr
    JOIN cover_batches cb ON cb.id = cr.batch_id
    JOIN sessions s ON s.id = cr.session_id
    JOIN units un ON un.id = s.unit_id
    WHERE cr.claimed_by_id = $1
      AND cr.status = 'claimed'
      AND cb.end_date >= CURRENT_DATE
    `,
    [tutorId]
  );
  return result.rows;
};

// Get all sessions for a unit. Coordinators must own the unit; tutors
// must be linked to it (via availability or an assigned session).
router.get('/', verifyToken, async (req, res) => {
  try {
    const { unitId } = req.params;

    const ownedUnitId = await getOwnedUnitId(unitId, req.user.id);
    const hasCoordinatorAccess = Boolean(ownedUnitId);
    const isLinkedTutor = await isTutorLinkedToUnit(req.user.id, unitId);

    if (!hasCoordinatorAccess) {
      if (!isLinkedTutor) {
        return res.status(403).json({ error: 'You are not linked to this unit' });
      }
      const canView = await canTutorViewTimetable(unitId, req.user.id);
     if (!canView) {
       return res.json({ released: false, sessions: [] });
     }
    }

    const result = await pool.query(
      `
      SELECT s.*,
        COALESCE(
          json_agg(
            json_build_object(
              'tutorId', st.tutor_id,
              'tutorName', TRIM(CONCAT(u.name, ' ', COALESCE(u.last_name, ''))),
              'confirmed', st.tutor_confirmed,
              'rejectReason', st.tutor_reject_reason
            )
          ) FILTER (WHERE st.tutor_id IS NOT NULL),
          '[]'
        ) AS tutors,
        (
          SELECT COALESCE(json_agg(json_build_object(
            'coverRequestId', cr.id,
            'claimedById', cr.claimed_by_id,
            'claimedByName', TRIM(CONCAT(cu.name, ' ', COALESCE(cu.last_name, ''))),
            'originalTutorId', cr.original_tutor_id,
            'startDate', cb.start_date,
            'endDate', cb.end_date
          ) ORDER BY cb.start_date), '[]')
          FROM cover_requests cr
          JOIN cover_batches cb ON cb.id = cr.batch_id
          LEFT JOIN users cu ON cu.id = cr.claimed_by_id
          WHERE cr.session_id = s.id AND cr.status = 'claimed' AND cb.end_date >= CURRENT_DATE
        ) AS active_covers
      FROM sessions s
      LEFT JOIN session_tutors st ON st.session_id = s.id
      LEFT JOIN users u ON st.tutor_id = u.id      
      WHERE s.unit_id = $1
        GROUP BY s.id
      ORDER BY
        CASE s.day
          WHEN 'MON' THEN 1 WHEN 'TUE' THEN 2 WHEN 'WED' THEN 3
          WHEN 'THU' THEN 4 WHEN 'FRI' THEN 5 WHEN 'SAT' THEN 6 ELSE 7
        END,
        s.start_time
      `,
      [unitId]
    );

    const assigned = result.rows.map(formatSessionRow);
    if (!hasCoordinatorAccess && isLinkedTutor) {
      const covering = (await getActiveCoverSessions(req.user.id))
        .filter(s => s.unit_id === unitId) // this route is scoped to one unit
        .map(formatCoveringSessionRow);
      return res.json([...assigned, ...covering]);
    }
    res.json(assigned);
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

/**
 * GET /units/:unitId/sessions/my-assigned (tutor only)
 * The logged-in tutor's own assigned sessions in this unit, including
 * ones still awaiting their confirmation. ?includeDeclined=true also returns
 * the ones they declined (My Schedule shows those with the reason).
 */
router.get('/my-assigned', verifyToken, requireRole('tutor', 'coordinator'), async (req, res) => {
  try {
    const { unitId } = req.params;

    const result = await pool.query(
      `
      SELECT s.*, un.unit_code,
        COALESCE(
          json_agg(
            json_build_object(
              'tutorId', st.tutor_id,
              'tutorName', TRIM(CONCAT(u.name, ' ', COALESCE(u.last_name, ''))),
              'confirmed', st.tutor_confirmed,
              'rejectReason', st.tutor_reject_reason
            )
          ) FILTER (WHERE st.tutor_id IS NOT NULL),
          '[]'
        ) AS tutors
      FROM sessions s
      LEFT JOIN units un ON s.unit_id = un.id
      LEFT JOIN session_tutors st ON st.session_id = s.id
      LEFT JOIN users u ON st.tutor_id = u.id
      WHERE s.unit_id = $1 AND s.id IN (
        SELECT session_id FROM session_tutors
        WHERE tutor_id = $2 AND ($3::boolean OR tutor_confirmed IS DISTINCT FROM false)
      )
      GROUP BY s.id, un.unit_code      ORDER BY
        CASE s.day
          WHEN 'MON' THEN 1 WHEN 'TUE' THEN 2 WHEN 'WED' THEN 3
          WHEN 'THU' THEN 4 WHEN 'FRI' THEN 5 WHEN 'SAT' THEN 6 ELSE 7
        END,
        s.start_time
      `,
      [unitId, req.user.id, req.query.includeDeclined === 'true']
    );

    const formatted = result.rows.map(formatSessionRow);
    if (req.user.role !== 'coordinator') {
      const covering = (await getActiveCoverSessions(req.user.id))
        .filter(s => s.unit_id === unitId)
        .map(formatCoveringSessionRow);
      return res.json([...formatted, ...covering]);
    }
    res.json(formatted);
  } catch (error) {
    console.error('Error fetching assigned sessions:', error);
    res.status(500).json({ error: 'Failed to fetch assigned sessions' });
  }
});

// Manually add a single session
router.post('/', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const { unitId } = req.params;
    const ownedUnitId = await getOwnedUnitId(unitId, req.user.id);
    if (!ownedUnitId) return res.status(404).json({ error: 'Unit not found' });

    const { day, startTime, endTime, location, campus, sessionType, capacity, requiredTutors, status } = req.body;
    const requestedCode = req.body.sessionCode ? String(req.body.sessionCode).trim().toUpperCase() : null;
    const normalisedDay = normaliseDay(day) || day;

    const validation = validateSessionInput({ day: normalisedDay, startTime, endTime, location, campus, sessionType, capacity, requiredTutors, status });
    if (validation.error) {
      return res.status(400).json({ error: validation.error });
    }
    const { capacityNumber, requiredTutorsNumber } = validation;
    

    let sessionCode = requestedCode;
    if (sessionCode) {
      const dupeCheck = await pool.query(
        'SELECT id FROM sessions WHERE unit_id = $1 AND session_code = $2',
        [unitId, sessionCode]
      );
      if (dupeCheck.rows.length > 0) {
        return res.status(409).json({ error: `Session code "${sessionCode}" is already used in this unit. Please choose another.` });
      }
    } else {
      sessionCode = await generateNextSessionCode(pool, unitId, sessionType);
    }

    const result = await pool.query(
      `
      INSERT INTO sessions
          (unit_id, day, start_time, end_time, location, campus, session_type, capacity, required_tutors, status, session_code)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
      `,
      [
        unitId, normalisedDay, startTime, endTime,
        location.trim(), campus, sessionType,
        capacityNumber, requiredTutorsNumber, status, sessionCode
      ]
    );

    res.status(201).json(formatSessionRow(result.rows[0]));
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// Update a single session
router.put('/:sessionId', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const { unitId, sessionId } = req.params;
    const ownedUnitId = await getOwnedUnitId(unitId, req.user.id);
    if (!ownedUnitId) return res.status(404).json({ error: 'Unit not found' });

    if (await isScheduleLocked(unitId)) {
      return res.status(409).json({ error: 'This schedule has been finalised and locked. Unlock it first to make changes.' });
    }

    const { day, startTime, endTime, location, campus, sessionType, capacity, requiredTutors, status } = req.body;
    const normalisedDay = day ? (normaliseDay(day) || day) : null;

    const currentResult = await pool.query(
      `
      SELECT s.*,
        COUNT(st.id) FILTER (WHERE st.tutor_confirmed IS DISTINCT FROM FALSE)::int AS assigned_count
      FROM sessions s
      LEFT JOIN session_tutors st ON st.session_id = s.id
      WHERE s.id = $1 AND s.unit_id = $2
      GROUP BY s.id
      `,
      [sessionId, unitId]
    );
    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const current = currentResult.rows[0];
    const editError = checkSessionEdit(current, {
      day: normalisedDay, startTime, endTime, sessionType, capacity, requiredTutors
    });
    if (editError) {
      return res.status(editError.status).json({ error: editError.error });
    }
    if (current.assigned_count > 0 && sessionType && requiresSuperTutor(sessionType)) {
      // Same rule as assigning: a plain Tutor cannot hold a Lecture/Consultation.
      const ineligible = await pool.query(
        `
        SELECT 1
        FROM session_tutors st
        JOIN units un ON un.id = $2
        WHERE st.session_id = $1
          AND st.tutor_confirmed IS DISTINCT FROM FALSE
          AND st.tutor_id <> un.unit_coordinator_id
          AND NOT EXISTS (
            SELECT 1 FROM unit_memberships um
            WHERE um.unit_id = $2 AND um.user_id = st.tutor_id AND um.role IN ('super_tutor', 'coordinator')
          )
        LIMIT 1
        `,
        [sessionId, unitId]
      );
      if (ineligible.rows.length > 0) {
        return res.status(409).json({ error: 'Unassign Tutors before changing this session to a lecture or consultation' });
      }
    }
    if (current.assigned_count > 0) {
      const clash = await findEditClash(
        pool, sessionId,
        normalisedDay || current.day, startTime || current.start_time, endTime || current.end_time
      );
      if (clash) return res.status(409).json({ error: clash });
    }

    let sessionCode = undefined;
    if (req.body.sessionCode !== undefined) {
      sessionCode = req.body.sessionCode ? String(req.body.sessionCode).trim().toUpperCase() : null;
      if (sessionCode) {
        const dupeCheck = await pool.query(
          'SELECT id FROM sessions WHERE unit_id = $1 AND session_code = $2 AND id != $3',
          [unitId, sessionCode, sessionId]
        );
        if (dupeCheck.rows.length > 0) {
          return res.status(409).json({ error: `Session code "${sessionCode}" is already used in this unit. Please choose another.` });
        }
      }
    }
    
    const result = await pool.query(
      `
      UPDATE sessions
      SET
        day = COALESCE($1, day),
        start_time = COALESCE($2, start_time),
        end_time = COALESCE($3, end_time),
        location = COALESCE($4, location),
        campus = COALESCE($5, campus),
        session_type = COALESCE($6, session_type),
        capacity = COALESCE($7, capacity),
        required_tutors = COALESCE($8, required_tutors),
        status = COALESCE($9, status),
        session_code = CASE WHEN $10::text IS NOT NULL OR $11::boolean THEN $10 ELSE session_code END
      WHERE id = $12 AND unit_id = $13
      RETURNING *
      `,
      [normalisedDay, startTime, endTime, location, campus, sessionType, capacity, requiredTutors, status, sessionCode, sessionCode !== undefined, sessionId, unitId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json(formatSessionRow(result.rows[0]));
  } catch (error) {
    console.error('Error updating session:', error);
    res.status(500).json({ error: 'Failed to update session' });
  }
});

// Delete a single session
router.delete('/:sessionId', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const { unitId, sessionId } = req.params;
    const ownedUnitId = await getOwnedUnitId(unitId, req.user.id);
    if (!ownedUnitId) return res.status(404).json({ error: 'Unit not found' });

    if (await isScheduleLocked(unitId)) {
      return res.status(409).json({ error: 'This schedule has been finalised and locked. Unlock it first to make changes.' });
    }

    // Tutors who declined (tutor_confirmed = false) no longer hold the session,
    // so only pending or confirmed tutors block deletion.
    const activeTutors = await pool.query(
      'SELECT 1 FROM session_tutors WHERE session_id = $1 AND tutor_confirmed IS DISTINCT FROM false LIMIT 1',
      [sessionId]
    );
    if (activeTutors.rows.length > 0) {
      return res.status(409).json({ error: 'This session has assigned tutors. Remove them before deleting.' });
    }

    const result = await pool.query(
      'DELETE FROM sessions WHERE id = $1 AND unit_id = $2 RETURNING id',
      [sessionId, unitId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({ success: true, message: 'Session deleted successfully' });
  } catch (error) {
    console.error('Error deleting session:', error);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

/**
 * Bulk import sessions from a parsed CSV (mapping already resolved on the frontend).
 */
router.post('/import', verifyToken, requireRole('coordinator'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { unitId } = req.params;
    const ownedUnitId = await getOwnedUnitId(unitId, req.user.id);
    if (!ownedUnitId) return res.status(404).json({ error: 'Unit not found' });

    const { replace, sessions } = req.body;
    if (!Array.isArray(sessions) || sessions.length === 0) {
      return res.status(400).json({ error: 'No sessions provided to import' });
    }

    // Replacing wipes every session in the unit, so apply the same rules as
    // deleting a single session: not while locked, not while tutors hold any.
    if (replace) {
      if (await isScheduleLocked(unitId)) {
        return res.status(409).json({ error: 'This schedule has been finalised and locked. Unlock it first to replace sessions.' });
      }
      const assignedResult = await client.query(
        `SELECT 1 FROM session_tutors st
         JOIN sessions s ON s.id = st.session_id
         WHERE s.unit_id = $1 AND st.tutor_confirmed IS DISTINCT FROM false
         LIMIT 1`,
        [unitId]
      );
      if (assignedResult.rows.length > 0) {
        return res.status(409).json({ error: 'Some sessions in this unit have assigned tutors. Remove them before replacing the timetable.' });
      }
    }

    await client.query('BEGIN');

    if (replace) {
      await client.query('DELETE FROM sessions WHERE unit_id = $1', [unitId]);
    }

    const imported = [];
    const skipped = [];

    for (let i = 0; i < sessions.length; i++) {
      const row = sessions[i];
      const prepared = prepareImportRow(row);

      if (prepared.skipReason) {
        skipped.push({ rowIndex: i, reason: prepared.skipReason, row });
        continue;
      }
      const v = prepared.values;

      const sessionCode = prepared.sessionCode !== null
        ? prepared.sessionCode
        : await generateNextSessionCode(client, unitId, row.sessionType);

      const result = await client.query(
        `
        INSERT INTO sessions
          (unit_id, day, start_time, end_time, location, campus, session_type, capacity, required_tutors, status, staff_note, session_code)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id
        `,
        [
          unitId, v.day, v.startTime, v.endTime,
          v.location, v.campus, v.sessionType,
          v.capacity, v.requiredTutors, v.status, v.staffNote, sessionCode
        ]
      );
      imported.push(result.rows[0].id);
    }

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      importedCount: imported.length,
      skippedCount: skipped.length,
      skipped
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error importing sessions:', error);
    res.status(500).json({ error: 'Failed to import sessions' });
  } finally {
    client.release();
  }
});

/**
 * GET /units/:unitId/sessions/:sessionId/candidates
 * Returns every tutor with a computed suitability ranking for this session.
 */
router.get('/:sessionId/candidates', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const { unitId, sessionId } = req.params;
    const ownedUnitId = await getOwnedUnitId(unitId, req.user.id);
    if (!ownedUnitId) return res.status(404).json({ error: 'Unit not found' });

    const sessionResult = await pool.query(
      'SELECT * FROM sessions WHERE id = $1 AND unit_id = $2',
      [sessionId, unitId]
    );
    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const session = sessionResult.rows[0];
    const coveredSlots = getHourlySlotsInRange(session.start_time, session.end_time);
    const thisDuration = sessionDurationHours(session.start_time, session.end_time);

    const currentTutorsResult = await pool.query(
      'SELECT tutor_id FROM session_tutors WHERE session_id = $1 AND tutor_confirmed IS DISTINCT FROM false',
      [sessionId]
    );
    const currentTutorIds = new Set(currentTutorsResult.rows.map(r => r.tutor_id));

    const tutorsResult = await pool.query(
      `
      WITH tutor_memberships AS (
        SELECT DISTINCT ON (user_id)
          user_id,
          role AS membership_role
        FROM unit_memberships
        WHERE unit_id = $1
          AND role = ANY($2)
        ORDER BY user_id, CASE WHEN role = 'super_tutor' THEN 0 ELSE 1 END
      )
      SELECT u.id, TRIM(CONCAT(u.name, ' ', COALESCE(u.last_name, ''))) AS name, u.email, u.maximum_hours, tm.membership_role, m.priority_tag, m.starred, m.flagged
      FROM users u
      JOIN tutor_memberships tm
        ON tm.user_id = u.id
      LEFT JOIN tutor_unit_markers m ON m.tutor_id = u.id AND m.unit_id = $1
      ORDER BY name
      `,
      [unitId, TUTOR_LIKE_ROLES]
    );

    const coordinatorResult = await pool.query(
      `
      SELECT u.id, TRIM(CONCAT(u.name, ' ', COALESCE(u.last_name, ''))) AS name,
             u.email, u.maximum_hours, 'coordinator' AS membership_role,
             NULL::text AS priority_tag, false AS starred, false AS flagged
      FROM users u
      WHERE u.id = $1
      `,
      [req.user.id]
    );

    const candidateMap = new Map();
    tutorsResult.rows.forEach(tutor => candidateMap.set(tutor.id, tutor));
    if (coordinatorResult.rows[0]) {
      candidateMap.set(coordinatorResult.rows[0].id, coordinatorResult.rows[0]);
    }

    const sessionNeedsSuperTutor = requiresSuperTutor(session.session_type);

    const availResult = await pool.query(
      `
      SELECT tutor_id, day, start_time, preference
      FROM availability
      WHERE unit_id = $1 AND is_submitted = TRUE AND day = $2
      `,
      [unitId, session.day]
    );

        // Cross-unit aware: a tutor pending/confirmed on an overlapping session
    // in ANY unit is a hard block, not just within this unit.
    const otherSessionsResult = await pool.query(
      `
      SELECT s.id, s.day, s.start_time, s.end_time, s.unit_id, st.tutor_id, st.tutor_confirmed, un.unit_code
      FROM sessions s
      JOIN session_tutors st ON st.session_id = s.id
      JOIN units un ON un.id = s.unit_id
      WHERE s.id != $1 AND st.tutor_confirmed IS DISTINCT FROM false
      `,
      [sessionId]
    );

    const activeCoversResult = await pool.query(ACTIVE_COVERS_SQL, [null]);

    const scoringContext = {
      activeCovers: activeCoversResult.rows,
      session,
      coveredSlots,
      thisDuration,
      availRows: availResult.rows,
      otherSessions: otherSessionsResult.rows,
      sessionNeedsSuperTutor,
      currentTutorIds
    };
    const candidates = sortCandidates(
      Array.from(candidateMap.values()).map(tutor => scoreCandidate(tutor, scoringContext))
    );

    res.json({
      session: formatSessionRow(session),
      candidates
    });
  } catch (error) {
    console.error('Error computing candidates:', error);
    res.status(500).json({ error: 'Failed to compute tutor candidates' });
  }
});

/**
 * PATCH /units/:unitId/sessions/:sessionId/assign
 * Body: { tutorId } to assign, or { tutorId: null } to unassign.
 * Refuses if the unit's schedule has been locked/finalised.
 */
router.patch('/:sessionId/assign', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const { unitId, sessionId } = req.params;
    const ownedUnitId = await getOwnedUnitId(unitId, req.user.id);
    if (!ownedUnitId) return res.status(404).json({ error: 'Unit not found' });

    if (await isScheduleLocked(unitId)) {
      return res.status(409).json({ error: 'This schedule has been finalised and locked. Unlock it first to make changes.' });
    }

    const { tutorId } = req.body;

    if (!tutorId) {
      return res.status(400).json({ error: 'tutorId is required' });
    }

    const sessionResult = await pool.query(
      'SELECT * FROM sessions WHERE id = $1 AND unit_id = $2',
      [sessionId, unitId]
    );
    if (sessionResult.rows.length === 0) return res.status(404).json({ error: 'Session not found' });
    const session = sessionResult.rows[0];

        const existingTutorsResult = await pool.query(
      'SELECT tutor_id, tutor_confirmed FROM session_tutors WHERE session_id = $1',
      [sessionId]
    );
    const slotError = checkAssignSlot(existingTutorsResult.rows, tutorId, session.required_tutors);
    if (slotError) {
      return res.status(409).json({ error: slotError });
    }

    const isCoordinatorSelfAssignment = tutorId === req.user.id && Boolean(ownedUnitId);
    const tutorResult = await pool.query(
      `
      SELECT u.id, TRIM(CONCAT(u.name, ' ', COALESCE(u.last_name, ''))) AS name,
             u.email, u.maximum_hours,
             COALESCE(bool_or(um.role = 'super_tutor'), false) AS is_super_tutor
      FROM users u
      LEFT JOIN unit_memberships um
        ON um.user_id = u.id AND um.unit_id = $2 AND um.role = ANY($3)
      WHERE u.id = $1 AND ($4::boolean OR u.role = 'tutor' OR um.id IS NOT NULL)
      GROUP BY u.id, u.name, u.last_name, u.email, u.maximum_hours
      `,
      [tutorId, unitId, TUTOR_LIKE_ROLES, isCoordinatorSelfAssignment]
    );
    if (tutorResult.rows.length === 0) return res.status(404).json({ error: 'Staff member not found' });
    const tutor = tutorResult.rows[0];

    if (violatesSuperTutorRule(session.session_type, tutor.is_super_tutor, isCoordinatorSelfAssignment)) {
      return res.status(409).json({ error: `Only Super Tutors can be assigned to ${session.session_type} sessions` });
    }

    const otherSessionsResult = await pool.query(
      `
      SELECT s.id, s.day, s.start_time, s.end_time, un.unit_code
      FROM sessions s
      JOIN session_tutors st ON st.session_id = s.id
      JOIN units un ON un.id = s.unit_id
      WHERE s.id != $1 AND st.tutor_id = $2 AND st.tutor_confirmed IS DISTINCT FROM false
      `,
      [sessionId, tutorId]
    );

    const [conflictingSession] = findOverlappingSessions(session, otherSessionsResult.rows);
    if (conflictingSession) {
      return res.status(409).json({
        error: `This tutor is already assigned to an overlapping session in ${conflictingSession.unit_code}`
      });
    }

    const coversResult = await pool.query(ACTIVE_COVERS_SQL, [tutorId]);
    const [coverConflict] = findCoverConflicts(session, coversResult.rows);
    if (coverConflict) {
      return res.status(409).json({ error: `This tutor is ${describeCoverConflict(coverConflict).replace(/^C/, "c")}` });
    }

    const hoursIfAssigned = calcHoursIfAssigned(session, otherSessionsResult.rows);
    if (exceedsMaxHours(tutor.maximum_hours, hoursIfAssigned)) {
      return res.status(409).json({
        error: `Assigning this tutor would exceed their max hours (${hoursIfAssigned}/${tutor.maximum_hours} hrs)`
      });
    }

    await pool.query(
      `
      INSERT INTO session_tutors (session_id, tutor_id, tutor_confirmed, tutor_reject_reason)
      VALUES ($1, $2, $3, NULL)
      ON CONFLICT (session_id, tutor_id)
      DO UPDATE SET tutor_confirmed = $3, tutor_reject_reason = NULL
      `,
      [sessionId, tutorId, isCoordinatorSelfAssignment ? true : null]
    );

    if (!isCoordinatorSelfAssignment) {
      await pool.query(
        `
        INSERT INTO unit_memberships (unit_id, user_id, role)
        VALUES ($1, $2, 'tutor')
        ON CONFLICT (unit_id, user_id, role) DO NOTHING
        `,
        [unitId, tutorId]
      );
    }

    const withName = await pool.query(
      `
      SELECT s.*,
        COALESCE(
          json_agg(
            json_build_object(
              'tutorId', st.tutor_id,
              'tutorName', TRIM(CONCAT(u.name, ' ', COALESCE(u.last_name, ''))),
              'confirmed', st.tutor_confirmed,
              'rejectReason', st.tutor_reject_reason
            )
          ) FILTER (WHERE st.tutor_id IS NOT NULL),
          '[]'
        ) AS tutors,
        (
          SELECT COALESCE(json_agg(json_build_object(
            'coverRequestId', cr.id,
            'claimedById', cr.claimed_by_id,
            'claimedByName', TRIM(CONCAT(cu.name, ' ', COALESCE(cu.last_name, ''))),
            'originalTutorId', cr.original_tutor_id,
            'startDate', cb.start_date,
            'endDate', cb.end_date
          ) ORDER BY cb.start_date), '[]')
          FROM cover_requests cr
          JOIN cover_batches cb ON cb.id = cr.batch_id
          LEFT JOIN users cu ON cu.id = cr.claimed_by_id
          WHERE cr.session_id = s.id AND cr.status = 'claimed' AND cb.end_date >= CURRENT_DATE
        ) AS active_covers
      FROM sessions s
      LEFT JOIN session_tutors st ON st.session_id = s.id
      LEFT JOIN users u ON st.tutor_id = u.id
      WHERE s.id = $1
      GROUP BY s.id
      `,
      [sessionId]
    );

    const unitResult = await pool.query('SELECT unit_code FROM units WHERE id = $1', [unitId]);
    const unitCode = unitResult.rows[0]?.unit_code || 'a unit';

    await createNotification({
      userId: tutorId,
      type: 'session_assigned',
      title: isCoordinatorSelfAssignment ? 'Session assigned to you' : 'New session assignment',
      content: isCoordinatorSelfAssignment
        ? `You assigned yourself to a ${session.day} session in ${unitCode}.`
        : `You've been assigned to a ${session.day} session in ${unitCode}. Please confirm or decline it.`,
      unitId,
      sessionId,
      actionUrl: isCoordinatorSelfAssignment ? `/schedule-builder/${unitId}` : `/tutor-schedule/${unitId}`
    });

    res.json(formatSessionRow(withName.rows[0]));
  } catch (error) {
    console.error('Error assigning tutor:', error);
    res.status(500).json({ error: 'Failed to assign tutor' });
  }
});

/**
 * DELETE /units/:unitId/sessions/:sessionId/assign/:tutorId
 * Removes one specific tutor from this session (multi-tutor aware).
 */
router.delete('/:sessionId/assign/:tutorId', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const { unitId, sessionId, tutorId } = req.params;
    const ownedUnitId = await getOwnedUnitId(unitId, req.user.id);
    if (!ownedUnitId) return res.status(404).json({ error: 'Unit not found' });

    // The session must belong to this unit, otherwise a coordinator could
    // remove tutors from another unit's session by putting their own unit in the URL.
    const sessionInUnit = await pool.query(
      'SELECT 1 FROM sessions WHERE id = $1 AND unit_id = $2',
      [sessionId, unitId]
    );
    if (sessionInUnit.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (await isScheduleLocked(unitId)) {
      return res.status(409).json({ error: 'This schedule has been finalised and locked. Unlock it first to make changes.' });
    }

    await pool.query(
      'DELETE FROM session_tutors WHERE session_id = $1 AND tutor_id = $2',
      [sessionId, tutorId]
    );

    const withName = await pool.query(
      `
      SELECT s.*,
        COALESCE(
          json_agg(
            json_build_object(
              'tutorId', st.tutor_id,
              'tutorName', TRIM(CONCAT(u.name, ' ', COALESCE(u.last_name, ''))),
              'confirmed', st.tutor_confirmed,
              'rejectReason', st.tutor_reject_reason
            )
          ) FILTER (WHERE st.tutor_id IS NOT NULL),
          '[]'
        ) AS tutors,
        (
          SELECT COALESCE(json_agg(json_build_object(
            'coverRequestId', cr.id,
            'claimedById', cr.claimed_by_id,
            'claimedByName', TRIM(CONCAT(cu.name, ' ', COALESCE(cu.last_name, ''))),
            'originalTutorId', cr.original_tutor_id,
            'startDate', cb.start_date,
            'endDate', cb.end_date
          ) ORDER BY cb.start_date), '[]')
          FROM cover_requests cr
          JOIN cover_batches cb ON cb.id = cr.batch_id
          LEFT JOIN users cu ON cu.id = cr.claimed_by_id
          WHERE cr.session_id = s.id AND cr.status = 'claimed' AND cb.end_date >= CURRENT_DATE
        ) AS active_covers
      FROM sessions s
      LEFT JOIN session_tutors st ON st.session_id = s.id
      LEFT JOIN users u ON st.tutor_id = u.id
      WHERE s.id = $1
      GROUP BY s.id
      `,
      [sessionId]
    );
    if (withName.rows.length === 0) return res.status(404).json({ error: 'Session not found' });

    res.json(formatSessionRow(withName.rows[0]));
  } catch (error) {
    console.error('Error unassigning tutor:', error);
    res.status(500).json({ error: 'Failed to unassign tutor' });
  }
});

/**
 * PATCH /units/:unitId/sessions/:sessionId/confirm (tutor only)
 * Body: { confirmed: true } or { confirmed: false, reason: '...' }
 * Refuses if the unit's schedule has been locked/finalised.
 */
router.patch('/:sessionId/confirm', verifyToken, requireRole('tutor', 'coordinator'), async (req, res) => {
  try {
    const { unitId, sessionId } = req.params;
    const { confirmed, reason } = req.body;

    if (await isScheduleLocked(unitId)) {
      return res.status(409).json({ error: 'This schedule has been finalised and locked, so it can no longer be changed.' });
    }

    const sessionResult = await pool.query(
      `
      SELECT s.*, st.tutor_confirmed AS my_confirmation FROM sessions s
      JOIN session_tutors st ON st.session_id = s.id
      WHERE s.id = $1 AND s.unit_id = $2 AND st.tutor_id = $3
      `,
      [sessionId, unitId, req.user.id]
    );
    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found or not assigned to you' });
    }
    const session = sessionResult.rows[0];

    const confirmation = buildConfirmationUpdate(confirmed, reason);
    if (confirmation.error) {
      return res.status(400).json({ error: confirmation.error });
    }

    // A declined slot may already have been given to someone else, so a
    // decline is final: the coordinator has to assign the tutor again.
    if (session.my_confirmation === false) {
      return res.status(409).json({ error: 'You already declined this session. Ask the coordinator to assign you again.' });
    }

    // Accepting is the last chance to stop a double booking that slipped in
    // another way (two UCs at the same instant, an admin edit, a claimed
    // cover). A tutor cannot accept a session that overlaps one they have
    // already accepted, or a cover they are currently doing.
    if (confirmation.confirmed) {
      const commitments = await pool.query(
        `
        SELECT s.id AS session_id, s.day, s.start_time, s.end_time, un.unit_code,
               NULL::date AS start_date, NULL::date AS end_date
        FROM session_tutors st
        JOIN sessions s ON s.id = st.session_id
        JOIN units un ON un.id = s.unit_id
        WHERE st.tutor_id = $1 AND st.tutor_confirmed = TRUE AND s.id <> $2
        UNION ALL
        SELECT s.id, s.day, s.start_time, s.end_time, un.unit_code, cb.start_date, cb.end_date
        FROM cover_requests cr
        JOIN cover_batches cb ON cb.id = cr.batch_id
        JOIN sessions s ON s.id = cr.session_id
        JOIN units un ON un.id = s.unit_id
        WHERE cr.claimed_by_id = $1 AND cr.status = 'claimed' AND cb.end_date >= CURRENT_DATE
          AND s.id <> $2
        `,
        [req.user.id, sessionId]
      );
      const clash = findAcceptClash(session, commitments.rows);
      if (clash) {
        return res.status(409).json({ error: clash });
      }
    }

    const result = await pool.query(
      `
      UPDATE session_tutors
      SET tutor_confirmed = $1, tutor_reject_reason = $2
      WHERE session_id = $3 AND tutor_id = $4
      RETURNING *
      `,
      [confirmation.confirmed, confirmation.rejectReason, sessionId, req.user.id]    );

    const unitResult = await pool.query('SELECT unit_code FROM units WHERE id = $1', [unitId]);
    const unit = unitResult.rows[0];
    const coordinatorsResult = await pool.query(
      `
      SELECT unit_coordinator_id as user_id
      FROM units
      WHERE id = $1
      UNION
      SELECT user_id
      FROM unit_memberships
      WHERE unit_id = $1 AND role = 'coordinator'
      `,
      [unitId]
    );

    const tutorDisplayName = await getUserDisplayName(req.user.id);

    if (unit && coordinatorsResult.rows.length > 0) {
      await Promise.all(coordinatorsResult.rows.map(coordinator => createNotification({
        userId: coordinator.user_id,
        type: confirmed ? 'session_confirmed' : 'session_declined',
        title: confirmed ? 'Tutor confirmed a session' : 'Tutor declined a session',
        content: confirmed
          ? `${tutorDisplayName} confirmed their ${session.day} session in ${unit.unit_code}.`
          : `${tutorDisplayName} declined their ${session.day} session in ${unit.unit_code}: "${reason.trim()}"`,
        unitId,
        sessionId,
        actionUrl: `/schedule-builder/${unitId}`
      })));
    }

    const withTutors = await pool.query(
      `
      SELECT s.*,
        COALESCE(
          json_agg(
            json_build_object(
              'tutorId', st.tutor_id,
              'tutorName', TRIM(CONCAT(u.name, ' ', COALESCE(u.last_name, ''))),
              'confirmed', st.tutor_confirmed,
              'rejectReason', st.tutor_reject_reason
            )
          ) FILTER (WHERE st.tutor_id IS NOT NULL),
          '[]'
        ) AS tutors,
        (
          SELECT COALESCE(json_agg(json_build_object(
            'coverRequestId', cr.id,
            'claimedById', cr.claimed_by_id,
            'claimedByName', TRIM(CONCAT(cu.name, ' ', COALESCE(cu.last_name, ''))),
            'originalTutorId', cr.original_tutor_id,
            'startDate', cb.start_date,
            'endDate', cb.end_date
          ) ORDER BY cb.start_date), '[]')
          FROM cover_requests cr
          JOIN cover_batches cb ON cb.id = cr.batch_id
          LEFT JOIN users cu ON cu.id = cr.claimed_by_id
          WHERE cr.session_id = s.id AND cr.status = 'claimed' AND cb.end_date >= CURRENT_DATE
        ) AS active_covers
      FROM sessions s
      LEFT JOIN session_tutors st ON st.session_id = s.id
      LEFT JOIN users u ON st.tutor_id = u.id
      WHERE s.id = $1
      GROUP BY s.id
      `,
      [sessionId]
    );
    res.json(formatSessionRow(withTutors.rows[0]));
  } catch (error) {
    console.error('Error confirming session:', error);
    res.status(500).json({ error: 'Failed to update session confirmation' });
  }
});

module.exports = router;