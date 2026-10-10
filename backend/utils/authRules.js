// Registration rules used by auth.routes.js.
const { splitDisplayName } = require('./userNames');
const { passwordRuleError } = require('./passwords');

// Only "coordinator" (any capitalisation) registers a coordinator. Anything
// else, including "admin", registers a tutor: admins are never self-made.
const normaliseRegisterRole = (role) =>
  (String(role || '').trim().toLowerCase() === 'coordinator' ? 'coordinator' : 'tutor');

// First/last name from the register form; older forms sent one fullName instead.
const resolveRegisterName = (firstName, lastName, fullName) => {
  const legacyName = splitDisplayName(fullName);
  return {
    firstName: String(firstName || legacyName.firstName || '').trim(),
    lastName: String(lastName || legacyName.lastName || '').trim()
  };
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isValidEmail = (email) => EMAIL_PATTERN.test(String(email || '').trim());

// All register checks in order. Returns the error message or null.
const validateRegistration = ({ firstName, lastName, email, role, password, confirmPassword }) => {
  if (!firstName || !lastName || !email || !role || !password || !confirmPassword) {
    return 'Please fill in all fields';
  }
  if (!isValidEmail(email)) {
    return 'Please enter a valid email address';
  }
  if (password !== confirmPassword) {
    return 'Passwords do not match';
  }
  const passwordError = passwordRuleError(password);
  if (passwordError) return passwordError;
  return null;
};

module.exports = { normaliseRegisterRole, resolveRegisterName, isValidEmail, validateRegistration };