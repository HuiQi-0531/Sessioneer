const express = require('express');
const pool = require('../db');
const { verifyToken, requireRole } = require('../middleware/auth');
const { createNotification, getUserDisplayName } = require('../utils/notify');

const router = express.Router();

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
        u.name as "tutorName",
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
      'SELECT id, unit_coordinator_id FROM units WHERE unit_code = $1 LIMIT 1',
      [unitCode]
    );
    const unit_id = unitResult.rows[0]?.id;
    const coordinatorId = unitResult.rows[0]?.unit_coordinator_id;

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

    if (coordinatorId) {
      await createNotification({
        userId: coordinatorId,
        type: 'request_submitted',
        title: 'New swap/change request',
        content: `${tutorDisplayName} submitted a ${requestType || 'session'} request in ${unitCode}.`,
        unitId: unit_id,
        actionUrl: '/uc-requests'
      });
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
        'SELECT unit_code, unit_coordinator_id FROM units WHERE id = $1',
        [updated.unit_id]
      );
      const unitCode = unitResult.rows[0]?.unit_code || 'your unit';
      const coordinatorId = unitResult.rows[0]?.unit_coordinator_id;

      if (coordinatorId) {
        const tutorDisplayName = await getUserDisplayName(req.user.id);
        await createNotification({
          userId: coordinatorId,
          type: 'request_appealed',
          title: 'Rejected request appealed',
          content: `${tutorDisplayName} appealed a rejected request in ${unitCode}.`,
          unitId: updated.unit_id,
          actionUrl: '/uc-requests'
        });
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
        u.name as assigned_tutor_name,
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
        u.name as "tutorName",
        un.unit_code as "unitCode"
      FROM change_requests cr
      LEFT JOIN users u ON cr.tutor_id = u.id
      JOIN units un ON cr.unit_id = un.id
      WHERE un.unit_coordinator_id = $1
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
        AND un.unit_coordinator_id = $5
      RETURNING 
        change_requests.id,
        change_requests.request_type as "requestType",
        change_requests.reason,
        change_requests.status,
        change_requests.priority,
        change_requests.review_notes as "reviewNotes",
        change_requests.created_at as "submittedDate",
        change_requests.tutor_id,
        change_requests.unit_id
    `, [status, reviewNotes, req.user.id, id, req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const updated = result.rows[0];

    const unitResult = await pool.query('SELECT unit_code FROM units WHERE id = $1', [updated.unit_id]);
    const unitCode = unitResult.rows[0]?.unit_code || 'your unit';

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
    }

    console.log('Request reviewed:', id, status);
    res.json(updated);
  } catch (error) {
    console.error('Error reviewing request:', error);
    res.status(500).json({ error: 'Failed to review request' });
  }
});

module.exports = router;
