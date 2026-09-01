const WEEKDAY_INDEX = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };

// Counts how many times `day` (e.g. 'THU') falls between startDate and endDate inclusive.
const countWeekdayOccurrences = (day, startDate, endDate) => {
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

const formatDateRange = (startDate, endDate) => {
  const opts = { day: 'numeric', month: 'short' };
  const start = new Date(startDate).toLocaleDateString('en-AU', opts);
  const end = new Date(endDate).toLocaleDateString('en-AU', opts);
  return `${start} - ${end}`;
};

const express = require('express');
const pool = require('../db');
const { verifyToken, requireRole } = require('../middleware/auth');
const { createNotification, getUserDisplayName } = require('../utils/notify');
const { getCoordinatorUnitId } = require('../utils/unitAccess');
const { escapeHtml, sendEmail } = require('../utils/email');
const { TUTOR_LIKE_ROLES, requiresSuperTutor } = require('../utils/roles');

const router = express.Router();

const formatTimeRange = (start, end) => `${String(start).slice(0, 5)} - ${String(end).slice(0, 5)}`;
const frontendUrl = () => (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');

const formatCoverSession = (session) => {
  const time = formatTimeRange(session.start_time || session.startTime, session.end_time || session.endTime);
  const location = session.location ? ` at ${session.location}` : '';
  return `${session.day} ${time}${location}`;
};

const sendCoverRequestEmail = async ({ tutorEmail, tutorName, unitCode, sessions, reason }) => {
  if (!tutorEmail) return;

  const requestsUrl = `${frontendUrl()}/requests`;
  const subject = `${unitCode} cover request available`;
  const sessionLines = sessions.map(formatCoverSession);
  const sessionListHtml = sessionLines
    .map(session => `<li>${escapeHtml(session)}</li>`)
    .join('');

  await sendEmail({
    to: [{ email: tutorEmail, name: tutorName || undefined }],
    subject,
    htmlContent: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #202124;">
        <h2>${escapeHtml(subject)}</h2>
        <p>A cover request has been created for ${escapeHtml(unitCode)}.</p>
        <p><strong>Session${sessions.length === 1 ? '' : 's'} needing cover:</strong></p>
        <ul>${sessionListHtml}</ul>
        <p><strong>Reason:</strong> ${escapeHtml(reason || 'No reason provided')}</p>
        <p>
          <a href="${requestsUrl}" style="display: inline-block; background: #5b4fc0; color: #ffffff; padding: 12px 18px; border-radius: 6px; text-decoration: none;">
            View cover request
          </a>
        </p>
      </div>
    `,
    textContent: [
      subject,
      '',
      `A cover request has been created for ${unitCode}.`,
      '',
      `Session${sessions.length === 1 ? '' : 's'} needing cover:`,
      ...sessionLines.map(session => `- ${session}`),
      '',
      `Reason: ${reason || 'No reason provided'}`,
      '',
      `View cover request: ${requestsUrl}`
    ].join('\n')
  });
};

const sendCoverClaimedEmail = async ({ coordinatorEmail, coordinatorName, claimerName, unitCode, session }) => {
  if (!coordinatorEmail) return;

  const requestsUrl = `${frontendUrl()}/uc-requests`;
  const sessionLabel = formatCoverSession(session);
  const subject = `${unitCode} cover request claimed`;

  await sendEmail({
    to: [{ email: coordinatorEmail, name: coordinatorName || undefined }],
    subject,
    htmlContent: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #202124;">
        <h2>${escapeHtml(subject)}</h2>
        <p>${escapeHtml(claimerName)} has claimed a cover request in ${escapeHtml(unitCode)}.</p>
        <table style="border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 6px 12px 6px 0; font-weight: bold;">Tutor</td><td style="padding: 6px 0;">${escapeHtml(claimerName)}</td></tr>
          <tr><td style="padding: 6px 12px 6px 0; font-weight: bold;">Session</td><td style="padding: 6px 0;">${escapeHtml(sessionLabel)}</td></tr>
        </table>
        <p>
          <a href="${requestsUrl}" style="display: inline-block; background: #5b4fc0; color: #ffffff; padding: 12px 18px; border-radius: 6px; text-decoration: none;">
            View request
          </a>
        </p>
      </div>
    `,
    textContent: [
      subject,
      '',
      `${claimerName} has claimed a cover request in ${unitCode}.`,
      `Tutor: ${claimerName}`,
      `Session: ${sessionLabel}`,
      '',
      `View request: ${requestsUrl}`
    ].join('\n')
  });
};

// ---------------------------------------------------------------------------
// UC: broadcast a set of sessions as "needs cover" to every other tutor on
// the unit. Sessions can be a single day or a whole week - the UC just
// selects whichever rows the absent tutor can't make.
// ---------------------------------------------------------------------------
router.post('/uc/cover-requests', verifyToken, requireRole('coordinator'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { sessionIds, reason, startDate, endDate } = req.body;

    if (!Array.isArray(sessionIds) || sessionIds.length === 0) {
      return res.status(400).json({ error: 'Select at least one session to broadcast.' });
    }

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Select the date range this cover request applies to.' });
    }
    if (new Date(startDate) > new Date(endDate)) {
      return res.status(400).json({ error: 'Start date must be before the end date.' });
    }

    // Pull the sessions and make sure every single one belongs to a unit this
    // coordinator actually owns - otherwise a UC could broadcast someone
    // else's timetable.
    const sessionsResult = await client.query(
      `
      SELECT s.id, s.unit_id, s.day, s.start_time, s.end_time, s.location,
             s.assigned_tutor_id, un.unit_code
      FROM sessions s
      JOIN units un ON un.id = s.unit_id
      WHERE s.id = ANY($1::uuid[])
      `,
      [sessionIds]
    );

    if (sessionsResult.rows.length !== sessionIds.length) {
      return res.status(404).json({ error: 'One or more sessions could not be found.' });
    }

    const unitIds = [...new Set(sessionsResult.rows.map(s => s.unit_id))];
    if (unitIds.length > 1) {
      return res.status(400).json({ error: 'Select sessions from a single unit at a time.' });
    }
    const unitId = unitIds[0];
    const coordinatorUnitId = await getCoordinatorUnitId(unitId, req.user.id, client);
    if (!coordinatorUnitId) {
      return res.status(403).json({ error: 'You can only broadcast sessions from your own units.' });
    }

    const unitCode = sessionsResult.rows[0].unit_code;

    await client.query('BEGIN');

    const batchResult = await client.query(
      `INSERT INTO cover_batches (unit_id, created_by_id, reason, start_date, end_date) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [unitId, req.user.id, reason || null, startDate, endDate]
    );
    const batchId = batchResult.rows[0].id;

    const created = [];
    for (const session of sessionsResult.rows) {
      const insertResult = await client.query(
        `
        INSERT INTO cover_requests (batch_id, session_id, unit_id, original_tutor_id, reason, created_by_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, session_id, status
        `,
        [batchId, session.id, unitId, session.assigned_tutor_id, reason || null, req.user.id]
      );
      created.push({ ...insertResult.rows[0], day: session.day, startTime: session.start_time, endTime: session.end_time });
    }

    await client.query('COMMIT');

    // Notify every tutor on this unit except whoever was originally assigned
    // to these sessions - they're the one who can't make it.
    const excludedTutorIds = new Set(sessionsResult.rows.map(s => s.assigned_tutor_id).filter(Boolean));
    const tutorsResult = await pool.query(
      `
      SELECT DISTINCT
        u.id,
        u.email,
        TRIM(CONCAT(u.name, ' ', COALESCE(u.last_name, ''))) AS name
      FROM unit_memberships um
      JOIN users u ON u.id = um.user_id
      WHERE um.unit_id = $1
        AND um.role = ANY($2)
        AND u.email IS NOT NULL
      `,
      [unitId, TUTOR_LIKE_ROLES]
    );
    const recipients = tutorsResult.rows.filter(tutor => tutor.id && !excludedTutorIds.has(tutor.id));
    const recipientIds = recipients.map(tutor => tutor.id);

    const sessionSummary = sessionsResult.rows.length === 1
      ? (() => {
          const s = sessionsResult.rows[0];
          const occurrences = countWeekdayOccurrences(s.day, startDate, endDate);
          return `${formatDateRange(startDate, endDate)} · ${s.day} ${formatTimeRange(s.start_time, s.end_time)} (${occurrences} session${occurrences === 1 ? '' : 's'})`;
        })()
      : `${formatDateRange(startDate, endDate)} · ${sessionsResult.rows.length} sessions`;

    await Promise.all(recipientIds.map(userId => createNotification({
      userId,
      type: 'session_cover_open',
      title: 'Cover needed - first come, first served',
      content: `${unitCode} needs cover for ${sessionSummary}. Claim it from Requests before someone else does.`,
      unitId,
      actionUrl: '/requests'
    })));

    await Promise.all(recipients.map(async (tutor) => {
      try {
        await sendCoverRequestEmail({
          tutorEmail: tutor.email,
          tutorName: tutor.name,
          unitCode,
          sessions: sessionsResult.rows,
          reason
        });
      } catch (emailError) {
        console.error('Error sending cover request email:', emailError);
      }
    }));

    console.log('Cover broadcast created:', batchId, 'sessions:', created.length, 'notified:', recipientIds.length);
    res.status(201).json({ batchId, requests: created, notifiedCount: recipientIds.length });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error creating cover broadcast:', error);
    res.status(500).json({ error: 'Failed to broadcast cover request.' });
  } finally {
    client.release();
  }
});

// UC: see how a broadcast batch is progressing (which sessions got claimed).
router.get('/uc/cover-requests', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        cr.id,
        cr.batch_id as "batchId",
        cr.status,
        cr.reason,
        cr.created_at as "createdAt",
        cb.start_date as "startDate",
        cb.end_date as "endDate",
        cr.claimed_at as "claimedAt",
        s.day, s.start_time as "startTime", s.end_time as "endTime", s.location,
        un.unit_code as "unitCode",
        TRIM(CONCAT(orig.name, ' ', COALESCE(orig.last_name, ''))) as "originalTutorName",
        TRIM(CONCAT(claimer.name, ' ', COALESCE(claimer.last_name, ''))) as "claimedByName"
      FROM cover_requests cr
      JOIN cover_batches cb ON cb.id = cr.batch_id
      JOIN sessions s ON s.id = cr.session_id
      JOIN units un ON un.id = cr.unit_id
      LEFT JOIN users orig ON orig.id = cr.original_tutor_id
      LEFT JOIN users claimer ON claimer.id = cr.claimed_by_id
      WHERE un.unit_coordinator_id = $1
         OR EXISTS (
           SELECT 1
           FROM unit_memberships um
           WHERE um.unit_id = un.id
             AND um.user_id = $1
             AND um.role = 'coordinator'
         )
      ORDER BY cr.created_at DESC
      `,
      [req.user.id]
    );
    res.json(result.rows.map(row => ({
      ...row,
      occurrenceCount: countWeekdayOccurrences(row.day, row.startDate, row.endDate)
    })));
  } catch (error) {
    console.error('Error fetching UC cover requests:', error);
    res.status(500).json({ error: 'Failed to fetch cover requests.' });
  }
});

// ---------------------------------------------------------------------------
// Tutor: view every open cover request on units they belong to (never their
// own sessions - you can't cover your own class).
// ---------------------------------------------------------------------------
router.get('/cover-requests/open', verifyToken, requireRole('tutor', 'coordinator'), async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        cr.id,
        cr.reason,
        cr.created_at as "createdAt",
        cb.start_date as "startDate",
        cb.end_date as "endDate",
        s.id as "sessionId", s.day, s.start_time as "startTime", s.end_time as "endTime",
        s.location, s.session_type as "sessionType",
        un.unit_code as "unitCode", un.unit_name as "unitName",
        TRIM(CONCAT(orig.name, ' ', COALESCE(orig.last_name, ''))) as "originalTutorName"
      FROM cover_requests cr
      JOIN cover_batches cb ON cb.id = cr.batch_id
      JOIN sessions s ON s.id = cr.session_id
      JOIN units un ON un.id = cr.unit_id
      LEFT JOIN users orig ON orig.id = cr.original_tutor_id
      WHERE cr.status = 'open'
        AND cr.unit_id IN (
          SELECT unit_id FROM unit_memberships WHERE user_id = $1 AND role = ANY($2)
        )
        AND (cr.original_tutor_id IS NULL OR cr.original_tutor_id != $1)
      ORDER BY cr.created_at DESC
      `,
      [req.user.id, TUTOR_LIKE_ROLES]
    );
    res.json(result.rows.map(row => ({
      ...row,
      occurrenceCount: countWeekdayOccurrences(row.day, row.startDate, row.endDate)
    })));
  } catch (error) {
    console.error('Error fetching open cover requests:', error);
    res.status(500).json({ error: 'Failed to fetch open cover requests.' });
  }
});

// Tutor: claim a session. First tutor whose UPDATE lands while status is
// still 'open' wins - the WHERE clause makes this atomic so two tutors
// clicking at the same instant can never both succeed.
router.post('/cover-requests/:id/claim', verifyToken, requireRole('tutor', 'coordinator'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    // Confirm this tutor actually belongs to the unit this request is on.
    const eligible = await client.query(
      `
      SELECT cr.id, cr.session_id, cr.unit_id, cr.original_tutor_id, cr.status,
             s.session_type,
             bool_or(um.role = 'super_tutor') AS is_super_tutor
      FROM cover_requests cr
      JOIN sessions s ON s.id = cr.session_id
      JOIN unit_memberships um ON um.unit_id = cr.unit_id AND um.user_id = $2 AND um.role = ANY($3)
      WHERE cr.id = $1
      GROUP BY cr.id, cr.session_id, cr.unit_id, cr.original_tutor_id, cr.status, s.session_type
      `,
      [id, req.user.id, TUTOR_LIKE_ROLES]
    );

    if (eligible.rows.length === 0) {
      return res.status(404).json({ error: 'Cover request not found.' });
    }

    const request = eligible.rows[0];
    if (request.original_tutor_id === req.user.id) {
      return res.status(400).json({ error: "You can't claim your own session." });
    }
    if (requiresSuperTutor(request.session_type) && !request.is_super_tutor) {
      return res.status(403).json({ error: `Only Super Tutors can claim ${request.session_type} sessions.` });
    }

    await client.query('BEGIN');

    // The atomic part: only succeeds if it's still 'open'.
    const claimResult = await client.query(
      `
      UPDATE cover_requests
      SET status = 'claimed', claimed_by_id = $1, claimed_at = NOW()
      WHERE id = $2 AND status = 'open'
      RETURNING id, session_id, unit_id, original_tutor_id
      `,
      [req.user.id, id]
    );

    if (claimResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Someone else already claimed this session.' });
    }

    const claimed = claimResult.rows[0];

    await client.query(
      `UPDATE sessions SET assigned_tutor_id = $1, tutor_confirmed = TRUE, tutor_reject_reason = NULL WHERE id = $2`,
      [req.user.id, claimed.session_id]
    );

    await client.query(
      `INSERT INTO unit_memberships (unit_id, user_id, role) VALUES ($1, $2, 'tutor') ON CONFLICT (unit_id, user_id, role) DO NOTHING`,
      [claimed.unit_id, req.user.id]
    );

    await client.query('COMMIT');

    const claimerName = await getUserDisplayName(req.user.id);
    const sessionResult = await pool.query(
      `
      SELECT s.day, s.start_time, s.end_time, s.location, un.unit_code
      FROM sessions s
      JOIN units un ON un.id = s.unit_id
      WHERE s.id = $1
      `,
      [claimed.session_id]
    );
    const claimedSession = sessionResult.rows[0] || {};
    const unitCode = claimedSession.unit_code || 'the unit';
    const coordinatorsResult = await pool.query(
      `
      SELECT DISTINCT
        u.id as user_id,
        u.email,
        TRIM(CONCAT(u.name, ' ', COALESCE(u.last_name, ''))) as name
      FROM units
      JOIN users u ON (
        u.id = units.unit_coordinator_id
        OR EXISTS (
          SELECT 1
          FROM unit_memberships um
          WHERE um.unit_id = units.id
            AND um.user_id = u.id
            AND um.role = 'coordinator'
        )
      )
      WHERE units.id = $1
        AND u.role = 'coordinator'
      `,
      [claimed.unit_id]
    );

    if (claimed.original_tutor_id) {
      await createNotification({
        userId: claimed.original_tutor_id,
        type: 'session_cover_claimed',
        title: 'Your session was covered',
        content: `${claimerName} picked up your session in ${unitCode}.`,
        unitId: claimed.unit_id,
        sessionId: claimed.session_id,
        actionUrl: '/tutor-schedule'
      });
    }
    if (coordinatorsResult.rows.length > 0) {
      await Promise.all(coordinatorsResult.rows.map(coordinator => createNotification({
        userId: coordinator.user_id,
        type: 'session_cover_claimed',
        title: 'Cover request claimed',
        content: `${claimerName} claimed a cover request in ${unitCode}.`,
        unitId: claimed.unit_id,
        sessionId: claimed.session_id,
        actionUrl: '/uc-requests'
      })));

      await Promise.all(coordinatorsResult.rows.map(async (coordinator) => {
        try {
          await sendCoverClaimedEmail({
            coordinatorEmail: coordinator.email,
            coordinatorName: coordinator.name,
            claimerName,
            unitCode,
            session: claimedSession
          });
        } catch (emailError) {
          console.error('Error sending cover claimed email:', emailError);
        }
      }));
    }

    console.log('Cover request claimed:', id, 'by', req.user.id);
    res.json({ success: true, sessionId: claimed.session_id });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error claiming cover request:', error);
    res.status(500).json({ error: 'Failed to claim session.' });
  } finally {
    client.release();
  }
});

// UC: cancel a broadcast batch that's no longer needed (e.g. tutor turned out
// to be available after all). Only pulls back requests still 'open'.
router.delete('/uc/cover-requests/batch/:batchId', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const { batchId } = req.params;
    const result = await pool.query(
      `
      UPDATE cover_requests
      SET status = 'cancelled'
      FROM cover_batches cb
      JOIN units un ON un.id = cb.unit_id
      WHERE cover_requests.batch_id = $1
        AND cover_requests.batch_id = cb.id
        AND (
          un.unit_coordinator_id = $2
          OR EXISTS (
            SELECT 1
            FROM unit_memberships um
            WHERE um.unit_id = un.id
              AND um.user_id = $2
              AND um.role = 'coordinator'
          )
        )
        AND cover_requests.status = 'open'
      RETURNING cover_requests.id
      `,
      [batchId, req.user.id]
    );
    res.json({ success: true, cancelledCount: result.rows.length });
  } catch (error) {
    console.error('Error cancelling cover batch:', error);
    res.status(500).json({ error: 'Failed to cancel cover batch.' });
  }
});

module.exports = router;