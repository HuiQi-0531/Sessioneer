const express = require('express');
const pool = require('../db');
const { escapeHtml, sendEmail } = require('../utils/email');

const router = express.Router();

const verifyCronSecret = (req, res, next) => {
  const configuredSecret = process.env.CRON_SECRET;

  if (!configuredSecret) {
    return res.status(503).json({ error: 'CRON_SECRET is not configured' });
  }

  const authHeader = req.headers.authorization || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const headerSecret = req.headers['x-cron-secret'];

  if (bearerToken !== configuredSecret && headerSecret !== configuredSecret) {
    return res.status(401).json({ error: 'Unauthorised reminder job' });
  }

  next();
};

const frontendUrl = () => process.env.FRONTEND_URL || 'http://localhost:3000';

const formatTime = (value) => {
  if (!value) return '';
  return String(value).slice(0, 5);
};

const formatSessionLabel = (session) => {
  const parts = [
    session.day,
    `${formatTime(session.start_time)}-${formatTime(session.end_time)}`,
    session.session_type,
    session.location
  ].filter(Boolean);

  return parts.join(' | ');
};

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

module.exports = router;
