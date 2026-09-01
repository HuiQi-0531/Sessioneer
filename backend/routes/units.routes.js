const express = require('express');
const pool = require('../db');
const { verifyToken, requireRole } = require('../middleware/auth');
const { isUnitActive } = require('../utils/normalise');
const { createNotification } = require('../utils/notify');
const { ensureUnitMembership, getCoordinatorUnitId } = require('../utils/unitAccess');

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
  scheduleLocked: u.schedule_locked || false,
  scheduleLockedAt: u.schedule_locked_at || null,
  draftReleased: u.draft_released || false,
  isActive: isUnitActive(u.semester, u.year)
});

const formatUnitAccess = (u) => ({
  ...formatUnit(u),
  roles: u.roles || []
});

const normaliseUnitCode = (unitCode) => String(unitCode || '').trim().toUpperCase();

const normaliseEmails = (emails) => {
  if (!Array.isArray(emails)) return [];

  return [...new Set(
    emails
      .map(email => String(email || '').trim().toLowerCase())
      .filter(Boolean)
  )];
};

const loadCoordinatorUsersByEmail = async (emails, currentUserEmail = null, clientOrPool = pool) => {
  const cleanEmails = normaliseEmails(emails)
    .filter(email => email !== String(currentUserEmail || '').trim().toLowerCase());

  if (cleanEmails.length === 0) {
    return { users: [], missingEmails: [], nonCoordinatorEmails: [] };
  }

  const result = await clientOrPool.query(
    `
    SELECT id, name, last_name, email, role
    FROM users
    WHERE LOWER(email) = ANY($1::text[])
    `,
    [cleanEmails]
  );

  const foundByEmail = new Map(result.rows.map(user => [user.email.toLowerCase(), user]));
  const missingEmails = cleanEmails.filter(email => !foundByEmail.has(email));
  const nonCoordinatorEmails = result.rows
    .filter(user => user.role !== 'coordinator')
    .map(user => user.email);
  const users = result.rows.filter(user => user.role === 'coordinator');

  return { users, missingEmails, nonCoordinatorEmails };
};

const findDuplicateUnit = async ({ coordinatorId, unitCode, semester, year, excludeUnitId = null }) => {
  const params = [coordinatorId, normaliseUnitCode(unitCode), semester, year];
  let excludeClause = '';

  if (excludeUnitId) {
    params.push(excludeUnitId);
    excludeClause = 'AND id != $5';
  }

  const result = await pool.query(
    `
    SELECT id
    FROM units
    WHERE (
      unit_coordinator_id = $1
      OR EXISTS (
        SELECT 1
        FROM unit_memberships um
        WHERE um.unit_id = units.id
          AND um.user_id = $1
          AND um.role = 'coordinator'
      )
    )
      AND UPPER(TRIM(unit_code)) = $2
      AND semester = $3
      AND year = $4
      ${excludeClause}
    LIMIT 1
    `,
    params
  );

  return result.rows[0] || null;
};

/**
 * GET /units/my-units (tutor view)
 * Every unit this tutor is connected to (submitted availability for,
 * or been assigned a session in), with the same isActive flag the
 * coordinator's unit list uses.
 */
