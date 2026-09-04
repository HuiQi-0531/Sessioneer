const express = require('express');
const crypto = require('crypto');
const pool = require('../db');
const { verifyToken, requireRole } = require('../middleware/auth');
const { formatUserNameFields, joinUserName } = require('../utils/userNames');
const { normaliseDay } = require('../utils/normalise');
const { createNotification } = require('../utils/notify');
const { escapeHtml, sendEmail } = require('../utils/email');

const router = express.Router();

const VALID_ROLES = new Set(['admin', 'coordinator', 'tutor']);
const VALID_ACCOUNT_STATUSES = new Set(['active', 'pending', 'disabled']);
const VALID_MEMBERSHIP_ROLES = new Set(['coordinator', 'tutor', 'super_tutor']);
const TUTOR_MEMBERSHIP_ROLES = ['tutor', 'super_tutor'];
const MEMBERSHIP_ROLE_LABELS = {
  coordinator: 'unit coordinator',
  tutor: 'tutor',
  super_tutor: 'super tutor'
};

const frontendUrl = () => (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');

const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
};

const hashResetToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

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

const normaliseRole = (role) => {
  const value = String(role || '').trim().toLowerCase();

  if (value === 'unit coordinator' || value === 'uc') return 'coordinator';
  if (value === 'administrator') return 'admin';
  if (VALID_ROLES.has(value)) return value;

  return '';
};

const normaliseMembershipRole = (role) => {
  const value = String(role || '').trim().toLowerCase().replace(/[\s-]+/g, '_');

  if (value === 'unit_coordinator' || value === 'uc') return 'coordinator';
  if (value === 'supertutor') return 'super_tutor';
  if (VALID_MEMBERSHIP_ROLES.has(value)) return value;

  return '';
};

const isTutorMembershipRole = (role) => TUTOR_MEMBERSHIP_ROLES.includes(role);

const normaliseAccountStatus = (status) => {
  const value = String(status || 'active').trim().toLowerCase();
  return VALID_ACCOUNT_STATUSES.has(value) ? value : '';
};

const formatAdminUser = (user) => ({
  id: user.id,
  ...formatUserNameFields(user),
  email: user.email,
  role: user.role,
  accountStatus: user.account_status || 'active',
  avatarUrl: user.avatar_url || null,
  phoneNumber: user.phone_number || '',
  unitCount: Number(user.unit_count || 0),
  coordinatorUnitCount: Number(user.coordinator_unit_count || 0),
  tutorUnitCount: Number(user.tutor_unit_count || 0),
  unitSummary: user.unit_summary || '',
  createdAt: user.created_at || null
});

const formatAdminUnit = (unit) => ({
  id: unit.id,
  unitCode: unit.unit_code,
  unitName: unit.unit_name,
  semester: unit.semester,
  year: unit.year,
  enrolmentSize: unit.enrolment_size,
  availabilityDeadline: unit.availability_deadline,
  availabilityLocked: unit.availability_locked,
  scheduleLocked: unit.schedule_locked,
  draftReleased: unit.draft_released,
  mainCoordinatorName: joinUserName(unit.main_coordinator_name, unit.main_coordinator_last_name),
  mainCoordinatorEmail: unit.main_coordinator_email || '',
  coordinators: unit.coordinators || '',
  coordinatorCount: Number(unit.coordinator_count || 0),
  tutorCount: Number(unit.tutor_count || 0),
  sessionCount: Number(unit.session_count || 0)
});

const formatAdminUnitTutor = (tutor) => ({
  id: tutor.id,
  ...formatUserNameFields(tutor),
  email: tutor.email,
  role: tutor.role,
  membershipRole: tutor.membership_role || 'tutor',
  isSuperTutor: tutor.membership_role === 'super_tutor',
  avatarUrl: tutor.avatar_url || null,
  assignedSessionCount: Number(tutor.assigned_session_count || 0)
});

const formatAdminUserUnitAccess = (membership) => ({
  unitId: membership.unit_id,
  unitCode: membership.unit_code,
  unitName: membership.unit_name,
  semester: membership.semester,
  year: membership.year,
  role: membership.access_role,
  isPrimaryCoordinator: !!membership.is_primary_coordinator,
  assignedSessionCount: Number(membership.assigned_session_count || 0)
});

