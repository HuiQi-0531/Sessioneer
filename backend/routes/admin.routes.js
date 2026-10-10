const express = require('express');
const crypto = require('crypto');
const pool = require('../db');
const { verifyToken, requireRole } = require('../middleware/auth');
const { formatUserNameFields, joinUserName } = require('../utils/userNames');
const { normaliseDay } = require('../utils/normalise');
const { createNotification } = require('../utils/notify');
const { escapeHtml, sendEmail } = require('../utils/email');
const { requiresSuperTutor } = require('../utils/roles');
const { validateTeachingPeriod, resolveTeachingPeriodUpdate } = require('../utils/reminderRules');
const { noticeSessionUpdated, noticeTutorRemoved, loadNoticeUser } = require('../utils/reminders');

const {
  VALID_ROLES,
  VALID_ACCOUNT_STATUSES,
  VALID_MEMBERSHIP_ROLES,
  TUTOR_MEMBERSHIP_ROLES,
  MEMBERSHIP_ROLE_LABELS,
  normaliseRole,
  normaliseMembershipRole,
  isTutorMembershipRole,
  normaliseAccountStatus,
  formatAdminUser,
  formatAdminUnit,
  formatAdminUnitTutor,
  formatAdminUserUnitAccess,
  formatAdminSession,
  formatAdminStaff,
  formatAdminApplication,
  formatAdminRequest,
  isUuid,
  isValidEmail,
  getSelfEditError,
  checkAdminSessionEdit,
  hasIneligibleForSuperTutorType,
  checkAdminAssignSlot
} = require('../utils/adminRules');
const {
  labelFromSessionValue,
  normaliseSessionLabel,
  getSessionComparableLabel,
  buildSuggestionSessions,
  buildReviewEmailSubject,
  buildAdminReviewNotification,
  isValidReviewStatus,
  unitLabelWithSemester
} = require('../utils/requestLabels');
const { isBlank, endsAfterStart, getMissingAdminSessionFields: getMissingSessionFields, codePrefixForType, nextSessionCode, shouldRegenerateCode } = require('../utils/sessionRules');
const {
  findOverlappingSessions,
  calcHoursIfAssigned,
  exceedsMaxHours,
  violatesSuperTutorRule,
  findEditClash,
  ACTIVE_COVERS_SQL,
  findCoverConflicts,
  describeCoverConflict
} = require('../utils/allocationRules');
const { normaliseUnitCode, deleteUnitCascade } = require('../utils/unitRules');
const { superTutorDowngradeError } = require('../utils/unitAccess');
const { sameTermUnitIdsSql } = require('../utils/termRules');
const { shouldApplyChange } = require('../utils/changeRequestRules');
const {
  AllocationError,
  applyApprovedChangeRequest,
  resolveSuggestedSession,
  assertSameSessionType,
  resolveSessionId
} = require('../utils/applyChangeRequest');

const router = express.Router();

const frontendUrl = () => (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');

const { hashPassword, hashResetToken } = require('../utils/passwords');

const sendPasswordResetEmail = async (email, resetLink, isSetup = false) => {
  const subject = isSetup ? 'Set up your Sessioneer password' : 'Reset your Sessioneer password';
  const heading = isSetup ? 'Set up your Sessioneer password' : 'Reset your Sessioneer password';
  const intro = isSetup
    ? 'An administrator has created a Sessioneer account for you. Use this link to set your password.'
    : 'An administrator has sent you a password reset link.';

  return sendEmail({
    to: email,
    subject,
    htmlContent: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #202124;">
        <h2>${escapeHtml(heading)}</h2>
        <p>${escapeHtml(intro)}</p>
        <p>
          <a href="${resetLink}" style="display: inline-block; background: #5b4fc0; color: #ffffff; padding: 12px 18px; border-radius: 6px; text-decoration: none;">
            Set password
          </a>
        </p>
        <p>This link will expire in 30 minutes.</p>
      </div>
    `,
    textContent: `${heading}: ${resetLink}\n\nThis link will expire in 30 minutes.`
  });
};

const createPasswordResetLink = async (userId) => {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashResetToken(token);
  const resetLink = `${frontendUrl()}/reset-password?token=${token}`;

  await pool.query(
    `
    UPDATE password_reset_tokens
    SET used_at = NOW()
    WHERE user_id = $1 AND used_at IS NULL
    `,
    [userId]
  );

  await pool.query(
    `
    INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
    VALUES ($1, $2, NOW() + INTERVAL '30 minutes')
    `,
    [userId, tokenHash]
  );

  return resetLink;
};

const getAdminSessionStaff = async (query, unitId) => {
  const result = await query(`
    SELECT u.id, u.name, u.last_name, u.email, u.maximum_hours,
      CASE
        WHEN u.id = un.unit_coordinator_id OR EXISTS (
          SELECT 1 FROM unit_memberships um
          WHERE um.unit_id = un.id AND um.user_id = u.id AND um.role = 'coordinator'
        ) THEN 'coordinator'
        WHEN EXISTS (
          SELECT 1 FROM unit_memberships um
          WHERE um.unit_id = un.id AND um.user_id = u.id AND um.role = 'super_tutor'
        ) THEN 'super_tutor'
        ELSE 'tutor'
      END AS access_role
    FROM users u
    JOIN units un ON un.id = $1
    WHERE u.role <> 'admin'
      AND COALESCE(u.account_status, 'active') = 'active'
      AND (
        u.id = un.unit_coordinator_id OR EXISTS (
          SELECT 1 FROM unit_memberships um
          WHERE um.unit_id = un.id AND um.user_id = u.id
            AND um.role IN ('coordinator', 'tutor', 'super_tutor')
        )
      )
    ORDER BY LOWER(u.name), LOWER(COALESCE(u.last_name, '')), LOWER(u.email)
  `, [unitId]);
  return result.rows.map(formatAdminStaff);
};

const sessionAssignmentError = (status, message) => Object.assign(new Error(message), { status });
const sendAdminRequestReviewEmail = async ({
  tutorEmail,
  tutorName,
  unitCode,
  unitName,
  requestType,
  status,
  currentSession,
  preferredSwapTo,
  reviewNotes
}) => {
  if (!tutorEmail) return;

  const { displayStatus, subject } = buildReviewEmailSubject(status, unitCode);
  const unitLabel = unitName ? `${unitCode} - ${unitName}` : unitCode;
  const requestsUrl = `${frontendUrl()}/requests`;

  await sendEmail({
    to: [{ email: tutorEmail, name: tutorName || undefined }],
    subject,
    htmlContent: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #202124;">
        <h2>${escapeHtml(subject)}</h2>
        <p>Your ${escapeHtml(requestType || 'session')} request for ${escapeHtml(unitLabel)} has been ${escapeHtml(displayStatus)} by an administrator.</p>
        <table style="border-collapse: collapse; margin: 16px 0;">
          <tr><td style="padding: 6px 12px 6px 0; font-weight: bold;">Current session</td><td style="padding: 6px 0;">${escapeHtml(labelFromSessionValue(currentSession))}</td></tr>
          <tr><td style="padding: 6px 12px 6px 0; font-weight: bold;">Preferred swap to</td><td style="padding: 6px 0;">${escapeHtml(preferredSwapTo ? labelFromSessionValue(preferredSwapTo) : 'Not specified')}</td></tr>
          <tr><td style="padding: 6px 12px 6px 0; font-weight: bold;">Admin note</td><td style="padding: 6px 0;">${escapeHtml(reviewNotes || 'No note provided')}</td></tr>
        </table>
        <p>
          <a href="${requestsUrl}" style="display: inline-block; background: #5b4fc0; color: #ffffff; padding: 12px 18px; border-radius: 6px; text-decoration: none;">
            View request
          </a>
        </p>
      </div>
    `,
    textContent: [
      subject,
      '',
      `Your ${requestType || 'session'} request for ${unitLabel} has been ${displayStatus} by an administrator.`,
      `Current session: ${labelFromSessionValue(currentSession)}`,
      `Preferred swap to: ${preferredSwapTo ? labelFromSessionValue(preferredSwapTo) : 'Not specified'}`,
      `Admin note: ${reviewNotes || 'No note provided'}`,
      '',
      `View request: ${requestsUrl}`
    ].join('\n')
  });
};

const findCoordinatorByEmail = async (email) => {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail) return null;

  const result = await pool.query(
    `
    SELECT id, email, role, name, last_name
    FROM users
    WHERE LOWER(email) = $1
    `,
    [cleanEmail]
  );

  return result.rows[0] || null;
};

const findUserByEmail = async (email) => {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail) return null;

  const result = await pool.query(
    `
    SELECT id, name, last_name, email, role, avatar_url
    FROM users
    WHERE LOWER(email) = $1
    `,
    [cleanEmail]
  );

  return result.rows[0] || null;
};

