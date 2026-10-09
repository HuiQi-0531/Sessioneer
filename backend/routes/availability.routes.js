const express = require('express');
const { sameTermUnitIdsSql } = require('../utils/termRules');
const pool = require('../db');
const { verifyToken, requireRole } = require('../middleware/auth');
const {
  getCoordinatorUnitId,
  isTutorLinkedToUnit,
  isUserLinkedToUnit,
  isUnitCoordinatorSql,
  resolveUnitForUser
} = require('../utils/unitAccess');
const {
  parseAvailabilitySlot,
  isAvailabilityLocked,
  buildAvailabilityGrid,
  applyCommittedSessions
} = require('../utils/availabilityRules');
const { checkManualAvailabilityReminder } = require('../utils/reminderRules');
const { sendAvailabilityReminder } = require('../utils/reminders');

// SQL: a manual reminder for this unit ($1) + tutor ($2) was already sent
// today (Brisbane calendar day). sent_at is stored in UTC.
const SENT_TODAY_SQL = `
  SELECT 1 FROM availability_reminders
  WHERE unit_id = $1 AND tutor_id = $2 AND kind = 'manual'
    AND (sent_at AT TIME ZONE 'UTC' AT TIME ZONE 'Australia/Brisbane')::date
        = (NOW() AT TIME ZONE 'Australia/Brisbane')::date
  LIMIT 1
`;

const router = express.Router();

/**
 * GET /availability?unitCode=FIT3077
 * UC page uses this to get all tutors, their submission status,
 * and their submitted availability slots.
 */
