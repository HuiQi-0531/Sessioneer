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

// Converts a "HH:MM:SS" string to total minutes since midnight.
const timeToMinutes = (timeStr) => {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
};

// Converts a "HH:MM:SS" time into the availability grid's slot label,
// e.g. "08:00:00" -> "8am", "13:00:00" -> "1pm".
const timeToSlot = (timeStr) => {
  const hour = parseInt(timeStr.split(':')[0], 10);
  if (hour === 0) return '12am';
  if (hour < 12) return `${hour}am`;
  if (hour === 12) return '12pm';
  return `${hour - 12}pm`;
};

// Returns the list of hourly slot labels a session's time range covers.
// e.g. start "10:00:00", end "12:00:00" -> ["10am", "11am"]
const getHourlySlotsInRange = (startTime, endTime) => {
  const startMin = timeToMinutes(startTime);
  const endMin = timeToMinutes(endTime);
  const slots = [];
  for (let m = startMin; m < endMin; m += 60) {
    const hourStr = `${String(Math.floor(m / 60)).padStart(2, '0')}:00:00`;
    slots.push(timeToSlot(hourStr));
  }
  return slots;
};

// Duration of a session in hours, e.g. "10:00:00" to "12:00:00" -> 2
const sessionDurationHours = (startTime, endTime) => {
  return (timeToMinutes(endTime) - timeToMinutes(startTime)) / 60;
};

// Do two time ranges on the same day overlap?
const timeRangesOverlap = (startA, endA, startB, endB) => {
  return timeToMinutes(startA) < timeToMinutes(endB) && timeToMinutes(startB) < timeToMinutes(endA);
};

module.exports = {
  normaliseDay,
  normaliseTime,
  isUnitActive,
  timeToMinutes,
  timeToSlot,
  getHourlySlotsInRange,
  sessionDurationHours,
  timeRangesOverlap
};