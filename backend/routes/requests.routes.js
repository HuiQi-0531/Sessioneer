const express = require('express');
const pool = require('../db');
const { verifyToken, requireRole } = require('../middleware/auth');
const { createNotification, getUserDisplayName } = require('../utils/notify');
const { escapeHtml, sendEmail } = require('../utils/email');

const router = express.Router();

const frontendUrl = () => (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');

const getUnitCoordinators = async (unitId) => {
  const result = await pool.query(
    `
    SELECT DISTINCT
      u.id,
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
    [unitId]
  );

  return result.rows;
};

const labelFromSessionValue = (value) => {
  if (!value) return 'Not specified';
  const parts = String(value).split('::');
  if (parts.length !== 2) return value;
  return parts[1].replace(/\|/g, ' | ');
};

const sendUrgentRequestEmail = async ({
  coordinatorEmail,
  coordinatorName,
  tutorName,
  tutorEmail,
  unitCode,
  unitName,
  requestType,
  currentSession,
  preferredSwapTo,
  reason
}) => {
  if (!coordinatorEmail) return;

  const reviewUrl = `${frontendUrl()}/uc-requests`;
  const title = `Urgent ${requestType || 'session'} request`;
  const subject = `${title} from ${tutorName} for ${unitCode}`;
  const sessionLabel = labelFromSessionValue(currentSession);
  const preferredLabel = preferredSwapTo ? labelFromSessionValue(preferredSwapTo) : 'Not specified';
  const unitLabel = unitName ? `${unitCode} - ${unitName}` : unitCode;

  await sendEmail({
    to: [{ email: coordinatorEmail, name: coordinatorName || undefined }],
    subject,
    htmlContent: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #202124;">
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(tutorName)} submitted an urgent ${escapeHtml(requestType || 'session')} request for ${escapeHtml(unitLabel)}.</p>
        <table style="border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 6px 12px 6px 0; font-weight: bold;">Tutor</td><td style="padding: 6px 0;">${escapeHtml(tutorName)} (${escapeHtml(tutorEmail || 'no email')})</td></tr>
          <tr><td style="padding: 6px 12px 6px 0; font-weight: bold;">Current session</td><td style="padding: 6px 0;">${escapeHtml(sessionLabel)}</td></tr>
          <tr><td style="padding: 6px 12px 6px 0; font-weight: bold;">Preferred swap to</td><td style="padding: 6px 0;">${escapeHtml(preferredLabel)}</td></tr>
          <tr><td style="padding: 6px 12px 6px 0; font-weight: bold;">Reason</td><td style="padding: 6px 0;">${escapeHtml(reason || 'No reason provided')}</td></tr>
        </table>
        <p>
          <a href="${reviewUrl}" style="display: inline-block; background: #5b4fc0; color: #ffffff; padding: 12px 18px; border-radius: 6px; text-decoration: none;">
            Review request
          </a>
        </p>
      </div>
    `,
    textContent: [
      title,
      '',
      `${tutorName} submitted an urgent ${requestType || 'session'} request for ${unitLabel}.`,
      `Tutor: ${tutorName}${tutorEmail ? ` (${tutorEmail})` : ''}`,
      `Current session: ${sessionLabel}`,
      `Preferred swap to: ${preferredLabel}`,
      `Reason: ${reason || 'No reason provided'}`,
      '',
      `Review request: ${reviewUrl}`
    ].join('\n')
  });
};

