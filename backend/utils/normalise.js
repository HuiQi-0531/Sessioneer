// Normalises day values like "Monday", "Mon", "MON" into "MON"
const DAY_MAP = {
  monday: 'MON', mon: 'MON',
  tuesday: 'TUE', tue: 'TUE', tues: 'TUE',
  wednesday: 'WED', wed: 'WED',
  thursday: 'THU', thu: 'THU', thurs: 'THU',
  friday: 'FRI', fri: 'FRI',
  saturday: 'SAT', sat: 'SAT',
  sunday: 'SUN', sun: 'SUN',
};

const normaliseDay = (rawDay) => {
  if (!rawDay) return null;
  const key = rawDay.toString().trim().toLowerCase();
  return DAY_MAP[key] || null;
};

// Normalises time values like "8:00", "15:00", "3pm", "3:00pm", "1500" into "HH:MM:SS"
const normaliseTime = (rawTime) => {
  if (!rawTime) return null;
  const value = rawTime.toString().trim().toLowerCase();

  // "3pm" or "3 pm"
  let match = value.match(/^(\d{1,2})\s*(am|pm)$/);
  if (match) {
    let hour = parseInt(match[1], 10);
    const period = match[2];
    if (period === 'pm' && hour !== 12) hour += 12;
    if (period === 'am' && hour === 12) hour = 0;
    return `${String(hour).padStart(2, '0')}:00:00`;
  }

  // "3:00pm" or "3:30 pm"
  match = value.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/);
  if (match) {
    let hour = parseInt(match[1], 10);
    const minute = match[2];
    const period = match[3];
    if (period === 'pm' && hour !== 12) hour += 12;
    if (period === 'am' && hour === 12) hour = 0;
    return `${String(hour).padStart(2, '0')}:${minute}:00`;
  }

  // "8:00" or "15:00" (24-hour, with or without leading zero)
  match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    const hour = parseInt(match[1], 10);
    const minute = match[2];
    if (hour >= 0 && hour <= 23) {
      return `${String(hour).padStart(2, '0')}:${minute}:00`;
    }
  }

  // "1500" or "800" (24-hour, no colon)
  match = value.match(/^(\d{1,2})(\d{2})$/);
  if (match) {
    const hour = parseInt(match[1], 10);
    const minute = match[2];
    if (hour >= 0 && hour <= 23) {
      return `${String(hour).padStart(2, '0')}:${minute}:00`;
    }
  }

  return null;
};

// Works out if a unit's semester has already passed.
// Semester 1 is treated as Jan-Jun, Semester 2 as Jul-Dec.
const isUnitActive = (semester, year) => {
  if (!semester || !year) return true; // not enough info, assume active
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0 = Jan

  if (year > currentYear) return true;
  if (year < currentYear) return false;

  const isSem1 = semester.toLowerCase().includes('1');
  if (isSem1) return currentMonth <= 5; // Jan-Jun
  return currentMonth >= 6; // Jul-Dec
};

module.exports = { normaliseDay, normaliseTime, isUnitActive };