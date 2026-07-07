const express = require('express');
const pool = require('../db');
const { verifyToken, requireRole } = require('../middleware/auth');
const { normaliseDay, normaliseTime } = require('../utils/normalise');

// mergeParams lets this router read :unitId from the parent route in server.js
const router = express.Router({ mergeParams: true });

// Confirms the given unit belongs to the logged-in coordinator.
const getOwnedUnitId = async (unitId, coordinatorId) => {
  const result = await pool.query(
    'SELECT id FROM units WHERE id = $1 AND unit_coordinator_id = $2',
    [unitId, coordinatorId]
  );
  return result.rows[0]?.id || null;
};

const formatSessionRow = (s) => ({
  id: s.id,
  day: s.day,
  startTime: s.start_time,
  endTime: s.end_time,
  location: s.location,
  campus: s.campus,
  sessionType: s.session_type,
  capacity: s.capacity,
  status: s.status,
  staffNote: s.staff_note,
  isAssigned: s.is_assigned,
  assignedTutorName: s.assigned_tutor_name || null
});

// Get all sessions for a unit
router.get('/', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const { unitId } = req.params;
    const ownedUnitId = await getOwnedUnitId(unitId, req.user.id);
    if (!ownedUnitId) return res.status(404).json({ error: 'Unit not found' });

    const result = await pool.query(
      `
      SELECT s.*, u.name as assigned_tutor_name
      FROM sessions s
      LEFT JOIN users u ON s.assigned_tutor_id = u.id
      WHERE s.unit_id = $1
      ORDER BY
        CASE s.day
          WHEN 'MON' THEN 1 WHEN 'TUE' THEN 2 WHEN 'WED' THEN 3
          WHEN 'THU' THEN 4 WHEN 'FRI' THEN 5 WHEN 'SAT' THEN 6 ELSE 7
        END,
        s.start_time
      `,
      [unitId]
    );

    res.json(result.rows.map(formatSessionRow));
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// Manually add a single session
router.post('/', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const { unitId } = req.params;
    const ownedUnitId = await getOwnedUnitId(unitId, req.user.id);
    if (!ownedUnitId) return res.status(404).json({ error: 'Unit not found' });

    const { day, startTime, endTime, location, campus, sessionType, capacity, status } = req.body;
    const normalisedDay = normaliseDay(day) || day;

    if (!normalisedDay || !startTime || !endTime) {
      return res.status(400).json({ error: 'Day, start time, and end time are required' });
    }

    const result = await pool.query(
      `
      INSERT INTO sessions
        (unit_id, day, start_time, end_time, location, campus, session_type, capacity, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
      `,
      [
        unitId, normalisedDay, startTime, endTime,
        location || null, campus || null, sessionType || null,
        capacity || null, status || 'Confirmed'
      ]
    );

    res.status(201).json(formatSessionRow(result.rows[0]));
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// Update a single session
router.put('/:sessionId', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const { unitId, sessionId } = req.params;
    const ownedUnitId = await getOwnedUnitId(unitId, req.user.id);
    if (!ownedUnitId) return res.status(404).json({ error: 'Unit not found' });

    const { day, startTime, endTime, location, campus, sessionType, capacity, status } = req.body;
    const normalisedDay = day ? (normaliseDay(day) || day) : null;

    const result = await pool.query(
      `
      UPDATE sessions
      SET
        day = COALESCE($1, day),
        start_time = COALESCE($2, start_time),
        end_time = COALESCE($3, end_time),
        location = COALESCE($4, location),
        campus = COALESCE($5, campus),
        session_type = COALESCE($6, session_type),
        capacity = COALESCE($7, capacity),
        status = COALESCE($8, status)
      WHERE id = $9 AND unit_id = $10
      RETURNING *
      `,
      [normalisedDay, startTime, endTime, location, campus, sessionType, capacity, status, sessionId, unitId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json(formatSessionRow(result.rows[0]));
  } catch (error) {
    console.error('Error updating session:', error);
    res.status(500).json({ error: 'Failed to update session' });
  }
});

// Delete a single session
router.delete('/:sessionId', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const { unitId, sessionId } = req.params;
    const ownedUnitId = await getOwnedUnitId(unitId, req.user.id);
    if (!ownedUnitId) return res.status(404).json({ error: 'Unit not found' });

    const result = await pool.query(
      'DELETE FROM sessions WHERE id = $1 AND unit_id = $2 RETURNING id',
      [sessionId, unitId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({ success: true, message: 'Session deleted successfully' });
  } catch (error) {
    console.error('Error deleting session:', error);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

/**
 * Bulk import sessions from a parsed CSV (mapping already resolved on the frontend).
 * Rows that fail to normalise (bad day/time) are skipped and reported back,
 * rather than failing the whole import.
 */
router.post('/import', verifyToken, requireRole('coordinator'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { unitId } = req.params;
    const ownedUnitId = await getOwnedUnitId(unitId, req.user.id);
    if (!ownedUnitId) return res.status(404).json({ error: 'Unit not found' });

    const { replace, sessions } = req.body;
    if (!Array.isArray(sessions) || sessions.length === 0) {
      return res.status(400).json({ error: 'No sessions provided to import' });
    }

    await client.query('BEGIN');

    if (replace) {
      await client.query('DELETE FROM sessions WHERE unit_id = $1', [unitId]);
    }

    const imported = [];
    const skipped = [];

    for (let i = 0; i < sessions.length; i++) {
      const row = sessions[i];
      const normalisedDay = normaliseDay(row.day);
      const normalisedStart = normaliseTime(row.startTime);
      const normalisedEnd = normaliseTime(row.endTime);

      if (!normalisedDay || !normalisedStart || !normalisedEnd) {
        skipped.push({ rowIndex: i, reason: 'Could not read day or time', row });
        continue;
      }

      const result = await client.query(
        `
        INSERT INTO sessions
          (unit_id, day, start_time, end_time, location, campus, session_type, capacity, status, staff_note)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id
        `,
        [
          unitId, normalisedDay, normalisedStart, normalisedEnd,
          row.location || null, row.campus || null, row.sessionType || null,
          row.capacity || null, row.status || 'Confirmed', row.staffNote || null
        ]
      );
      imported.push(result.rows[0].id);
    }

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      importedCount: imported.length,
      skippedCount: skipped.length,
      skipped
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error importing sessions:', error);
    res.status(500).json({ error: 'Failed to import sessions' });
  } finally {
    client.release();
  }
});

module.exports = router;