const sendRequestReviewEmail = async ({
  tutorEmail,
  tutorName,
  unitCode,
  unitName,
  requestType,
  status,
  currentSession,
  preferredSwapTo,
  reviewNotes
}) => {
  if (!tutorEmail) return;

  const statusLower = (status || '').toLowerCase();
  const displayStatus = statusLower === 'accepted' ? 'approved' : statusLower || 'updated';
  const unitLabel = unitName ? `${unitCode} - ${unitName}` : unitCode;
  const requestsUrl = `${frontendUrl()}/requests`;
  const sessionLabel = labelFromSessionValue(currentSession);
  const preferredLabel = preferredSwapTo ? labelFromSessionValue(preferredSwapTo) : 'Not specified';
  const subject = statusLower === 'suggested'
    ? `Alternative session suggested for ${unitCode}`
    : `Your ${unitCode} request was ${displayStatus}`;

  await sendEmail({
    to: [{ email: tutorEmail, name: tutorName || undefined }],
    subject,
    htmlContent: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #202124;">
        <h2>${escapeHtml(subject)}</h2>
        <p>Your ${escapeHtml(requestType || 'session')} request for ${escapeHtml(unitLabel)} has been ${escapeHtml(displayStatus)}.</p>
        <table style="border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 6px 12px 6px 0; font-weight: bold;">Current session</td><td style="padding: 6px 0;">${escapeHtml(sessionLabel)}</td></tr>
          <tr><td style="padding: 6px 12px 6px 0; font-weight: bold;">Preferred swap to</td><td style="padding: 6px 0;">${escapeHtml(preferredLabel)}</td></tr>
          <tr><td style="padding: 6px 12px 6px 0; font-weight: bold;">Coordinator note</td><td style="padding: 6px 0;">${escapeHtml(reviewNotes || 'No note provided')}</td></tr>
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
      `Your ${requestType || 'session'} request for ${unitLabel} has been ${displayStatus}.`,
      `Current session: ${sessionLabel}`,
      `Preferred swap to: ${preferredLabel}`,
      `Coordinator note: ${reviewNotes || 'No note provided'}`,
      '',
      `View request: ${requestsUrl}`
    ].join('\n')
  });
};

