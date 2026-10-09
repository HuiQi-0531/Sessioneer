// Which units appear in the Messages unit list, and how they are labelled.

const semesterNumber = (semester) => (String(semester || '').includes('1') ? 1 : 2);

// A unit is "past" once its semester has finished. Current AND upcoming units
// stay in Messages, so a UC can talk to next semester's tutors while staffing.
export const isPastUnit = (unit, now = new Date()) => {
  if (!unit?.semester || !unit?.year) return false;
  const year = Number(unit.year);
  const currentYear = now.getFullYear();
  if (year !== currentYear) return year < currentYear;
  // Semester 1 is Jan-Jun, Semester 2 is Jul-Dec (same rule as isUnitActive).
  return semesterNumber(unit.semester) === 1 && now.getMonth() >= 6;
};

export const pickMessageUnits = (units, hasAccess, now = new Date()) =>
  (units || []).filter(unit => hasAccess(unit) && !isPastUnit(unit, now));

// "#CAB139", or "#CAB139 · S2 2027" when the list has another CAB139.
export const messageUnitLabel = (unit, units = []) => {
  if (!unit) return '-';
  const code = String(unit.unitCode || '').trim().toUpperCase();
  const clash = units.some(other => other.id !== unit.id
    && String(other.unitCode || '').trim().toUpperCase() === code);
  if (!clash || !unit.year) return `#${unit.unitCode}`;
  return `#${unit.unitCode} · S${semesterNumber(unit.semester)} ${unit.year}`;
};

// Start on the active unit if it is in the list, otherwise the first one.
export const initialMessageUnitId = (messageUnits, activeUnit) => {
  if (activeUnit && messageUnits.some(unit => unit.id === activeUnit.id)) return activeUnit.id;
  return messageUnits[0]?.id || null;
};
