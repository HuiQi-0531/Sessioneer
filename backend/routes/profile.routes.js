const express = require('express');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const multer = require('multer');
const pool = require('../db');
const { verifyToken } = require('../middleware/auth');
const { formatUserNameFields } = require('../utils/userNames');

const router = express.Router();

const AVATAR_BUCKET = process.env.SUPABASE_AVATAR_BUCKET || 'profile-avatars';
const MAX_AVATAR_SIZE = 2 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AVATAR_SIZE },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_AVATAR_TYPES.has(file.mimetype)) {
      return cb(new Error('Unsupported image type'));
    }
    cb(null, true);
  }
});

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
  ...formatUserNameFields(u),
  email: u.email,
  role: u.role,
  avatarUrl: u.avatar_url || null,
  phoneNumber: u.phone_number,
  workExperience: u.work_experience,
  maximumHours: u.maximum_hours,
  contractType: u.contract_type,
  notifySessionUpdates: u.notify_session_updates,
  notifyRequestUpdates: u.notify_request_updates
});

const getSupabaseConfig = () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return null;
  }
  return {
    supabaseUrl: supabaseUrl.replace(/\/$/, ''),
    serviceKey
  };
};

const ensureAvatarBucket = async () => {
  const { supabaseUrl, serviceKey } = getSupabaseConfig();
  const response = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      id: AVATAR_BUCKET,
      name: AVATAR_BUCKET,
      public: true,
      file_size_limit: MAX_AVATAR_SIZE
    })
  });

  if (!response.ok && response.status !== 409 && response.status !== 400) {
    const text = await response.text();
    throw new Error(text || 'Failed to prepare avatar storage');
  }
};

const buildRequestBaseUrl = (req) => {
  const forwardedProto = req.get('x-forwarded-proto');
  const protocol = forwardedProto ? forwardedProto.split(',')[0] : req.protocol;
  return `${protocol}://${req.get('host')}`;
};

const uploadAvatarLocally = async (file, userId, req) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const safeExt = ext && ext.length <= 12 ? ext : '.jpg';
  const objectPath = path.join('profile-avatars', String(userId), `${Date.now()}-${crypto.randomBytes(12).toString('hex')}${safeExt}`);
  const uploadDir = path.join(__dirname, '..', 'uploads', path.dirname(objectPath));
  const fullPath = path.join(__dirname, '..', 'uploads', objectPath);

  await fs.mkdir(uploadDir, { recursive: true });
  await fs.writeFile(fullPath, file.buffer);

  return `${buildRequestBaseUrl(req)}/uploads/${objectPath.split(path.sep).map(encodeURIComponent).join('/')}`;
};

const uploadAvatar = async (file, userId, req) => {
  const supabaseConfig = getSupabaseConfig();
  if (!supabaseConfig) {
    return uploadAvatarLocally(file, userId, req);
  }

  const { supabaseUrl, serviceKey } = supabaseConfig;
  await ensureAvatarBucket();

  const ext = path.extname(file.originalname || '').toLowerCase();
  const safeExt = ext && ext.length <= 12 ? ext : '.jpg';
  const objectPath = `avatars/${userId}/${Date.now()}-${crypto.randomBytes(12).toString('hex')}${safeExt}`;
  const uploadUrl = `${supabaseUrl}/storage/v1/object/${AVATAR_BUCKET}/${objectPath}`;

  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': file.mimetype,
      'x-upsert': 'false'
    },
    body: file.buffer
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Failed to upload avatar');
  }

  const encodedPath = objectPath.split('/').map(encodeURIComponent).join('/');
  return `${supabaseUrl}/storage/v1/object/public/${AVATAR_BUCKET}/${encodedPath}`;
};

// GET /profile - the logged-in user's own profile
router.get('/', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT id, name, last_name, email, role, phone_number, work_experience,
             maximum_hours, contract_type, avatar_url, notify_session_updates, notify_request_updates
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

// PUT /profile - update editable fields (first/last name, phone, and tutor-only fields for tutors)
router.put('/', verifyToken, async (req, res) => {
  try {
    const { name, firstName, lastName, phoneNumber, workExperience, maximumHours, contractType } = req.body;
    const cleanFirstName = String(firstName || name || '').trim();
    const cleanLastName = String(lastName || '').trim();
    const hasLastNameField = Object.prototype.hasOwnProperty.call(req.body, 'lastName');

    // Tutor-only fields are only ever written if the logged-in user is a tutor,
    // regardless of what a coordinator's request body might contain.
    const isTutor = req.user.role === 'tutor';

    const result = await pool.query(
      `
      UPDATE users
      SET
        name = COALESCE($1, name),
        last_name = CASE WHEN $2 THEN $3 ELSE last_name END,
        phone_number = COALESCE($4, phone_number),
        work_experience = CASE WHEN $5 THEN COALESCE($6, work_experience) ELSE work_experience END,
        maximum_hours = CASE WHEN $5 THEN COALESCE($7, maximum_hours) ELSE maximum_hours END,
        contract_type = CASE WHEN $5 THEN COALESCE($8, contract_type) ELSE contract_type END
      WHERE id = $9
      RETURNING id, name, last_name, email, role, phone_number, work_experience,
                maximum_hours, contract_type, avatar_url, notify_session_updates, notify_request_updates
      `,
      [cleanFirstName || null, hasLastNameField, cleanLastName || null, phoneNumber || null, isTutor, workExperience || null, maximumHours ?? null, contractType || null, req.user.id]
    );

    res.json(formatProfile(result.rows[0]));
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// POST /profile/avatar - upload/update the logged-in user's profile picture
router.post('/avatar', verifyToken, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Please choose an image to upload' });
    }

    const avatarUrl = await uploadAvatar(req.file, req.user.id, req);
    const result = await pool.query(
      `
      UPDATE users
      SET avatar_url = $1
      WHERE id = $2
      RETURNING id, name, last_name, email, role, phone_number, work_experience,
                maximum_hours, contract_type, avatar_url, notify_session_updates, notify_request_updates
      `,
      [avatarUrl, req.user.id]
    );

    res.json(formatProfile(result.rows[0]));
  } catch (error) {
    console.error('Error uploading avatar:', error);
    res.status(500).json({ error: error.message || 'Failed to upload profile picture' });
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
      RETURNING id, name, last_name, email, role, phone_number, work_experience,
                maximum_hours, contract_type, avatar_url, notify_session_updates, notify_request_updates
      `,
      [notifySessionUpdates, notifyRequestUpdates, req.user.id]
    );

    res.json(formatProfile(result.rows[0]));
  } catch (error) {
    console.error('Error updating notification preferences:', error);
    res.status(500).json({ error: 'Failed to update notification preferences' });
  }
});

router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    const message = error.code === 'LIMIT_FILE_SIZE'
      ? 'Image is too large. Please choose an image under 2 MB.'
      : error.message;
    return res.status(400).json({ error: message });
  }

  if (error.message === 'Unsupported image type') {
    return res.status(400).json({ error: 'Please choose a JPG, PNG, WEBP, or GIF image.' });
  }

  next(error);
});

module.exports = router;
