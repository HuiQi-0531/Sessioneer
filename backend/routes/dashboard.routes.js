const express = require('express');
const { isUnitCoordinatorSql } = require('../utils/unitAccess');
const pool = require('../db');
const { verifyToken, requireRole } = require('../middleware/auth');
const { isUnitActive } = require('../utils/normalise');
const { countDashboardUnits } = require('../utils/dashboardRules');

const router = express.Router();

/**
 * GET /tutor/dashboard-summary
 * Everything the tutor dashboard needs in one call: their units with
 * availability/assignment status, overall session counts, and pending
 * change request count. Each unit carries an isActive flag (current
 * semester or not) so the frontend can default to showing only active
 * units, with a toggle to reveal inactive ones -- same concept as the
 * UC dashboard.
 */
router.get('/tutor/dashboard-summary', verifyToken, requireRole('tutor', 'coordinator'), async (req, res) => {
  try {
    const tutorId = req.user.id;

    const unitsResult = await pool.query(
      `
      SELECT DISTINCT u.id, u.unit_code, u.semester, u.year
      FROM units u
      WHERE u.id IN (
        SELECT unit_id FROM availability WHERE tutor_id = $1
        UNION
        SELECT s.unit_id FROM session_tutors st
        JOIN sessions s ON s.id = st.session_id
        WHERE st.tutor_id = $1
        UNION
        SELECT unit_id FROM unit_memberships WHERE user_id = $1 AND role IN ('tutor', 'super_tutor')
      )
      -- A unit coordinator doesn't need a tutor view for their own unit -
      -- they assign themselves directly when scheduling instead.
      AND u.id NOT IN (
        SELECT unit_id FROM unit_memberships WHERE user_id = $1 AND role = 'coordinator'
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
        // Count sessions given to this tutor, leaving out ones they turned down.
        `SELECT COUNT(*) FROM session_tutors st
         JOIN sessions s ON s.id = st.session_id
         WHERE st.tutor_id = $1 AND s.unit_id = $2
           AND st.tutor_confirmed IS DISTINCT FROM FALSE`,        [tutorId, unit.id]
      );

      return {
        unitId: unit.id,
        unitCode: unit.unit_code,
        semester: unit.semester,
        year: unit.year,
        isActive: isUnitActive(unit.semester, unit.year),
        availabilitySubmitted: parseInt(availResult.rows[0].count, 10) > 0,
        assignedSessionCount: parseInt(assignedResult.rows[0].count, 10)
      };
    }));

    const totalSessionsResult = await pool.query(
      `SELECT COUNT(*) FROM session_tutors
       WHERE tutor_id = $1 AND tutor_confirmed IS DISTINCT FROM FALSE`,
      [tutorId]
    );
    const confirmedSessionsResult = await pool.query(
      'SELECT COUNT(*) FROM session_tutors WHERE tutor_id = $1 AND tutor_confirmed = TRUE',
      [tutorId]
    );
    const pendingRequestsResult = await pool.query(
      "SELECT COUNT(*) FROM change_requests WHERE tutor_id = $1 AND status = 'Pending'",
      [tutorId]
    );

    res.json({
      unitStatuses,
      totalUnits: unitsResult.rows.length,
      ...countDashboardUnits(unitStatuses),
      totalSessions: parseInt(totalSessionsResult.rows[0].count, 10),
      confirmedSessions: parseInt(confirmedSessionsResult.rows[0].count, 10),
      pendingRequestsCount: parseInt(pendingRequestsResult.rows[0].count, 10)
    });
  } catch (error) {
    console.error('Error fetching dashboard summary:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard summary' });
  }
});

/**
 * GET /uc/dashboard-summary (coordinator only)
 * Everything the coordinator dashboard needs in one call: their units
 * with session/availability progress, and overall counts.
 */
router.get('/uc/dashboard-summary', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const coordinatorId = req.user.id;

    const unitsResult = await pool.query(
      `
        SELECT DISTINCT u.id, u.unit_code, u.semester, u.year
        FROM units u
        LEFT JOIN unit_memberships um
          ON um.unit_id = u.id
         AND um.user_id = $1
         AND um.role = 'coordinator'
        WHERE u.unit_coordinator_id = $1 OR um.id IS NOT NULL
        ORDER BY u.year DESC, u.semester DESC
      `,
      [coordinatorId]
    );

    const unitStatuses = await Promise.all(unitsResult.rows.map(async (unit) => {
      const sessionCountResult = await pool.query(
        'SELECT COUNT(*) FROM sessions WHERE unit_id = $1',
        [unit.id]
      );
      const unassignedResult = await pool.query(
        `SELECT COUNT(*) FROM sessions s
        WHERE s.unit_id = $1
          AND NOT EXISTS (
            SELECT 1 FROM session_tutors st
            WHERE st.session_id = s.id AND st.tutor_confirmed IS DISTINCT FROM FALSE
          )        `,
        [unit.id]
      );
  
      const submittedTutorsResult = await pool.query(
        `SELECT COUNT(DISTINCT a.tutor_id) FROM availability a
         WHERE a.unit_id = $1 AND a.is_submitted = TRUE
           AND NOT ${isUnitCoordinatorSql('a.tutor_id', '$1')}`,
        [unit.id]
      );

      return {
        unitId: unit.id,
        unitCode: unit.unit_code,
        semester: unit.semester,
        year: unit.year,
        isActive: isUnitActive(unit.semester, unit.year),
        sessionCount: parseInt(sessionCountResult.rows[0].count, 10),
        unassignedCount: parseInt(unassignedResult.rows[0].count, 10),
        tutorsSubmittedCount: parseInt(submittedTutorsResult.rows[0].count, 10)
      };
    }));

    const unitIds = unitsResult.rows.map(u => u.id);

    let pendingRequestsCount = 0;
    let totalSessions = 0;
    let unassignedSessions = 0;
    let pendingConfirmations = 0;

    if (unitIds.length > 0) {
      const pendingRequestsResult = await pool.query(
        `SELECT COUNT(*) FROM change_requests WHERE unit_id = ANY($1::uuid[]) AND status = 'Pending'`,
        [unitIds]
      );
      pendingRequestsCount = parseInt(pendingRequestsResult.rows[0].count, 10);

      const totalSessionsResult = await pool.query(
        'SELECT COUNT(*) FROM sessions WHERE unit_id = ANY($1::uuid[])',
        [unitIds]
      );
      totalSessions = parseInt(totalSessionsResult.rows[0].count, 10);

      const unassignedSessionsResult = await pool.query(
        `
        SELECT COUNT(*) FROM sessions s
        WHERE s.unit_id = ANY($1::uuid[])
          AND NOT EXISTS (
            -- A tutor who turned the session down no longer counts as covering it.
            SELECT 1 FROM session_tutors st
            WHERE st.session_id = s.id AND st.tutor_confirmed IS DISTINCT FROM FALSE
          )        `,
        [unitIds]
      );
      unassignedSessions = parseInt(unassignedSessionsResult.rows[0].count, 10);

      const pendingConfirmationsResult = await pool.query(
        `
        SELECT COUNT(*) FROM sessions s
        WHERE s.unit_id = ANY($1::uuid[])
          AND EXISTS (
            SELECT 1 FROM session_tutors st
            WHERE st.session_id = s.id AND st.tutor_confirmed IS NULL
          )
        `,
        [unitIds]
      );
      pendingConfirmations = parseInt(pendingConfirmationsResult.rows[0].count, 10);
    }

    res.json({
      unitStatuses,
      totalUnits: unitsResult.rows.length,
      activeUnitCount: countDashboardUnits(unitStatuses).activeUnitCount,
      pendingRequestsCount,
      totalSessions,
      unassignedSessions,
      pendingConfirmations
    });
  } catch (error) {
    console.error('Error fetching UC dashboard summary:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard summary' });
  }
});

module.exports = router;