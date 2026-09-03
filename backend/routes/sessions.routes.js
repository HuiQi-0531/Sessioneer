const express = require('express');
const pool = require('../db');
const { verifyToken, requireRole } = require('../middleware/auth');
const {
  normaliseDay,
  normaliseTime,
  getHourlySlotsInRange,
  sessionDurationHours,
  timeRangesOverlap,
  timeToSlot
} = require('../utils/normalise');
const { createNotification, getUserDisplayName } = require('../utils/notify');
const { getCoordinatorUnitId } = require('../utils/unitAccess');
const { TUTOR_LIKE_ROLES, requiresSuperTutor } = require('../utils/roles');

// Same suggestion rule as the frontend (ScheduleBuilder.jsx): every 30
// students triggers one more suggested tutor. Used as a fallback whenever a
// caller doesn't explicitly set required_tutors, instead of silently
// defaulting to 1 regardless of capacity.
const STUDENTS_PER_TUTOR = 30;
const suggestedTutorCount = (capacity) => Math.floor((capacity || 0) / STUDENTS_PER_TUTOR) + 1;

// Session code prefix per type - e.g. Tutorial sessions get TUT01, TUT02...
// Falls back to 'SES' for any type not in this list (custom/unlisted types).
const CODE_PREFIXES = {
  Tutorial: 'TUT',
  Consultation: 'CON',
  Practical: 'PRC',
  Lecture: 'LEC',
  Workshop: 'WOR'
};
const codePrefixForType = (sessionType) => CODE_PREFIXES[sessionType] || 'SES';

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
  let maxNum = 0;
  result.rows.forEach(r => {
    const match = String(r.session_code || '').match(new RegExp(`^${prefix}(\\d+)$`));
    if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
  });
  const nextNum = maxNum + 1;
  return `${prefix}${String(nextNum).padStart(2, '0')}`;
};

// mergeParams lets this router read :unitId from the parent route in server.js
const router = express.Router({ mergeParams: true });

const isBlank = (value) => value === undefined || value === null || String(value).trim() === '';

const getMissingSessionFields = (session) => {
  const requiredFields = [
    ['day', 'Day'],
    ['startTime', 'Start time'],
    ['endTime', 'End time'],
    ['location', 'Location'],
    ['campus', 'Campus'],
    ['sessionType', 'Type'],
    ['capacity', 'Capacity'],
    ['requiredTutors', 'Tutor'],
    ['status', 'Status']
  ];

  return requiredFields
    .filter(([field]) => isBlank(session[field]))
    .map(([, label]) => label);
};

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

const formatSessionRow = (s) => {
  const allTutors = s.tutors || [];
  // A declined tutor (confirmed === false) doesn't count as filling the
  // slot — the session should reappear as needing reassignment. Pending
  // (confirmed === null) and confirmed (confirmed === true) tutors do.
  const activeTutors = allTutors.filter(t => t.confirmed !== false);
  const declinedTutors = allTutors.filter(t => t.confirmed === false);

  return {
    id: s.id,
    sessionCode: s.session_code || null,
    day: s.day,
    startTime: s.start_time,
    endTime: s.end_time,
    location: s.location,
    campus: s.campus,
    sessionType: s.session_type,
    capacity: s.capacity,
    requiredTutors: s.required_tutors,
    status: s.status,
    staffNote: s.staff_note,
    tutors: activeTutors,
    declinedTutors,
    isAssigned: activeTutors.length > 0,
    // Legacy fields kept for any frontend code not yet updated to use `tutors[]`.
    // Reflects the first active (non-declined) tutor, if any.
    assignedTutorId: activeTutors[0]?.tutorId || null,
    assignedTutorName: activeTutors[0]?.tutorName || null,
    tutorConfirmed: activeTutors[0]?.confirmed ?? null,
    tutorRejectReason: activeTutors[0]?.rejectReason || null,
    unitCode: s.unit_code || null
  };
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

const countWeekdayOccurrences = (day, startDate, endDate) => {
  const WEEKDAY_INDEX = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };
  const targetIdx = WEEKDAY_INDEX[String(day).toUpperCase()];
  if (targetIdx === undefined || !startDate || !endDate) return 0;
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return 0;
  const cursor = new Date(start);
  cursor.setDate(cursor.getDate() + ((targetIdx - cursor.getDay() + 7) % 7));
  let count = 0;
  while (cursor <= end) {
    count++;
    cursor.setDate(cursor.getDate() + 7);
  }
  return count;
};

