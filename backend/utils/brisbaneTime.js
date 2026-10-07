// Brisbane (Australia/Brisbane) date and time helpers.
//
// Queensland does not use daylight saving, so Brisbane is always UTC+10.
// Working with a fixed offset keeps the reminder maths simple and makes it
// independent of the server's own time zone (Render runs in UTC, laptops
// may not).
const { normaliseDay } = require('./normalise');

const BRISBANE_OFFSET_MINUTES = 10 * 60;
const OFFSET_MS = BRISBANE_OFFSET_MINUTES * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const WEEKDAY_LABELS = { SUN: 'Sun', MON: 'Mon', TUE: 'Tue', WED: 'Wed', THU: 'Thu', FRI: 'Fri', SAT: 'Sat' };
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n) => String(n).padStart(2, '0');

const toDate = (value) => (value instanceof Date ? value : new Date(value));

// The wall-clock parts of an instant, as seen in Brisbane.
const brisbaneParts = (value) => {
  const shifted = new Date(toDate(value).getTime() + OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: WEEKDAYS[shifted.getUTCDay()],
    hours: shifted.getUTCHours(),
    minutes: shifted.getUTCMinutes()
  };
};

// 'YYYY-MM-DD' of the Brisbane calendar day the instant falls on.
const brisbaneDateKey = (value) => {
  const p = brisbaneParts(value);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
};

// A calendar date (Date from a pg DATE column, or 'YYYY-MM-DD...' string) as
// 'YYYY-MM-DD'. pg returns DATE as local midnight, so local getters are used.
const toDateKey = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
};

// "HH:MM" or "HH:MM:SS" -> minutes after midnight (null if unreadable).
const timeToMinutesOfDay = (value) => {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
};

// The UTC instant of a Brisbane wall-clock time on a Brisbane calendar day.
const brisbaneLocalToUtc = (dateKey, time) => {
  const [y, m, d] = dateKey.split('-').map(Number);
  const minutes = timeToMinutesOfDay(time) || 0;
  return new Date(Date.UTC(y, m - 1, d, 0, minutes) - OFFSET_MS);
};

// Adds whole days to a 'YYYY-MM-DD' key.
const addDaysToKey = (dateKey, days) => {
  const [y, m, d] = dateKey.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d) + days * DAY_MS);
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
};

// Next time a weekly session (day like 'MON' / 'Monday' + start time) begins
// at or after `now`, in Brisbane time. Returns { dateKey, start, end } with
// start/end as UTC Date objects, or null for an unreadable day/time.
const nextWeeklyOccurrence = (day, startTime, endTime, now = new Date()) => {
  const targetDay = normaliseDay(day);
  const startMinutes = timeToMinutesOfDay(startTime);
  if (!targetDay || startMinutes === null) return null;

  const today = brisbaneParts(now);
  const todayKey = brisbaneDateKey(now);
  let offset = (WEEKDAYS.indexOf(targetDay) - WEEKDAYS.indexOf(today.weekday) + 7) % 7;
  let dateKey = addDaysToKey(todayKey, offset);
  let start = brisbaneLocalToUtc(dateKey, startTime);
  if (start.getTime() < toDate(now).getTime()) {
    offset += 7;
    dateKey = addDaysToKey(todayKey, offset);
    start = brisbaneLocalToUtc(dateKey, startTime);
  }

  let end = endTime ? brisbaneLocalToUtc(dateKey, endTime) : null;
  if (end && end.getTime() <= start.getTime()) end = null;
  return { dateKey, start, end };
};

// "Mon 13 Oct 2026"
const formatDateKey = (dateKey) => {
  const [y, m, d] = dateKey.split('-').map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${WEEKDAY_LABELS[weekday]} ${d} ${MONTH_LABELS[m - 1]} ${y}`;
};

// "10:00" -> "10:00 am", "14:30:00" -> "2:30 pm"
const formatClockTime = (time) => {
  const minutes = timeToMinutesOfDay(time);
  if (minutes === null) return String(time || '');
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h >= 12 ? 'pm' : 'am';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${pad(m)} ${period}`;
};

// An instant shown in Brisbane: "Fri 10 Oct 2026, 5:00 pm (Brisbane time)"
const formatBrisbaneDateTime = (value) => {
  if (!value) return '';
  const p = brisbaneParts(value);
  return `${formatDateKey(brisbaneDateKey(value))}, ${formatClockTime(`${p.hours}:${pad(p.minutes)}`)} (Brisbane time)`;
};

module.exports = {
  BRISBANE_OFFSET_MINUTES,
  DAY_MS,
  HOUR_MS,
  brisbaneParts,
  brisbaneDateKey,
  brisbaneLocalToUtc,
  addDaysToKey,
  toDateKey,
  timeToMinutesOfDay,
  nextWeeklyOccurrence,
  formatDateKey,
  formatClockTime,
  formatBrisbaneDateTime
};
