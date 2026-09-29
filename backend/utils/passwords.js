// Password helpers shared by auth, admin, profile and tutor application routes.
// Moved here unchanged from auth.routes.js so every route uses (and the logic
// unit tests check) one copy instead of four.
const crypto = require('crypto');

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

const hashResetToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

// Same rule the routes used inline before: `if (password.length < 6)` rejects.
const isValidPassword = (password) => !(password.length < 6);

module.exports = { hashPassword, verifyPassword, hashResetToken, isValidPassword };