const formatCoveringSessionRow = (s) => ({
  ...formatSessionRow(s),
  isCovering: true,
  coverStartDate: s.cover_start_date,
  coverEndDate: s.cover_end_date,
  coverOccurrenceCount: countWeekdayOccurrences(s.day, s.cover_start_date, s.cover_end_date)
});

// Get all sessions for a unit. Coordinators must own the unit; tutors
// must be linked to it (via availability or an assigned session).
router.get('/', verifyToken, async (req, res) => {
  try {
    const { unitId } = req.params;

    if (req.user.role === 'coordinator') {
      const ownedUnitId = await getOwnedUnitId(unitId, req.user.id);
      if (!ownedUnitId) return res.status(404).json({ error: 'Unit not found' });
    } else {
      const isLinkedTutor = await isTutorLinkedToUnit(req.user.id, unitId);
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
        ) AS tutors
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
    if (req.user.role !== 'coordinator') {
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
 * ones still awaiting their confirmation.
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
        SELECT session_id FROM session_tutors WHERE tutor_id = $2 AND tutor_confirmed IS DISTINCT FROM false
      )
      GROUP BY s.id, un.unit_code      ORDER BY
        CASE s.day
          WHEN 'MON' THEN 1 WHEN 'TUE' THEN 2 WHEN 'WED' THEN 3
          WHEN 'THU' THEN 4 WHEN 'FRI' THEN 5 WHEN 'SAT' THEN 6 ELSE 7
        END,
        s.start_time
      `,
      [unitId, req.user.id]
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

    const missingFields = getMissingSessionFields({ day: normalisedDay, startTime, endTime, location, campus, sessionType, capacity, requiredTutors, status });
    if (missingFields.length > 0) {
      return res.status(400).json({ error: `Please fill in all fields before saving: ${missingFields.join(', ')}` });
    }

    const capacityNumber = parseInt(capacity, 10);
    const requiredTutorsNumber = parseInt(requiredTutors, 10);

    if (Number.isNaN(capacityNumber) || capacityNumber < 1) {
      return res.status(400).json({ error: 'Capacity must be at least 1' });
    }

    if (Number.isNaN(requiredTutorsNumber) || requiredTutorsNumber < 1) {
      return res.status(400).json({ error: 'Tutor must be at least 1' });
    }

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

    const { day, startTime, endTime, location, campus, sessionType, capacity, requiredTutors, status } = req.body;    const normalisedDay = day ? (normaliseDay(day) || day) : null;
    
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

    await client.query('BEGIN');

    if (replace) {
      await client.query('DELETE FROM sessions WHERE unit_id = $1', [unitId]);
    }

    const imported = [];
    const skipped = [];

    for (let i = 0; i < sessions.length; i++) {
      const row = sessions[i];
      const normalisedDay = normaliseDay(row.day);
      const normalisedStart = normaliseTime(row.startTime);
      const normalisedEnd = normaliseTime(row.endTime);

      if (!normalisedDay || !normalisedStart || !normalisedEnd) {
        skipped.push({ rowIndex: i, reason: 'Could not read day or time', row });
        continue;
      }

      const sessionCode = row.sessionCode
        ? String(row.sessionCode).trim().toUpperCase()
        : await generateNextSessionCode(client, unitId, row.sessionType);

      const result = await client.query(
        `
        INSERT INTO sessions
          (unit_id, day, start_time, end_time, location, campus, session_type, capacity, required_tutors, status, staff_note, session_code)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id
        `,
        [
          unitId, normalisedDay, normalisedStart, normalisedEnd,
          row.location || null, row.campus || null, row.sessionType || null,
          row.capacity || null, row.requiredTutors || suggestedTutorCount(row.capacity), row.status || 'Confirmed', row.staffNote || null, sessionCode
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
      SELECT u.id, TRIM(CONCAT(u.name, ' ', COALESCE(u.last_name, ''))) AS name, u.email, u.maximum_hours, um.role AS membership_role, m.priority_tag, m.starred, m.flagged
      FROM users u
      JOIN unit_memberships um
        ON um.user_id = u.id AND um.unit_id = $1 AND um.role = ANY($2)
      LEFT JOIN tutor_unit_markers m ON m.tutor_id = u.id AND m.unit_id = $1
      ORDER BY name
      `,
      [unitId, TUTOR_LIKE_ROLES]
    );

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

    const candidates = tutorsResult.rows.map(tutor => {
      const tutorAvail = availResult.rows.filter(a => a.tutor_id === tutor.id);
      const slotPreferences = coveredSlots.map(slot => {
        const match = tutorAvail.find(a => timeToSlot(a.start_time) === slot);
        return match ? match.preference : null;
      });

      const hasAnyAvailabilityData = tutorAvail.length > 0;
      const hasAvoid = slotPreferences.includes('avoid');
      const allPreferred = slotPreferences.length > 0 && slotPreferences.every(p => p === 'preferred');
      const allKnown = slotPreferences.every(p => p !== null);

            const overlappingSessions = otherSessionsResult.rows.filter(other =>
        other.tutor_id === tutor.id &&
        other.day === session.day &&
        timeRangesOverlap(session.start_time, session.end_time, other.start_time, other.end_time)
      );
      const conflict = overlappingSessions.length > 0;
      // A conflict where the OTHER assignment is still pending (not yet
      // confirmed by the tutor) gets a distinct "tentative" warning, since
      // it may resolve itself if the tutor declines that other session.
      const tentativeConflict = overlappingSessions.some(other => other.tutor_confirmed === null);
      const confirmedConflict = overlappingSessions.some(other => other.tutor_confirmed === true);
      const conflictUnitCodes = [...new Set(overlappingSessions.map(other => other.unit_code))];

      const existingHours = otherSessionsResult.rows
        .filter(other => other.tutor_id === tutor.id)
        .reduce((sum, other) => sum + sessionDurationHours(other.start_time, other.end_time), 0);
      const hoursIfAssigned = existingHours + thisDuration;
      const overMaxHours = tutor.maximum_hours != null && hoursIfAssigned > tutor.maximum_hours;

      const isSuperTutor = tutor.membership_role === 'super_tutor';
      const notEligibleForType = sessionNeedsSuperTutor && !isSuperTutor;

      const hardBlocked = conflict || overMaxHours || notEligibleForType;
      const warnings = [];
      if (notEligibleForType) warnings.push(`Only Super Tutors can be assigned to ${session.session_type} sessions`);
      if (confirmedConflict) {
        warnings.push(`Already confirmed on an overlapping session in ${conflictUnitCodes.join(', ')}`);
      } else if (tentativeConflict) {
        warnings.push(`Tentatively assigned to an overlapping session in ${conflictUnitCodes.join(', ')} — awaiting their confirmation`);
      }
      if (overMaxHours) warnings.push(`Would exceed max hours (${hoursIfAssigned}/${tutor.maximum_hours} hrs)`);
      if (hasAvoid) warnings.push('Marked "avoid" for this time');
      if (!hasAnyAvailabilityData) warnings.push('No availability submitted');
      if ((tutor.priority_tag || 'Standard') === 'Risk') warnings.push('Flagged as risk');

      let availabilityScore = 0;
      slotPreferences.forEach(p => {
        if (p === 'preferred') availabilityScore += 2;
        else if (p === 'available') availabilityScore += 1;
        else if (p === 'avoid') availabilityScore -= 2;
      });

      const priorityBonus = {
        Preferred: 2, Standard: 0, Backup: -1, Risk: -1
      }[tutor.priority_tag || 'Standard'] || 0;

      const score = availabilityScore + priorityBonus;

            return {
        id: tutor.id,
        name: tutor.name,
        email: tutor.email,
        maximumHours: tutor.maximum_hours,
        isSuperTutor,
        priorityTag: tutor.priority_tag || 'Standard',
        starred: tutor.starred || false,
        flagged: tutor.flagged || false,
        hoursIfAssigned,
        allPreferred,
        allKnown,
        hardBlocked,
        tentativeConflict,
        warnings,
        isAssignedToThisSession: currentTutorIds.has(tutor.id),
        score
      };
    });

    candidates.sort((a, b) => {
        if (a.isAssignedToThisSession !== b.isAssignedToThisSession) return a.isAssignedToThisSession ? -1 : 1;
      if (a.hardBlocked !== b.hardBlocked) return a.hardBlocked ? 1 : -1;
      return b.score - a.score;
    });

    res.json({
      session: formatSessionRow({ ...session, assigned_tutor_name: null }),
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
    const activeExistingTutors = existingTutorsResult.rows.filter(r => r.tutor_confirmed !== false);

    if (activeExistingTutors.some(r => r.tutor_id === tutorId)) {
      return res.status(409).json({ error: 'This tutor is already assigned to this session' });
    }
    const requiredTutors = session.required_tutors || 1;
    if (activeExistingTutors.length >= requiredTutors) {
      return res.status(409).json({ error: `This session already has its required ${requiredTutors} tutor(s) assigned` });
    }

    const tutorResult = await pool.query(
      `
      SELECT u.id, TRIM(CONCAT(u.name, ' ', COALESCE(u.last_name, ''))) AS name, u.maximum_hours,
             bool_or(um.role = 'super_tutor') AS is_super_tutor
      FROM users u
      LEFT JOIN unit_memberships um
        ON um.user_id = u.id AND um.unit_id = $2 AND um.role = ANY($3)
      WHERE u.id = $1 AND (u.role = 'tutor' OR um.id IS NOT NULL)
      GROUP BY u.id, u.name, u.last_name, u.maximum_hours
      `,
      [tutorId, unitId, TUTOR_LIKE_ROLES]
    );
    if (tutorResult.rows.length === 0) return res.status(404).json({ error: 'Tutor not found' });
    const tutor = tutorResult.rows[0];

    if (requiresSuperTutor(session.session_type) && !tutor.is_super_tutor) {
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

    const conflictingSession = otherSessionsResult.rows.find(other =>
      other.day === session.day &&
      timeRangesOverlap(session.start_time, session.end_time, other.start_time, other.end_time)
    );
    if (conflictingSession) {
      return res.status(409).json({
        error: `This tutor is already assigned to an overlapping session in ${conflictingSession.unit_code}`
      });
    }

    const thisDuration = sessionDurationHours(session.start_time, session.end_time);
    const existingHours = otherSessionsResult.rows
      .reduce((sum, other) => sum + sessionDurationHours(other.start_time, other.end_time), 0);
    const hoursIfAssigned = existingHours + thisDuration;

    if (tutor.maximum_hours != null && hoursIfAssigned > tutor.maximum_hours) {
      return res.status(409).json({
        error: `Assigning this tutor would exceed their max hours (${hoursIfAssigned}/${tutor.maximum_hours} hrs)`
      });
    }

    await pool.query(
      `
      INSERT INTO session_tutors (session_id, tutor_id, tutor_confirmed, tutor_reject_reason)
      VALUES ($1, $2, NULL, NULL)
      ON CONFLICT (session_id, tutor_id)
      DO UPDATE SET tutor_confirmed = NULL, tutor_reject_reason = NULL
      `,
      [sessionId, tutorId]
    );

    await pool.query(
      `
      INSERT INTO unit_memberships (unit_id, user_id, role)
      VALUES ($1, $2, 'tutor')
      ON CONFLICT (unit_id, user_id, role) DO NOTHING
      `,
      [unitId, tutorId]
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
        ) AS tutors
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
      title: 'New session assignment',
      content: `You've been assigned to a ${session.day} session in ${unitCode}. Please confirm or decline it.`,
      unitId,
      sessionId,
      actionUrl: `/tutor-schedule/${unitId}`
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
        ) AS tutors
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
      SELECT s.* FROM sessions s
      JOIN session_tutors st ON st.session_id = s.id
      WHERE s.id = $1 AND s.unit_id = $2 AND st.tutor_id = $3
      `,
      [sessionId, unitId, req.user.id]
    );
    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found or not assigned to you' });
    }
    const session = sessionResult.rows[0];

    if (confirmed === false && (!reason || !reason.trim())) {
      return res.status(400).json({ error: 'Please provide a reason for declining' });
    }

    const result = await pool.query(
      `
      UPDATE session_tutors
      SET tutor_confirmed = $1, tutor_reject_reason = $2
      WHERE session_id = $3 AND tutor_id = $4
      RETURNING *
      `,
      [confirmed, confirmed ? null : reason.trim(), sessionId, req.user.id]
    );

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
        ) AS tutors
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