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

const isTutorLinkedToUnit = async (tutorId, unitId) => {
  const result = await pool.query(
    `
    SELECT 1 WHERE EXISTS (
      SELECT 1 FROM availability WHERE tutor_id = $1 AND unit_id = $2
      UNION
      SELECT 1 FROM sessions WHERE assigned_tutor_id = $1 AND unit_id = $2
    )
    `,
    [tutorId, unitId]
  );
  return result.rows.length > 0;
};

const buildContact = async (currentUserId, otherUserId, name, email) => {
  const lastMsgResult = await pool.query(
    `
    SELECT content, sent_at
    FROM messages
    WHERE unit_id IS NULL
      AND ((sender_id = $1 AND recipient_id = $2) OR (sender_id = $2 AND recipient_id = $1))
    ORDER BY sent_at DESC
    LIMIT 1
    `,
    [currentUserId, otherUserId]
  );

  const unreadResult = await pool.query(
    `SELECT COUNT(*) FROM messages WHERE unit_id IS NULL AND sender_id = $1 AND recipient_id = $2 AND is_read = FALSE`,
    [otherUserId, currentUserId]
  );

  return {
    userId: otherUserId,
    name,
    email,
    lastMessage: lastMsgResult.rows[0]?.content || null,
    lastMessageAt: lastMsgResult.rows[0]?.sent_at || null,
    unreadCount: parseInt(unreadResult.rows[0].count, 10)
  };
};

/**
 * GET /units/:unitId/messages/contacts
 * Coordinator: every tutor, as a potential 1-on-1 contact.
 * Tutor: the unit's coordinator, plus every other tutor linked to the
 * same unit (peer-to-peer messaging).
 */
router.get('/contacts', verifyToken, async (req, res) => {
  try {
    const { unitId } = req.params;

    if (req.user.role === 'coordinator') {
      const ownedUnitId = await getOwnedUnitId(unitId, req.user.id);
      if (!ownedUnitId) return res.status(404).json({ error: 'Unit not found' });

      const tutorsResult = await pool.query(
        `SELECT id, name, email FROM users WHERE role = 'tutor' ORDER BY name`
      );

      const contacts = await Promise.all(
        tutorsResult.rows.map(t => buildContact(req.user.id, t.id, t.name, t.email))
      );
      return res.json(contacts);
    }

    if (req.user.role === 'tutor') {
      const linked = await isTutorLinkedToUnit(req.user.id, unitId);
      if (!linked) return res.status(403).json({ error: 'You are not linked to this unit' });

      const unitResult = await pool.query(
        `
        SELECT c.id, c.name, c.email
        FROM units u
        JOIN users c ON c.id = u.unit_coordinator_id
        WHERE u.id = $1
        `,
        [unitId]
      );
      const coordinator = unitResult.rows[0];

      const peerTutorsResult = await pool.query(
        `SELECT id, name, email FROM users WHERE role = 'tutor' AND id != $1 ORDER BY name`,
        [req.user.id]
      );

      const contacts = [];
      if (coordinator) {
        contacts.push(await buildContact(req.user.id, coordinator.id, coordinator.name, coordinator.email));
      }
      for (const t of peerTutorsResult.rows) {
        contacts.push(await buildContact(req.user.id, t.id, t.name, t.email));
      }

      return res.json(contacts);
    }

    return res.status(403).json({ error: 'Forbidden' });
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