router.get('/my-units', verifyToken, requireRole('tutor', 'coordinator'), async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT DISTINCT u.id, u.unit_code, u.unit_name, u.semester, u.year,
             u.campus, u.delivery_mode, u.availability_deadline, u.availability_locked,
             u.schedule_locked, u.schedule_locked_at, u.draft_released
      FROM units u
      WHERE u.id IN (
        SELECT unit_id FROM unit_memberships WHERE user_id = $1 AND role IN ('tutor', 'super_tutor')
        UNION
        SELECT unit_id FROM availability WHERE tutor_id = $1
        UNION
        SELECT unit_id FROM sessions WHERE assigned_tutor_id = $1
      )
      ORDER BY u.year DESC, u.semester DESC
      `,
      [req.user.id]
    );

    res.json(result.rows.map(formatUnit));
  } catch (error) {
    console.error('Error fetching tutor units:', error);
    res.status(500).json({ error: 'Failed to fetch units' });
  }
});

// Get every unit the logged-in user can access, with their role(s) per unit.
router.get('/my-access', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT u.id, u.unit_code, u.unit_name, u.semester, u.year,
             u.campus, u.delivery_mode, u.enrolment_size, u.availability_deadline,
             u.availability_locked, u.schedule_locked, u.schedule_locked_at, u.draft_released,
             ARRAY_AGG(DISTINCT access_roles.role ORDER BY access_roles.role) as roles
      FROM units u
      JOIN (
        SELECT unit_id, role
        FROM unit_memberships
        WHERE user_id = $1
        UNION
        SELECT id as unit_id, 'coordinator' as role
        FROM units
        WHERE unit_coordinator_id = $1
      ) access_roles ON access_roles.unit_id = u.id
      GROUP BY u.id, u.unit_code, u.unit_name, u.semester, u.year,
               u.campus, u.delivery_mode, u.enrolment_size, u.availability_deadline,
               u.availability_locked, u.schedule_locked, u.schedule_locked_at, u.draft_released
      ORDER BY u.year DESC, u.semester DESC, u.unit_code ASC
      `,
      [req.user.id]
    );

    res.json(result.rows.map(formatUnitAccess));
  } catch (error) {
    console.error('Error fetching user unit access:', error);
    res.status(500).json({ error: 'Failed to fetch unit access' });
  }
});

