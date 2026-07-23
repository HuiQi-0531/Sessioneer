const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('../db');

const router = express.Router();

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

const formatUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role
});

const hashResetToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

const sendPasswordResetEmail = async (email, resetLink) => {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured');
  }

  const from = process.env.EMAIL_FROM || 'Sessioneer <onboarding@resend.dev>';

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: email,
      subject: 'Reset your Sessioneer password',
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #202124;">
          <h2>Reset your Sessioneer password</h2>
          <p>We received a request to reset your password.</p>
          <p>
            <a href="${resetLink}" style="display: inline-block; background: #5b4fc0; color: #ffffff; padding: 12px 18px; border-radius: 6px; text-decoration: none;">
              Reset password
            </a>
          </p>
          <p>This link will expire in 30 minutes.</p>
          <p>If you did not request this, you can ignore this email.</p>
        </div>
      `,
      text: `Reset your Sessioneer password: ${resetLink}\n\nThis link will expire in 30 minutes.`
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || data.error || 'Failed to send reset email');
  }

  return data;
};

router.post('/register', async (req, res) => {
  try {
    const { fullName, email, role, password, confirmPassword } = req.body;

    if (!fullName || !email || !role || !password || !confirmPassword) {
      return res.status(400).json({ error: 'Please fill in all fields' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }

    const normalizedRole = role === 'Coordinator' ? 'coordinator' : 'tutor';
    const passwordHash = hashPassword(password);

    const result = await pool.query(
      `
      INSERT INTO users (name, email, role, password_hash)
      VALUES ($1, $2, $3, $4)
      RETURNING id, name, email, role
      `,
      [fullName, email.toLowerCase(), normalizedRole, passwordHash]
    );

    res.status(201).json({
      message: 'Account created successfully',
      user: formatUser(result.rows[0])
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Email is already registered' });
    }
    console.error('Error registering user:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Please enter your email and password' });
    }

    const result = await pool.query(
      `
      SELECT id, name, email, role, password_hash
      FROM users
      WHERE email = $1
      LIMIT 1
      `,
      [email.toLowerCase()]
    );

    const user = result.rows[0];

    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      message: 'Login successful',
      user: formatUser(user),
      token
    });
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ error: 'Failed to log in' });
  }
});

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Please enter your email address' });
    }

    const normalizedEmail = email.toLowerCase();
    const result = await pool.query(
      `
      SELECT id, email
      FROM users
      WHERE email = $1
      LIMIT 1
      `,
      [normalizedEmail]
    );

    const user = result.rows[0];

    if (!user) {
      return res.json({
        message: 'If that email exists, a password reset link has been sent.'
      });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashResetToken(token);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetLink = `${frontendUrl.replace(/\/$/, '')}/reset-password?token=${token}`;

    await pool.query(
      `
      UPDATE password_reset_tokens
      SET used_at = NOW()
      WHERE user_id = $1 AND used_at IS NULL
      `,
      [user.id]
    );

    await pool.query(
      `
      INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
      VALUES ($1, $2, NOW() + INTERVAL '30 minutes')
      `,
      [user.id, tokenHash]
    );

    await sendPasswordResetEmail(user.email, resetLink);

    res.json({
      message: 'If that email exists, a password reset link has been sent.'
    });
  } catch (error) {
    console.error('Error sending password reset email:', error);
    res.status(500).json({ error: 'Failed to send reset email' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Reset token and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const tokenHash = hashResetToken(token);
    const tokenResult = await pool.query(
      `
      SELECT prt.id, prt.user_id
      FROM password_reset_tokens prt
      JOIN users u ON u.id = prt.user_id
      WHERE prt.token_hash = $1
        AND prt.used_at IS NULL
        AND prt.expires_at > NOW()
      LIMIT 1
      `,
      [tokenHash]
    );

    const resetToken = tokenResult.rows[0];

    if (!resetToken) {
      return res.status(400).json({ error: 'Reset link is invalid or expired' });
    }

    const passwordHash = hashPassword(newPassword);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await client.query(
        'UPDATE users SET password_hash = $1 WHERE id = $2',
        [passwordHash, resetToken.user_id]
      );
      await client.query(
        'UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1',
        [resetToken.id]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

module.exports = router;
