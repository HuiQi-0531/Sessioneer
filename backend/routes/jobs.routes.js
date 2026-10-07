const express = require('express');
const pool = require('../db');
const { escapeHtml, sendEmail } = require('../utils/email');
const { frontendUrl } = require('../utils/urls');
const { verifyCronSecret, formatSessionLabel } = require('../utils/jobRules');
const {
  isUnitInAvailabilityReminderWindow,
  selectSessionsForReminder,
  resolveSessionReminderRecipients
} = require('../utils/reminderRules');
const { sendAvailabilityReminder, sendSessionReminder } = require('../utils/reminders');

const router = express.Router();

const sendAssignmentReminderEmail = async ({ tutor, unit, session }) => {
  const tutorName = tutor.name || 'there';
  const unitLabel = `${unit.unit_code}${unit.unit_name ? ` - ${unit.unit_name}` : ''}`;
  const sessionLabel = formatSessionLabel(session);
  const actionLink = `${frontendUrl()}/tutor-schedule/${unit.id}`;
  const subject = `Reminder: confirm your ${unit.unit_code} session`;

  await sendEmail({
    to: tutor.email,
    subject,
    htmlContent: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #1f2937;">
        <h2>${escapeHtml(subject)}</h2>
        <p>Hi ${escapeHtml(tutorName)},</p>
        <p>You were assigned to a session 3 days ago and it is still waiting for your response.</p>
        <table style="border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 6px 12px 6px 0; font-weight: bold;">Unit</td><td style="padding: 6px 0;">${escapeHtml(unitLabel)}</td></tr>
          <tr><td style="padding: 6px 12px 6px 0; font-weight: bold;">Session</td><td style="padding: 6px 0;">${escapeHtml(sessionLabel)}</td></tr>
        </table>
        <p>Please accept or decline the session so the coordinator can finalise the schedule.</p>
        <p><a href="${escapeHtml(actionLink)}" style="color: #4f46e5;">View your schedule</a></p>
      </div>
    `,
    textContent: `Hi ${tutorName},

You were assigned to a session 3 days ago and it is still waiting for your response.

Unit: ${unitLabel}
Session: ${sessionLabel}

Please accept or decline the session here: ${actionLink}`
  });
};

router.post('/session-assignment-reminders', verifyCronSecret, async (req, res) => {
  try {
    const pendingAssignments = await pool.query(`
      SELECT
        st.id AS assignment_id,
        st.assigned_at,
        u.email AS tutor_email,
        TRIM(CONCAT(u.name, ' ', COALESCE(u.last_name, ''))) AS tutor_name,
        un.id AS unit_id,
        un.unit_code,
        un.unit_name,
        s.id AS session_id,
        s.day,
        s.start_time,
        s.end_time,
        s.location,
        s.session_type
      FROM session_tutors st
      JOIN sessions s ON s.id = st.session_id
      JOIN units un ON un.id = s.unit_id
      JOIN users u ON u.id = st.tutor_id
      WHERE st.tutor_confirmed IS NULL
        AND st.reminder_sent_at IS NULL
        AND st.assigned_at <= NOW() - INTERVAL '3 days'
        AND u.email IS NOT NULL
      ORDER BY st.assigned_at ASC
      LIMIT 100
    `);

    let emailedCount = 0;
    let failedCount = 0;
    const failures = [];

    for (const assignment of pendingAssignments.rows) {
      try {
        await sendAssignmentReminderEmail({
          tutor: {
            email: assignment.tutor_email,
            name: assignment.tutor_name
          },
          unit: {
            id: assignment.unit_id,
            unit_code: assignment.unit_code,
            unit_name: assignment.unit_name
          },
          session: assignment
        });

        await pool.query(
          'UPDATE session_tutors SET reminder_sent_at = NOW() WHERE id = $1 AND reminder_sent_at IS NULL',
          [assignment.assignment_id]
        );
        emailedCount += 1;
      } catch (error) {
        failedCount += 1;
        failures.push({
          assignmentId: assignment.assignment_id,
          email: assignment.tutor_email,
          error: error.message
        });
        console.error('Error sending assignment reminder email:', error);
      }
    }

    res.json({
      checkedAt: new Date().toISOString(),
      pendingCount: pendingAssignments.rowCount,
      emailedCount,
      failedCount,
      failures
    });
  } catch (error) {
    console.error('Error running assignment reminder job:', error);
    res.status(500).json({ error: 'Failed to run assignment reminder job' });
  }
});

// The jobs normally use the real clock. A caller holding the cron secret may
// pass { "asOf": "<ISO time>" } to run the job as if it were that moment
// (used by the tests and for manual dry runs). Returns a Date or null.
const resolveJobTime = (req) => {
  const asOf = req.body && req.body.asOf;
  if (!asOf) return new Date();
  const parsed = new Date(asOf);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * POST /jobs/availability-deadline-reminders  (daily, 9:00 am Brisbane)
 * Emails every tutor / Super Tutor who has not submitted availability for a
 * unit whose deadline is less than 3 days away (and not locked or passed).
 * One email per tutor + unit + deadline: availability_reminders remembers it.
 */
router.post('/availability-deadline-reminders', verifyCronSecret, async (req, res) => {
  const now = resolveJobTime(req);
  if (!now) return res.status(400).json({ error: 'asOf must be a valid date' });

  try {
    const unitsResult = await pool.query(`
      SELECT id, unit_code, unit_name, availability_deadline, availability_locked
      FROM units
      WHERE availability_deadline IS NOT NULL
        AND COALESCE(availability_locked, FALSE) = FALSE
    `);
    const units = unitsResult.rows.filter(unit => isUnitInAvailabilityReminderWindow(unit, now));

    let checkedCount = 0;
    let alreadySentCount = 0;
    let emailedCount = 0;
    let failedCount = 0;
    const failures = [];

    for (const unit of units) {
      const tutorsResult = await pool.query(
        `
        SELECT DISTINCT u.id, u.email,
               TRIM(CONCAT(u.name, ' ', COALESCE(u.last_name, ''))) AS name
        FROM unit_memberships um
        JOIN users u ON u.id = um.user_id
        WHERE um.unit_id = $1
          AND um.role IN ('tutor', 'super_tutor')
          AND u.email IS NOT NULL
          AND COALESCE(u.account_status, 'active') = 'active'
          AND NOT EXISTS (
            SELECT 1 FROM availability a
            WHERE a.unit_id = $1 AND a.tutor_id = u.id AND a.is_submitted = TRUE
          )
        `,
        [unit.id]
      );

      for (const tutor of tutorsResult.rows) {
        checkedCount += 1;
        // Claim the reminder first so two overlapping runs can never both send it.
        const claim = await pool.query(
          `
          INSERT INTO availability_reminders (unit_id, tutor_id, deadline, kind)
          SELECT id, $2, availability_deadline, 'auto' FROM units WHERE id = $1
          ON CONFLICT (unit_id, tutor_id, deadline) WHERE kind = 'auto' DO NOTHING
          RETURNING id
          `,
          [unit.id, tutor.id]
        );
        if (claim.rows.length === 0) {
          alreadySentCount += 1;
          continue;
        }

        try {
          await sendAvailabilityReminder({ tutor, unit });
          emailedCount += 1;
        } catch (error) {
          // Release the claim so tomorrow's run can try again.
          await pool.query('DELETE FROM availability_reminders WHERE id = $1', [claim.rows[0].id]).catch(() => {});
          failedCount += 1;
          failures.push({ unitId: unit.id, tutorId: tutor.id, email: tutor.email, error: error.message });
          console.error('Error sending availability reminder email:', error);
        }
      }
    }

    res.json({
      checkedAt: new Date().toISOString(),
      asOf: now.toISOString(),
      unitCount: units.length,
      checkedCount,
      pendingCount: checkedCount - alreadySentCount,
      alreadySentCount,
      emailedCount,
      failedCount,
      failures
    });
  } catch (error) {
    console.error('Error running availability reminder job:', error);
    res.status(500).json({ error: 'Failed to run availability reminder job' });
  }
});

/**
 * POST /jobs/session-reminders  (hourly)
 * Reminds tutors about classes starting 23-24 hours from now (Brisbane time):
 * unit has a teaching period containing that date, the schedule is locked,
 * and the tutor has Confirmed. If the class was taken over through a claimed
 * cover request, only the person covering is reminded. One reminder per
 * tutor + session + class date (session_reminders).
 */
router.post('/session-reminders', verifyCronSecret, async (req, res) => {
  const now = resolveJobTime(req);
  if (!now) return res.status(400).json({ error: 'asOf must be a valid date' });

  try {
    const sessionsResult = await pool.query(`
      SELECT s.id, s.unit_id, s.session_code, s.day, s.start_time, s.end_time,
             s.location, s.session_type,
             un.unit_code, un.unit_name, un.schedule_locked,
             un.teaching_start_date, un.teaching_end_date
      FROM sessions s
      JOIN units un ON un.id = s.unit_id
      WHERE un.schedule_locked = TRUE
        AND un.teaching_start_date IS NOT NULL
        AND un.teaching_end_date IS NOT NULL
    `);
    const selected = selectSessionsForReminder(sessionsResult.rows, now);
    const sessionIds = selected.map(item => item.session.id);

    const [assignmentsResult, coversResult] = sessionIds.length === 0
      ? [{ rows: [] }, { rows: [] }]
      : await Promise.all([
          pool.query(
            'SELECT session_id, tutor_id, tutor_confirmed FROM session_tutors WHERE session_id = ANY($1::uuid[])',
            [sessionIds]
          ),
          pool.query(
            `
            SELECT cr.session_id, cr.original_tutor_id, cr.claimed_by_id, cr.status,
                   cb.start_date, cb.end_date
            FROM cover_requests cr
            JOIN cover_batches cb ON cb.id = cr.batch_id
            WHERE cr.session_id = ANY($1::uuid[]) AND cr.status = 'claimed'
            `,
            [sessionIds]
          )
        ]);

    const plan = selected.map(({ session, occurrence }) => ({
      session,
      occurrence,
      recipients: resolveSessionReminderRecipients(
        assignmentsResult.rows.filter(row => row.session_id === session.id),
        coversResult.rows.filter(row => row.session_id === session.id),
        occurrence.dateKey
      )
    }));

    const tutorIds = [...new Set(plan.flatMap(item => item.recipients.map(r => r.tutorId)))];
    const usersResult = tutorIds.length === 0
      ? { rows: [] }
      : await pool.query(
          `
          SELECT id, email, notify_session_updates, account_status,
                 TRIM(CONCAT(name, ' ', COALESCE(last_name, ''))) AS name
          FROM users WHERE id = ANY($1::uuid[])
          `,
          [tutorIds]
        );
    const usersById = new Map(usersResult.rows.map(user => [user.id, user]));

    let checkedCount = 0;
    let skippedCount = 0;
    let alreadySentCount = 0;
    let emailedCount = 0;
    let failedCount = 0;
    const failures = [];

    for (const { session, occurrence, recipients } of plan) {
      for (const recipient of recipients) {
        checkedCount += 1;
        const tutor = usersById.get(recipient.tutorId);
        // Turned off session notices in Settings, no email, or not active: skip.
        if (!tutor || !tutor.email || tutor.notify_session_updates === false
            || (tutor.account_status && tutor.account_status !== 'active')) {
          skippedCount += 1;
          continue;
        }

        const claim = await pool.query(
          `
          INSERT INTO session_reminders (session_id, tutor_id, occurrence_date)
          VALUES ($1, $2, $3)
          ON CONFLICT (session_id, tutor_id, occurrence_date) DO NOTHING
          RETURNING id
          `,
          [session.id, tutor.id, occurrence.dateKey]
        );
        if (claim.rows.length === 0) {
          alreadySentCount += 1;
          continue;
        }

        try {
          await sendSessionReminder({ tutor, session, occurrence, via: recipient.via });
          emailedCount += 1;
        } catch (error) {
          await pool.query('DELETE FROM session_reminders WHERE id = $1', [claim.rows[0].id]).catch(() => {});
          failedCount += 1;
          failures.push({ sessionId: session.id, tutorId: tutor.id, email: tutor.email, date: occurrence.dateKey, error: error.message });
          console.error('Error sending session reminder email:', error);
        }
      }
    }

    res.json({
      checkedAt: new Date().toISOString(),
      asOf: now.toISOString(),
      sessionCount: selected.length,
      checkedCount,
      pendingCount: checkedCount - skippedCount - alreadySentCount,
      skippedCount,
      alreadySentCount,
      emailedCount,
      failedCount,
      failures
    });
  } catch (error) {
    console.error('Error running session reminder job:', error);
    res.status(500).json({ error: 'Failed to run session reminder job' });
  }
});

module.exports = router;
