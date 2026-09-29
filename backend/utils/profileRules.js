// Moved here unchanged from profile.routes.js.
const { formatUserNameFields } = require('./userNames');

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

// Values for the profile UPDATE query (was inline in PUT /profile).
const buildProfileUpdateParams = (body, role, userId) => {
  const { name, firstName, lastName, phoneNumber, workExperience, maximumHours, contractType } = body;
  const cleanFirstName = String(firstName || name || '').trim();
  const cleanLastName = String(lastName || '').trim();
  const hasLastNameField = Object.prototype.hasOwnProperty.call(body, 'lastName');

  // Tutor-only fields are only ever written if the logged-in user is a tutor,
  // regardless of what a coordinator's request body might contain.
  const isTutor = role === 'tutor';

  return [cleanFirstName || null, hasLastNameField, cleanLastName || null, phoneNumber || null, isTutor, workExperience || null, maximumHours ?? null, contractType || null, userId];
};

module.exports = { formatProfile, buildProfileUpdateParams };