// Get the logged-in tutor's own requests only
router.get('/requests', verifyToken, requireRole('tutor', 'coordinator'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        cr.id,
        cr.request_type as "requestType",
        cr.reason,
        cr.status,
        cr.review_notes as "reviewNotes",
        cr.created_at as "submittedDate",
        cr.current_session as "currentSession",
        cr.preferred_swap_to as "preferredSwapTo",
        cr.priority,
        cr.unit_id as "unitId",
        TRIM(CONCAT(u.name, ' ', COALESCE(u.last_name, ''))) as "tutorName",
        un.unit_code as "unitCode"
      FROM change_requests cr
      LEFT JOIN users u ON cr.tutor_id = u.id
      LEFT JOIN units un ON cr.unit_id = un.id
      WHERE cr.tutor_id = $1
      ORDER BY 
        CASE WHEN LOWER(cr.priority) = 'urgent' THEN 0 ELSE 1 END,
        cr.created_at DESC
    `, [req.user.id]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching requests:', error);
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

// Create new request (uses the logged-in tutor's own id, not a name lookup)
router.post('/requests', verifyToken, requireRole('tutor', 'coordinator'), async (req, res) => {
  try {
    const {
      unitCode, requestType, priority,
      currentSession, preferredSwapTo, reason
    } = req.body;

    const tutor_id = req.user.id;

    const unitResult = await pool.query(
      `
      SELECT
        un.id,
        un.unit_code,
        un.unit_name,
        un.unit_coordinator_id
      FROM units un
      WHERE un.unit_code = $1
      LIMIT 1
      `,
      [unitCode]
    );
    const unit = unitResult.rows[0];
    const unit_id = unit?.id;
    const coordinators = unit_id ? await getUnitCoordinators(unit_id) : [];

    const priorityValue = priority || 'Normal';

    if (unit_id) {
      await pool.query(
        `
        INSERT INTO unit_memberships (unit_id, user_id, role)
        VALUES ($1, $2, 'tutor')
        ON CONFLICT (unit_id, user_id, role) DO NOTHING
        `,
        [unit_id, tutor_id]
      );
    }

    const result = await pool.query(`
      INSERT INTO change_requests 
      (tutor_id, unit_id, request_type, reason, status, current_session, preferred_swap_to, priority, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING 
        id,
        request_type as "requestType",
        reason,
        status,
        priority,
        current_session as "currentSession",
        preferred_swap_to as "preferredSwapTo",
        created_at as "submittedDate"
    `, [tutor_id, unit_id, requestType, reason, 'Pending', currentSession, preferredSwapTo, priorityValue]);

    console.log('New request created:', result.rows[0].id, 'priority:', priorityValue);

    const tutorDisplayName = await getUserDisplayName(req.user.id);

    if (coordinators.length > 0) {
      await Promise.all(coordinators.map(coordinator => createNotification({
        userId: coordinator.id,
        type: 'request_submitted',
        title: 'New swap/change request',
        content: `${tutorDisplayName} submitted a ${requestType || 'session'} request in ${unitCode}.`,
        unitId: unit_id,
        actionUrl: '/uc-requests'
      })));

      if ((priorityValue || '').toLowerCase() === 'urgent') {
        await Promise.all(coordinators.map(async (coordinator) => {
          try {
          await sendUrgentRequestEmail({
            coordinatorEmail: coordinator.email,
            coordinatorName: coordinator.name,
            tutorName: tutorDisplayName,
            tutorEmail: req.user.email,
            unitCode: unit.unit_code || unitCode,
            unitName: unit.unit_name,
            requestType,
            currentSession,
            preferredSwapTo,
            reason
          });
          } catch (emailError) {
            console.error('Error sending urgent request email:', emailError);
          }
        }));
      }
    }

    res.status(201).json({
      ...result.rows[0],
      tutorName: tutorDisplayName,
      unitCode,
    });
  } catch (error) {
    console.error('Error creating request:', error);
    res.status(500).json({ error: 'Failed to create request' });
  }
});

// Update request. Also used by tutors to appeal a rejected request: they
// send { status: 'Pending', reason: <original + appeal text> } to reopen it,
// which notifies the unit coordinator so it shows back up for review.
router.patch('/requests/:id', verifyToken, requireRole('tutor', 'coordinator'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reviewNotes, reason } = req.body;

    const result = await pool.query(`
      UPDATE change_requests 
      SET 
        status = COALESCE($1, status),
        review_notes = COALESCE($2, review_notes),
        reason = COALESCE($3, reason)
      WHERE id = $4 AND tutor_id = $5
      RETURNING 
        id,
        request_type as "requestType",
        reason,
        status,
        priority,
        review_notes as "reviewNotes",
        current_session as "currentSession",
        preferred_swap_to as "preferredSwapTo",
        created_at as "submittedDate",
        unit_id
    `, [status, reviewNotes, reason, id, req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const updated = result.rows[0];

    // If this update reopened the request as Pending (an appeal), let the
    // unit coordinator know it needs another look.
    if ((status || '').toLowerCase() === 'pending' && updated.unit_id) {
      const unitResult = await pool.query(
        'SELECT unit_code FROM units WHERE id = $1',
        [updated.unit_id]
      );
      const unitCode = unitResult.rows[0]?.unit_code || 'your unit';
      const coordinators = await getUnitCoordinators(updated.unit_id);

      if (coordinators.length > 0) {
        const tutorDisplayName = await getUserDisplayName(req.user.id);
        await Promise.all(coordinators.map(coordinator => createNotification({
          userId: coordinator.id,
          type: 'request_appealed',
          title: 'Rejected request appealed',
          content: `${tutorDisplayName} appealed a rejected request in ${unitCode}.`,
          unitId: updated.unit_id,
          actionUrl: '/uc-requests'
        })));
      }
    }

    console.log('Request updated:', id);
    delete updated.unit_id;
    res.json(updated);
  } catch (error) {
    console.error('Error updating request:', error);
    res.status(500).json({ error: 'Failed to update request' });
  }
});

// Delete request
router.delete('/requests/:id', verifyToken, requireRole('tutor', 'coordinator'), async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM change_requests WHERE id = $1 AND tutor_id = $2 RETURNING id', [id, req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    console.log('Request deleted:', id);
    res.json({ success: true, message: 'Request deleted successfully' });
  } catch (error) {
    console.error('Error deleting request:', error);
    res.status(500).json({ error: 'Failed to delete request' });
  }
});

// Legacy global sessions listing, used by the tutor-facing Sessions page.
// Not unit-scoped like the newer /units/:unitId/sessions endpoints.
router.get('/sessions', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        s.*,
        TRIM(CONCAT(u.name, ' ', COALESCE(u.last_name, ''))) as assigned_tutor_name,
        un.unit_code
      FROM sessions s
      LEFT JOIN users u ON s.assigned_tutor_id = u.id
      LEFT JOIN units un ON s.unit_id = un.id
      ORDER BY s.day, s.start_time
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// Get all requests for UC review
router.get('/uc/requests', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        cr.id,
        cr.request_type as "requestType",
        cr.reason,
        cr.status,
        cr.review_notes as "reviewNotes",
        cr.created_at as "submittedDate",
        cr.current_session as "currentSession",
        cr.preferred_swap_to as "preferredSwapTo",
        cr.priority,
        cr.unit_id as "unitId",
        TRIM(CONCAT(u.name, ' ', COALESCE(u.last_name, ''))) as "tutorName",
        un.unit_code as "unitCode"
      FROM change_requests cr
      LEFT JOIN users u ON cr.tutor_id = u.id
      JOIN units un ON cr.unit_id = un.id
      WHERE EXISTS (
        SELECT 1
        FROM unit_memberships um
        WHERE um.unit_id = un.id
          AND um.user_id = $1
          AND um.role = 'coordinator'
      )
         OR un.unit_coordinator_id = $1
      ORDER BY 
        CASE WHEN cr.status = 'Pending' THEN 0 ELSE 1 END,
        CASE WHEN LOWER(cr.priority) = 'urgent' THEN 0 ELSE 1 END,
        cr.created_at DESC
    `, [req.user.id]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching UC requests:', error);
    res.status(500).json({ error: 'Failed to fetch UC requests' });
  }
});

