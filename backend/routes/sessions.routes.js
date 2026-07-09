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
const { createNotification } = require('../utils/notify');

// mergeParams lets this router read :unitId from the parent route in server.js
const router = express.Router({ mergeParams: true });

// Confirms the given unit belongs to the logged-in coordinator.
const getOwnedUnitId = async (unitId, coordinatorId) => {
  const result = await pool.query(
    'SELECT id FROM units WHERE id = $1 AND unit_coordinator_id = $2',
    [unitId, coordinatorId]
  );
  return result.rows[0]?.id || null;
};

const isScheduleLocked = async (unitId) => {
  const result = await pool.query('SELECT schedule_locked FROM units WHERE id = $1', [unitId]);
  return result.rows[0]?.schedule_locked || false;
};

const formatSessionRow = (s) => ({
  id: s.id,
  day: s.day,
  startTime: s.start_time,
  endTime: s.end_time,
  location: s.location,
  campus: s.campus,
  sessionType: s.session_type,
  capacity: s.capacity,
  status: s.status,
  staffNote: s.staff_note,
  isAssigned: s.is_assigned,
  assignedTutorId: s.assigned_tutor_id,
  assignedTutorName: s.assigned_tutor_name || null,
  tutorConfirmed: s.tutor_confirmed,
  tutorRejectReason: s.tutor_reject_reason,
  unitCode: s.unit_code || null
});

