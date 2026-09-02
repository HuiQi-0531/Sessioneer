const express = require('express');
const crypto = require('crypto');
const pool = require('../db');
const { verifyToken, requireRole } = require('../middleware/auth');
const { splitDisplayName } = require('../utils/userNames');
const { getCoordinatorUnitId } = require('../utils/unitAccess');
const { LEGACY_FIELD_KEYS, DEFAULT_APPLICATION_FIELDS, sanitiseFields } = require('../utils/applicationFields');

const router = express.Router();

// The only two roles a coordinator can invite someone as. Anything else in
// the request body is ignored and falls back to 'tutor'.
const INVITABLE_ROLES = ['tutor', 'super_tutor'];
const normaliseInvitedRole = (role) => (INVITABLE_ROLES.includes(role) ? role : 'tutor');

// Same password hashing scheme used by auth.routes.js
const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
};

const formatApplication = (a) => ({
  id: a.id,
  unitId: a.unit_id,
  unitCode: a.unit_code,
  name: a.name,
  lastName: a.last_name,
  fullName: [a.name, a.last_name].filter(Boolean).join(' '),
  email: a.email,
  phoneNumber: a.phone_number,
  workExperience: a.work_experience,
  maximumHours: a.maximum_hours,
  contractType: a.contract_type,
  hasResume: !!a.resume_filename,
  resumeFilename: a.resume_filename,
  status: a.status,
  appliedAt: a.applied_at,
  invitedAt: a.invited_at,
  invitedRole: a.invited_role || 'tutor',
  // Only meaningful while status === 'invited' - accept-invite nulls this
  // out, and it's how the "Copy link" button on an already-invited card
  // can still work after the one-time success modal has been closed.
  inviteToken: a.status === 'invited' ? a.invite_token : null,
  customAnswers: a.custom_answers || {}
});

const getOwnedUnitId = async (unitId, coordinatorId, clientOrPool = pool) => {
  return getCoordinatorUnitId(unitId, coordinatorId, clientOrPool);
};

/**
 * POST /tutor-applications (public, no login required)
 * Body: { name, email, phoneNumber, workExperience, resumeBase64, resumeFilename, resumeMimeType }
 * The resume is sent as a base64 string in the JSON body rather than a
 * true multipart upload, so no new file-upload dependency is needed.
 */