router.use(verifyToken, requireRole('admin'));

router.get('/users', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        u.id,
        u.name,
        u.last_name,
        u.email,
        u.role,
        COALESCE(u.account_status, 'active') AS account_status,
        u.avatar_url,
        u.phone_number,
        u.created_at,
        (
          SELECT COUNT(DISTINCT access_units.unit_id)
          FROM (
            SELECT unit_id
            FROM unit_memberships
            WHERE user_id = u.id
            UNION
            SELECT id AS unit_id
            FROM units
            WHERE unit_coordinator_id = u.id
          ) access_units
        ) AS unit_count,
        (
          SELECT COUNT(DISTINCT coordinator_units.unit_id)
          FROM (
            SELECT unit_id
            FROM unit_memberships
            WHERE user_id = u.id AND role = 'coordinator'
            UNION
            SELECT id AS unit_id
            FROM units
            WHERE unit_coordinator_id = u.id
          ) coordinator_units
        ) AS coordinator_unit_count,
        (
          SELECT COUNT(DISTINCT unit_id)
          FROM unit_memberships
          WHERE user_id = u.id AND role IN ('tutor', 'super_tutor')
        ) AS tutor_unit_count,
        (
        SELECT STRING_AGG(DISTINCT unit_labels.label, ', ' ORDER BY unit_labels.label)
        FROM (
          SELECT un.unit_code || ' · ' || un.semester || ' ' || un.year::text AS label
          FROM unit_memberships um
          JOIN units un ON un.id = um.unit_id
          WHERE um.user_id = u.id
          UNION
          SELECT unit_code || ' · ' || semester || ' ' || year::text
          FROM units
          WHERE unit_coordinator_id = u.id
        ) unit_labels
        ) AS unit_summary
      FROM users u
      ORDER BY LOWER(u.name), LOWER(COALESCE(u.last_name, '')), LOWER(u.email)
    `);

    res.json(result.rows.map(formatAdminUser));
  } catch (error) {
    console.error('Admin users fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.post('/users', async (req, res) => {
  try {
    const firstName = String(req.body.firstName || req.body.name || '').trim();
    const lastName = String(req.body.lastName || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const role = normaliseRole(req.body.role);
    const accountStatus = normaliseAccountStatus(req.body.accountStatus || 'active');
    const sendSetupLink = req.body.sendSetupLink !== false;

    if (!firstName || !lastName || !email || !role || !accountStatus) {
      return res.status(400).json({ error: 'First name, last name, email, role and account status are required' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    const placeholderPassword = crypto.randomBytes(32).toString('hex');

    const result = await pool.query(
      `
      INSERT INTO users (name, last_name, email, role, password_hash, account_status)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, name, last_name, email, role, account_status, avatar_url, phone_number, created_at
      `,
      [firstName, lastName, email, role, hashPassword(placeholderPassword), accountStatus]
    );

    if (sendSetupLink) {
      const resetLink = await createPasswordResetLink(result.rows[0].id);
      await sendPasswordResetEmail(result.rows[0].email, resetLink, true);
    }

    res.status(201).json(formatAdminUser({ ...result.rows[0], unit_count: 0 }));
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'A user with this email already exists' });
    }

    console.error('Admin user create error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

router.put('/users/:id', async (req, res) => {
  try {
    const firstName = String(req.body.firstName || req.body.name || '').trim();
    const lastName = String(req.body.lastName || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const role = normaliseRole(req.body.role);
    const accountStatus = normaliseAccountStatus(req.body.accountStatus || 'active');

    if (!firstName || !lastName || !email || !role || !accountStatus) {
      return res.status(400).json({ error: 'First name, last name, email, role and account status are required' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    const selfEditError = getSelfEditError(req.params.id, req.user.id, role, accountStatus);
    if (selfEditError) {
      return res.status(400).json({ error: selfEditError });
    }

    const result = await pool.query(
      `
      UPDATE users
      SET name = $1,
          last_name = $2,
          email = $3,
          role = $4,
          account_status = $5
      WHERE id = $6
      RETURNING id, name, last_name, email, role, account_status, avatar_url, phone_number, created_at
      `,
      [firstName, lastName, email, role, accountStatus, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const counts = await pool.query(
      `
      SELECT
        (
          SELECT COUNT(DISTINCT access_units.unit_id)
          FROM (
            SELECT unit_id FROM unit_memberships WHERE user_id = $1
            UNION
            SELECT id AS unit_id FROM units WHERE unit_coordinator_id = $1
          ) access_units
        ) AS unit_count,
        (
          SELECT COUNT(DISTINCT coordinator_units.unit_id)
          FROM (
            SELECT unit_id FROM unit_memberships WHERE user_id = $1 AND role = 'coordinator'
            UNION
            SELECT id AS unit_id FROM units WHERE unit_coordinator_id = $1
          ) coordinator_units
        ) AS coordinator_unit_count,
        (
          SELECT COUNT(DISTINCT unit_id)
          FROM unit_memberships
          WHERE user_id = $1 AND role IN ('tutor', 'super_tutor')
        ) AS tutor_unit_count,
        (
        SELECT STRING_AGG(DISTINCT unit_labels.label, ', ' ORDER BY unit_labels.label)
        FROM (
          SELECT un.unit_code || ' · ' || un.semester || ' ' || un.year::text AS label
          FROM unit_memberships um
          JOIN units un ON un.id = um.unit_id
          WHERE um.user_id = $1
          UNION
          SELECT unit_code || ' · ' || semester || ' ' || year::text
          FROM units
          WHERE unit_coordinator_id = $1
        ) unit_labels
        ) AS unit_summary
      `,
      [req.params.id]
    );

    res.json(formatAdminUser({ ...result.rows[0], ...counts.rows[0] }));
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'A user with this email already exists' });
    }

    console.error('Admin user update error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

router.post('/users/:id/send-reset-link', async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT id, email, name, last_name
      FROM users
      WHERE id = $1
      `,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    const resetLink = await createPasswordResetLink(user.id);
    const userName = [user.name, user.last_name].filter(Boolean).join(' ');
    await sendPasswordResetEmail(user.email, resetLink, false);

    res.json({ message: `Password reset link sent to ${userName || user.email}` });
  } catch (error) {
    console.error('Admin send reset link error:', error);
    res.status(500).json({ error: 'Failed to send reset link' });
  }
});

router.get('/users/:id/units', async (req, res) => {
  try {
    const userExists = await pool.query('SELECT id FROM users WHERE id = $1', [req.params.id]);
    if (userExists.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const result = await pool.query(
      `
      WITH coordinator_unit_ids AS (
        SELECT id AS unit_id
        FROM units
        WHERE unit_coordinator_id = $1
        UNION
        SELECT unit_id
        FROM unit_memberships
        WHERE user_id = $1
          AND role = 'coordinator'
      )
      SELECT
        un.id AS unit_id,
        un.unit_code,
        un.unit_name,
        un.semester,
        un.year,
        access.access_role,
        access.is_primary_coordinator,
        (
          SELECT COUNT(*)
          FROM sessions s
          WHERE s.unit_id = un.id
            AND EXISTS (
              SELECT 1 FROM session_tutors st
              WHERE st.session_id = s.id AND st.tutor_id = $1
                AND st.tutor_confirmed IS DISTINCT FROM false
            )
        ) AS assigned_session_count
      FROM (
        SELECT id AS unit_id, 'coordinator'::text AS access_role, TRUE AS is_primary_coordinator
        FROM units
        WHERE unit_coordinator_id = $1
        UNION
        SELECT unit_id, role AS access_role, FALSE AS is_primary_coordinator
        FROM unit_memberships
        WHERE user_id = $1
          AND NOT (
            role IN ('tutor', 'super_tutor')
            AND unit_id IN (SELECT unit_id FROM coordinator_unit_ids)
          )
      ) access
      JOIN units un ON un.id = access.unit_id
      ORDER BY un.year DESC, un.semester DESC, un.unit_code, access.access_role
      `,
      [req.params.id]
    );

    res.json(result.rows.map(formatAdminUserUnitAccess));
  } catch (error) {
    console.error('Admin user unit access fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch user unit access' });
  }
});

