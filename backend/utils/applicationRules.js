// Tutor application logic moved here unchanged from tutorApplications.routes.js.
const { splitDisplayName } = require('./userNames');
const { LEGACY_FIELD_KEYS } = require('./applicationFields');

// The only two roles a coordinator can invite someone as. Anything else in
// the request body is ignored and falls back to 'tutor'.
const INVITABLE_ROLES = ['tutor', 'super_tutor'];
const normaliseInvitedRole = (role) => (INVITABLE_ROLES.includes(role) ? role : 'tutor');

const formatApplication = (a) => ({
  id: a.id,
  unitId: a.unit_id,
  unitCode: a.unit_code,
  name: a.name,
  lastName: a.last_name,
  fullName: [a.name, a.last_name].filter(Boolean).join(' '),
  email: a.email,
  phoneNumber: a.phone_number,
  workExperience: a.work_experience,
  maximumHours: a.maximum_hours,
  contractType: a.contract_type,
  hasResume: !!a.resume_filename,
  resumeFilename: a.resume_filename,
  status: a.status,
  appliedAt: a.applied_at,
  invitedAt: a.invited_at,
  invitedRole: a.invited_role || 'tutor',
  // Only meaningful while status === 'invited' - accept-invite nulls this
  // out, and it's how the "Copy link" button on an already-invited card
  // can still work after the one-time success modal has been closed.
  inviteToken: a.status === 'invited' ? a.invite_token : null,
  customAnswers: a.custom_answers || {}
});

// Only keep answers for keys that aren't one of the legacy dedicated columns.
const filterCustomAnswers = (customAnswers) => (customAnswers && typeof customAnswers === 'object'
  ? Object.fromEntries(Object.entries(customAnswers).filter(([key]) => !LEGACY_FIELD_KEYS.includes(key)))
  : {});

const isInviteExpired = (expiresAt) => new Date() > new Date(expiresAt);

// Name for the new account when an invite is accepted.
const resolveInviteName = (application, inviteFirstName, inviteLastName) => {
  const splitName = splitDisplayName(application.name);
  return {
    firstName: application.name || splitName.firstName || inviteFirstName,
    lastName: application.last_name || splitName.lastName || inviteLastName
  };
};

module.exports = {
  INVITABLE_ROLES,
  normaliseInvitedRole,
  formatApplication,
  filterCustomAnswers,
  isInviteExpired,
  resolveInviteName
};