router.get('/unit/:unitId', async (req, res) => {
  try {
    const { unitId } = req.params;
    const result = await pool.query(
      'SELECT id, unit_code, unit_name, semester, year, application_form FROM units WHERE id = $1',
      [unitId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    const unit = result.rows[0];
    res.json({
      id: unit.id,
      unitCode: unit.unit_code,
      unitName: unit.unit_name,
      semester: unit.semester,
      year: unit.year,
      applicationForm: unit.application_form || DEFAULT_APPLICATION_FIELDS
    });
  } catch (error) {
    console.error('Error fetching application unit:', error);
    res.status(500).json({ error: 'Failed to fetch unit' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { unitId, firstName, lastName, name, email, phoneNumber, workExperience, maximumHours, contractType, resumeBase64, resumeFilename, resumeMimeType, customAnswers } = req.body;
    const cleanFirstName = (firstName || name || '').trim();
    const cleanLastName = (lastName || '').trim();

    if (!cleanFirstName || !email) {
      return res.status(400).json({ error: 'First name and email are required' });
    }

    if (!unitId) {
      return res.status(400).json({ error: 'Application link is missing a unit' });
    }

    const unitResult = await pool.query('SELECT id FROM units WHERE id = $1', [unitId]);
    if (unitResult.rows.length === 0) {
      return res.status(404).json({ error: 'Unit not found' });
    }

    const resumeBuffer = resumeBase64 ? Buffer.from(resumeBase64, 'base64') : null;
    // Only keep answers for keys that aren't one of the legacy dedicated
    // columns - those are handled separately above.
    const cleanCustomAnswers = customAnswers && typeof customAnswers === 'object'
      ? Object.fromEntries(Object.entries(customAnswers).filter(([key]) => !LEGACY_FIELD_KEYS.includes(key)))
      : {};

    await pool.query(
      `
      INSERT INTO tutor_applications
        (unit_id, name, last_name, email, phone_number, work_experience, maximum_hours, contract_type, resume_filename, resume_mime_type, resume_data, custom_answers, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending')
      `,
      [unitId, cleanFirstName, cleanLastName || null, email, phoneNumber || null, workExperience || null, maximumHours ?? null, contractType || null, resumeFilename || null, resumeMimeType || null, resumeBuffer, JSON.stringify(cleanCustomAnswers)]
    );

    res.status(201).json({ success: true, message: 'Application submitted successfully' });
  } catch (error) {
    console.error('Error submitting tutor application:', error);
    res.status(500).json({ error: 'Failed to submit application' });
  }
});

// GET /tutor-applications?unitId=... (coordinator only) - list applications for a coordinator-owned unit
router.get('/', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const { unitId } = req.query;
    if (!unitId) {
      return res.status(400).json({ error: 'Unit is required' });
    }
    const ownedUnitId = await getOwnedUnitId(unitId, req.user.id);
    if (!ownedUnitId) return res.status(404).json({ error: 'Unit not found' });

    const result = await pool.query(
      `SELECT ta.*, u.unit_code
       FROM tutor_applications ta
       LEFT JOIN units u ON u.id = ta.unit_id
       WHERE ta.unit_id = $1
       ORDER BY
        CASE status WHEN 'pending' THEN 0 WHEN 'invited' THEN 1 ELSE 2 END,
        applied_at DESC`,
      [unitId]
    );
    res.json(result.rows.map(formatApplication));
  } catch (error) {
    console.error('Error fetching applications:', error);
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
});

// GET /tutor-applications/form/:unitId (coordinator only) - this unit's
// application form. Falls back to the default template if they've never
// customised it.
router.get('/form/:unitId', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const { unitId } = req.params;
    const ownedUnitId = await getOwnedUnitId(unitId, req.user.id);
    if (!ownedUnitId) return res.status(404).json({ error: 'Unit not found' });

    const result = await pool.query('SELECT application_form FROM units WHERE id = $1', [ownedUnitId]);
    const stored = result.rows[0]?.application_form;
    res.json({
      fields: stored || DEFAULT_APPLICATION_FIELDS,
      isCustomised: !!stored
    });
  } catch (error) {
    console.error('Error fetching application form:', error);
    res.status(500).json({ error: 'Failed to fetch application form' });
  }
});

// PUT /tutor-applications/form/:unitId (coordinator only) - save this
// unit's own copy of the application form.
router.put('/form/:unitId', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const { unitId } = req.params;
    const ownedUnitId = await getOwnedUnitId(unitId, req.user.id);
    if (!ownedUnitId) return res.status(404).json({ error: 'Unit not found' });

    const fields = sanitiseFields(req.body.fields);
    if (!fields) {
      return res.status(400).json({ error: 'Invalid form fields' });
    }

    await pool.query('UPDATE units SET application_form = $1 WHERE id = $2', [JSON.stringify(fields), ownedUnitId]);
    res.json({ fields });
  } catch (error) {
    console.error('Error saving application form:', error);
    res.status(500).json({ error: 'Failed to save application form' });
  }
});

// POST /tutor-applications/form/:unitId/reset (coordinator only) - go back
// to the default template.
router.post('/form/:unitId/reset', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const { unitId } = req.params;
    const ownedUnitId = await getOwnedUnitId(unitId, req.user.id);
    if (!ownedUnitId) return res.status(404).json({ error: 'Unit not found' });

    await pool.query('UPDATE units SET application_form = NULL WHERE id = $1', [ownedUnitId]);
    res.json({ fields: DEFAULT_APPLICATION_FIELDS });
  } catch (error) {
    console.error('Error resetting application form:', error);
    res.status(500).json({ error: 'Failed to reset application form' });
  }
});

// GET /tutor-applications/:id/resume (coordinator only) - download the resume file
router.get('/:id/resume', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT resume_filename, resume_mime_type, resume_data FROM tutor_applications WHERE id = $1',
      [id]
    );
    if (result.rows.length === 0 || !result.rows[0].resume_data) {
      return res.status(404).json({ error: 'No resume found' });
    }
    const { resume_filename, resume_mime_type, resume_data } = result.rows[0];
    res.setHeader('Content-Type', resume_mime_type || 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${resume_filename || 'resume.pdf'}"`);
    res.send(resume_data);
  } catch (error) {
    console.error('Error fetching resume:', error);
    res.status(500).json({ error: 'Failed to fetch resume' });
  }
});

