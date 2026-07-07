const express = require('express');
const pool = require('../db');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Get the full message thread between the logged-in user and another user (1-on-1)
router.get('/thread/:otherUserId', verifyToken, async (req, res) => {
  try {
    const { otherUserId } = req.params;

    const result = await pool.query(
      `
      SELECT id, sender_id, recipient_id, content, is_read, sent_at
      FROM messages
      WHERE unit_id IS NULL
        AND ((sender_id = $1 AND recipient_id = $2)
         OR (sender_id = $2 AND recipient_id = $1))
      ORDER BY sent_at ASC
      `,
      [req.user.id, otherUserId]
    );

    res.json(result.rows.map(m => ({
      id: m.id,
      senderId: m.sender_id,
      recipientId: m.recipient_id,
      content: m.content,
      isRead: m.is_read,
      sentAt: m.sent_at,
      isMine: m.sender_id === req.user.id
    })));
  } catch (error) {
    console.error('Error fetching message thread:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Send a 1-on-1 message
router.post('/', verifyToken, async (req, res) => {
  try {
    const { recipientId, content } = req.body;
    if (!recipientId || !content || !content.trim()) {
      return res.status(400).json({ error: 'recipientId and content are required' });
    }

    const result = await pool.query(
      `
      INSERT INTO messages (sender_id, recipient_id, content, sent_at)
      VALUES ($1, $2, $3, NOW())
      RETURNING id, sender_id, recipient_id, content, is_read, sent_at
      `,
      [req.user.id, recipientId, content.trim()]
    );

    const m = result.rows[0];
    res.status(201).json({
      id: m.id,
      senderId: m.sender_id,
      recipientId: m.recipient_id,
      content: m.content,
      isRead: m.is_read,
      sentAt: m.sent_at,
      isMine: true
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Mark all 1-on-1 messages from otherUserId to the logged-in user as read
router.patch('/thread/:otherUserId/read', verifyToken, async (req, res) => {
  try {
    const { otherUserId } = req.params;
    await pool.query(
      `
      UPDATE messages
      SET is_read = TRUE, read_at = NOW()
      WHERE unit_id IS NULL AND sender_id = $1 AND recipient_id = $2 AND is_read = FALSE
      `,
      [otherUserId, req.user.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Error marking messages read:', error);
    res.status(500).json({ error: 'Failed to mark messages as read' });
  }
});

/**
 * GET /messages/my-contacts (tutor only)
 * Returns the coordinators this tutor can message: the coordinator of
 * every unit they have submitted availability for or been assigned a
 * session in, along with a last-message preview and unread count.
 */
router.get('/my-contacts', verifyToken, requireRole('tutor'), async (req, res) => {
  try {
    const unitsResult = await pool.query(
      `
      SELECT DISTINCT u.id as unit_id, u.unit_code, u.unit_name, u.unit_coordinator_id,
             c.id as coordinator_id, c.name as coordinator_name
      FROM units u
      JOIN users c ON c.id = u.unit_coordinator_id
      WHERE u.id IN (
        SELECT unit_id FROM availability WHERE tutor_id = $1
        UNION
        SELECT unit_id FROM sessions WHERE assigned_tutor_id = $1
      )
      `,
      [req.user.id]
    );

    const contacts = await Promise.all(unitsResult.rows.map(async (row) => {
      const lastMsgResult = await pool.query(
        `
        SELECT content, sent_at, sender_id
        FROM messages
        WHERE unit_id IS NULL
          AND ((sender_id = $1 AND recipient_id = $2) OR (sender_id = $2 AND recipient_id = $1))
        ORDER BY sent_at DESC
        LIMIT 1
        `,
        [req.user.id, row.coordinator_id]
      );

      const unreadResult = await pool.query(
        `SELECT COUNT(*) FROM messages WHERE unit_id IS NULL AND sender_id = $1 AND recipient_id = $2 AND is_read = FALSE`,
        [row.coordinator_id, req.user.id]
      );

      return {
        userId: row.coordinator_id,
        name: row.coordinator_name,
        unitId: row.unit_id,
        unitCode: row.unit_code,
        unitName: row.unit_name,
        lastMessage: lastMsgResult.rows[0]?.content || null,
        lastMessageAt: lastMsgResult.rows[0]?.sent_at || null,
        unreadCount: parseInt(unreadResult.rows[0].count, 10)
      };
    }));

    res.json(contacts);
  } catch (error) {
    console.error('Error fetching tutor contacts:', error);
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

/**
 * GET /messages/group/:unitId
 * Full group chat history for a unit. Anyone who is either the unit's
 * coordinator or a tutor connected to the unit can read it.
 */
router.get('/group/:unitId', verifyToken, async (req, res) => {
  try {
    const { unitId } = req.params;

    const result = await pool.query(
      `
      SELECT m.id, m.sender_id, m.content, m.sent_at, u.name as sender_name
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.unit_id = $1
      ORDER BY m.sent_at ASC
      `,
      [unitId]
    );

    res.json(result.rows.map(m => ({
      id: m.id,
      senderId: m.sender_id,
      senderName: m.sender_name,
      content: m.content,
      sentAt: m.sent_at,
      isMine: m.sender_id === req.user.id
    })));
  } catch (error) {
    console.error('Error fetching group chat:', error);
    res.status(500).json({ error: 'Failed to fetch group chat' });
  }
});

// Send a message to a unit's group chat
router.post('/group/:unitId', verifyToken, async (req, res) => {
  try {
    const { unitId } = req.params;
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'content is required' });
    }

    const result = await pool.query(
      `
      INSERT INTO messages (sender_id, unit_id, content, sent_at)
      VALUES ($1, $2, $3, NOW())
      RETURNING id, sender_id, content, sent_at
      `,
      [req.user.id, unitId, content.trim()]
    );

    const m = result.rows[0];
    res.status(201).json({
      id: m.id,
      senderId: m.sender_id,
      senderName: req.user.name || null,
      content: m.content,
      sentAt: m.sent_at,
      isMine: true
    });
  } catch (error) {
    console.error('Error sending group message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Mark the group chat as read up to now for the logged-in user
router.patch('/group/:unitId/read', verifyToken, async (req, res) => {
  try {
    const { unitId } = req.params;
    await pool.query(
      `
      INSERT INTO group_chat_reads (unit_id, user_id, last_read_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (unit_id, user_id)
      DO UPDATE SET last_read_at = NOW()
      `,
      [unitId, req.user.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Error marking group chat read:', error);
    res.status(500).json({ error: 'Failed to mark group chat as read' });
  }
});

module.exports = router;