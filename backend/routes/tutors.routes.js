const express = require('express');
const pool = require('../db');
const { verifyToken, requireRole } = require('../middleware/auth');
const { getCoordinatorUnitId } = require('../utils/unitAccess');
const { TUTOR_LIKE_ROLES } = require('../utils/roles');

// mergeParams lets this router read :unitId from the parent route in server.js
const router = express.Router({ mergeParams: true });

const getOwnedUnitId = async (unitId, coordinatorId) => {
  return getCoordinatorUnitId(unitId, coordinatorId);
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
        u.id, TRIM(CONCAT(u.name, ' ', COALESCE(u.last_name, ''))) AS name, u.email, u.phone_number, u.work_experience,
        u.maximum_hours, u.contract_type, um.role AS membership_role,
        m.priority_tag, m.internal_notes, m.tags, m.early_access, m.starred, m.flagged
      FROM users u
      JOIN unit_memberships um
        ON um.user_id = u.id AND um.unit_id = $1 AND um.role = ANY($2)
      LEFT JOIN tutor_unit_markers m
        ON m.tutor_id = u.id AND m.unit_id = $1
      ORDER BY name
      `,
      [unitId, TUTOR_LIKE_ROLES]
    );

    const tutors = result.rows.map(t => ({
      id: t.id,
      name: t.name,
      email: t.email,
      phoneNumber: t.phone_number,
      workExperience: t.work_experience,
      maximumHours: t.maximum_hours,
      contractType: t.contract_type,
      role: t.membership_role || 'tutor',
      isSuperTutor: t.membership_role === 'super_tutor',
      priorityTag: t.priority_tag || 'Standard',
      internalNotes: t.internal_notes || '',
      tags: t.tags || [],
      earlyAccess: t.early_access || false,
      starred: t.starred || false,
      flagged: t.flagged || false
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

// Toggle whether a specific tutor can see the timetable before the UC
// releases the draft (or locks/finalises the schedule) for everyone.
router.put('/:tutorId/early-access', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const { unitId, tutorId } = req.params;
    const ownedUnitId = await getOwnedUnitId(unitId, req.user.id);
    if (!ownedUnitId) return res.status(404).json({ error: 'Unit not found' });

    const { earlyAccess } = req.body;

    const result = await pool.query(
      `
      INSERT INTO tutor_unit_markers (unit_id, tutor_id, early_access)
      VALUES ($1, $2, $3)
      ON CONFLICT (unit_id, tutor_id)
      DO UPDATE SET early_access = $3
      RETURNING early_access
      `,
      [unitId, tutorId, !!earlyAccess]
    );

    res.json({ earlyAccess: result.rows[0].early_access });
  } catch (error) {
    console.error('Error updating early access:', error);
    res.status(500).json({ error: 'Failed to update early access' });
  }
});

// Toggle whether a coordinator has starred a tutor (marks them as a favourite/priority pick).
router.put('/:tutorId/starred', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const { unitId, tutorId } = req.params;
    const ownedUnitId = await getOwnedUnitId(unitId, req.user.id);
    if (!ownedUnitId) return res.status(404).json({ error: 'Unit not found' });

    const { starred } = req.body;

    const result = await pool.query(
      `
      INSERT INTO tutor_unit_markers (unit_id, tutor_id, starred)
      VALUES ($1, $2, $3)
      ON CONFLICT (unit_id, tutor_id)
      DO UPDATE SET starred = $3
      RETURNING starred
      `,
      [unitId, tutorId, !!starred]
    );

    res.json({ starred: result.rows[0].starred });
  } catch (error) {
    console.error('Error updating starred status:', error);
    res.status(500).json({ error: 'Failed to update starred status' });
  }
});

// Toggle whether a coordinator has flagged a tutor (marks them as a risk/caution case).
router.put('/:tutorId/flagged', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const { unitId, tutorId } = req.params;
    const ownedUnitId = await getOwnedUnitId(unitId, req.user.id);
    if (!ownedUnitId) return res.status(404).json({ error: 'Unit not found' });

    const { flagged } = req.body;

    const result = await pool.query(
      `
      INSERT INTO tutor_unit_markers (unit_id, tutor_id, flagged)
      VALUES ($1, $2, $3)
      ON CONFLICT (unit_id, tutor_id)
      DO UPDATE SET flagged = $3
      RETURNING flagged
      `,
      [unitId, tutorId, !!flagged]
    );

    res.json({ flagged: result.rows[0].flagged });
  } catch (error) {
    console.error('Error updating flagged status:', error);
    res.status(500).json({ error: 'Failed to update flagged status' });
  }
});

module.exports = router;