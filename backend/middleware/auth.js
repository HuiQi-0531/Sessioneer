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

// Every 401 from here carries this code, so the frontend can tell "your
// login is no longer valid" apart from other 401s (e.g. a wrong current
// password) and send the user back to the login page.
const AUTH_ERROR_CODE = 'AUTH_INVALID';
const unauthorised = (res, error) => res.status(401).json({ error, code: AUTH_ERROR_CODE });

// Tokens carry the user's token_version as `tv`. Logging out, changing or
// resetting the password bumps the stored version, which makes every token
// issued before that moment stop working. Tokens from before this feature
// have no `tv` and count as version 0.
const tokenVersionMatches = (decoded, user) =>
  Number(decoded.tv || 0) === Number(user.token_version || 0);

const signToken = (user) => jwt.sign(
  { id: user.id, email: user.email, role: user.role, tv: Number(user.token_version || 0) },
  process.env.JWT_SECRET,
  { expiresIn: '8h' }
);

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return unauthorised(res, 'No token provided');
  }

  const token = authHeader.split(' ')[1];

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return unauthorised(res, 'Invalid or expired token');
  }

  try {
    const result = await pool.query(
      `
      SELECT id, email, role, account_status, token_version
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [decoded.id]
    );

    const user = result.rows[0];

    if (!user) {
      return unauthorised(res, 'User account no longer exists');
    }

    if (!tokenVersionMatches(decoded, user)) {
      return unauthorised(res, 'You have been logged out. Please log in again.');
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
    return unauthorised(res, 'Invalid or expired token');
  }
};

const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    const role = req.user?.role;
    // A Super Tutor can do everything a Tutor can.
    const allowed = allowedRoles.includes(role) ||
      (role === 'super_tutor' && allowedRoles.includes('tutor'));

    if (!req.user || !allowed) {
      return res.status(403).json({ error: 'You do not have permission to do this' });
    }
    next();
  };
};

module.exports = {
  verifyToken,
  requireRole,
  getBlockedAccountResponse,
  signToken,
  tokenVersionMatches,
  AUTH_ERROR_CODE
};