const formatAdminSession = (session) => ({
  id: session.id,
  unitId: session.unit_id,
  unitCode: session.unit_code,
  unitName: session.unit_name,
  semester: session.semester,
  year: session.year,
  day: session.day,
  startTime: session.start_time,
  endTime: session.end_time,
  location: session.location || '',
  campus: session.campus || '',
  sessionType: session.session_type || '',
  capacity: session.capacity,
  requiredTutors: session.required_tutors,
  status: session.status || 'Draft',
  assignedTutorCount: Number(session.assigned_tutor_count || 0),
  assignedTutors: session.assigned_tutors || '',
  tutorConfirmationState: session.tutor_confirmation_state || 'Unassigned'
});

const formatAdminApplication = (application) => ({
  id: application.id,
  unitId: application.unit_id,
  unitCode: application.unit_code || '',
  unitName: application.unit_name || '',
  firstName: application.name || '',
  lastName: application.last_name || '',
  fullName: [application.name, application.last_name].filter(Boolean).join(' ') || 'Pending profile',
  email: application.email,
  phoneNumber: application.phone_number || '',
  workExperience: application.work_experience || '',
  maximumHours: application.maximum_hours,
  contractType: application.contract_type || '',
  hasResume: !!application.resume_filename,
  resumeFilename: application.resume_filename || '',
  status: application.status || 'pending',
  appliedAt: application.applied_at,
  invitedAt: application.invited_at,
  inviteExpiresAt: application.invite_token_expires_at,
  createdUserId: application.created_user_id || null,
  invitedByName: [application.invited_by_name, application.invited_by_last_name].filter(Boolean).join(' '),
  invitedByEmail: application.invited_by_email || '',
  coordinatorName: [application.coordinator_name, application.coordinator_last_name].filter(Boolean).join(' '),
  coordinatorEmail: application.coordinator_email || ''
});

const formatAdminRequest = (request) => ({
  id: request.id,
  requestGroup: request.request_group,
  requestType: request.request_type,
  unitId: request.unit_id,
  unitCode: request.unit_code || '',
  unitName: request.unit_name || '',
  tutorName: [request.tutor_name, request.tutor_last_name].filter(Boolean).join(' ') || request.tutor_email || 'Unknown tutor',
  tutorEmail: request.tutor_email || '',
  coordinatorName: [request.coordinator_name, request.coordinator_last_name].filter(Boolean).join(' '),
  coordinatorEmail: request.coordinator_email || '',
  priority: request.priority || '',
  status: request.status || '',
  reason: request.reason || '',
  currentSession: request.current_session || '',
  preferredSwapTo: request.preferred_swap_to || '',
  reviewNotes: request.review_notes || '',
  submittedAt: request.submitted_at,
  reviewedAt: request.reviewed_at,
  sessionLabel: request.session_label || '',
  location: request.location || '',
  claimedByName: [request.claimed_by_name, request.claimed_by_last_name].filter(Boolean).join(' '),
  claimedByEmail: request.claimed_by_email || '',
  claimedAt: request.claimed_at
});

const normaliseUnitCode = (unitCode) => String(unitCode || '').trim().toUpperCase();

const isBlank = (value) => value === undefined || value === null || String(value).trim() === '';

const labelFromSessionValue = (value) => {
  if (!value) return 'Not specified';
  const parts = String(value).split('::');
  if (parts.length !== 2) return value;
  return parts[1].replace(/\|/g, ' | ');
};

const normaliseSessionLabel = (value) => {
  return labelFromSessionValue(value)
    .replace(/\s*\|\s*/g, '|')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
};

const getSessionComparableLabel = (session) => {
  const start = session.start_time ? String(session.start_time).slice(0, 5) : 'TBC';
  const end = session.end_time ? String(session.end_time).slice(0, 5) : 'TBC';
  const room = session.location || 'TBA';
  return normaliseSessionLabel(`${session.day || 'TBC'} ${start}-${end}|${room}`);
};

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

  const statusLower = String(status || '').toLowerCase();
  const displayStatus = statusLower === 'accepted' ? 'approved' : statusLower || 'updated';
  const subject = statusLower === 'suggested'
    ? `Alternative session suggested for ${unitCode}`
    : `Your ${unitCode} request was ${displayStatus}`;
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

