const express = require('express');
const pool = require('../db');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Get the logged-in tutor's own requests only
router.get('/requests', verifyToken, requireRole('tutor'), async (req, res) => {
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

// Create new request
router.post('/requests', verifyToken, async (req, res) => {
  try {
    const {
      tutorName, unitCode, requestType, priority,
      currentSession, preferredSwapTo, reason
    } = req.body;

    const tutorResult = await pool.query(
      'SELECT id FROM users WHERE name = $1 LIMIT 1',
      [tutorName || 'Elaine Lee']
    );
    const tutor_id = tutorResult.rows[0]?.id;

    const unitResult = await pool.query(
      'SELECT id FROM units WHERE unit_code = $1 LIMIT 1',
      [unitCode]
    );
    const unit_id = unitResult.rows[0]?.id;

    const priorityValue = priority || 'Normal';

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

    res.status(201).json({
      ...result.rows[0],
      tutorName: req.user.email,
      unitCode,
    });
  } catch (error) {
    console.error('Error creating request:', error);
    res.status(500).json({ error: 'Failed to create request' });
  }
});

// Update request
router.patch('/requests/:id', verifyToken, requireRole('tutor'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reviewNotes } = req.body;

    const result = await pool.query(`
      UPDATE change_requests 
      SET 
        status = COALESCE($1, status),
        review_notes = COALESCE($2, review_notes)
      WHERE id = $3 AND tutor_id = $4
      RETURNING 
        id,
        request_type as "requestType",
        reason,
        status,
        priority,
        review_notes as "reviewNotes",
        current_session as "currentSession",
        preferred_swap_to as "preferredSwapTo",
        created_at as "submittedDate"
    `, [status, reviewNotes, id, req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    console.log('Request updated:', id);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating request:', error);
    res.status(500).json({ error: 'Failed to update request' });
  }
});

// Delete request
router.delete('/requests/:id', verifyToken, requireRole('tutor'), async (req, res) => {
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
      LEFT JOIN units un ON cr.unit_id = un.id
      ORDER BY 
        CASE WHEN cr.status = 'Pending' THEN 0 ELSE 1 END,
        CASE WHEN LOWER(cr.priority) = 'urgent' THEN 0 ELSE 1 END,
        cr.created_at DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching UC requests:', error);
    res.status(500).json({ error: 'Failed to fetch UC requests' });
  }
});

// Review a request (approve/reject/suggest)
router.patch('/uc/requests/:id/review', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reviewNotes } = req.body;

    const ucResult = await pool.query(
      "SELECT id FROM users WHERE role = 'coordinator' LIMIT 1"
    );
    const reviewed_by_id = ucResult.rows[0]?.id;

    const result = await pool.query(`
      UPDATE change_requests 
      SET 
        status = $1, 
        review_notes = $2, 
        reviewed_by_id = $3,
        reviewed_at = NOW()
      WHERE id = $4
      RETURNING 
        id,
        request_type as "requestType",
        reason,
        status,
        priority,
        review_notes as "reviewNotes",
        created_at as "submittedDate"
    `, [status, reviewNotes, reviewed_by_id, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    console.log('Request reviewed:', id, status);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error reviewing request:', error);
    res.status(500).json({ error: 'Failed to review request' });
  }
});

module.exports = router;