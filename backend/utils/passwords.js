// Password helpers shared by auth, admin, profile and tutor application routes.
// Every route uses (and the logic unit tests check) this one copy instead of four.
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
  // A damaged stored hash has the wrong length, so treat it as a wrong password.
  if (originalHashBuffer.length !== inputHashBuffer.length) return false;
  return crypto.timingSafeEqual(originalHashBuffer, inputHashBuffer);
};

const hashResetToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

// Same rule the routes used inline before: `if (password.length < 6)` rejects.
const isValidPassword = (password) => !(password.length < 6);

module.exports = { hashPassword, verifyPassword, hashResetToken, isValidPassword };