// PATCH /tutor-applications/:id/invite (coordinator only) - generate an invite link
router.patch('/:id/invite', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const { id } = req.params;
    const { unitId, role } = req.body;
    if (!unitId) {
      return res.status(400).json({ error: 'Unit is required' });
    }
    const ownedUnitId = await getOwnedUnitId(unitId, req.user.id);
    if (!ownedUnitId) return res.status(404).json({ error: 'Unit not found' });

    const invitedRole = normaliseInvitedRole(role);
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const result = await pool.query(
      `
      UPDATE tutor_applications
      SET status = 'invited', invited_by_id = $1, invited_at = NOW(),
          invite_token = $2, invite_token_expires_at = $3, invited_role = $4
      WHERE id = $5 AND unit_id = $6
      RETURNING *
      `,
      [req.user.id, token, expiresAt, invitedRole, id, unitId]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Application not found' });

    res.json({ ...formatApplication(result.rows[0]), inviteToken: token });
  } catch (error) {
    console.error('Error inviting applicant:', error);
    res.status(500).json({ error: 'Failed to invite applicant' });
  }
});

/**
 * POST /tutor-applications/direct-invite (coordinator only)
 * For tutors the coordinator already knows. Existing users are added to the unit;
 * new users get an activation link and fill their own profile details.
 */
router.post('/direct-invite', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const { unitId, email, role } = req.body;
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail) {
      return res.status(400).json({ error: 'Tutor email is required' });
    }
    if (!unitId) {
      return res.status(400).json({ error: 'Unit is required' });
    }
    const invitedRole = normaliseInvitedRole(role);
    const ownedUnitId = await getOwnedUnitId(unitId, req.user.id);
    if (!ownedUnitId) return res.status(404).json({ error: 'Unit not found' });

    const unitResult = await pool.query(
      'SELECT unit_code, unit_name FROM units WHERE id = $1',
      [ownedUnitId]
    );
    const unit = unitResult.rows[0] || {};

    const existingUser = await pool.query(
      'SELECT id, name, last_name, email FROM users WHERE LOWER(email) = $1',
      [cleanEmail]
    );

    if (existingUser.rows.length > 0) {
      const user = existingUser.rows[0];

      // A person only holds one tutor-tier role per unit (tutor OR super_tutor).
      // Re-inviting them as the other one swaps it instead of stacking both.
      const alreadyHasThisRole = await pool.query(
        `SELECT id FROM unit_memberships WHERE unit_id = $1 AND user_id = $2 AND role = $3`,
        [ownedUnitId, user.id, invitedRole]
      );
      await pool.query(
        `DELETE FROM unit_memberships WHERE unit_id = $1 AND user_id = $2 AND role IN ('tutor', 'super_tutor') AND role != $3`,
        [ownedUnitId, user.id, invitedRole]
      );
      const membershipResult = alreadyHasThisRole.rows.length > 0
        ? alreadyHasThisRole
        : await pool.query(
          `
          INSERT INTO unit_memberships (unit_id, user_id, role)
          VALUES ($1, $2, $3)
          ON CONFLICT (unit_id, user_id, role) DO NOTHING
          RETURNING id
          `,
          [ownedUnitId, user.id, invitedRole]
        );

      const roleLabel = invitedRole === 'super_tutor' ? 'Super Tutor' : 'tutor';

      if (alreadyHasThisRole.rows.length === 0) {
        await pool.query(
          `
          INSERT INTO notifications
            (user_id, notification_type, title, content, related_unit_id, action_url)
          VALUES ($1, $2, $3, $4, $5, $6)
          `,
          [
            user.id,
            'tutor_unit_invite',
            'Added to a new tutor unit',
            `You have been added as a ${roleLabel} for ${unit.unit_code || 'a unit'}.`,
            ownedUnitId,
            '/tutor-dashboard'
          ]
        );
      }

      return res.json({
        addedExistingUser: true,
        alreadyTutor: alreadyHasThisRole.rows.length > 0,
        invitedRole,
        userId: user.id,
        email: user.email,
        fullName: [user.name, user.last_name].filter(Boolean).join(' ')
      });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const result = await pool.query(
      `
      INSERT INTO tutor_applications
        (unit_id, name, email, status, invited_by_id, invited_at, invite_token, invite_token_expires_at, invited_role)
      VALUES ($1, $2, $3, 'invited', $4, NOW(), $5, $6, $7)
      RETURNING *
      `,
      [unitId, '', cleanEmail, req.user.id, token, expiresAt, invitedRole]
    );

    res.status(201).json({ ...formatApplication(result.rows[0]), inviteToken: token });
  } catch (error) {
    console.error('Error creating direct invite:', error);
    res.status(500).json({ error: 'Failed to create invite' });
  }
});

