const jwt = require('jsonwebtoken');
const pool = require('../db');

const getBlockedAccountResponse = (status) => {
  if (status === 'disabled') {
    return {
      code: 403,
      error: 'This account has been disabled. Please contact an administrator.'
    };
  }

  if (status === 'pending') {
    return {
      code: 403,
      error: 'This account is still pending. Please contact an administrator.'
    };
  }

  return null;
};

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const result = await pool.query(
      `
      SELECT id, email, role, account_status
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [decoded.id]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'User account no longer exists' });
    }

    const accountStatus = user.account_status || 'active';
    const blocked = getBlockedAccountResponse(accountStatus);

    if (blocked) {
      return res.status(blocked.code).json({ error: blocked.error });
    }

    req.user = {
      ...decoded,
      id: user.id,
      email: user.email,
      role: user.role
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to do this' });
    }
    next();
  };
};

module.exports = { verifyToken, requireRole };