const getMissingSessionFields = (session) => {
  const requiredFields = [
    ['unitId', 'Unit'],
    ['day', 'Day'],
    ['startTime', 'Start time'],
    ['endTime', 'End time'],
    ['location', 'Location'],
    ['campus', 'Campus'],
    ['sessionType', 'Type'],
    ['capacity', 'Capacity'],
    ['requiredTutors', 'Tutor'],
    ['status', 'Status']
  ];

  return requiredFields
    .filter(([field]) => isBlank(session[field]))
    .map(([, label]) => label);
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
          SELECT STRING_AGG(DISTINCT unit_labels.unit_code, ', ' ORDER BY unit_labels.unit_code)
          FROM (
            SELECT un.unit_code
            FROM unit_memberships um
            JOIN units un ON un.id = um.unit_id
            WHERE um.user_id = u.id
            UNION
            SELECT unit_code
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

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
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

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    if (req.params.id === req.user.id && role !== 'admin') {
      return res.status(400).json({ error: 'You cannot remove admin access from your own account' });
    }

    if (req.params.id === req.user.id && accountStatus === 'disabled') {
      return res.status(400).json({ error: 'You cannot disable your own admin account' });
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
          SELECT STRING_AGG(DISTINCT unit_labels.unit_code, ', ' ORDER BY unit_labels.unit_code)
          FROM (
            SELECT un.unit_code
            FROM unit_memberships um
            JOIN units un ON un.id = um.unit_id
            WHERE um.user_id = $1
            UNION
            SELECT unit_code
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
            AND s.assigned_tutor_id = $1
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
            AND s.assigned_tutor_id = $2
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
        'SELECT COUNT(*)::int AS count FROM sessions WHERE unit_id = $1 AND assigned_tutor_id = $2',
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
      INSERT INTO units (unit_coordinator_id, unit_code, unit_name, semester, year, enrolment_size, availability_deadline)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, unit_code, unit_name, semester, year, enrolment_size, availability_deadline,
                availability_locked, schedule_locked, draft_released
      `,
      [coordinator.id, unitCode, unitName, semester, year, enrolmentSize, availabilityDeadline]
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
          availability_deadline = $7
      WHERE id = $8
      RETURNING id, unit_code, unit_name, semester, year, enrolment_size, availability_deadline,
                availability_locked, schedule_locked, draft_released
      `,
      [coordinator.id, unitCode, unitName, semester, year, enrolmentSize, availabilityDeadline, id]
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
      SELECT
        u.id,
        u.name,
        u.last_name,
        u.email,
        u.role,
        um.role AS membership_role,
        u.avatar_url,
        (
          SELECT COUNT(*)
          FROM sessions s
          WHERE s.unit_id = $1
            AND s.assigned_tutor_id = u.id
        ) AS assigned_session_count
      FROM unit_memberships um
      JOIN users u ON u.id = um.user_id
      WHERE um.unit_id = $1
        AND um.role IN ('tutor', 'super_tutor')
      ORDER BY CASE WHEN um.role = 'super_tutor' THEN 0 ELSE 1 END,
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
      relatedUnitId: id
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
            AND s.assigned_tutor_id = u.id
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
            AND s.assigned_tutor_id = u.id
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
      FROM sessions
      WHERE unit_id = $1
        AND assigned_tutor_id = $2
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
          NULL::timestamp AS claimed_at
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
          cover.claimed_at
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
          ) FILTER (WHERE st.tutor_id IS NOT NULL),
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

    const currentRequestLabel = normaliseSessionLabel(request.current_session);
    const swapOpenSessionLabels = new Set(
      requestLabelsResult.rows
        .map(row => normaliseSessionLabel(row.current_session))
        .filter(Boolean)
    );

    const sessions = sessionsResult.rows
      .map((session) => {
        const comparableLabel = getSessionComparableLabel(session);
        const assignedCount = Array.isArray(session.tutors) ? session.tutors.length : 0;
        const requiredTutors = Number(session.required_tutors || 1);
        const isSwapOpen = swapOpenSessionLabels.has(comparableLabel);

        return {
          id: session.id,
          day: session.day,
          startTime: session.start_time,
          endTime: session.end_time,
          location: session.location,
          campus: session.campus,
          sessionType: session.session_type,
          capacity: session.capacity,
          requiredTutors: session.required_tutors,
          status: session.status,
          tutors: session.tutors || [],
          comparableLabel,
          availabilityLabel: isSwapOpen
            ? 'Swap/change requested'
            : assignedCount === 0
              ? 'Unassigned'
              : 'Space available'
        };
      })
      .filter(session => session.comparableLabel && session.comparableLabel !== currentRequestLabel)
      .filter(session => {
        const assignedCount = Array.isArray(session.tutors) ? session.tutors.length : 0;
        const requiredTutors = Number(session.requiredTutors || 1);
        return assignedCount < requiredTutors || swapOpenSessionLabels.has(session.comparableLabel);
      });

    res.json(sessions);
  } catch (error) {
    console.error('Admin suggestion sessions fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch suggestion sessions' });
  }
});