router.post('/users/:id/units', async (req, res) => {
  try {
    const unitId = req.body.unitId;
    const role = normaliseMembershipRole(req.body.role);

    if (!unitId || !VALID_MEMBERSHIP_ROLES.has(role)) {
      return res.status(400).json({ error: 'Unit and access role are required' });
    }

    const userResult = await pool.query(
      'SELECT id, email, name, last_name, role FROM users WHERE id = $1',
      [req.params.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (userResult.rows[0].role === 'admin') {
      return res.status(400).json({ error: 'Administrator accounts cannot be added to teaching units' });
    }

    const unitResult = await pool.query(
      'SELECT id, unit_code, unit_name FROM units WHERE id = $1',
      [unitId]
    );

    if (unitResult.rows.length === 0) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    if (isTutorMembershipRole(role)) {
      const coordinatorAccess = await pool.query(
        `
        SELECT 1
        FROM units
        WHERE id = $1
          AND unit_coordinator_id = $2
        UNION
        SELECT 1
        FROM unit_memberships
        WHERE unit_id = $1
          AND user_id = $2
          AND role = 'coordinator'
        LIMIT 1
        `,
        [unitId, req.params.id]
      );

      if (coordinatorAccess.rows.length > 0) {
        return res.status(409).json({ error: 'This user already has coordinator access for this unit.' });
      }

      if (role === 'tutor') {
        const downgradeError = await superTutorDowngradeError(req.params.id, unitId);
        if (downgradeError) return res.status(409).json({ error: downgradeError });
      }

      await pool.query(
        `
        DELETE FROM unit_memberships
        WHERE unit_id = $1
          AND user_id = $2
          AND role IN ('tutor', 'super_tutor')
          AND role <> $3
        `,
        [unitId, req.params.id, role]
      );
    }

    if (role === 'coordinator') {
      await pool.query(
        `
        DELETE FROM unit_memberships
        WHERE unit_id = $1
          AND user_id = $2
          AND role IN ('tutor', 'super_tutor')
        `,
        [unitId, req.params.id]
      );
    }

    await pool.query(
      `
      INSERT INTO unit_memberships (unit_id, user_id, role)
      VALUES ($1, $2, $3)
      ON CONFLICT (unit_id, user_id, role) DO NOTHING
      `,
      [unitId, req.params.id, role]
    );

    const unit = unitResult.rows[0];
    const user = userResult.rows[0];
    const userName = [user.name, user.last_name].filter(Boolean).join(' ') || user.email;
    const roleLabel = MEMBERSHIP_ROLE_LABELS[role] || role;

    await createNotification({
      userId: req.params.id,
      type: role === 'coordinator' ? 'coordinator_unit_added' : 'tutor_unit_added',
      title: `Added to ${unit.unit_code}`,
      content: `You have been added as a ${roleLabel} for ${unit.unit_code}.`,
      unitId,
      actionUrl: role === 'coordinator' ? '/uc-dashboard' : '/tutor-dashboard'
    });

    const accessResult = await pool.query(
      `
      SELECT
        un.id AS unit_id,
        un.unit_code,
        un.unit_name,
        un.semester,
        un.year,
        um.role AS access_role,
        FALSE AS is_primary_coordinator,
        (
          SELECT COUNT(*)
          FROM sessions s
          WHERE s.unit_id = un.id
            AND EXISTS (
              SELECT 1 FROM session_tutors st
              WHERE st.session_id = s.id AND st.tutor_id = $2
                AND st.tutor_confirmed IS DISTINCT FROM false
            )
        ) AS assigned_session_count
      FROM unit_memberships um
      JOIN units un ON un.id = um.unit_id
      WHERE um.unit_id = $1
        AND um.user_id = $2
        AND um.role = $3
      `,
      [unitId, req.params.id, role]
    );

    res.status(201).json({
      message: `${userName} was added to ${unit.unit_code}`,
      access: accessResult.rows[0] ? formatAdminUserUnitAccess(accessResult.rows[0]) : null
    });
  } catch (error) {
    console.error('Admin user unit access add error:', error);
    res.status(500).json({ error: 'Failed to add unit access' });
  }
});

router.delete('/users/:id/units/:unitId/:role', async (req, res) => {
  try {
    const role = normaliseMembershipRole(req.params.role);

    if (!VALID_MEMBERSHIP_ROLES.has(role)) {
      return res.status(400).json({ error: 'Invalid access role' });
    }

    if (role === 'coordinator') {
      const primaryCoordinator = await pool.query(
        'SELECT id FROM units WHERE id = $1 AND unit_coordinator_id = $2',
        [req.params.unitId, req.params.id]
      );

      if (primaryCoordinator.rows.length > 0) {
        return res.status(409).json({ error: 'This user is the main coordinator for this unit and cannot be removed here.' });
      }
    }

    if (isTutorMembershipRole(role)) {
      const assignedSessions = await pool.query(
        `SELECT COUNT(*)::int AS count FROM sessions s
         JOIN session_tutors st ON st.session_id = s.id
         WHERE s.unit_id = $1 AND st.tutor_id = $2
           AND st.tutor_confirmed IS DISTINCT FROM false`,
        [req.params.unitId, req.params.id]
      );

      if (Number(assignedSessions.rows[0]?.count || 0) > 0) {
        return res.status(409).json({ error: 'This tutor has assigned sessions in this unit. Reassign those sessions before removing access.' });
      }
    }

    const result = await pool.query(
      `
      DELETE FROM unit_memberships
      WHERE unit_id = $1
        AND user_id = $2
        AND role = $3
      RETURNING unit_id
      `,
      [req.params.unitId, req.params.id, role]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Unit access not found' });
    }

    res.json({ message: 'Unit access removed' });
  } catch (error) {
    console.error('Admin user unit access remove error:', error);
    res.status(500).json({ error: 'Failed to remove unit access' });
  }
});

router.get('/units', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        un.id,
        un.unit_code,
        un.unit_name,
        un.semester,
        un.year,
        un.enrolment_size,
        un.availability_deadline,
        un.availability_locked,
        un.schedule_locked,
        un.draft_released,
        un.teaching_start_date,
        un.teaching_end_date,
        main_uc.name AS main_coordinator_name,
        main_uc.last_name AS main_coordinator_last_name,
        main_uc.email AS main_coordinator_email,
        (
          SELECT STRING_AGG(DISTINCT TRIM(CONCAT(u.name, ' ', COALESCE(u.last_name, ''))), ', ' ORDER BY TRIM(CONCAT(u.name, ' ', COALESCE(u.last_name, ''))))
          FROM users u
          WHERE u.id = un.unit_coordinator_id
             OR EXISTS (
               SELECT 1
               FROM unit_memberships um
               WHERE um.unit_id = un.id
                 AND um.user_id = u.id
                 AND um.role = 'coordinator'
             )
        ) AS coordinators,
        (
          SELECT COUNT(DISTINCT u.id)
          FROM users u
          WHERE u.id = un.unit_coordinator_id
             OR EXISTS (
               SELECT 1
               FROM unit_memberships um
               WHERE um.unit_id = un.id
                 AND um.user_id = u.id
                 AND um.role = 'coordinator'
             )
        ) AS coordinator_count,
        (
          SELECT COUNT(DISTINCT user_id)
          FROM unit_memberships
          WHERE unit_id = un.id AND role IN ('tutor', 'super_tutor')
        ) AS tutor_count,
        (
          SELECT COUNT(*)
          FROM sessions
          WHERE unit_id = un.id
        ) AS session_count
      FROM units un
      LEFT JOIN users main_uc ON main_uc.id = un.unit_coordinator_id
      ORDER BY un.year DESC, un.semester DESC, un.unit_code ASC
    `);

    res.json(result.rows.map(formatAdminUnit));
  } catch (error) {
    console.error('Admin units fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch units' });
  }
});

router.post('/units', async (req, res) => {
  try {
    const unitCode = normaliseUnitCode(req.body.unitCode);
    const unitName = String(req.body.unitName || '').trim();
    const semester = String(req.body.semester || '').trim();
    const year = Number(req.body.year);
    const enrolmentSize = req.body.enrolmentSize ? Number(req.body.enrolmentSize) : null;
    const availabilityDeadline = req.body.availabilityDeadline || null;
    const coordinatorEmail = String(req.body.coordinatorEmail || '').trim().toLowerCase();

    if (!unitCode || !unitName || !semester || !year || !coordinatorEmail) {
      return res.status(400).json({ error: 'Unit code, unit name, semester, year and coordinator email are required' });
    }

    const teaching = resolveTeachingPeriodUpdate(req.body, {});
    const teachingError = validateTeachingPeriod(teaching.start, teaching.end);
    if (teachingError) {
      return res.status(400).json({ error: teachingError });
    }

    const coordinator = await findCoordinatorByEmail(coordinatorEmail);
    if (!coordinator) {
      return res.status(400).json({ error: 'No coordinator account found for this email' });
    }
    if (coordinator.role !== 'coordinator') {
      return res.status(400).json({ error: 'The main coordinator must be a Unit Coordinator account' });
    }

    const duplicate = await pool.query(
      `
      SELECT id
      FROM units
      WHERE UPPER(TRIM(unit_code)) = $1 AND semester = $2 AND year = $3
      LIMIT 1
      `,
      [unitCode, semester, year]
    );

    if (duplicate.rows.length > 0) {
      return res.status(409).json({ error: `${unitCode} already exists for ${semester}, ${year}` });
    }

    const result = await pool.query(
      `
      INSERT INTO units (unit_coordinator_id, unit_code, unit_name, semester, year, enrolment_size, availability_deadline,
                         teaching_start_date, teaching_end_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, unit_code, unit_name, semester, year, enrolment_size, availability_deadline,
                availability_locked, schedule_locked, draft_released, teaching_start_date, teaching_end_date
      `,
      [coordinator.id, unitCode, unitName, semester, year, enrolmentSize, availabilityDeadline, teaching.start, teaching.end]
    );

    await pool.query(
      `
      INSERT INTO unit_memberships (unit_id, user_id, role)
      VALUES ($1, $2, 'coordinator')
      ON CONFLICT (unit_id, user_id, role) DO NOTHING
      `,
      [result.rows[0].id, coordinator.id]
    );

    res.status(201).json(formatAdminUnit({
      ...result.rows[0],
      main_coordinator_name: coordinator.name,
      main_coordinator_last_name: coordinator.last_name,
      main_coordinator_email: coordinator.email,
      coordinators: joinUserName(coordinator.name, coordinator.last_name) || coordinator.email,
      coordinator_count: 1,
      tutor_count: 0,
      session_count: 0
    }));
  } catch (error) {
    console.error('Admin unit create error:', error);
    res.status(500).json({ error: 'Failed to create unit' });
  }
});

router.put('/units/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const unitCode = normaliseUnitCode(req.body.unitCode);
    const unitName = String(req.body.unitName || '').trim();
    const semester = String(req.body.semester || '').trim();
    const year = Number(req.body.year);
    const enrolmentSize = req.body.enrolmentSize ? Number(req.body.enrolmentSize) : null;
    const availabilityDeadline = req.body.availabilityDeadline || null;
    const coordinatorEmail = String(req.body.coordinatorEmail || '').trim().toLowerCase();

    if (!unitCode || !unitName || !semester || !year || !coordinatorEmail) {
      return res.status(400).json({ error: 'Unit code, unit name, semester, year and coordinator email are required' });
    }

    const existingTeaching = await pool.query(
      'SELECT teaching_start_date, teaching_end_date FROM units WHERE id = $1',
      [id]
    );
    const teaching = resolveTeachingPeriodUpdate(req.body, existingTeaching.rows[0] || {});
    const teachingError = validateTeachingPeriod(teaching.start, teaching.end);
    if (teachingError) {
      return res.status(400).json({ error: teachingError });
    }

    const coordinator = await findCoordinatorByEmail(coordinatorEmail);
    if (!coordinator) {
      return res.status(400).json({ error: 'No coordinator account found for this email' });
    }
    if (coordinator.role !== 'coordinator') {
      return res.status(400).json({ error: 'The main coordinator must be a Unit Coordinator account' });
    }

    const duplicate = await pool.query(
      `
      SELECT id
      FROM units
      WHERE UPPER(TRIM(unit_code)) = $1
        AND semester = $2
        AND year = $3
        AND id != $4
      LIMIT 1
      `,
      [unitCode, semester, year, id]
    );

    if (duplicate.rows.length > 0) {
      return res.status(409).json({ error: `${unitCode} already exists for ${semester}, ${year}` });
    }

    const result = await pool.query(
      `
      UPDATE units
      SET unit_coordinator_id = $1,
          unit_code = $2,
          unit_name = $3,
          semester = $4,
          year = $5,
          enrolment_size = $6,
          availability_deadline = $7,
          teaching_start_date = $9,
          teaching_end_date = $10
      WHERE id = $8
      RETURNING id, unit_code, unit_name, semester, year, enrolment_size, availability_deadline,
                availability_locked, schedule_locked, draft_released, teaching_start_date, teaching_end_date
      `,
      [coordinator.id, unitCode, unitName, semester, year, enrolmentSize, availabilityDeadline, id, teaching.start, teaching.end]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    await pool.query(
      `
      INSERT INTO unit_memberships (unit_id, user_id, role)
      VALUES ($1, $2, 'coordinator')
      ON CONFLICT (unit_id, user_id, role) DO NOTHING
      `,
      [id, coordinator.id]
    );

    const refreshed = await pool.query(
      `
      SELECT
        un.*,
        main_uc.name AS main_coordinator_name,
        main_uc.last_name AS main_coordinator_last_name,
        main_uc.email AS main_coordinator_email,
        (
          SELECT STRING_AGG(DISTINCT TRIM(CONCAT(u.name, ' ', COALESCE(u.last_name, ''))), ', ' ORDER BY TRIM(CONCAT(u.name, ' ', COALESCE(u.last_name, ''))))
          FROM users u
          WHERE u.id = un.unit_coordinator_id
             OR EXISTS (
               SELECT 1
               FROM unit_memberships um
               WHERE um.unit_id = un.id
                 AND um.user_id = u.id
                 AND um.role = 'coordinator'
             )
        ) AS coordinators,
        (SELECT COUNT(DISTINCT user_id) FROM unit_memberships WHERE unit_id = un.id AND role = 'coordinator') AS coordinator_count,
        (SELECT COUNT(DISTINCT user_id) FROM unit_memberships WHERE unit_id = un.id AND role IN ('tutor', 'super_tutor')) AS tutor_count,
        (SELECT COUNT(*) FROM sessions WHERE unit_id = un.id) AS session_count
      FROM units un
      LEFT JOIN users main_uc ON main_uc.id = un.unit_coordinator_id
      WHERE un.id = $1
      `,
      [id]
    );

    res.json(formatAdminUnit(refreshed.rows[0]));
  } catch (error) {
    console.error('Admin unit update error:', error);
    res.status(500).json({ error: 'Failed to update unit' });
  }
});

router.get('/units/:id/tutors', async (req, res) => {
  try {
    const { id } = req.params;

    const unit = await pool.query('SELECT id FROM units WHERE id = $1', [id]);
    if (unit.rows.length === 0) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    const result = await pool.query(
      `
      WITH tutor_memberships AS (
        SELECT DISTINCT ON (user_id)
          user_id,
          role AS membership_role
        FROM unit_memberships
        WHERE unit_id = $1
          AND role IN ('tutor', 'super_tutor')
        ORDER BY user_id, CASE WHEN role = 'super_tutor' THEN 0 ELSE 1 END
      )
      SELECT
        u.id,
        u.name,
        u.last_name,
        u.email,
        u.role,
        tm.membership_role,
        u.avatar_url,
        (
          SELECT COUNT(*)
          FROM sessions s
          WHERE s.unit_id = $1
            AND EXISTS (
              SELECT 1 FROM session_tutors st
              WHERE st.session_id = s.id AND st.tutor_id = u.id
                AND st.tutor_confirmed IS DISTINCT FROM false
            )
        ) AS assigned_session_count
      FROM tutor_memberships tm
      JOIN users u ON u.id = tm.user_id
      ORDER BY CASE WHEN tm.membership_role = 'super_tutor' THEN 0 ELSE 1 END,
               LOWER(u.name), LOWER(COALESCE(u.last_name, '')), LOWER(u.email)
      `,
      [id]
    );

    res.json(result.rows.map(formatAdminUnitTutor));
  } catch (error) {
    console.error('Admin unit tutors fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch unit tutors' });
  }
});

router.post('/units/:id/tutors', async (req, res) => {
  try {
    const { id } = req.params;
    const tutorEmail = String(req.body.email || '').trim().toLowerCase();
    const membershipRole = normaliseMembershipRole(req.body.role || 'tutor');

    if (!tutorEmail || !isTutorMembershipRole(membershipRole)) {
      return res.status(400).json({ error: 'Tutor email and access role are required' });
    }

    const unit = await pool.query('SELECT id, unit_code FROM units WHERE id = $1', [id]);
    if (unit.rows.length === 0) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    const tutor = await findUserByEmail(tutorEmail);
    if (!tutor) {
      return res.status(404).json({ error: 'No existing user account found for this email' });
    }
    if (tutor.role === 'admin') {
      return res.status(400).json({ error: 'Admin accounts cannot be added as tutors' });
    }

    if (membershipRole === 'tutor') {
      const downgradeError = await superTutorDowngradeError(tutor.id, id);
      if (downgradeError) return res.status(409).json({ error: downgradeError });
    }

    await pool.query(
      `
      DELETE FROM unit_memberships
      WHERE unit_id = $1
        AND user_id = $2
        AND role IN ('tutor', 'super_tutor')
        AND role <> $3
      `,
      [id, tutor.id, membershipRole]
    );

    await pool.query(
      `
      INSERT INTO unit_memberships (unit_id, user_id, role)
      VALUES ($1, $2, $3)
      ON CONFLICT (unit_id, user_id, role) DO NOTHING
      `,
      [id, tutor.id, membershipRole]
    );

    const roleLabel = MEMBERSHIP_ROLE_LABELS[membershipRole] || 'tutor';

    await createNotification({
      userId: tutor.id,
      type: 'tutor_unit_added',
      title: 'Added to a unit',
      content: `You have been added as a ${roleLabel} for ${unit.rows[0].unit_code}.`,
      unitId: id
    });

    const refreshed = await pool.query(
      `
      SELECT
        u.id,
        u.name,
        u.last_name,
        u.email,
        u.role,
        $3::text AS membership_role,
        u.avatar_url,
        (
          SELECT COUNT(*)
          FROM sessions s
          WHERE s.unit_id = $1
            AND EXISTS (
              SELECT 1 FROM session_tutors st
              WHERE st.session_id = s.id AND st.tutor_id = u.id
                AND st.tutor_confirmed IS DISTINCT FROM false
            )
        ) AS assigned_session_count
      FROM users u
      WHERE u.id = $2
      `,
      [id, tutor.id, membershipRole]
    );

    res.status(201).json(formatAdminUnitTutor(refreshed.rows[0]));
  } catch (error) {
    console.error('Admin unit tutor add error:', error);
    res.status(500).json({ error: 'Failed to add tutor to unit' });
  }
});

router.patch('/units/:id/tutors/:userId/role', async (req, res) => {
  try {
    const { id, userId } = req.params;
    const membershipRole = normaliseMembershipRole(req.body.role);

    if (!isTutorMembershipRole(membershipRole)) {
      return res.status(400).json({ error: 'A valid tutor access role is required' });
    }

    const unit = await pool.query('SELECT id FROM units WHERE id = $1', [id]);
    if (unit.rows.length === 0) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    const userResult = await pool.query(
      'SELECT id, role FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (userResult.rows[0].role === 'admin') {
      return res.status(400).json({ error: 'Admin accounts cannot be added as tutors' });
    }

    if (membershipRole === 'tutor') {
      const downgradeError = await superTutorDowngradeError(userId, id);
      if (downgradeError) return res.status(409).json({ error: downgradeError });
    }

    await pool.query(
      `
      DELETE FROM unit_memberships
      WHERE unit_id = $1
        AND user_id = $2
        AND role IN ('tutor', 'super_tutor')
        AND role <> $3
      `,
      [id, userId, membershipRole]
    );

    await pool.query(
      `
      INSERT INTO unit_memberships (unit_id, user_id, role)
      VALUES ($1, $2, $3)
      ON CONFLICT (unit_id, user_id, role) DO NOTHING
      `,
      [id, userId, membershipRole]
    );

    const refreshed = await pool.query(
      `
      SELECT
        u.id,
        u.name,
        u.last_name,
        u.email,
        u.role,
        $3::text AS membership_role,
        u.avatar_url,
        (
          SELECT COUNT(*)
          FROM sessions s
          WHERE s.unit_id = $1
            AND EXISTS (
              SELECT 1 FROM session_tutors st
              WHERE st.session_id = s.id AND st.tutor_id = u.id
                AND st.tutor_confirmed IS DISTINCT FROM false
            )
        ) AS assigned_session_count
      FROM users u
      WHERE u.id = $2
      `,
      [id, userId, membershipRole]
    );

    res.json(formatAdminUnitTutor(refreshed.rows[0]));
  } catch (error) {
    console.error('Admin unit tutor role update error:', error);
    res.status(500).json({ error: 'Failed to update tutor access role' });
  }
});

router.delete('/units/:id/tutors/:userId', async (req, res) => {
  try {
    const { id, userId } = req.params;

    const assigned = await pool.query(
      `
      SELECT COUNT(*) AS assigned_count
      FROM sessions s
      JOIN session_tutors st ON st.session_id = s.id
      WHERE s.unit_id = $1
        AND st.tutor_id = $2
        AND st.tutor_confirmed IS DISTINCT FROM false
      `,
      [id, userId]
    );

    if (Number(assigned.rows[0]?.assigned_count || 0) > 0) {
      return res.status(409).json({
        error: 'This tutor is assigned to sessions in this unit. Remove or reassign those sessions first.'
      });
    }

    const result = await pool.query(
      `
      DELETE FROM unit_memberships
      WHERE unit_id = $1
        AND user_id = $2
        AND role IN ('tutor', 'super_tutor')
      RETURNING unit_id
      `,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tutor membership not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Admin unit tutor remove error:', error);
    res.status(500).json({ error: 'Failed to remove tutor from unit' });
  }
});

router.get('/applications', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        ta.id,
        ta.unit_id,
        un.unit_code,
        un.unit_name,
        ta.name,
        ta.last_name,
        ta.email,
        ta.phone_number,
        ta.work_experience,
        ta.maximum_hours,
        ta.contract_type,
        ta.resume_filename,
        ta.status,
        ta.applied_at,
        ta.invited_at,
        ta.invite_token_expires_at,
        ta.created_user_id,
        invited_by.name AS invited_by_name,
        invited_by.last_name AS invited_by_last_name,
        invited_by.email AS invited_by_email,
        coordinator.name AS coordinator_name,
        coordinator.last_name AS coordinator_last_name,
        coordinator.email AS coordinator_email
      FROM tutor_applications ta
      LEFT JOIN units un ON un.id = ta.unit_id
      LEFT JOIN users invited_by ON invited_by.id = ta.invited_by_id
      LEFT JOIN users coordinator ON coordinator.id = un.unit_coordinator_id
      ORDER BY
        CASE ta.status
          WHEN 'pending' THEN 0
          WHEN 'invited' THEN 1
          WHEN 'accepted' THEN 2
          ELSE 3
        END,
        ta.applied_at DESC
    `);

    res.json(result.rows.map(formatAdminApplication));
  } catch (error) {
    console.error('Admin applications fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
});

router.get('/applications/:id/resume', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT resume_filename, resume_mime_type, resume_data FROM tutor_applications WHERE id = $1',
      [req.params.id]
    );

    if (result.rows.length === 0 || !result.rows[0].resume_data) {
      return res.status(404).json({ error: 'No resume found' });
    }

    const { resume_filename, resume_mime_type, resume_data } = result.rows[0];
    res.setHeader('Content-Type', resume_mime_type || 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${resume_filename || 'resume.pdf'}"`);
    res.send(resume_data);
  } catch (error) {
    console.error('Admin application resume fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch resume' });
  }
});

