// Profile rules used by profile.routes.js.
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

// Max hours from the form: "" / null / undefined means "not given" (null,
// so the stored value is kept); otherwise it must be a whole number 0-168.
// Returns { value } or { error }.
const parseMaximumHours = (raw) => {
  if (raw === undefined || raw === null || String(raw).trim() === '') return { value: null };
  const text = String(raw).trim();
  if (!/^\d+$/.test(text) || Number(text) > 168) {
    return { error: 'Maximum hours must be a whole number between 0 and 168' };
  }
  return { value: Number(text) };
};

// Values for the profile UPDATE query in PUT /profile.
const buildProfileUpdateParams = (body, role, userId) => {
  const { name, firstName, lastName, phoneNumber, workExperience, maximumHours, contractType } = body;
  const cleanFirstName = String(firstName || name || '').trim();
  const cleanLastName = String(lastName || '').trim();
  const hasLastNameField = Object.prototype.hasOwnProperty.call(body, 'lastName');

  // Tutor-only fields are only ever written if the logged-in user is a tutor,
  // regardless of what a coordinator's request body might contain.
  const isTutor = role === 'tutor';
  const hours = parseMaximumHours(maximumHours);

  return [cleanFirstName || null, hasLastNameField, cleanLastName || null, phoneNumber || null, isTutor, workExperience || null, hours.error ? null : hours.value, contractType || null, userId];
};

// A name can be changed but not cleared. Only checked when the form sends the
// field, so a request that only updates, say, max hours still works.
// Returns the error message or null.
const validateProfileNames = (body) => {
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key);
  if ((has('firstName') || has('name')) && !String(body.firstName || body.name || '').trim()) {
    return 'First name is required';
  }
  if (has('lastName') && !String(body.lastName || '').trim()) {
    return 'Last name is required';
  }
  return null;
};

module.exports = { formatProfile, parseMaximumHours, buildProfileUpdateParams, validateProfileNames };