router.patch('/requests/:id/review', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reviewNotes } = req.body;
    const statusLower = String(status || '').trim().toLowerCase();
    const allowedStatuses = new Set(['accepted', 'rejected', 'suggested']);

    if (!allowedStatuses.has(statusLower)) {
      return res.status(400).json({ error: 'Status must be accepted, rejected, or suggested.' });
    }

    const result = await pool.query(
      `
      UPDATE change_requests
      SET
        status = $1,
        review_notes = $2,
        reviewed_by_id = $3,
        reviewed_at = NOW()
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
      [statusLower, reviewNotes || '', req.user.id, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const updated = result.rows[0];
    const detailsResult = await pool.query(
      `
      SELECT
        un.unit_code,
        un.unit_name,
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

    let title = 'Request updated';
    let content = `Your request in ${unitCode} was updated.`;
    if (statusLower === 'accepted') {
      title = 'Request approved';
      content = `Your request in ${unitCode} was approved by an administrator.`;
    } else if (statusLower === 'rejected') {
      title = 'Request rejected';
      content = `Your request in ${unitCode} was rejected by an administrator.${reviewNotes ? ` Note: ${reviewNotes}` : ''}`;
    } else if (statusLower === 'suggested') {
      title = 'Alternative session suggested';
      content = `An administrator suggested an alternative session for your request in ${unitCode}.`;
    }

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
    console.error('Admin request review error:', error);
    res.status(500).json({ error: 'Failed to review request' });
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
        s.day,
        s.start_time,
        s.end_time,
        s.location,
        s.campus,
        s.session_type,
        s.capacity,
        s.required_tutors,
        s.status,
        COUNT(DISTINCT st.tutor_id) AS assigned_tutor_count,
        STRING_AGG(
          DISTINCT TRIM(CONCAT(t.name, ' ', COALESCE(t.last_name, ''))),
          ', '
        ) FILTER (WHERE t.id IS NOT NULL) AS assigned_tutors,
        CASE
          WHEN COUNT(DISTINCT st.tutor_id) = 0 THEN 'Unassigned'
          WHEN BOOL_OR(st.tutor_confirmed IS FALSE) THEN 'Declined'
          WHEN BOOL_OR(st.tutor_confirmed IS NULL) THEN 'Awaiting confirmation'
          WHEN BOOL_AND(st.tutor_confirmed IS TRUE) THEN 'Confirmed'
          ELSE 'Assigned'
        END AS tutor_confirmation_state
      FROM sessions s
      JOIN units un ON un.id = s.unit_id
      LEFT JOIN session_tutors st ON st.session_id = s.id
      LEFT JOIN users t ON t.id = st.tutor_id
      GROUP BY s.id, un.unit_code, un.unit_name, un.semester, un.year
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
      SELECT s.*, un.unit_code, un.unit_name, un.semester, un.year,
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
          status = $10
      WHERE id = $11
      RETURNING id
      `,
      [unitId, day, startTime, endTime, location, campus, sessionType, capacity, requiredTutors, status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const refreshed = await pool.query(
      `
      SELECT
        s.id,
        s.unit_id,
        un.unit_code,
        un.unit_name,
        un.semester,
        un.year,
        s.day,
        s.start_time,
        s.end_time,
        s.location,
        s.campus,
        s.session_type,
        s.capacity,
        s.required_tutors,
        s.status,
        COUNT(DISTINCT st.tutor_id) AS assigned_tutor_count,
        STRING_AGG(
          DISTINCT TRIM(CONCAT(t.name, ' ', COALESCE(t.last_name, ''))),
          ', '
        ) FILTER (WHERE t.id IS NOT NULL) AS assigned_tutors,
        CASE
          WHEN COUNT(DISTINCT st.tutor_id) = 0 THEN 'Unassigned'
          WHEN BOOL_OR(st.tutor_confirmed IS FALSE) THEN 'Declined'
          WHEN BOOL_OR(st.tutor_confirmed IS NULL) THEN 'Awaiting confirmation'
          WHEN BOOL_AND(st.tutor_confirmed IS TRUE) THEN 'Confirmed'
          ELSE 'Assigned'
        END AS tutor_confirmation_state
      FROM sessions s
      JOIN units un ON un.id = s.unit_id
      LEFT JOIN session_tutors st ON st.session_id = s.id
      LEFT JOIN users t ON t.id = st.tutor_id
      WHERE s.id = $1
      GROUP BY s.id, un.unit_code, un.unit_name, un.semester, un.year
      `,
      [id]
    );

    res.json(formatAdminSession(refreshed.rows[0]));
  } catch (error) {
    console.error('Admin session update error:', error);
    res.status(500).json({ error: 'Failed to update session' });
  }
});

router.delete('/sessions/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM sessions WHERE id = $1 RETURNING id', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Admin session delete error:', error);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

module.exports = router;
