const express = require('express');
const pool = require('../db');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

const formatNotification = (n) => ({
  id: n.id,
  type: n.notification_type,
  title: n.title,
  content: n.content,
  relatedUnitId: n.related_unit_id,
  relatedSessionId: n.related_session_id,
  actionUrl: n.action_url,
  isRead: n.is_read,
  createdAt: n.created_at
});

// Get the logged-in user's notifications (most recent first)
router.get('/', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT * FROM notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 30
      `,
      [req.user.id]
    );

    const unreadResult = await pool.query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = FALSE',
      [req.user.id]
    );

    res.json({
      notifications: result.rows.map(formatNotification),
      unreadCount: parseInt(unreadResult.rows[0].count, 10)
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Mark a single notification as read
router.patch('/:id/read', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(
      'UPDATE notifications SET is_read = TRUE, read_at = NOW() WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Error marking notification read:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// Mark all of the logged-in user's notifications as read
router.patch('/read-all', verifyToken, async (req, res) => {
  try {
    await pool.query(
      'UPDATE notifications SET is_read = TRUE, read_at = NOW() WHERE user_id = $1 AND is_read = FALSE',
      [req.user.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Error marking all notifications read:', error);
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
});

module.exports = router;