router.get('/', verifyToken, async (req, res) => {
  try {
    const { unitCode, unitId } = req.query;
    if (!unitCode && !unitId) {
      return res.status(400).json({ error: 'unitCode or unitId is required' });
    }

    const unit = await resolveUnitForUser({ unitId, unitCode }, req.user.id);
    if (!unit) return res.status(404).json({ error: 'Unit not found' });
    const unit_id = unit.id;

    const hasCoordinatorAccess = req.user.role === 'coordinator'
      && !!(await getCoordinatorUnitId(unit_id, req.user.id));
    const isLinkedTutor = await isTutorLinkedToUnit(req.user.id, unit_id);

    if (!hasCoordinatorAccess && !isLinkedTutor) {
      return res.status(403).json({ error: 'You do not have access to this unit availability' });
    }

    const tutorParams = hasCoordinatorAccess ? [unit_id] : [req.user.id, unit_id];
    // The unit's own coordinators are not shown as tutors here.
    const tutorWhere = hasCoordinatorAccess
      ? `AND NOT ${isUnitCoordinatorSql('u.id', '$1')}`
      : 'AND u.id = $1';
    const membershipUnitParam = hasCoordinatorAccess ? '$1' : '$2';
    const availabilityScope = hasCoordinatorAccess
      ? `tutor_id IN (
          SELECT user_id FROM unit_memberships WHERE unit_id = $1 AND role IN ('tutor', 'super_tutor')
        ) AND unit_id = $2`
      : 'tutor_id = $1 AND unit_id = $2';
    const availabilityParams = hasCoordinatorAccess ? [unit_id, unit_id] : [req.user.id, unit_id];
    const availabilityScopeAliased = hasCoordinatorAccess
      ? `a.tutor_id IN (
          SELECT user_id FROM unit_memberships WHERE unit_id = $1 AND role IN ('tutor', 'super_tutor')
        ) AND a.unit_id = $2`
      : 'a.tutor_id = $1 AND a.unit_id = $2';

    const [tutorResult, submittedResult, availResult] = await Promise.all([
      pool.query(
        `
        SELECT DISTINCT u.id, TRIM(CONCAT(u.name, ' ', COALESCE(u.last_name, ''))) AS name
        FROM users u
        JOIN unit_memberships um
          ON um.user_id = u.id AND um.unit_id = ${membershipUnitParam} AND um.role IN ('tutor', 'super_tutor')
        WHERE 1 = 1 ${tutorWhere}
        ORDER BY name
        `,
        tutorParams
      ),
      pool.query(
        `
        SELECT DISTINCT tutor_id
        FROM availability
        WHERE is_submitted = TRUE AND ${availabilityScope}
        `,
        availabilityParams
      ),
      pool.query(
        `
        WITH latest_submission AS (
          SELECT tutor_id, submitted_at
          FROM (
            SELECT
              tutor_id,
              submitted_at,
              DENSE_RANK() OVER (
                PARTITION BY tutor_id
                ORDER BY submitted_at DESC NULLS LAST
              ) AS submission_rank
            FROM availability
            WHERE is_submitted = TRUE AND ${availabilityScope}
          ) ranked
          WHERE submission_rank = 1
        )
        SELECT a.tutor_id, a.day, a.start_time, a.preference
        FROM availability a
        JOIN latest_submission latest
          ON latest.tutor_id = a.tutor_id
         AND latest.submitted_at IS NOT DISTINCT FROM a.submitted_at
        WHERE a.is_submitted = TRUE AND ${availabilityScopeAliased}
        ORDER BY a.tutor_id, a.day, a.start_time
        `,
        availabilityParams
      ),
    ]);
    const grid = buildAvailabilityGrid(tutorResult.rows, submittedResult.rows, availResult.rows);

    // Sessions these tutors have ACCEPTED in other units show as "avoid".
    const committedResult = await pool.query(
      `
      SELECT st.tutor_id, s.day, s.start_time, s.end_time, un.unit_code
      FROM session_tutors st
      JOIN sessions s ON s.id = st.session_id
      JOIN units un ON un.id = s.unit_id
      WHERE st.tutor_confirmed = TRUE
        AND s.unit_id <> $1
        AND st.tutor_id = ANY($2::uuid[])
        AND s.unit_id IN ${sameTermUnitIdsSql('$1')}
      `,
      [unit_id, grid.tutors.map(t => t.id)]
    );
    const result = applyCommittedSessions(grid, committedResult.rows);

    // Coordinators also see which tutors already got a bell reminder today,
    // so the button stays in its "sent" state after a reload.
    if (hasCoordinatorAccess) {
      const remindedResult = await pool.query(
        `
        SELECT DISTINCT tutor_id FROM availability_reminders
        WHERE unit_id = $1 AND kind = 'manual'
          AND (sent_at AT TIME ZONE 'UTC' AT TIME ZONE 'Australia/Brisbane')::date
              = (NOW() AT TIME ZONE 'Australia/Brisbane')::date
        `,
        [unit_id]
      );
      result.remindersSentToday = remindedResult.rows.map(row => row.tutor_id);
    }

    res.json(result);
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
router.post('/submit', verifyToken, requireRole('tutor', 'coordinator'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { unitCode, unitId, slots } = req.body;
    if ((!unitCode && !unitId) || !slots) {
      return res.status(400).json({ error: 'unitId (or unitCode) and slots are required' });
    }

    const tutor_id = req.user.id;

    const unit = await resolveUnitForUser({ unitId, unitCode }, tutor_id, client);
    if (!unit) return res.status(404).json({ error: 'Unit not found' });
    const unit_id = unit.id;

    // Only people already on the unit can submit availability for it.
    // (Submitting used to silently enrol any tutor into any unit.)
    if (!(await isUserLinkedToUnit(tutor_id, unit_id, client))) {
      return res.status(403).json({ error: 'You are not part of this unit' });
    }

    // UCs no longer submit availability for a unit they coordinate.
    if (await getCoordinatorUnitId(unit_id, tutor_id, client)) {
      return res.status(403).json({ error: 'Unit coordinators do not submit availability for their own unit.' });
    }

    if (isAvailabilityLocked(unit)) {
      return res.status(409).json({ error: 'Availability submissions are closed for this unit.' });
    }

    if (typeof slots !== 'object' || Array.isArray(slots)) {
      return res.status(400).json({ error: 'slots must be an object of "Day-time": preference' });
    }

    await client.query('BEGIN');

    await client.query(
      'DELETE FROM availability WHERE tutor_id = $1 AND unit_id = $2',
      [tutor_id, unit_id]
    );

    for (const [key, preference] of Object.entries(slots)) {
      // Slots that cannot be read are skipped, the rest are still saved.
      const slot = parseAvailabilitySlot(key, preference);
      if (!slot) continue;

      await client.query(`
        INSERT INTO availability (tutor_id, unit_id, day, start_time, end_time, preference, is_submitted, submitted_at)
        VALUES ($1, $2, $3, $4, $5, $6, TRUE, NOW())
      `, [tutor_id, unit_id, slot.day, slot.startTime, slot.endTime, slot.preference]);
    }

    await client.query('COMMIT');
    console.log(`Availability submitted: ${req.user.email} for ${unit.unit_code}`);
    res.status(201).json({ success: true, message: 'Availability submitted successfully' });

  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error submitting availability:', error);
    res.status(500).json({ error: 'Failed to submit availability' });
  } finally {
    client.release();
  }
});

/**
 * POST /availability/reminders (UC bell button)
 * Body: { unitId, tutorId }
 * Sends the "submit your availability" email + in-app notice to one tutor
 * straight away. Only a coordinator of that unit may do it, the tutor must be
 * on the unit and must not have submitted yet, and at most once per day.
 */
router.post('/reminders', verifyToken, requireRole('coordinator'), async (req, res) => {
  const { unitId, tutorId } = req.body || {};
  if (!unitId || !tutorId) {
    return res.status(400).json({ error: 'unitId and tutorId are required' });
  }

  const client = await pool.connect();
  let reminderId = null;
  let tutor = null;
  let unit = null;
  try {
    const coordinatorUnitId = await getCoordinatorUnitId(unitId, req.user.id, client).catch(() => null);
    if (!coordinatorUnitId) {
      return res.status(403).json({ error: 'Only a coordinator of this unit can send reminders.' });
    }

    await client.query('BEGIN');
    // Serialise clicks for the same tutor + unit so a double click sends once.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`availability-reminder:${unitId}:${tutorId}`]);

    const unitResult = await client.query(
      'SELECT id, unit_code, unit_name, availability_deadline FROM units WHERE id = $1',
      [unitId]
    );
    unit = unitResult.rows[0];

    const tutorResult = await client.query(
      `
      SELECT u.id, u.email, TRIM(CONCAT(u.name, ' ', COALESCE(u.last_name, ''))) AS name
      FROM users u
      WHERE u.id = $2
        AND EXISTS (
          SELECT 1 FROM unit_memberships um
          WHERE um.unit_id = $1 AND um.user_id = u.id AND um.role IN ('tutor', 'super_tutor')
        )
        AND NOT ${isUnitCoordinatorSql('u.id', '$1')}
      `,
      [unitId, tutorId]
    );
    tutor = tutorResult.rows[0];

    const [submittedResult, sentTodayResult] = tutor
      ? await Promise.all([
          client.query(
            'SELECT 1 FROM availability WHERE unit_id = $1 AND tutor_id = $2 AND is_submitted = TRUE LIMIT 1',
            [unitId, tutorId]
          ),
          client.query(SENT_TODAY_SQL, [unitId, tutorId])
        ])
      : [{ rows: [] }, { rows: [] }];

    const problem = checkManualAvailabilityReminder({
      isTutorOnUnit: !!tutor && !!tutor.email,
      hasSubmitted: submittedResult.rows.length > 0,
      alreadySentToday: sentTodayResult.rows.length > 0
    });
    if (problem) {
      await client.query('ROLLBACK');
      return res.status(problem.status).json({ error: problem.error });
    }

    const inserted = await client.query(
      `
      INSERT INTO availability_reminders (unit_id, tutor_id, deadline, kind, sent_by_id)
      VALUES ($1, $2, $3, 'manual', $4)
      RETURNING id, sent_at
      `,
      [unitId, tutorId, unitResult.rows[0].availability_deadline, req.user.id]
    );
    reminderId = inserted.rows[0].id;
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error preparing availability reminder:', error);
    return res.status(500).json({ error: 'Failed to send reminder' });
  } finally {
    client.release();
  }

  try {
    await sendAvailabilityReminder({ tutor, unit });
    res.status(201).json({ success: true, tutorId, message: 'Reminder sent' });
  } catch (error) {
    // Not sent, so it does not count towards "once per day".
    await pool.query('DELETE FROM availability_reminders WHERE id = $1', [reminderId]).catch(() => {});
    console.error('Error sending availability reminder:', error);
    res.status(502).json({ error: 'The reminder email could not be sent. Please try again.' });
  }
});

module.exports = router;