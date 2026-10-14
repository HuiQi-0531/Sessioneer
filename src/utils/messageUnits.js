// Which units appear in the Messages unit list, and how they are labelled.

const semesterNumber = (semester) => (String(semester || '').includes('1') ? 1 : 2);

const pad = (n) => String(n).padStart(2, '0');

// Today in Brisbane as 'YYYY-MM-DD'. Brisbane is UTC+10 all year (no
// daylight saving), so the day rolls over at Brisbane midnight whatever
// time zone the browser is in.
export const brisbaneTodayKey = (now = new Date()) => {
  const b = new Date(now.getTime() + 10 * 60 * 60 * 1000);
  return `${b.getUTCFullYear()}-${pad(b.getUTCMonth() + 1)}-${pad(b.getUTCDate())}`;
};

// 'upcoming', 'current' or 'past'. Semester 1 is Jan-Jun, Semester 2 is
// Jul-Dec, the same windows as the Active Unit switcher.
// Mirrors unitChatStatus in backend/utils/messageRules.js.
export const messageUnitStatus = (unit, today = brisbaneTodayKey()) => {
  if (!unit?.semester || !unit?.year) return 'current';
  const isSem1 = semesterNumber(unit.semester) === 1;
  const start = `${unit.year}-${isSem1 ? '01-01' : '07-01'}`;
  const end = `${unit.year}-${isSem1 ? '06-30' : '12-31'}`;
  if (today < start) return 'upcoming';
  if (today > end) return 'past';
  return 'current';
};

// Every unit the user can message in, past ones included (they open read-only).
export const pickMessageUnits = (units, hasAccess) =>
  (units || []).filter(unit => hasAccess(unit));

// Splits the list for the unit column. Upcoming is soonest first, past is
// most recent first.
export const groupMessageUnits = (units, today = brisbaneTodayKey()) => {
  const groups = { past: [], upcoming: [], current: [] };
  (units || []).forEach(unit => groups[messageUnitStatus(unit, today)].push(unit));
  const termKey = (unit) => Number(unit.year) * 10 + semesterNumber(unit.semester);
  groups.upcoming.sort((a, b) => termKey(a) - termKey(b));
  groups.past.sort((a, b) => termKey(b) - termKey(a));
  return groups;
};

// "#CAB139", or "#CAB139 · S2 2027" when the list has another CAB139.
export const messageUnitLabel = (unit, units = []) => {
  if (!unit) return '-';
  const code = String(unit.unitCode || '').trim().toUpperCase();
  const clash = units.some(other => other.id !== unit.id
    && String(other.unitCode || '').trim().toUpperCase() === code);
  if (!clash || !unit.year) return `#${unit.unitCode}`;
  return `#${unit.unitCode} · S${semesterNumber(unit.semester)} ${unit.year}`;
};

// Start on the active unit if it is in the list, otherwise the first current
// unit, then upcoming, and only open a past chat if nothing else exists.
export const initialMessageUnitId = (messageUnits, activeUnit, today = brisbaneTodayKey()) => {
  if (activeUnit && messageUnits.some(unit => unit.id === activeUnit.id)) return activeUnit.id;
  const groups = groupMessageUnits(messageUnits, today);
  return (groups.current[0] || groups.upcoming[0] || groups.past[0])?.id || null;
};