router.get('/requests', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM (
        SELECT
          cr.id,
          'Swap/Change' AS request_group,
          cr.request_type,
          cr.unit_id,
          un.unit_code,
          un.unit_name,
          tutor.name AS tutor_name,
          tutor.last_name AS tutor_last_name,
          tutor.email AS tutor_email,
          coordinator.name AS coordinator_name,
          coordinator.last_name AS coordinator_last_name,
          coordinator.email AS coordinator_email,
          cr.priority,
          cr.status,
          cr.reason,
          cr.current_session,
          cr.preferred_swap_to,
          cr.review_notes,
          cr.created_at AS submitted_at,
          cr.reviewed_at,
          NULL::text AS session_label,
          NULL::text AS location,
          NULL::varchar AS claimed_by_name,
          NULL::varchar AS claimed_by_last_name,
          NULL::varchar AS claimed_by_email,
          NULL::timestamp AS claimed_at,
          un.semester,
          un.year
        FROM change_requests cr
        LEFT JOIN units un ON un.id = cr.unit_id
        LEFT JOIN users tutor ON tutor.id = cr.tutor_id
        LEFT JOIN users coordinator ON coordinator.id = COALESCE(cr.reviewed_by_id, un.unit_coordinator_id)

        UNION ALL

        SELECT
          cover.id,
          'Cover' AS request_group,
          'Cover request' AS request_type,
          cover.unit_id,
          un.unit_code,
          un.unit_name,
          original.name AS tutor_name,
          original.last_name AS tutor_last_name,
          original.email AS tutor_email,
          creator.name AS coordinator_name,
          creator.last_name AS coordinator_last_name,
          creator.email AS coordinator_email,
          'Urgent' AS priority,
          cover.status,
          cover.reason,
          NULL::text AS current_session,
          NULL::text AS preferred_swap_to,
          NULL::text AS review_notes,
          cover.created_at AS submitted_at,
          NULL::timestamp AS reviewed_at,
          CONCAT(s.day, ' ', LEFT(s.start_time::text, 5), ' - ', LEFT(s.end_time::text, 5)) AS session_label,
          s.location,
          claimer.name AS claimed_by_name,
          claimer.last_name AS claimed_by_last_name,
          claimer.email AS claimed_by_email,
          cover.claimed_at,
          un.semester,
          un.year
        FROM cover_requests cover
        JOIN units un ON un.id = cover.unit_id
        JOIN sessions s ON s.id = cover.session_id
        LEFT JOIN users original ON original.id = cover.original_tutor_id
        LEFT JOIN users creator ON creator.id = cover.created_by_id
        LEFT JOIN users claimer ON claimer.id = cover.claimed_by_id
      ) requests
      ORDER BY
        CASE WHEN LOWER(status) IN ('pending', 'open') THEN 0 ELSE 1 END,
        CASE WHEN LOWER(priority) = 'urgent' THEN 0 ELSE 1 END,
        submitted_at DESC
    `);

    res.json(result.rows.map(formatAdminRequest));
  } catch (error) {
    console.error('Admin requests fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

router.get('/requests/:id/suggestion-sessions', async (req, res) => {
  try {
    const { id } = req.params;

    const requestResult = await pool.query(
      `
      SELECT id, unit_id, current_session
      FROM change_requests
      WHERE id = $1
      LIMIT 1
      `,
      [id]
    );

    if (requestResult.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const request = requestResult.rows[0];
    if (!request.unit_id) {
      return res.status(400).json({ error: 'This request is missing unit information.' });
    }

    const sessionsResult = await pool.query(
      `
      SELECT
        s.id,
        s.day,
        s.start_time,
        s.end_time,
        s.location,
        s.campus,
        s.session_type,
        s.capacity,
        s.required_tutors,
        s.status,
        COALESCE(
          json_agg(
            json_build_object(
              'tutorId', st.tutor_id,
              'tutorName', TRIM(CONCAT(u.name, ' ', COALESCE(u.last_name, ''))),
              'confirmed', st.tutor_confirmed
            )
          ) FILTER (WHERE st.tutor_id IS NOT NULL AND st.tutor_confirmed IS DISTINCT FROM FALSE),
          '[]'
        ) AS tutors
      FROM sessions s
      LEFT JOIN session_tutors st ON st.session_id = s.id
      LEFT JOIN users u ON u.id = st.tutor_id
      WHERE s.unit_id = $1
      GROUP BY s.id
      ORDER BY
        CASE s.day
          WHEN 'MON' THEN 1 WHEN 'TUE' THEN 2 WHEN 'WED' THEN 3
          WHEN 'THU' THEN 4 WHEN 'FRI' THEN 5 WHEN 'SAT' THEN 6 ELSE 7
        END,
        s.start_time
      `,
      [request.unit_id]
    );

    const requestLabelsResult = await pool.query(
      `
      SELECT current_session
      FROM change_requests
      WHERE unit_id = $1
        AND id <> $2
        AND LOWER(status) = 'pending'
      `,
      [request.unit_id, id]
    );

    const sessions = buildSuggestionSessions(
      sessionsResult.rows,
      request.current_session,
      requestLabelsResult.rows.map(row => row.current_session)
    );

    res.json(sessions);
  } catch (error) {
    console.error('Admin suggestion sessions fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch suggestion sessions' });
  }
});

router.patch('/requests/:id/review', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { status, reviewNotes, suggestedSessionId: bodySuggestedId } = req.body;
    const statusLower = String(status || '').trim().toLowerCase();

    if (!isValidReviewStatus(statusLower)) {
      return res.status(400).json({ error: 'Status must be accepted, rejected, or suggested.' });
    }

    const existingResult = await client.query('SELECT * FROM change_requests WHERE id = $1', [id]);
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }
    const existing = existingResult.rows[0];

    await client.query('BEGIN');

    let suggestedSessionId = existing.suggested_session_id;
    if (statusLower === 'suggested') {
      suggestedSessionId = await resolveSuggestedSession(client, existing, {
        suggestedSessionId: bodySuggestedId || null,
        reviewNotes
      });
    }

    // Approving must also move the tutor on the timetable (session_tutors),
    // exactly like a coordinator approval. It used to only change the label.
    if (shouldApplyChange(statusLower, existing.status)) {
      await applyApprovedChangeRequest(client, existing);
    }

    const result = await client.query(
      `
      UPDATE change_requests
      SET
        status = $1,
        review_notes = $2,
        reviewed_by_id = $3,
        reviewed_at = NOW(),
        suggested_session_id = CASE WHEN $6 THEN $5 ELSE suggested_session_id END
      WHERE id = $4
      RETURNING
        id,
        request_type,
        reason,
        status,
        priority,
        review_notes,
        current_session,
        preferred_swap_to,
        created_at,
        tutor_id,
        unit_id
      `,
      [statusLower, reviewNotes || '', req.user.id, id, suggestedSessionId || null, statusLower === 'suggested']
    );

    await client.query('COMMIT');

    const updated = result.rows[0];
    const detailsResult = await pool.query(
      `
      SELECT
        un.unit_code,
        un.unit_name,
        un.semester,
        un.year,
        TRIM(CONCAT(tutor.name, ' ', COALESCE(tutor.last_name, ''))) AS tutor_name,
        tutor.email AS tutor_email
      FROM units un
      LEFT JOIN users tutor ON tutor.id = $2
      WHERE un.id = $1
      LIMIT 1
      `,
      [updated.unit_id, updated.tutor_id]
    );
    const details = detailsResult.rows[0] || {};
    const unitCode = details.unit_code || 'your unit';

    const { title, content } = buildAdminReviewNotification(
      statusLower,
      details.unit_code ? unitLabelWithSemester(details.unit_code, details.semester, details.year) : unitCode,
      reviewNotes
    );

    if (updated.tutor_id) {
      await createNotification({
        userId: updated.tutor_id,
        type: `request_${statusLower}`,
        title,
        content,
        unitId: updated.unit_id,
        actionUrl: '/requests'
      });

      try {
        await sendAdminRequestReviewEmail({
          tutorEmail: details.tutor_email,
          tutorName: details.tutor_name,
          unitCode,
          unitName: details.unit_name,
          requestType: updated.request_type,
          status: statusLower,
          currentSession: updated.current_session,
          preferredSwapTo: updated.preferred_swap_to,
          reviewNotes
        });
      } catch (emailError) {
        console.error('Error sending admin request review email:', emailError);
      }
    }

    res.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (error instanceof AllocationError) {
      return res.status(error.status || 400).json({ error: error.message });
    }
    console.error('Admin request review error:', error);
    res.status(500).json({ error: 'Failed to review request' });
  } finally {
    client.release();
  }
});

router.patch('/cover-requests/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      UPDATE cover_requests
      SET status = 'cancelled'
      WHERE id = $1
        AND status = 'open'
      RETURNING id, unit_id, session_id, original_tutor_id
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Open cover request not found' });
    }

    const cancelled = result.rows[0];
    if (cancelled.original_tutor_id) {
      const unitResult = await pool.query('SELECT unit_code FROM units WHERE id = $1', [cancelled.unit_id]);
      const unitCode = unitResult.rows[0]?.unit_code || 'your unit';
      await createNotification({
        userId: cancelled.original_tutor_id,
        type: 'cover_request_cancelled',
        title: 'Cover request cancelled',
        content: `An administrator cancelled a cover request in ${unitCode}.`,
        unitId: cancelled.unit_id,
        sessionId: cancelled.session_id,
        actionUrl: '/requests'
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Admin cover request cancel error:', error);
    res.status(500).json({ error: 'Failed to cancel cover request' });
  }
});

router.get('/sessions', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        s.id,
        s.unit_id,
        un.unit_code,
        un.unit_name,
        un.semester,
        un.year,
        un.schedule_locked,
        s.day,
        s.start_time,
        s.end_time,
        s.location,
        s.campus,
        s.session_type,
        s.capacity,
        s.required_tutors,
        s.status,
        COUNT(DISTINCT st.tutor_id) FILTER (WHERE st.tutor_confirmed IS DISTINCT FROM false) AS assigned_tutor_count,
        STRING_AGG(
          DISTINCT TRIM(CONCAT(t.name, ' ', COALESCE(t.last_name, ''))),
          ', '
        ) FILTER (WHERE t.id IS NOT NULL AND st.tutor_confirmed IS DISTINCT FROM false) AS assigned_tutors,
        CASE
          WHEN COUNT(DISTINCT st.tutor_id) FILTER (WHERE st.tutor_confirmed IS DISTINCT FROM false) = 0 THEN 'Unassigned'
          WHEN BOOL_OR(st.tutor_confirmed IS NULL) THEN 'Awaiting confirmation'
          WHEN BOOL_AND(st.tutor_confirmed IS TRUE) FILTER (WHERE st.tutor_confirmed IS DISTINCT FROM false) THEN 'Confirmed'
          ELSE 'Assigned'
        END AS tutor_confirmation_state
      FROM sessions s
      JOIN units un ON un.id = s.unit_id
      LEFT JOIN session_tutors st ON st.session_id = s.id
      LEFT JOIN users t ON t.id = st.tutor_id
      GROUP BY s.id, un.unit_code, un.unit_name, un.semester, un.year, un.schedule_locked
      ORDER BY
        un.year DESC,
        un.semester DESC,
        un.unit_code ASC,
        CASE s.day
          WHEN 'MON' THEN 1 WHEN 'TUE' THEN 2 WHEN 'WED' THEN 3
          WHEN 'THU' THEN 4 WHEN 'FRI' THEN 5 WHEN 'SAT' THEN 6 ELSE 7
        END,
        s.start_time ASC
    `);

    res.json(result.rows.map(formatAdminSession));
  } catch (error) {
    console.error('Admin sessions fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

router.post('/sessions', async (req, res) => {
  try {
    const unitId = String(req.body.unitId || '').trim();
    const day = normaliseDay(req.body.day) || String(req.body.day || '').trim().toUpperCase();
    const startTime = String(req.body.startTime || '').trim();
    const endTime = String(req.body.endTime || '').trim();
    const location = String(req.body.location || '').trim();
    const campus = String(req.body.campus || '').trim();
    const sessionType = String(req.body.sessionType || '').trim();
    const capacity = req.body.capacity ? Number(req.body.capacity) : null;
    const requiredTutors = req.body.requiredTutors ? Number(req.body.requiredTutors) : null;
    const status = String(req.body.status || '').trim();

    const missingFields = getMissingSessionFields({
      unitId, day, startTime, endTime, location, campus, sessionType, capacity, requiredTutors, status
    });

    if (missingFields.length > 0) {
      return res.status(400).json({ error: `Please fill in all fields before saving: ${missingFields.join(', ')}` });
    }

    if (Number.isNaN(capacity) || capacity < 1) {
      return res.status(400).json({ error: 'Capacity must be at least 1' });
    }

    if (Number.isNaN(requiredTutors) || requiredTutors < 1) {
      return res.status(400).json({ error: 'Tutor must be at least 1' });
    }

    if (!endsAfterStart(startTime, endTime)) {
      return res.status(400).json({ error: 'End time must be after start time' });
    }

    const unit = await pool.query('SELECT id FROM units WHERE id = $1', [unitId]);
    if (unit.rows.length === 0) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    const result = await pool.query(
      `
      INSERT INTO sessions
        (unit_id, day, start_time, end_time, location, campus, session_type, capacity, required_tutors, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
      `,
      [unitId, day, startTime, endTime, location, campus, sessionType, capacity, requiredTutors, status]
    );

    const refreshed = await pool.query(
      `
      SELECT s.*, un.unit_code, un.unit_name, un.semester, un.year, un.schedule_locked,
        0 AS assigned_tutor_count,
        NULL AS assigned_tutors,
        'Unassigned' AS tutor_confirmation_state
      FROM sessions s
      JOIN units un ON un.id = s.unit_id
      WHERE s.id = $1
      `,
      [result.rows[0].id]
    );

    res.status(201).json(formatAdminSession(refreshed.rows[0]));
  } catch (error) {
    console.error('Admin session create error:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

router.put('/sessions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const unitId = String(req.body.unitId || '').trim();
    const day = normaliseDay(req.body.day) || String(req.body.day || '').trim().toUpperCase();
    const startTime = String(req.body.startTime || '').trim();
    const endTime = String(req.body.endTime || '').trim();
    const location = String(req.body.location || '').trim();
    const campus = String(req.body.campus || '').trim();
    const sessionType = String(req.body.sessionType || '').trim();
    const capacity = req.body.capacity ? Number(req.body.capacity) : null;
    const requiredTutors = req.body.requiredTutors ? Number(req.body.requiredTutors) : null;
    const status = String(req.body.status || '').trim();

    const missingFields = getMissingSessionFields({
      unitId, day, startTime, endTime, location, campus, sessionType, capacity, requiredTutors, status
    });

    if (missingFields.length > 0) {
      return res.status(400).json({ error: `Please fill in all fields before saving: ${missingFields.join(', ')}` });
    }

    if (Number.isNaN(capacity) || capacity < 1) {
      return res.status(400).json({ error: 'Capacity must be at least 1' });
    }

    if (Number.isNaN(requiredTutors) || requiredTutors < 1) {
      return res.status(400).json({ error: 'Tutor must be at least 1' });
    }

    if (!endsAfterStart(startTime, endTime)) {
      return res.status(400).json({ error: 'End time must be after start time' });
    }

    const currentResult = await pool.query(`
      SELECT s.*,
        COUNT(st.tutor_id) FILTER (WHERE st.tutor_confirmed IS DISTINCT FROM false)::int AS assigned_count
      FROM sessions s
      LEFT JOIN session_tutors st ON st.session_id = s.id
      WHERE s.id = $1
      GROUP BY s.id
    `, [id]);
    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const current = currentResult.rows[0];
    const editError = checkAdminSessionEdit(current, unitId, requiredTutors);
    if (editError) {
      return res.status(409).json({ error: editError });
    }
    if (current.assigned_count > 0 && requiresSuperTutor(sessionType)) {
      const assignedResult = await pool.query(`
        SELECT st.tutor_id
        FROM session_tutors st
        WHERE st.session_id = $1 AND st.tutor_confirmed IS DISTINCT FROM false
      `, [id]);
      const staff = await getAdminSessionStaff(pool.query.bind(pool), unitId);
      if (hasIneligibleForSuperTutorType(assignedResult.rows, staff)) {
        return res.status(409).json({ error: 'Unassign Tutors before changing this session to a lecture or consultation' });
      }
    }
    if (current.assigned_count > 0) {
      const clash = await findEditClash(pool, id, day, startTime, endTime);
      if (clash) return res.status(409).json({ error: clash });
    }

    // Bug 5b: the code follows a type change (TUT03 -> WOR01).
    let newSessionCode = null;
    if (shouldRegenerateCode({
      currentType: current.session_type,
      newType: sessionType,
      currentCode: current.session_code,
      requestedCode: undefined
    })) {
      const prefix = codePrefixForType(sessionType);
      const used = await pool.query(
        'SELECT session_code FROM sessions WHERE unit_id = $1 AND session_code LIKE $2',
        [unitId, `${prefix}%`]
      );
      newSessionCode = nextSessionCode(prefix, used.rows.map(r => r.session_code));
    }

    const result = await pool.query(
      `
      UPDATE sessions
      SET unit_id = $1,
          day = $2,
          start_time = $3,
          end_time = $4,
          location = $5,
          campus = $6,
          session_type = $7,
          capacity = $8,
          required_tutors = $9,
          status = $10,
          session_code = COALESCE($12, session_code)
      WHERE id = $11
      RETURNING *
      `,
      [unitId, day, startTime, endTime, location, campus, sessionType, capacity, requiredTutors, status, id, newSessionCode]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Same as the UC page: tell assigned tutors if the day, time or location moved.
    await noticeSessionUpdated({ before: current, after: result.rows[0] });

    const refreshed = await pool.query(
      `
      SELECT
        s.id,
        s.unit_id,
        un.unit_code,
        un.unit_name,
        un.semester,
        un.year,
        un.schedule_locked,
        s.day,
        s.start_time,
        s.end_time,
        s.location,
        s.campus,
        s.session_type,
        s.capacity,
        s.required_tutors,
        s.status,
        COUNT(DISTINCT st.tutor_id) FILTER (WHERE st.tutor_confirmed IS DISTINCT FROM false) AS assigned_tutor_count,
        STRING_AGG(
          DISTINCT TRIM(CONCAT(t.name, ' ', COALESCE(t.last_name, ''))),
          ', '
        ) FILTER (WHERE t.id IS NOT NULL AND st.tutor_confirmed IS DISTINCT FROM false) AS assigned_tutors,
        CASE
          WHEN COUNT(DISTINCT st.tutor_id) FILTER (WHERE st.tutor_confirmed IS DISTINCT FROM false) = 0 THEN 'Unassigned'
          WHEN BOOL_OR(st.tutor_confirmed IS NULL) THEN 'Awaiting confirmation'
          WHEN BOOL_AND(st.tutor_confirmed IS TRUE) FILTER (WHERE st.tutor_confirmed IS DISTINCT FROM false) THEN 'Confirmed'
          ELSE 'Assigned'
        END AS tutor_confirmation_state
      FROM sessions s
      JOIN units un ON un.id = s.unit_id
      LEFT JOIN session_tutors st ON st.session_id = s.id
      LEFT JOIN users t ON t.id = st.tutor_id
      WHERE s.id = $1
      GROUP BY s.id, un.unit_code, un.unit_name, un.semester, un.year, un.schedule_locked
      `,
      [id]
    );

    res.json(formatAdminSession(refreshed.rows[0]));
  } catch (error) {
    console.error('Admin session update error:', error);
    res.status(500).json({ error: 'Failed to update session' });
  }
});

router.get('/sessions/:id/assignments', async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid session ID' });

    const sessionResult = await pool.query(`
      SELECT s.id, s.unit_id, s.required_tutors, s.session_type, un.schedule_locked
      FROM sessions s
      JOIN units un ON un.id = s.unit_id
      WHERE s.id = $1
    `, [req.params.id]);
    const session = sessionResult.rows[0];
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const needsSuperTutor = requiresSuperTutor(session.session_type);

    const [staff, assignedResult] = await Promise.all([
      getAdminSessionStaff(pool.query.bind(pool), session.unit_id),
      pool.query(`
        SELECT u.id, u.name, u.last_name, u.email, st.tutor_confirmed
        FROM session_tutors st
        JOIN users u ON u.id = st.tutor_id
        WHERE st.session_id = $1
        ORDER BY LOWER(u.name), LOWER(COALESCE(u.last_name, ''))
      `, [session.id])
    ]);
    const staffRoles = new Map(staff.map(member => [member.id, member.role]));

    res.json({
      scheduleLocked: !!session.schedule_locked,
      requiredTutors: Number(session.required_tutors || 1),
      sessionType: session.session_type,
      // Bug 11: a Lecture / Consultation can only go to a Super Tutor or the
      // unit's coordinator, so plain Tutors are not offered at all (picking
      // one used to fail only after pressing Assign).
      superTutorOnly: needsSuperTutor,
      candidates: needsSuperTutor
        ? staff.filter(member => member.role === 'super_tutor' || member.role === 'coordinator')
        : staff,
      assigned: assignedResult.rows.map(user => ({
        id: user.id,
        name: joinUserName(user.name, user.last_name) || user.email,
        email: user.email,
        role: staffRoles.get(user.id) || null,
        confirmed: user.tutor_confirmed
      }))
    });
  } catch (error) {
    console.error('Admin session assignments fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch session assignments' });
  }
});

router.post('/sessions/:id/assignments', async (req, res) => {
  const { id } = req.params;
  const tutorId = String(req.body.tutorId || '').trim();
  if (!isUuid(id) || !isUuid(tutorId)) {
    return res.status(400).json({ error: 'Valid session and staff IDs are required' });
  }

  let client;
  let committed = false;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const sessionResult = await client.query(`
      SELECT s.id, s.unit_id, s.day, s.start_time, s.end_time,
             s.session_type, s.required_tutors, un.unit_code, un.schedule_locked
      FROM sessions s
      JOIN units un ON un.id = s.unit_id
      WHERE s.id = $1
      FOR UPDATE OF s
    `, [id]);
    const session = sessionResult.rows[0];
    if (!session) throw sessionAssignmentError(404, 'Session not found');
    if (session.schedule_locked) {
      throw sessionAssignmentError(409, 'This schedule is locked. Unlock it before changing assignments.');
    }

    const existingResult = await client.query(
      'SELECT tutor_id, tutor_confirmed FROM session_tutors WHERE session_id = $1',
      [id]
    );
    const slotError = checkAdminAssignSlot(existingResult.rows, tutorId, session.required_tutors);
    if (slotError) throw sessionAssignmentError(409, slotError);

    const candidates = await getAdminSessionStaff(client.query.bind(client), session.unit_id);
    const staff = candidates.find(candidate => candidate.id === tutorId);
    if (!staff) {
      throw sessionAssignmentError(409, 'This staff member does not have active access to the unit');
    }
    if (violatesSuperTutorRule(session.session_type, staff.role === 'super_tutor', staff.role === 'coordinator')) {
      throw sessionAssignmentError(409, `Only Super Tutors can be assigned to ${session.session_type} sessions`);
    }

    const otherResult = await client.query(`
      SELECT s.day, s.start_time, s.end_time, un.unit_code
      FROM sessions s
      JOIN session_tutors st ON st.session_id = s.id
      JOIN units un ON un.id = s.unit_id
      WHERE s.id <> $1 AND st.tutor_id = $2 AND st.tutor_confirmed IS DISTINCT FROM false
        AND s.unit_id IN ${sameTermUnitIdsSql('$3')}
    `, [id, tutorId, session.unit_id]);
    const [overlap] = findOverlappingSessions(session, otherResult.rows);
    if (overlap) {
      throw sessionAssignmentError(409, `This staff member has an overlapping session in ${overlap.unit_code}`);
    }

    const coversResult = await client.query(ACTIVE_COVERS_SQL, [tutorId]);
    const [coverConflict] = findCoverConflicts(session, coversResult.rows);
    if (coverConflict) {
      throw sessionAssignmentError(409, `This staff member is ${describeCoverConflict(coverConflict).replace(/^C/, "c")}`);
    }

    const hours = calcHoursIfAssigned(session, otherResult.rows);
    if (exceedsMaxHours(staff.maximumHours, hours)) {
      throw sessionAssignmentError(409, `This assignment would exceed the staff member's maximum hours (${hours}/${staff.maximumHours})`);
    }

    const confirmed = staff.role === 'coordinator' ? true : null;
    await client.query(`
      INSERT INTO session_tutors (session_id, tutor_id, tutor_confirmed, tutor_reject_reason)
      VALUES ($1, $2, $3, NULL)
      ON CONFLICT (session_id, tutor_id)
      DO UPDATE SET tutor_confirmed = $3, tutor_reject_reason = NULL, assigned_at = NOW(), reminder_sent_at = NULL
    `, [id, tutorId, confirmed]);
    await client.query('COMMIT');
    committed = true;

    try {
      await createNotification({
        userId: tutorId,
        type: 'session_assigned',
        title: staff.role === 'coordinator' ? 'Session assigned to you' : 'New session assignment',
        content: staff.role === 'coordinator'
          ? `You have been assigned to a ${session.day} session in ${session.unit_code}.`
          : `You've been assigned to a ${session.day} session in ${session.unit_code}. Please confirm or decline it.`,
        unitId: session.unit_id,
        sessionId: id,
        actionUrl: staff.role === 'coordinator'
          ? `/schedule-builder/${session.unit_id}`
          : `/tutor-schedule/${session.unit_id}`
      });
    } catch (notificationError) {
      console.error('Admin session assignment notification error:', notificationError);
    }

    res.status(201).json({ success: true });
  } catch (error) {
    if (client && !committed) await client.query('ROLLBACK').catch(() => {});
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Admin session assignment error:', error);
    res.status(500).json({ error: 'Failed to assign staff member' });
  } finally {
    if (client) client.release();
  }
});

router.delete('/sessions/:id/assignments/:tutorId', async (req, res) => {
  const { id, tutorId } = req.params;
  if (!isUuid(id) || !isUuid(tutorId)) {
    return res.status(400).json({ error: 'Valid session and staff IDs are required' });
  }

  try {
    const sessionResult = await pool.query(`
      SELECT s.*, un.schedule_locked
      FROM sessions s
      JOIN units un ON un.id = s.unit_id
      WHERE s.id = $1
    `, [id]);
    if (sessionResult.rows.length === 0) return res.status(404).json({ error: 'Session not found' });
    if (sessionResult.rows[0].schedule_locked) {
      return res.status(409).json({ error: 'This schedule is locked. Unlock it before changing assignments.' });
    }

    const removed = await pool.query(
      'DELETE FROM session_tutors WHERE session_id = $1 AND tutor_id = $2 RETURNING tutor_id, tutor_confirmed',
      [id, tutorId]
    );
    if (removed.rows.length === 0) return res.status(404).json({ error: 'Assignment not found' });

    if (removed.rows[0].tutor_confirmed !== false) {
      await noticeTutorRemoved({ session: sessionResult.rows[0], tutor: await loadNoticeUser(tutorId) });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Admin session unassignment error:', error);
    res.status(500).json({ error: 'Failed to unassign staff member' });
  }
});

router.delete('/sessions/:id', async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid session ID' });

  let client;
  let committed = false;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const sessionResult = await client.query(`
      SELECT s.id, un.schedule_locked
      FROM sessions s
      JOIN units un ON un.id = s.unit_id
      WHERE s.id = $1
      FOR UPDATE OF s
    `, [req.params.id]);
    if (sessionResult.rows.length === 0) throw sessionAssignmentError(404, 'Session not found');
    if (sessionResult.rows[0].schedule_locked) {
      throw sessionAssignmentError(409, 'This schedule is locked. Unlock it before deleting sessions.');
    }

    const assigned = await client.query(
      'SELECT 1 FROM session_tutors WHERE session_id = $1 AND tutor_confirmed IS DISTINCT FROM false LIMIT 1',
      [req.params.id]
    );
    if (assigned.rows.length > 0) {
      throw sessionAssignmentError(409, 'This session has assigned staff. Unassign them before deleting it.');
    }

    await client.query('DELETE FROM sessions WHERE id = $1', [req.params.id]);
    await client.query('COMMIT');
    committed = true;
    res.json({ success: true });
  } catch (error) {
    if (client && !committed) await client.query('ROLLBACK').catch(() => {});
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Admin session delete error:', error);
    res.status(500).json({ error: 'Failed to delete session' });
  } finally {
    if (client) client.release();
  }
});

module.exports = router;