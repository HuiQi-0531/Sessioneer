// Roles that should be treated as "a tutor on this unit" for general access
// purposes (messages, availability, dashboard, cover eligibility, etc).
// Super Tutor is a superset of Tutor - anywhere the app previously checked
// role = 'tutor', it should now check membership in this list instead,
// unless the check specifically cares about Lecture/Consultation eligibility
// (see SUPER_TUTOR_ONLY_SESSION_TYPES below).
const TUTOR_LIKE_ROLES = ['tutor', 'super_tutor'];

// Session types that only a Super Tutor can be assigned/swapped/cover into.
// Comparison is case-insensitive since sessionType is free text.
const SUPER_TUTOR_ONLY_SESSION_TYPES = ['lecture', 'consultation'];

const requiresSuperTutor = (sessionType) =>
  SUPER_TUTOR_ONLY_SESSION_TYPES.includes(String(sessionType || '').trim().toLowerCase());

module.exports = {
  TUTOR_LIKE_ROLES,
  SUPER_TUTOR_ONLY_SESSION_TYPES,
  requiresSuperTutor
};