// Get all units coordinated by the logged-in coordinator
router.get('/', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT id, unit_code, unit_name, semester, year, campus,
             delivery_mode, enrolment_size, availability_deadline,
             availability_locked, schedule_locked, schedule_locked_at, created_at
      FROM units
      WHERE unit_coordinator_id = $1
         OR EXISTS (
           SELECT 1
           FROM unit_memberships um
           WHERE um.unit_id = units.id
             AND um.user_id = $1
             AND um.role = 'coordinator'
         )
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

// Get a single unit (must be coordinated by the logged-in coordinator)
router.get('/:id', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `
      SELECT id, unit_code, unit_name, semester, year, campus,
             delivery_mode, enrolment_size, availability_deadline,
             availability_locked, schedule_locked, schedule_locked_at, created_at
      FROM units
      WHERE id = $1
        AND (
          unit_coordinator_id = $2
          OR EXISTS (
            SELECT 1
            FROM unit_memberships um
            WHERE um.unit_id = units.id
              AND um.user_id = $2
              AND um.role = 'coordinator'
          )
        )
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
      enrolmentSize, availabilityDeadline, coordinatorEmails
    } = req.body;

    if (!unitCode || !unitName || !semester || !year) {
      return res.status(400).json({
        error: 'Unit code, unit name, semester, and year are required'
      });
    }

    const normalizedUnitCode = normaliseUnitCode(unitCode);
    const duplicateUnit = await findDuplicateUnit({
      coordinatorId: req.user.id,
      unitCode: normalizedUnitCode,
      semester,
      year
    });

    if (duplicateUnit) {
      return res.status(409).json({
        error: `${normalizedUnitCode} already exists for ${semester}, ${year}. Please use a different unit code or semester.`
      });
    }

    const { users: coordinatorUsers, missingEmails, nonCoordinatorEmails } = await loadCoordinatorUsersByEmail(
      coordinatorEmails,
      req.user.email
    );

    if (missingEmails.length > 0) {
      return res.status(400).json({ error: `No account found for: ${missingEmails.join(', ')}` });
    }

    if (nonCoordinatorEmails.length > 0) {
      return res.status(400).json({ error: `These accounts are not Unit Coordinator accounts: ${nonCoordinatorEmails.join(', ')}` });
    }

    for (const coordinator of coordinatorUsers) {
      const coordinatorDuplicate = await findDuplicateUnit({
        coordinatorId: coordinator.id,
        unitCode: normalizedUnitCode,
        semester,
        year
      });

      if (coordinatorDuplicate) {
        return res.status(409).json({
          error: `${coordinator.email} already has access to ${normalizedUnitCode} for ${semester}, ${year}.`
        });
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        `
        INSERT INTO units
          (unit_coordinator_id, unit_code, unit_name, semester, year,
           campus, delivery_mode, enrolment_size, availability_deadline)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, unit_code, unit_name, semester, year, campus,
                  delivery_mode, enrolment_size, availability_deadline,
                  availability_locked, schedule_locked, schedule_locked_at, draft_released
        `,
        [
          req.user.id, normalizedUnitCode, unitName, semester, year,
          null, null, enrolmentSize || null,
          availabilityDeadline || null
        ]
      );

      const unitId = result.rows[0].id;
      await ensureUnitMembership(client, unitId, req.user.id, 'coordinator');

      for (const coordinator of coordinatorUsers) {
        await ensureUnitMembership(client, unitId, coordinator.id, 'coordinator');
      }

      await client.query('COMMIT');

      for (const coordinator of coordinatorUsers) {
        await createNotification({
          userId: coordinator.id,
          type: 'unit_coordinator_added',
          title: 'Added to a unit',
          content: `You have been added as a coordinator for ${normalizedUnitCode}.`,
          unitId,
          actionUrl: '/uc-dashboard'
        });
      }

      res.status(201).json(formatUnit(result.rows[0]));
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
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
      enrolmentSize, availabilityDeadline
    } = req.body;

    const coordinatorUnitId = await getCoordinatorUnitId(id, req.user.id);
    if (!coordinatorUnitId) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    const existingResult = await pool.query(
      'SELECT unit_code, semester, year FROM units WHERE id = $1',
      [id]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    const existingUnit = existingResult.rows[0];
    const nextUnitCode = unitCode ? normaliseUnitCode(unitCode) : existingUnit.unit_code;
    const nextSemester = semester || existingUnit.semester;
    const nextYear = year || existingUnit.year;
    const duplicateUnit = await findDuplicateUnit({
      coordinatorId: req.user.id,
      unitCode: nextUnitCode,
      semester: nextSemester,
      year: nextYear,
      excludeUnitId: id
    });

    if (duplicateUnit) {
      return res.status(409).json({
        error: `${nextUnitCode} already exists for ${nextSemester}, ${nextYear}. Please use a different unit code or semester.`
      });
    }

    const result = await pool.query(
      `
      UPDATE units
      SET
        unit_code = COALESCE($1, unit_code),
        unit_name = COALESCE($2, unit_name),
        semester = COALESCE($3, semester),
        year = COALESCE($4, year),
        enrolment_size = COALESCE($5, enrolment_size),
        availability_deadline = COALESCE($6, availability_deadline)
      WHERE id = $7
      RETURNING id, unit_code, unit_name, semester, year, campus,
                delivery_mode, enrolment_size, availability_deadline,
                availability_locked, schedule_locked, schedule_locked_at, draft_released
      `,
      [
        nextUnitCode, unitName, semester, year,
        enrolmentSize, availabilityDeadline,
        id
      ]
    );

    res.json(formatUnit(result.rows[0]));
  } catch (error) {
    console.error('Error updating unit:', error);
    res.status(500).json({ error: 'Failed to update unit' });
  }
});

// Get coordinators linked to a unit.
router.get('/:id/coordinators', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const { id } = req.params;
    const coordinatorUnitId = await getCoordinatorUnitId(id, req.user.id);
    if (!coordinatorUnitId) return res.status(404).json({ error: 'Unit not found' });

    const result = await pool.query(
      `
      SELECT
        u.id,
        u.name,
        u.last_name,
        u.email,
        units.unit_coordinator_id = u.id AS is_main
      FROM units
      JOIN users u ON (
        u.id = units.unit_coordinator_id
        OR EXISTS (
          SELECT 1
          FROM unit_memberships um
          WHERE um.unit_id = units.id
            AND um.user_id = u.id
            AND um.role = 'coordinator'
        )
      )
      WHERE units.id = $1
      ORDER BY is_main DESC, u.name ASC, u.last_name ASC, u.email ASC
      `,
      [id]
    );

    res.json(result.rows.map(user => ({
      id: user.id,
      name: user.name,
      lastName: user.last_name,
      fullName: [user.name, user.last_name].filter(Boolean).join(' '),
      email: user.email,
      isMain: user.is_main
    })));
  } catch (error) {
    console.error('Error fetching unit coordinators:', error);
    res.status(500).json({ error: 'Failed to fetch unit coordinators' });
  }
});

// Add an existing Unit Coordinator account to a unit.
router.post('/:id/coordinators', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const { id } = req.params;
    const cleanEmail = String(req.body.email || '').trim().toLowerCase();

    if (!cleanEmail) {
      return res.status(400).json({ error: 'Coordinator email is required' });
    }

    const coordinatorUnitId = await getCoordinatorUnitId(id, req.user.id);
    if (!coordinatorUnitId) return res.status(404).json({ error: 'Unit not found' });

    const { users, missingEmails, nonCoordinatorEmails } = await loadCoordinatorUsersByEmail([cleanEmail], req.user.email);
    if (missingEmails.length > 0) {
      return res.status(400).json({ error: `No account found for ${cleanEmail}` });
    }
    if (nonCoordinatorEmails.length > 0) {
      return res.status(400).json({ error: `${cleanEmail} is not a Unit Coordinator account` });
    }

    const coordinator = users[0];
    const unitResult = await pool.query(
      'SELECT unit_code, semester, year FROM units WHERE id = $1',
      [id]
    );
    const unit = unitResult.rows[0];

    const coordinatorDuplicate = await findDuplicateUnit({
      coordinatorId: coordinator.id,
      unitCode: unit.unit_code,
      semester: unit.semester,
      year: unit.year,
      excludeUnitId: id
    });

    if (coordinatorDuplicate) {
      return res.status(409).json({
        error: `${coordinator.email} already has access to ${unit.unit_code} for ${unit.semester}, ${unit.year}.`
      });
    }

    const membershipResult = await pool.query(
      `
      INSERT INTO unit_memberships (unit_id, user_id, role)
      VALUES ($1, $2, 'coordinator')
      ON CONFLICT (unit_id, user_id, role) DO NOTHING
      RETURNING id
      `,
      [id, coordinator.id]
    );

    const unitCode = unit?.unit_code || 'this unit';

    if (membershipResult.rows.length > 0) {
      await createNotification({
        userId: coordinator.id,
        type: 'unit_coordinator_added',
        title: 'Added to a unit',
        content: `You have been added as a coordinator for ${unitCode}.`,
        unitId: id,
        actionUrl: '/uc-dashboard'
      });
    }

    res.status(201).json({
      success: true,
      alreadyCoordinator: membershipResult.rows.length === 0,
      coordinator: {
        id: coordinator.id,
        name: coordinator.name,
        lastName: coordinator.last_name,
        fullName: [coordinator.name, coordinator.last_name].filter(Boolean).join(' '),
        email: coordinator.email,
        isMain: false
      }
    });
  } catch (error) {
    console.error('Error adding unit coordinator:', error);
    res.status(500).json({ error: 'Failed to add unit coordinator' });
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

/**
 * PATCH /units/:id/lock-schedule (coordinator only)
 * Locks the schedule so no further assignment/confirmation changes can
 * be made. Refuses to lock if any session is still unassigned or
 * awaiting tutor confirmation, unless force=true is passed.
 */
router.patch('/:id/lock-schedule', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const { id } = req.params;
    const { force } = req.body;

    const coordinatorUnitId = await getCoordinatorUnitId(id, req.user.id);
    if (!coordinatorUnitId) return res.status(404).json({ error: 'Unit not found' });

    const unassignedResult = await pool.query(
      'SELECT COUNT(*) FROM sessions WHERE unit_id = $1 AND is_assigned = FALSE',
      [id]
    );
    const pendingResult = await pool.query(
      'SELECT COUNT(*) FROM sessions WHERE unit_id = $1 AND is_assigned = TRUE AND tutor_confirmed IS NOT TRUE',
      [id]
    );
    const unassignedCount = parseInt(unassignedResult.rows[0].count, 10);
    const pendingCount = parseInt(pendingResult.rows[0].count, 10);

    if (!force && (unassignedCount > 0 || pendingCount > 0)) {
      return res.status(409).json({
        error: 'Schedule is not fully ready yet',
        unassignedCount,
        pendingCount
      });
    }

    const result = await pool.query(
      `
      UPDATE units
      SET schedule_locked = TRUE, schedule_locked_at = NOW()
      WHERE id = $1
      RETURNING id, unit_code, unit_name, semester, year, campus,
                delivery_mode, enrolment_size, availability_deadline,
                availability_locked, schedule_locked, schedule_locked_at, draft_released
      `,
      [id]
    );

    res.json(formatUnit(result.rows[0]));
  } catch (error) {
    console.error('Error locking schedule:', error);
    res.status(500).json({ error: 'Failed to lock schedule' });
  }
});

// PATCH /units/:id/release-draft (coordinator only)
// Makes the (still-editable) draft schedule visible to tutors linked to this unit.
router.patch('/:id/release-draft', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const { id } = req.params;
    const coordinatorUnitId = await getCoordinatorUnitId(id, req.user.id);
    if (!coordinatorUnitId) return res.status(404).json({ error: 'Unit not found' });

    const result = await pool.query(
      `
      UPDATE units
      SET draft_released = TRUE
      WHERE id = $1
      RETURNING id, unit_code, unit_name, semester, year, campus,
                delivery_mode, enrolment_size, availability_deadline,
                availability_locked, schedule_locked, schedule_locked_at, draft_released
      `,
      [id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Unit not found' });

    res.json(formatUnit(result.rows[0]));
  } catch (error) {
    console.error('Error releasing draft:', error);
    res.status(500).json({ error: 'Failed to release draft schedule' });
  }
});

// PATCH /units/:id/unrelease-draft (coordinator only) — undo, e.g. if released by mistake
router.patch('/:id/unrelease-draft', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const { id } = req.params;
    const coordinatorUnitId = await getCoordinatorUnitId(id, req.user.id);
    if (!coordinatorUnitId) return res.status(404).json({ error: 'Unit not found' });

    const result = await pool.query(
      `
      UPDATE units
      SET draft_released = FALSE
      WHERE id = $1
      RETURNING id, unit_code, unit_name, semester, year, campus,
                delivery_mode, enrolment_size, availability_deadline,
                availability_locked, schedule_locked, schedule_locked_at, draft_released
      `,
      [id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Unit not found' });

    res.json(formatUnit(result.rows[0]));
  } catch (error) {
    console.error('Error un-releasing draft:', error);
    res.status(500).json({ error: 'Failed to un-release draft schedule' });
  }
});

// PATCH /units/:id/unlock-schedule (coordinator only)
router.patch('/:id/unlock-schedule', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const { id } = req.params;
    const coordinatorUnitId = await getCoordinatorUnitId(id, req.user.id);
    if (!coordinatorUnitId) return res.status(404).json({ error: 'Unit not found' });

    const result = await pool.query(
      `
      UPDATE units
      SET schedule_locked = FALSE, schedule_locked_at = NULL
      WHERE id = $1
      RETURNING id, unit_code, unit_name, semester, year, campus,
                delivery_mode, enrolment_size, availability_deadline,
                availability_locked, schedule_locked, schedule_locked_at, draft_released
      `,
      [id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Unit not found' });

    res.json(formatUnit(result.rows[0]));
  } catch (error) {
    console.error('Error unlocking schedule:', error);
    res.status(500).json({ error: 'Failed to unlock schedule' });
  }
});

// PATCH /units/:id/lock-availability (coordinator only) - manual early lock
router.patch('/:id/lock-availability', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const { id } = req.params;
    const coordinatorUnitId = await getCoordinatorUnitId(id, req.user.id);
    if (!coordinatorUnitId) return res.status(404).json({ error: 'Unit not found' });

    const result = await pool.query(
      `
      UPDATE units
      SET availability_locked = TRUE
      WHERE id = $1
      RETURNING id, unit_code, unit_name, semester, year, campus,
                delivery_mode, enrolment_size, availability_deadline,
                availability_locked, schedule_locked, schedule_locked_at, draft_released
      `,
      [id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Unit not found' });

    res.json(formatUnit(result.rows[0]));
  } catch (error) {
    console.error('Error locking availability:', error);
    res.status(500).json({ error: 'Failed to lock availability' });
  }
});

// PATCH /units/:id/unlock-availability (coordinator only)
router.patch('/:id/unlock-availability', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const { id } = req.params;
    const coordinatorUnitId = await getCoordinatorUnitId(id, req.user.id);
    if (!coordinatorUnitId) return res.status(404).json({ error: 'Unit not found' });

    const result = await pool.query(
      `
      UPDATE units
      SET availability_locked = FALSE
      WHERE id = $1
      RETURNING id, unit_code, unit_name, semester, year, campus,
                delivery_mode, enrolment_size, availability_deadline,
                availability_locked, schedule_locked, schedule_locked_at, draft_released
      `,
      [id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Unit not found' });

    res.json(formatUnit(result.rows[0]));
  } catch (error) {
    console.error('Error unlocking availability:', error);
    res.status(500).json({ error: 'Failed to unlock availability' });
  }
});

// POST /units/:id/duplicate (coordinator only)
// Duplicates a unit into a new semester/year, carrying over only tutors
// (unit_memberships with role='tutor') and sessions. Everything else
// (availability, requests, coordinators, lock/release flags) starts fresh.
router.post('/:id/duplicate', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const { id } = req.params;
    const { semester, year, unitCode, unitName } = req.body;

    if (!semester || !year) {
      return res.status(400).json({ error: 'Semester and year are required' });
    }

    const coordinatorUnitId = await getCoordinatorUnitId(id, req.user.id);
    if (!coordinatorUnitId) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    const sourceResult = await pool.query(
      'SELECT unit_code, unit_name, campus, delivery_mode, enrolment_size FROM units WHERE id = $1',
      [id]
    );
    if (sourceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Unit not found' });
    }
    const source = sourceResult.rows[0];

    const nextUnitCode = normaliseUnitCode(unitCode || source.unit_code);
    const nextUnitName = (unitName || source.unit_name || '').trim() || source.unit_name;

    const duplicateUnit = await findDuplicateUnit({
      coordinatorId: req.user.id,
      unitCode: nextUnitCode,
      semester,
      year
    });
    if (duplicateUnit) {
      return res.status(409).json({
        error: `${nextUnitCode} already exists for ${semester}, ${year}. Please use a different unit code or semester.`
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const insertResult = await client.query(
        `
        INSERT INTO units
          (unit_coordinator_id, unit_code, unit_name, semester, year,
           campus, delivery_mode, enrolment_size)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, unit_code, unit_name, semester, year, campus,
                  delivery_mode, enrolment_size, availability_deadline,
                  availability_locked, schedule_locked, schedule_locked_at, draft_released
        `,
        [
          req.user.id, nextUnitCode, nextUnitName, semester, year,
          source.campus, source.delivery_mode, source.enrolment_size
        ]
      );
      const newUnitId = insertResult.rows[0].id;

      await ensureUnitMembership(client, newUnitId, req.user.id, 'coordinator');

      // Copy tutors only (not other coordinators, not availability).
      // Their tier (tutor vs super_tutor) carries over as-is.
      await client.query(
        `
        INSERT INTO unit_memberships (unit_id, user_id, role)
        SELECT $1, user_id, role
        FROM unit_memberships
        WHERE unit_id = $2 AND role IN ('tutor', 'super_tutor')
        ON CONFLICT (unit_id, user_id, role) DO NOTHING
        `,
        [newUnitId, id]
      );

      // Copy sessions. Column list is read from information_schema at
      // runtime rather than hardcoded, since the exact sessions schema
      // wasn't available when this was written -- swap this block for a
      // fixed column list once confirmed. Assignment/confirmation columns
      // (is_assigned, assigned_tutor_id, tutor_confirmed, id, unit_id,
      // created_at, updated_at) are excluded so each copied session starts
      // unassigned in the new unit, even though tutors were carried over.
      const EXCLUDED_SESSION_COLUMNS = [
        'id', 'unit_id', 'is_assigned', 'assigned_tutor_id',
        'tutor_confirmed', 'created_at', 'updated_at'
      ];
      const columnsResult = await client.query(
        `
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sessions'
          AND column_name != ALL($1::text[])
        ORDER BY ordinal_position
        `,
        [EXCLUDED_SESSION_COLUMNS]
      );
      const sessionColumns = columnsResult.rows.map(r => r.column_name);

      if (sessionColumns.length > 0) {
        const colList = sessionColumns.map(c => `"${c}"`).join(', ');
        await client.query(
          `
          INSERT INTO sessions (unit_id, ${colList})
          SELECT $1, ${colList}
          FROM sessions
          WHERE unit_id = $2
          `,
          [newUnitId, id]
        );
      }

      await client.query('COMMIT');
      res.status(201).json(formatUnit(insertResult.rows[0]));
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error duplicating unit:', error);
    res.status(500).json({ error: 'Failed to duplicate unit' });
  }
});

module.exports = router;