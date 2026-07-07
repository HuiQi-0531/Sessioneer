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

// Get all tutors, with their priority marker/notes/tags for this unit if set.
// Phone, experience, and contract type are read-only here (the tutor sets these themselves).
router.get('/', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const { unitId } = req.params;
    const ownedUnitId = await getOwnedUnitId(unitId, req.user.id);
    if (!ownedUnitId) return res.status(404).json({ error: 'Unit not found' });

    const result = await pool.query(
      `
      SELECT
        u.id, u.name, u.email, u.phone_number, u.work_experience,
        u.maximum_hours, u.contract_type,
        m.priority_tag, m.internal_notes, m.tags
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
      phoneNumber: t.phone_number,
      workExperience: t.work_experience,
      maximumHours: t.maximum_hours,
      contractType: t.contract_type,
      priorityTag: t.priority_tag || 'Standard',
      internalNotes: t.internal_notes || '',
      tags: t.tags || []
    }));

    res.json(tutors);
  } catch (error) {
    console.error('Error fetching tutors:', error);
    res.status(500).json({ error: 'Failed to fetch tutors' });
  }
});

// Set (or update) a tutor's priority marker, notes, and free-text tags for this unit
router.put('/:tutorId/marker', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const { unitId, tutorId } = req.params;
    const ownedUnitId = await getOwnedUnitId(unitId, req.user.id);
    if (!ownedUnitId) return res.status(404).json({ error: 'Unit not found' });

    const { priorityTag, internalNotes, tags } = req.body;
    const cleanTags = Array.isArray(tags)
      ? tags.map(t => t.trim()).filter(t => t.length > 0)
      : [];

    const result = await pool.query(
      `
      INSERT INTO tutor_unit_markers (unit_id, tutor_id, priority_tag, internal_notes, tags)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (unit_id, tutor_id)
      DO UPDATE SET priority_tag = $3, internal_notes = $4, tags = $5
      RETURNING priority_tag, internal_notes, tags
      `,
      [unitId, tutorId, priorityTag || 'Standard', internalNotes || null, cleanTags]
    );

    res.json({
      priorityTag: result.rows[0].priority_tag,
      internalNotes: result.rows[0].internal_notes || '',
      tags: result.rows[0].tags || []
    });
  } catch (error) {
    console.error('Error updating tutor marker:', error);
    res.status(500).json({ error: 'Failed to update tutor marker' });
  }
});

module.exports = router;