// Review a request (approve/reject/suggest) - notifies the tutor either way
router.patch('/uc/requests/:id/review', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reviewNotes } = req.body;

    const result = await pool.query(`
      UPDATE change_requests 
      SET 
        status = $1, 
        review_notes = $2, 
        reviewed_by_id = $3,
        reviewed_at = NOW()
      FROM units un
      WHERE change_requests.id = $4
        AND change_requests.unit_id = un.id
        AND (
          un.unit_coordinator_id = $5
          OR EXISTS (
            SELECT 1
            FROM unit_memberships um
            WHERE um.unit_id = un.id
              AND um.user_id = $5
              AND um.role = 'coordinator'
          )
        )
      RETURNING 
        change_requests.id,
        change_requests.request_type as "requestType",
        change_requests.reason,
        change_requests.status,
        change_requests.priority,
        change_requests.review_notes as "reviewNotes",
        change_requests.current_session as "currentSession",
        change_requests.preferred_swap_to as "preferredSwapTo",
        change_requests.created_at as "submittedDate",
        change_requests.tutor_id,
        change_requests.unit_id
    `, [status, reviewNotes, req.user.id, id, req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const updated = result.rows[0];

    const detailsResult = await pool.query(
      `
      SELECT
        un.unit_code,
        un.unit_name,
        TRIM(CONCAT(tutor.name, ' ', COALESCE(tutor.last_name, ''))) as tutor_name,
        tutor.email as tutor_email
      FROM units un
      LEFT JOIN users tutor ON tutor.id = $2
      WHERE un.id = $1
      LIMIT 1
      `,
      [updated.unit_id, updated.tutor_id]
    );
    const details = detailsResult.rows[0] || {};
    const unitCode = details.unit_code || 'your unit';

    const statusLower = (status || '').toLowerCase();
    let title, content;
    if (statusLower === 'accepted') {
      title = 'Request approved';
      content = `Your request in ${unitCode} was approved.`;
    } else if (statusLower === 'rejected') {
      title = 'Request rejected';
      content = `Your request in ${unitCode} was rejected.${reviewNotes ? ` Note: ${reviewNotes}` : ''}`;
    } else if (statusLower === 'suggested') {
      title = 'Alternative session suggested';
      content = `Your coordinator suggested an alternative session for your request in ${unitCode}.`;
    } else {
      title = 'Request updated';
      content = `Your request in ${unitCode} was updated to "${status}".`;
    }

    if (updated.tutor_id) {
      await createNotification({
        userId: updated.tutor_id,
        type: `request_${statusLower || 'updated'}`,
        title,
        content,
        unitId: updated.unit_id,
        actionUrl: '/requests'
      });

      try {
        await sendRequestReviewEmail({
          tutorEmail: details.tutor_email,
          tutorName: details.tutor_name,
          unitCode,
          unitName: details.unit_name,
          requestType: updated.requestType,
          status,
          currentSession: updated.currentSession,
          preferredSwapTo: updated.preferredSwapTo,
          reviewNotes
        });
      } catch (emailError) {
        console.error('Error sending request review email:', emailError);
      }
    }

    console.log('Request reviewed:', id, status);
    res.json(updated);
  } catch (error) {
    console.error('Error reviewing request:', error);
    res.status(500).json({ error: 'Failed to review request' });
  }
});

module.exports = router;
