const express = require('express');
const pool = require('../db');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Helper: convert TIME string "08:00:00" back to "8am"
const timeToSlot = (timeStr) => {
  const [h] = timeStr.split(':');
  const hour = parseInt(h);
  if (hour === 0) return '12am';
  if (hour < 12) return `${hour}am`;
  if (hour === 12) return '12pm';
  return `${hour - 12}pm`;
};

// Normalises day "Monday" -> "MON" for the availability slot key format
const AVAILABILITY_DAY_MAP = {
  Monday: 'MON', Tuesday: 'TUE', Wednesday: 'WED', Thursday: 'THU', Friday: 'FRI',
  MON: 'MON', TUE: 'TUE', WED: 'WED', THU: 'THU', FRI: 'FRI',
};

// True if the unit's availability window is closed, either because a
// coordinator locked it manually or because the deadline has passed.
const isAvailabilityLocked = (unit) => {
  if (unit.availability_locked) return true;
  if (unit.availability_deadline && new Date() > new Date(unit.availability_deadline)) return true;
  return false;
};

const getUnitForAvailability = async (unitCode) => {
  const result = await pool.query(
    'SELECT id, unit_coordinator_id FROM units WHERE unit_code = $1 LIMIT 1',
    [unitCode || 'FIT3077']
  );
  return result.rows[0] || null;
};

const isTutorLinkedToUnit = async (tutorId, unitId) => {
  const result = await pool.query(
    `
    SELECT 1 WHERE EXISTS (
      SELECT 1 FROM availability WHERE tutor_id = $1 AND unit_id = $2
      UNION
      SELECT 1 FROM sessions WHERE assigned_tutor_id = $1 AND unit_id = $2
    )
    `,
    [tutorId, unitId]
  );
  return result.rows.length > 0;
};

/**
 * GET /availability?unitCode=FIT3077
 * UC page uses this to get all tutors, their submission status,
 * and their submitted availability slots.
 */
router.get('/', verifyToken, async (req, res) => {
  try {
    const { unitCode } = req.query;

    const unit = await getUnitForAvailability(unitCode);
    if (!unit) return res.status(404).json({ error: 'Unit not found' });
    const unit_id = unit.id;

    const isCoordinatorOwner = req.user.role === 'coordinator' && unit.unit_coordinator_id === req.user.id;
    const isLinkedTutor = req.user.role === 'tutor' && await isTutorLinkedToUnit(req.user.id, unit_id);

    if (!isCoordinatorOwner && !isLinkedTutor) {
      return res.status(403).json({ error: 'You do not have access to this unit availability' });
    }

    const tutorParams = isCoordinatorOwner ? [] : [req.user.id];
    const tutorWhere = isCoordinatorOwner ? '' : 'AND id = $1';

    const tutorResult = await pool.query(
      `SELECT id, name FROM users WHERE role = 'tutor' ${tutorWhere} ORDER BY name`,
      tutorParams
    );
    const tutors = tutorResult.rows.map(t => ({ id: t.id, name: t.name, icon: null }));
    const visibleTutorIds = new Set(tutors.map(t => t.id));

    const submittedResult = await pool.query(
      'SELECT DISTINCT tutor_id FROM availability WHERE unit_id = $1 AND is_submitted = TRUE',
      [unit_id]
    );
    const submittedIds = new Set(
      submittedResult.rows
        .map(r => r.tutor_id)
        .filter(id => visibleTutorIds.has(id))
    );

    const submissionStatus = tutors.map(t => ({
      tutorId: t.id,
      submitted: submittedIds.has(t.id),
    }));

    const availResult = await pool.query(
      'SELECT tutor_id, day, start_time, preference FROM availability WHERE unit_id = $1 AND is_submitted = TRUE',
      [unit_id]
    );

    const availability = { MON: {}, TUE: {}, WED: {}, THU: {}, FRI: {} };
    for (const row of availResult.rows) {
      if (!visibleTutorIds.has(row.tutor_id)) continue;
      const day = AVAILABILITY_DAY_MAP[row.day];
      if (!day) continue;
      const slot = timeToSlot(row.start_time);
      if (!availability[day][row.tutor_id]) availability[day][row.tutor_id] = {};
      availability[day][row.tutor_id][slot] = row.preference;
    }

    res.json({ tutors, submissionStatus, availability });
  } catch (error) {
    console.error('Error fetching availability:', error);
    res.status(500).json({ error: 'Failed to fetch availability' });
  }
});

/**
 * POST /availability/submit (tutor only)
 * Body: { unitCode, slots: { "Monday-8:00am": "preferred", ... } }
 * Uses the logged-in tutor's own identity, not a client-supplied email.
 * Refuses if the unit's availability window is locked or past its deadline.
 */
router.post('/submit', verifyToken, requireRole('tutor'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { unitCode, slots } = req.body;
    if (!unitCode || !slots) {
      return res.status(400).json({ error: 'unitCode and slots are required' });
    }

    const tutor_id = req.user.id;

    const unitResult = await client.query(
      'SELECT id, availability_locked, availability_deadline FROM units WHERE unit_code = $1 LIMIT 1',
      [unitCode]
    );
    if (!unitResult.rows.length) return res.status(404).json({ error: 'Unit not found' });
    const unit = unitResult.rows[0];
    const unit_id = unit.id;

    if (isAvailabilityLocked(unit)) {
      return res.status(409).json({ error: 'Availability submissions are closed for this unit.' });
    }

    await client.query('BEGIN');

    await client.query(
      'DELETE FROM availability WHERE tutor_id = $1 AND unit_id = $2',
      [tutor_id, unit_id]
    );

    for (const [key, preference] of Object.entries(slots)) {
      const dashIdx = key.indexOf('-');
      if (dashIdx === -1) continue;
      const dayRaw = key.slice(0, dashIdx);
      const timeRaw = key.slice(dashIdx + 1);

      const day = AVAILABILITY_DAY_MAP[dayRaw];
      if (!day) continue;
      if (!['preferred', 'available', 'avoid'].includes(preference)) continue;

      const timeMatch = timeRaw.match(/^(\d+):(\d+)(am|pm)$/);
      if (!timeMatch) continue;
      let hour = parseInt(timeMatch[1]);
      const period = timeMatch[3];
      if (period === 'pm' && hour !== 12) hour += 12;
      if (period === 'am' && hour === 12) hour = 0;
      const startTime = `${String(hour).padStart(2, '0')}:00:00`;
      const endTime = `${String(hour + 1).padStart(2, '0')}:00:00`;

      await client.query(`
        INSERT INTO availability (tutor_id, unit_id, day, start_time, end_time, preference, is_submitted, submitted_at)
        VALUES ($1, $2, $3, $4, $5, $6, TRUE, NOW())
      `, [tutor_id, unit_id, day, startTime, endTime, preference]);
    }

    await client.query('COMMIT');
    console.log(`Availability submitted: ${req.user.email} for ${unitCode}`);
    res.status(201).json({ success: true, message: 'Availability submitted successfully' });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error submitting availability:', error);
    res.status(500).json({ error: 'Failed to submit availability' });
  } finally {
    client.release();
  }
});

module.exports = router;
