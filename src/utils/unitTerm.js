// Same semester + year? A tutor's classes in another semester (e.g. the
// CAB201 copy for Semester 2, 2027) are not part of this week's timetable.
// Mirrors backend/utils/termRules.js.
export const isSameTerm = (a, b) => {
  if (!a || !b) return false;
  return String(a.semester || '').trim().toLowerCase() === String(b.semester || '').trim().toLowerCase()
    && String(a.year ?? '') === String(b.year ?? '');
};