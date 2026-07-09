const express = require('express');
const crypto = require('crypto');
const pool = require('../db');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// Same scheme as auth.routes.js: "salt:hash" using scrypt.
const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
};

const verifyPassword = (password, storedHash) => {
  if (!storedHash || !storedHash.includes(':')) {
    return false;
  }
  const [salt, originalHash] = storedHash.split(':');
  const originalHashBuffer = Buffer.from(originalHash, 'hex');
  const inputHashBuffer = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(originalHashBuffer, inputHashBuffer);
};

const formatProfile = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  phoneNumber: u.phone_number,
  workExperience: u.work_experience,
  maximumHours: u.maximum_hours,
  contractType: u.contract_type,
  notifySessionUpdates: u.notify_session_updates,
  notifyRequestUpdates: u.notify_request_updates
});

// GET /profile - the logged-in user's own profile
router.get('/', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT id, name, email, role, phone_number, work_experience,
             maximum_hours, contract_type, notify_session_updates, notify_request_updates
      FROM users WHERE id = $1
      `,
      [req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(formatProfile(result.rows[0]));
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// PUT /profile - update editable fields (name, phone, and tutor-only fields for tutors)
router.put('/', verifyToken, async (req, res) => {
  try {
    const { name, phoneNumber, workExperience, maximumHours, contractType } = req.body;

    // Tutor-only fields are only ever written if the logged-in user is a tutor,
    // regardless of what a coordinator's request body might contain.
    const isTutor = req.user.role === 'tutor';

    const result = await pool.query(
      `
      UPDATE users
      SET
        name = COALESCE($1, name),
        phone_number = COALESCE($2, phone_number),
        work_experience = CASE WHEN $3 THEN COALESCE($4, work_experience) ELSE work_experience END,
        maximum_hours = CASE WHEN $3 THEN COALESCE($5, maximum_hours) ELSE maximum_hours END,
        contract_type = CASE WHEN $3 THEN COALESCE($6, contract_type) ELSE contract_type END
      WHERE id = $7
      RETURNING id, name, email, role, phone_number, work_experience,
                maximum_hours, contract_type, notify_session_updates, notify_request_updates
      `,
      [name || null, phoneNumber || null, isTutor, workExperience || null, maximumHours ?? null, contractType || null, req.user.id]
    );

    res.json(formatProfile(result.rows[0]));
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// PUT /profile/password - change password
router.put('/password', verifyToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const userResult = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    if (!verifyPassword(currentPassword, userResult.rows[0].password_hash)) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const newHash = hashPassword(newPassword);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, req.user.id]);

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// PUT /profile/notifications - toggle notification preferences
router.put('/notifications', verifyToken, async (req, res) => {
  try {
    const { notifySessionUpdates, notifyRequestUpdates } = req.body;

    const result = await pool.query(
      `
      UPDATE users
      SET
        notify_session_updates = COALESCE($1, notify_session_updates),
        notify_request_updates = COALESCE($2, notify_request_updates)
      WHERE id = $3
      RETURNING id, name, email, role, phone_number, work_experience,
                maximum_hours, contract_type, notify_session_updates, notify_request_updates
      `,
      [notifySessionUpdates, notifyRequestUpdates, req.user.id]
    );

    res.json(formatProfile(result.rows[0]));
  } catch (error) {
    console.error('Error updating notification preferences:', error);
    res.status(500).json({ error: 'Failed to update notification preferences' });
  }
});

module.exports = router;