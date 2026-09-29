// Registration logic moved here unchanged from auth.routes.js.
const { splitDisplayName } = require('./userNames');

const normaliseRegisterRole = (role) => (role === 'Coordinator' ? 'coordinator' : 'tutor');

// First/last name from the register form; older forms sent one fullName instead.
const resolveRegisterName = (firstName, lastName, fullName) => {
  const legacyName = splitDisplayName(fullName);
  return {
    firstName: String(firstName || legacyName.firstName || '').trim(),
    lastName: String(lastName || legacyName.lastName || '').trim()
  };
};

module.exports = { normaliseRegisterRole, resolveRegisterName };
