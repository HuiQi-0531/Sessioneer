// Frontend mirror of backend/utils/roles.js.
// Super Tutor is a superset of Tutor for general access purposes (seeing the
// unit, submitting availability, showing up in tutor lists, etc). Anywhere
// the app used to check unit.roles.includes('tutor'), it should check
// against TUTOR_LIKE_ROLES instead, unless the check specifically cares
// about Lecture/Consultation eligibility.
export const TUTOR_LIKE_ROLES = ['tutor', 'super_tutor'];

// Does this unit (from allUnits / activeUnit, each with a `roles` array)
// give this user tutor-side access, whether as a plain Tutor or Super Tutor?
export const unitHasTutorAccess = (unit) =>
  (unit?.roles || []).some((r) => TUTOR_LIKE_ROLES.includes(r));

// Is this user specifically a Super Tutor on this unit?
export const isSuperTutorOnUnit = (unit) =>
  (unit?.roles || []).includes('super_tutor');