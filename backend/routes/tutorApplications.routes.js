const express = require('express');
const crypto = require('crypto');
const pool = require('../db');
const { verifyToken, requireRole } = require('../middleware/auth');
const { splitDisplayName } = require('../utils/userNames');

const router = express.Router();

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
  invitedAt: a.invited_at
});

const getOwnedUnitId = async (unitId, coordinatorId, clientOrPool = pool) => {
  const result = await clientOrPool.query(
    'SELECT id FROM units WHERE id = $1 AND unit_coordinator_id = $2',
    [unitId, coordinatorId]
  );
  return result.rows[0]?.id || null;
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
      'SELECT id, unit_code, unit_name, semester, year FROM units WHERE id = $1',
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
      year: unit.year
    });
  } catch (error) {
    console.error('Error fetching application unit:', error);
    res.status(500).json({ error: 'Failed to fetch unit' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { unitId, firstName, lastName, name, email, phoneNumber, workExperience, maximumHours, contractType, resumeBase64, resumeFilename, resumeMimeType } = req.body;
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

    await pool.query(
      `
      INSERT INTO tutor_applications
        (unit_id, name, last_name, email, phone_number, work_experience, maximum_hours, contract_type, resume_filename, resume_mime_type, resume_data, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending')
      `,
      [unitId, cleanFirstName, cleanLastName || null, email, phoneNumber || null, workExperience || null, maximumHours ?? null, contractType || null, resumeFilename || null, resumeMimeType || null, resumeBuffer]
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
    const { unitId } = req.body;
    if (!unitId) {
      return res.status(400).json({ error: 'Unit is required' });
    }
    const ownedUnitId = await getOwnedUnitId(unitId, req.user.id);
    if (!ownedUnitId) return res.status(404).json({ error: 'Unit not found' });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const result = await pool.query(
      `
      UPDATE tutor_applications
      SET status = 'invited', invited_by_id = $1, invited_at = NOW(),
          invite_token = $2, invite_token_expires_at = $3
      WHERE id = $4 AND unit_id = $5
      RETURNING *
      `,
      [req.user.id, token, expiresAt, id, unitId]
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
 * For tutors the coordinator already knows personally (returning tutors) -
 * skips the application/resume step and generates an invite link straight away.
 */
router.post('/direct-invite', verifyToken, requireRole('coordinator'), async (req, res) => {
  try {
    const { unitId, name, email } = req.body;
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }
    if (!unitId) {
      return res.status(400).json({ error: 'Unit is required' });
    }
    const ownedUnitId = await getOwnedUnitId(unitId, req.user.id);
    if (!ownedUnitId) return res.status(404).json({ error: 'Unit not found' });

    // TODO: Later, if this email already belongs to an existing user, add a
    // tutor unit membership instead of creating a duplicate invite/account.
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const result = await pool.query(
      `
      INSERT INTO tutor_applications
        (unit_id, name, email, status, invited_by_id, invited_at, invite_token, invite_token_expires_at)
      VALUES ($1, $2, $3, 'invited', $4, NOW(), $5, $6)
      RETURNING *
      `,
      [unitId, name, email, req.user.id, token, expiresAt]
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

    res.json({ name: [app.name, app.last_name].filter(Boolean).join(' '), email: app.email });
  } catch (error) {
    console.error('Error verifying invite:', error);
    res.status(500).json({ error: 'Failed to verify invite' });
  }
});

/**
 * POST /tutor-applications/accept-invite (public)
 * Body: { token, password }
 * Creates the real tutor account, carries the resume across if one exists,
 * and marks the application as accepted.
 */
router.post('/accept-invite', async (req, res) => {
  const client = await pool.connect();
  try {
    const { token, password } = req.body;
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

    const existingUser = await client.query('SELECT id FROM users WHERE email = $1', [application.email]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists. Please log in instead.' });
    }

    await client.query('BEGIN');

    const passwordHash = hashPassword(password);
    const splitName = splitDisplayName(application.name);
    const firstName = application.name || splitName.firstName;
    const lastName = application.last_name || splitName.lastName;
    const newUserResult = await client.query(
      `
      INSERT INTO users (name, last_name, email, role, password_hash, phone_number, work_experience, maximum_hours, contract_type, resume_filename, resume_mime_type, resume_data)
      VALUES ($1, $2, $3, 'tutor', $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id
      `,
      [
        firstName || application.name, lastName || null, application.email, passwordHash,
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
        VALUES ($1, $2, 'tutor')
        ON CONFLICT (unit_id, user_id, role) DO NOTHING
        `,
        [application.unit_id, newUserId]
      );
    }

    await client.query(
      `
      UPDATE tutor_applications
      SET status = 'accepted', created_user_id = $1, invite_token = NULL
      WHERE id = $2
      `,
      [newUserId, application.id]
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
