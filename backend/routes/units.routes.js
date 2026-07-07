const express = require('express');
const pool = require('../db');
const { verifyToken, requireRole } = require('../middleware/auth');
const { isUnitActive } = require('../utils/normalise');

const router = express.Router();

const formatUnit = (u) => ({
  id: u.id,
  unitCode: u.unit_code,
  unitName: u.unit_name,
  semester: u.semester,
  year: u.year,
  campus: u.campus,
  deliveryMode: u.delivery_mode,
  enrolmentSize: u.enrolment_size,
  availabilityDeadline: u.availability_deadline,
  availabilityLocked: u.availability_locked,
  isActive: isUnitActive(u.semester, u.year)
});

// Get all units belonging to the logged-in coordinator
router.get('/', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT id, unit_code, unit_name, semester, year, campus,
             delivery_mode, enrolment_size, availability_deadline,
             availability_locked, created_at
      FROM units
      WHERE unit_coordinator_id = $1
      ORDER BY year DESC, semester DESC, created_at DESC
      `,
      [req.user.id]
    );

    res.json(result.rows.map(formatUnit));
  } catch (error) {
    console.error('Error fetching units:', error);
    res.status(500).json({ error: 'Failed to fetch units' });
  }
});

// Get a single unit (must belong to the logged-in coordinator)
router.get('/:id', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `
      SELECT id, unit_code, unit_name, semester, year, campus,
             delivery_mode, enrolment_size, availability_deadline,
             availability_locked, created_at
      FROM units
      WHERE id = $1 AND unit_coordinator_id = $2
      `,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    res.json(formatUnit(result.rows[0]));
  } catch (error) {
    console.error('Error fetching unit:', error);
    res.status(500).json({ error: 'Failed to fetch unit' });
  }
});

// Create a new unit
router.post('/', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const {
      unitCode, unitName, semester, year,
      campus, deliveryMode, enrolmentSize, availabilityDeadline
    } = req.body;

    if (!unitCode || !unitName || !semester || !year || !deliveryMode) {
      return res.status(400).json({
        error: 'Unit code, unit name, semester, year, and delivery mode are required'
      });
    }

    const result = await pool.query(
      `
      INSERT INTO units
        (unit_coordinator_id, unit_code, unit_name, semester, year,
         campus, delivery_mode, enrolment_size, availability_deadline)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, unit_code, unit_name, semester, year, campus,
                delivery_mode, enrolment_size, availability_deadline
      `,
      [
        req.user.id, unitCode, unitName, semester, year,
        campus || null, deliveryMode, enrolmentSize || null,
        availabilityDeadline || null
      ]
    );

    res.status(201).json(formatUnit(result.rows[0]));
  } catch (error) {
    console.error('Error creating unit:', error);
    res.status(500).json({ error: 'Failed to create unit' });
  }
});

// Update an existing unit
router.put('/:id', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      unitCode, unitName, semester, year,
      campus, deliveryMode, enrolmentSize, availabilityDeadline
    } = req.body;

    const result = await pool.query(
      `
      UPDATE units
      SET
        unit_code = COALESCE($1, unit_code),
        unit_name = COALESCE($2, unit_name),
        semester = COALESCE($3, semester),
        year = COALESCE($4, year),
        campus = COALESCE($5, campus),
        delivery_mode = COALESCE($6, delivery_mode),
        enrolment_size = COALESCE($7, enrolment_size),
        availability_deadline = COALESCE($8, availability_deadline)
      WHERE id = $9 AND unit_coordinator_id = $10
      RETURNING id, unit_code, unit_name, semester, year, campus,
                delivery_mode, enrolment_size, availability_deadline
      `,
      [
        unitCode, unitName, semester, year, campus,
        deliveryMode, enrolmentSize, availabilityDeadline,
        id, req.user.id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    res.json(formatUnit(result.rows[0]));
  } catch (error) {
    console.error('Error updating unit:', error);
    res.status(500).json({ error: 'Failed to update unit' });
  }
});

// Delete a unit
router.delete('/:id', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM units WHERE id = $1 AND unit_coordinator_id = $2 RETURNING id',
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    res.json({ success: true, message: 'Unit deleted successfully' });
  } catch (error) {
    console.error('Error deleting unit:', error);
    res.status(500).json({ error: 'Failed to delete unit' });
  }
});

module.exports = router;