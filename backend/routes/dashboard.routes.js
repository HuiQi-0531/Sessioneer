const express = require('express');
const pool = require('../db');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /tutor/dashboard-summary (tutor only)
 * Everything the tutor dashboard needs in one call: their units with
 * availability/assignment status, overall session counts, and pending
 * change request count.
 */
router.get('/dashboard-summary', verifyToken, requireRole('tutor'), async (req, res) => {
  try {
    const tutorId = req.user.id;

    const unitsResult = await pool.query(
      `
      SELECT DISTINCT u.id, u.unit_code, u.semester, u.year
      FROM units u
      WHERE u.id IN (
        SELECT unit_id FROM availability WHERE tutor_id = $1
        UNION
        SELECT unit_id FROM sessions WHERE assigned_tutor_id = $1
      )
      ORDER BY u.year DESC, u.semester DESC
      `,
      [tutorId]
    );

    const unitStatuses = await Promise.all(unitsResult.rows.map(async (unit) => {
      const availResult = await pool.query(
        'SELECT COUNT(*) FROM availability WHERE tutor_id = $1 AND unit_id = $2 AND is_submitted = TRUE',
        [tutorId, unit.id]
      );
      const assignedResult = await pool.query(
        'SELECT COUNT(*) FROM sessions WHERE assigned_tutor_id = $1 AND unit_id = $2',
        [tutorId, unit.id]
      );

      return {
        unitId: unit.id,
        unitCode: unit.unit_code,
        availabilitySubmitted: parseInt(availResult.rows[0].count, 10) > 0,
        assignedSessionCount: parseInt(assignedResult.rows[0].count, 10)
      };
    }));

    const totalSessionsResult = await pool.query(
      'SELECT COUNT(*) FROM sessions WHERE assigned_tutor_id = $1',
      [tutorId]
    );
    const confirmedSessionsResult = await pool.query(
      'SELECT COUNT(*) FROM sessions WHERE assigned_tutor_id = $1 AND tutor_confirmed = TRUE',
      [tutorId]
    );
    const pendingRequestsResult = await pool.query(
      "SELECT COUNT(*) FROM change_requests WHERE tutor_id = $1 AND status = 'Pending'",
      [tutorId]
    );

    res.json({
      unitStatuses,
      totalUnits: unitsResult.rows.length,
      availabilitySubmittedCount: unitStatuses.filter(u => u.availabilitySubmitted).length,
      totalSessions: parseInt(totalSessionsResult.rows[0].count, 10),
      confirmedSessions: parseInt(confirmedSessionsResult.rows[0].count, 10),
      pendingRequestsCount: parseInt(pendingRequestsResult.rows[0].count, 10)
    });
  } catch (error) {
    console.error('Error fetching dashboard summary:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard summary' });
  }
});

module.exports = router;