// GET /tutor-applications/verify-invite/:token (public) - checks the token before showing the set-password form
router.get('/verify-invite/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const result = await pool.query(
      `SELECT name, last_name, email, status, invite_token_expires_at FROM tutor_applications WHERE invite_token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid invite link' });
    }
    const app = result.rows[0];
    if (app.status !== 'invited') {
      return res.status(409).json({ error: 'This invite has already been used' });
    }
    if (new Date() > new Date(app.invite_token_expires_at)) {
      return res.status(410).json({ error: 'This invite link has expired' });
    }

    const displayName = [app.name, app.last_name].filter(Boolean).join(' ');
    res.json({ name: displayName, email: app.email, requiresName: !displayName });
  } catch (error) {
    console.error('Error verifying invite:', error);
    res.status(500).json({ error: 'Failed to verify invite' });
  }
});

/**
 * POST /tutor-applications/accept-invite (public)
 * Body: { token, password, firstName, lastName }
 * Creates the real tutor account, carries the resume across if one exists,
 * and marks the application as accepted.
 */
router.post('/accept-invite', async (req, res) => {
  const client = await pool.connect();
  try {
    const { token, password, firstName, lastName } = req.body;
    if (!token || !password) {
      return res.status(400).json({ error: 'Token and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const appResult = await client.query('SELECT * FROM tutor_applications WHERE invite_token = $1', [token]);
    if (appResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid invite link' });
    }
    const application = appResult.rows[0];

    if (application.status !== 'invited') {
      return res.status(409).json({ error: 'This invite has already been used' });
    }
    if (new Date() > new Date(application.invite_token_expires_at)) {
      return res.status(410).json({ error: 'This invite link has expired' });
    }

    const existingUser = await client.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [application.email]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists. Please log in instead.' });
    }

    const inviteFirstName = (firstName || '').trim();
    const inviteLastName = (lastName || '').trim();
    if (!application.name && (!inviteFirstName || !inviteLastName)) {
      return res.status(400).json({ error: 'First name and last name are required' });
    }

    await client.query('BEGIN');

    const passwordHash = hashPassword(password);
    const splitName = splitDisplayName(application.name);
    const resolvedFirstName = application.name || splitName.firstName || inviteFirstName;
    const resolvedLastName = application.last_name || splitName.lastName || inviteLastName;
    const newUserResult = await client.query(
      `
      INSERT INTO users (name, last_name, email, role, password_hash, phone_number, work_experience, maximum_hours, contract_type, resume_filename, resume_mime_type, resume_data)
      VALUES ($1, $2, $3, 'tutor', $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id
      `,
      [
        resolvedFirstName, resolvedLastName || null, application.email, passwordHash,
        application.phone_number, application.work_experience, 
        application.maximum_hours, application.contract_type,
        application.resume_filename, application.resume_mime_type, application.resume_data
      ]
    );
    const newUserId = newUserResult.rows[0].id;

    if (application.unit_id) {
      await client.query(
        `
        INSERT INTO unit_memberships (unit_id, user_id, role)
        VALUES ($1, $2, $3)
        ON CONFLICT (unit_id, user_id, role) DO NOTHING
        `,
        [application.unit_id, newUserId, application.invited_role || 'tutor']
      );
    }

    await client.query(
      `
      UPDATE tutor_applications
      SET status = 'accepted', created_user_id = $1, invite_token = NULL,
          name = $2, last_name = $3
      WHERE id = $4
      `,
      [newUserId, resolvedFirstName, resolvedLastName || null, application.id]
    );

    await client.query('COMMIT');
    res.status(201).json({ success: true, message: 'Account created successfully. You can now log in.' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error accepting invite:', error);
    res.status(500).json({ error: 'Failed to create account' });
  } finally {
    client.release();
  }
});

// GET /tutor-applications/user/:userId/resume (coordinator only) - resume for an already-active tutor
router.get('/user/:userId/resume', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await pool.query(
      'SELECT resume_filename, resume_mime_type, resume_data FROM users WHERE id = $1',
      [userId]
    );
    if (result.rows.length === 0 || !result.rows[0].resume_data) {
      return res.status(404).json({ error: 'No resume found' });
    }
    const { resume_filename, resume_mime_type, resume_data } = result.rows[0];
    res.setHeader('Content-Type', resume_mime_type || 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${resume_filename || 'resume.pdf'}"`);
    res.send(resume_data);
  } catch (error) {
    console.error('Error fetching tutor resume:', error);
    res.status(500).json({ error: 'Failed to fetch resume' });
  }
});

module.exports = router;