// Get all sessions for a unit. Coordinators must own the unit; tutors
// must be linked to it (via availability or an assigned session).
router.get('/', verifyToken, async (req, res) => {
  try {
    const { unitId } = req.params;

    if (req.user.role === 'coordinator') {
      const ownedUnitId = await getOwnedUnitId(unitId, req.user.id);
      if (!ownedUnitId) return res.status(404).json({ error: 'Unit not found' });
    } else if (req.user.role === 'tutor') {
      const linkedResult = await pool.query(
        `
        SELECT 1 WHERE EXISTS (
          SELECT 1 FROM availability WHERE tutor_id = $1 AND unit_id = $2
          UNION
          SELECT 1 FROM sessions WHERE assigned_tutor_id = $1 AND unit_id = $2
        )
        `,
        [req.user.id, unitId]
      );
      if (linkedResult.rows.length === 0) {
        return res.status(403).json({ error: 'You are not linked to this unit' });
      }
    } else {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const result = await pool.query(
      `
      SELECT s.*, u.name as assigned_tutor_name
      FROM sessions s
      LEFT JOIN users u ON s.assigned_tutor_id = u.id
      WHERE s.unit_id = $1
      ORDER BY
        CASE s.day
          WHEN 'MON' THEN 1 WHEN 'TUE' THEN 2 WHEN 'WED' THEN 3
          WHEN 'THU' THEN 4 WHEN 'FRI' THEN 5 WHEN 'SAT' THEN 6 ELSE 7
        END,
        s.start_time
      `,
      [unitId]
    );

    res.json(result.rows.map(formatSessionRow));
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
router.get('/my-assigned', verifyToken, requireRole('tutor'), async (req, res) => {
  try {
    const { unitId } = req.params;

    const result = await pool.query(
      `
      SELECT s.*, un.unit_code
      FROM sessions s
      LEFT JOIN units un ON s.unit_id = un.id
      WHERE s.unit_id = $1 AND s.assigned_tutor_id = $2
      ORDER BY
        CASE s.day
          WHEN 'MON' THEN 1 WHEN 'TUE' THEN 2 WHEN 'WED' THEN 3
          WHEN 'THU' THEN 4 WHEN 'FRI' THEN 5 WHEN 'SAT' THEN 6 ELSE 7
        END,
        s.start_time
      `,
      [unitId, req.user.id]
    );

    res.json(result.rows.map(formatSessionRow));
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

    const { day, startTime, endTime, location, campus, sessionType, capacity, status } = req.body;
    const normalisedDay = normaliseDay(day) || day;

    if (!normalisedDay || !startTime || !endTime) {
      return res.status(400).json({ error: 'Day, start time, and end time are required' });
    }

    const result = await pool.query(
      `
      INSERT INTO sessions
        (unit_id, day, start_time, end_time, location, campus, session_type, capacity, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
      `,
      [
        unitId, normalisedDay, startTime, endTime,
        location || null, campus || null, sessionType || null,
        capacity || null, status || 'Confirmed'
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

    const { day, startTime, endTime, location, campus, sessionType, capacity, status } = req.body;
    const normalisedDay = day ? (normaliseDay(day) || day) : null;

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
        status = COALESCE($8, status)
      WHERE id = $9 AND unit_id = $10
      RETURNING *
      `,
      [normalisedDay, startTime, endTime, location, campus, sessionType, capacity, status, sessionId, unitId]
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

      const result = await client.query(
        `
        INSERT INTO sessions
          (unit_id, day, start_time, end_time, location, campus, session_type, capacity, status, staff_note)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id
        `,
        [
          unitId, normalisedDay, normalisedStart, normalisedEnd,
          row.location || null, row.campus || null, row.sessionType || null,
          row.capacity || null, row.status || 'Confirmed', row.staffNote || null
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

    const tutorsResult = await pool.query(
      `
      SELECT u.id, u.name, u.email, u.maximum_hours, m.priority_tag
      FROM users u
      LEFT JOIN tutor_unit_markers m ON m.tutor_id = u.id AND m.unit_id = $1
      WHERE u.role = 'tutor'
      ORDER BY u.name
      `,
      [unitId]
    );

    const availResult = await pool.query(
      `
      SELECT tutor_id, day, start_time, preference
      FROM availability
      WHERE unit_id = $1 AND is_submitted = TRUE AND day = $2
      `,
      [unitId, session.day]
    );

    const otherSessionsResult = await pool.query(
      `
      SELECT id, day, start_time, end_time, assigned_tutor_id
      FROM sessions
      WHERE unit_id = $1 AND is_assigned = TRUE AND id != $2
      `,
      [unitId, sessionId]
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

      const conflict = otherSessionsResult.rows.some(other =>
        other.assigned_tutor_id === tutor.id &&
        other.day === session.day &&
        timeRangesOverlap(session.start_time, session.end_time, other.start_time, other.end_time)
      );

      const existingHours = otherSessionsResult.rows
        .filter(other => other.assigned_tutor_id === tutor.id)
        .reduce((sum, other) => sum + sessionDurationHours(other.start_time, other.end_time), 0);
      const hoursIfAssigned = existingHours + thisDuration;
      const overMaxHours = tutor.maximum_hours != null && hoursIfAssigned > tutor.maximum_hours;

      const hardBlocked = conflict || overMaxHours;
      const warnings = [];
      if (conflict) warnings.push('Already assigned to an overlapping session');
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
        priorityTag: tutor.priority_tag || 'Standard',
        hoursIfAssigned,
        allPreferred,
        allKnown,
        hardBlocked,
        warnings,
        score
      };
    });

    candidates.sort((a, b) => {
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

    if (tutorId === null) {
      const result = await pool.query(
        `
        UPDATE sessions
        SET assigned_tutor_id = NULL, is_assigned = FALSE, tutor_confirmed = NULL, tutor_reject_reason = NULL
        WHERE id = $1 AND unit_id = $2
        RETURNING *
        `,
        [sessionId, unitId]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Session not found' });
      return res.json(formatSessionRow(result.rows[0]));
    }

    const sessionResult = await pool.query(
      'SELECT * FROM sessions WHERE id = $1 AND unit_id = $2',
      [sessionId, unitId]
    );
    if (sessionResult.rows.length === 0) return res.status(404).json({ error: 'Session not found' });
    const session = sessionResult.rows[0];

    const tutorResult = await pool.query(
      'SELECT id, name, maximum_hours FROM users WHERE id = $1 AND role = $2',
      [tutorId, 'tutor']
    );
    if (tutorResult.rows.length === 0) return res.status(404).json({ error: 'Tutor not found' });
    const tutor = tutorResult.rows[0];

    const otherSessionsResult = await pool.query(
      `
      SELECT id, day, start_time, end_time, assigned_tutor_id
      FROM sessions
      WHERE unit_id = $1 AND is_assigned = TRUE AND id != $2 AND assigned_tutor_id = $3
      `,
      [unitId, sessionId, tutorId]
    );

    const conflict = otherSessionsResult.rows.some(other =>
      other.day === session.day &&
      timeRangesOverlap(session.start_time, session.end_time, other.start_time, other.end_time)
    );
    if (conflict) {
      return res.status(409).json({ error: 'This tutor is already assigned to an overlapping session' });
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

    const result = await pool.query(
      `
      UPDATE sessions
      SET assigned_tutor_id = $1, is_assigned = TRUE, tutor_confirmed = NULL, tutor_reject_reason = NULL
      WHERE id = $2 AND unit_id = $3
      RETURNING *
      `,
      [tutorId, sessionId, unitId]
    );

    const withName = await pool.query(
      `
      SELECT s.*, u.name as assigned_tutor_name
      FROM sessions s
      LEFT JOIN users u ON s.assigned_tutor_id = u.id
      WHERE s.id = $1
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
 * PATCH /units/:unitId/sessions/:sessionId/confirm (tutor only)
 * Body: { confirmed: true } or { confirmed: false, reason: '...' }
 * Refuses if the unit's schedule has been locked/finalised.
 */
router.patch('/:sessionId/confirm', verifyToken, requireRole('tutor'), async (req, res) => {
  try {
    const { unitId, sessionId } = req.params;
    const { confirmed, reason } = req.body;

    if (await isScheduleLocked(unitId)) {
      return res.status(409).json({ error: 'This schedule has been finalised and locked, so it can no longer be changed.' });
    }

    const sessionResult = await pool.query(
      'SELECT * FROM sessions WHERE id = $1 AND unit_id = $2 AND assigned_tutor_id = $3',
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
      UPDATE sessions
      SET tutor_confirmed = $1, tutor_reject_reason = $2
      WHERE id = $3
      RETURNING *
      `,
      [confirmed, confirmed ? null : reason.trim(), sessionId]
    );

    const unitResult = await pool.query('SELECT unit_code, unit_coordinator_id FROM units WHERE id = $1', [unitId]);
    const unit = unitResult.rows[0];

    if (unit) {
      await createNotification({
        userId: unit.unit_coordinator_id,
        type: confirmed ? 'session_confirmed' : 'session_declined',
        title: confirmed ? 'Tutor confirmed a session' : 'Tutor declined a session',
        content: confirmed
          ? `${req.user.email} confirmed their ${session.day} session in ${unit.unit_code}.`
          : `${req.user.email} declined their ${session.day} session in ${unit.unit_code}: "${reason.trim()}"`,
        unitId,
        sessionId,
        actionUrl: `/schedule-builder/${unitId}`
      });
    }

    res.json(formatSessionRow(result.rows[0]));
  } catch (error) {
    console.error('Error confirming session:', error);
    res.status(500).json({ error: 'Failed to update session confirmation' });
  }
});

module.exports = router;