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

// Get all tutors, with their priority marker/notes for this unit if set
router.get('/', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const { unitId } = req.params;
    const ownedUnitId = await getOwnedUnitId(unitId, req.user.id);
    if (!ownedUnitId) return res.status(404).json({ error: 'Unit not found' });

    const result = await pool.query(
      `
      SELECT
        u.id, u.name, u.email, u.maximum_hours,
        m.priority_tag, m.internal_notes
      FROM users u
      LEFT JOIN tutor_unit_markers m
        ON m.tutor_id = u.id AND m.unit_id = $1
      WHERE u.role = 'tutor'
      ORDER BY u.name
      `,
      [unitId]
    );

    const tutors = result.rows.map(t => ({
      id: t.id,
      name: t.name,
      email: t.email,
      maximumHours: t.maximum_hours,
      priorityTag: t.priority_tag || 'Standard',
      internalNotes: t.internal_notes || ''
    }));

    res.json(tutors);
  } catch (error) {
    console.error('Error fetching tutors:', error);
    res.status(500).json({ error: 'Failed to fetch tutors' });
  }
});

// Set (or update) a tutor's priority marker and notes for this unit
router.put('/:tutorId/marker', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const { unitId, tutorId } = req.params;
    const ownedUnitId = await getOwnedUnitId(unitId, req.user.id);
    if (!ownedUnitId) return res.status(404).json({ error: 'Unit not found' });

    const { priorityTag, internalNotes } = req.body;

    const result = await pool.query(
      `
      INSERT INTO tutor_unit_markers (unit_id, tutor_id, priority_tag, internal_notes)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (unit_id, tutor_id)
      DO UPDATE SET priority_tag = $3, internal_notes = $4
      RETURNING priority_tag, internal_notes
      `,
      [unitId, tutorId, priorityTag || 'Standard', internalNotes || null]
    );

    res.json({
      priorityTag: result.rows[0].priority_tag,
      internalNotes: result.rows[0].internal_notes || ''
    });
  } catch (error) {
    console.error('Error updating tutor marker:', error);
    res.status(500).json({ error: 'Failed to update tutor marker' });
  }
});

module.exports = router;