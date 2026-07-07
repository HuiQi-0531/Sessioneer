const express = require('express');
const pool = require('../db');
const { verifyToken, requireRole } = require('../middleware/auth');

// mergeParams lets this router read :unitId from the parent route in server.js
const router = express.Router({ mergeParams: true });

const getOwnedUnitId = async (unitId, coordinatorId) => {
  const result = await pool.query(
    'SELECT id FROM units WHERE id = $1 AND unit_coordinator_id = $2',
    [unitId, coordinatorId]
  );
  return result.rows[0]?.id || null;
};

/**
 * GET /units/:unitId/messages/contacts
 * Returns every tutor as a potential 1-on-1 contact for this unit, each
 * with a last-message preview and unread count against the logged-in coordinator.
 */
router.get('/contacts', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const { unitId } = req.params;
    const ownedUnitId = await getOwnedUnitId(unitId, req.user.id);
    if (!ownedUnitId) return res.status(404).json({ error: 'Unit not found' });

    const tutorsResult = await pool.query(
      `SELECT id, name, email FROM users WHERE role = 'tutor' ORDER BY name`
    );

    const contacts = await Promise.all(tutorsResult.rows.map(async (tutor) => {
      const lastMsgResult = await pool.query(
        `
        SELECT content, sent_at
        FROM messages
        WHERE unit_id IS NULL
          AND ((sender_id = $1 AND recipient_id = $2) OR (sender_id = $2 AND recipient_id = $1))
        ORDER BY sent_at DESC
        LIMIT 1
        `,
        [req.user.id, tutor.id]
      );

      const unreadResult = await pool.query(
        `SELECT COUNT(*) FROM messages WHERE unit_id IS NULL AND sender_id = $1 AND recipient_id = $2 AND is_read = FALSE`,
        [tutor.id, req.user.id]
      );

      return {
        userId: tutor.id,
        name: tutor.name,
        email: tutor.email,
        lastMessage: lastMsgResult.rows[0]?.content || null,
        lastMessageAt: lastMsgResult.rows[0]?.sent_at || null,
        unreadCount: parseInt(unreadResult.rows[0].count, 10)
      };
    }));

    res.json(contacts);
  } catch (error) {
    console.error('Error fetching unit contacts:', error);
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

/**
 * GET /units/:unitId/messages/group-unread-count
 * How many group chat messages in this unit the logged-in user hasn't
 * seen yet (based on their last_read_at in group_chat_reads).
 */
router.get('/group-unread-count', verifyToken, async (req, res) => {
  try {
    const { unitId } = req.params;

    const lastReadResult = await pool.query(
      'SELECT last_read_at FROM group_chat_reads WHERE unit_id = $1 AND user_id = $2',
      [unitId, req.user.id]
    );
    const lastReadAt = lastReadResult.rows[0]?.last_read_at || new Date(0);

    const countResult = await pool.query(
      `
      SELECT COUNT(*) FROM messages
      WHERE unit_id = $1 AND sent_at > $2 AND sender_id != $3
      `,
      [unitId, lastReadAt, req.user.id]
    );

    res.json({ unreadCount: parseInt(countResult.rows[0].count, 10) });
  } catch (error) {
    console.error('Error fetching group unread count:', error);
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});

module.exports = router;