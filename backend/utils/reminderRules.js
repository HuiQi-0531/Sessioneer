// Rules for the reminder jobs (jobs.routes.js), the UC's availability bell
// (availability.routes.js) and schedule-change notices (sessions + admin).
// Everything here is pure so it can be unit tested without a database.
const {
  DAY_MS,
  HOUR_MS,
  toDateKey,
  nextWeeklyOccurrence,
  timeToMinutesOfDay,
  formatClockTime
} = require('./brisbaneTime');
const { normaliseDay } = require('./normalise');

// ---------------------------------------------------------------------------
// Availability deadline reminder
// ---------------------------------------------------------------------------

const AVAILABILITY_REMINDER_DAYS = 3;

// A unit is in the reminder window when it has a deadline, the UC has not
// locked availability, the deadline is still ahead, and it is no more than
// three days away.
const isUnitInAvailabilityReminderWindow = (unit, now = new Date()) => {
  if (!unit || !unit.availability_deadline) return false;
  if (unit.availability_locked) return false;
  const deadline = new Date(unit.availability_deadline);
  if (Number.isNaN(deadline.getTime())) return false;
  const msLeft = deadline.getTime() - new Date(now).getTime();
  return msLeft > 0 && msLeft <= AVAILABILITY_REMINDER_DAYS * DAY_MS;
};

// Whether the UC's bell may send a reminder to this tutor. Returns
// { status, error } or null.
const checkManualAvailabilityReminder = ({ isTutorOnUnit, hasSubmitted, alreadySentToday }) => {
  if (!isTutorOnUnit) return { status: 404, error: 'This tutor is not part of this unit.' };
  if (hasSubmitted) return { status: 409, error: 'This tutor has already submitted their availability.' };
  if (alreadySentToday) return { status: 409, error: 'Reminder already sent today' };
  return null;
};

// ---------------------------------------------------------------------------
// Teaching period
// ---------------------------------------------------------------------------

const TEACHING_PERIOD_ERROR = 'Teaching end date must be on or after the teaching start date.';

// Validates a teaching period. Both empty is fine (no session reminders).
// Returns the error message or null.
const validateTeachingPeriod = (startDate, endDate) => {
  const hasStart = startDate !== null && startDate !== undefined && startDate !== '';
  const hasEnd = endDate !== null && endDate !== undefined && endDate !== '';
  if (!hasStart && !hasEnd) return null;
  if (!hasStart || !hasEnd) {
    return 'Enter both a teaching start date and a teaching end date, or leave both empty.';
  }
  const start = toDateKey(startDate);
  const end = toDateKey(endDate);
  if (!start || !end || Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end))) {
    return 'Teaching dates must be valid dates (YYYY-MM-DD).';
  }
  if (end < start) return TEACHING_PERIOD_ERROR;
  return null;
};

// For an update: the teaching dates to store. A field missing from the body
// keeps the stored value; an empty value ('' or null) clears it.
// Returns { start, end } as 'YYYY-MM-DD' or null.
const resolveTeachingPeriodUpdate = (body, existing = {}) => {
  const pick = (key, current) => {
    if (!body || !Object.prototype.hasOwnProperty.call(body, key)) return toDateKey(current);
    const value = body[key];
    if (value === null || value === undefined || value === '') return null;
    return toDateKey(value) || String(value);
  };
  return {
    start: pick('teachingStartDate', existing.teaching_start_date),
    end: pick('teachingEndDate', existing.teaching_end_date)
  };
};

const isDateInTeachingPeriod = (dateKey, startDate, endDate) => {
  const start = toDateKey(startDate);
  const end = toDateKey(endDate);
  if (!dateKey || !start || !end) return false;
  return start <= dateKey && dateKey <= end;
};

// ---------------------------------------------------------------------------
// 24-hour session reminder
// ---------------------------------------------------------------------------

const SESSION_REMINDER_WINDOW = { fromHours: 23, toHours: 24 };

// The next occurrence of a weekly session, if it starts between 23 and 24
// hours after `now` (Brisbane time). Returns { dateKey, start, end } or null.
const occurrenceInReminderWindow = (session, now = new Date(), window = SESSION_REMINDER_WINDOW) => {
  const occurrence = nextWeeklyOccurrence(session.day, session.start_time, session.end_time, now);
  if (!occurrence) return null;
  const msUntil = occurrence.start.getTime() - new Date(now).getTime();
  if (msUntil >= window.fromHours * HOUR_MS && msUntil < window.toHours * HOUR_MS) {
    return occurrence;
  }
  return null;
};

// Sessions (each row carries its unit's teaching period and schedule lock)
// whose next class should be reminded about in this run.
// Returns [{ session, occurrence }].
const selectSessionsForReminder = (sessions, now = new Date(), window = SESSION_REMINDER_WINDOW) => {
  const selected = [];
  for (const session of sessions || []) {
    if (!session.schedule_locked) continue;
    if (!session.teaching_start_date || !session.teaching_end_date) continue;
    const occurrence = occurrenceInReminderWindow(session, now, window);
    if (!occurrence) continue;
    if (!isDateInTeachingPeriod(occurrence.dateKey, session.teaching_start_date, session.teaching_end_date)) continue;
    selected.push({ session, occurrence });
  }
  return selected;
};

// A claimed cover request applies to this class date.
const coverAppliesOn = (cover, dateKey) => {
  if (!cover || cover.status !== 'claimed' || !cover.claimed_by_id) return false;
  const start = toDateKey(cover.start_date);
  const end = toDateKey(cover.end_date);
  if (!start || !end) return false;
  return start <= dateKey && dateKey <= end;
};

// Who should get the reminder for one class:
//   - tutors whose response is Confirmed (tutor_confirmed === true),
//   - except a tutor whose class that day was taken over through a claimed
//     cover request: the person who claimed it is reminded instead.
// Returns [{ tutorId, via: 'assignment' | 'cover' }] without duplicates.
const resolveSessionReminderRecipients = (assignments, covers, dateKey) => {
  const activeCovers = (covers || []).filter(cover => coverAppliesOn(cover, dateKey));
  const coveredTutors = new Set(activeCovers.map(cover => cover.original_tutor_id).filter(Boolean));

  const recipients = new Map();
  for (const assignment of assignments || []) {
    if (assignment.tutor_confirmed !== true) continue;
    if (coveredTutors.has(assignment.tutor_id)) continue;
    recipients.set(assignment.tutor_id, { tutorId: assignment.tutor_id, via: 'assignment' });
  }
  for (const cover of activeCovers) {
    if (!recipients.has(cover.claimed_by_id)) {
      recipients.set(cover.claimed_by_id, { tutorId: cover.claimed_by_id, via: 'cover' });
    }
  }
  return [...recipients.values()];
};

// ---------------------------------------------------------------------------
// Schedule-change notices
// ---------------------------------------------------------------------------

const DAY_LABELS = { MON: 'Mon', TUE: 'Tue', WED: 'Wed', THU: 'Thu', FRI: 'Fri', SAT: 'Sat', SUN: 'Sun' };

const shortTime = (value) => {
  const minutes = timeToMinutesOfDay(value);
  if (minutes === null) return String(value || '');
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
};

const dayLabel = (day) => DAY_LABELS[normaliseDay(day)] || String(day || '');

// "Mon 10:00–12:00"
const formatSessionSlot = (session) =>
  `${dayLabel(session.day)} ${shortTime(session.start_time)}–${shortTime(session.end_time)}`;

// "TUT02", or the session type when there is no code.
const sessionDisplayName = (session) => session.session_code || session.session_type || 'Session';

const sameText = (a, b) => String(a ?? '').trim() === String(b ?? '').trim();

// What a tutor can see changed between two versions of a session.
// Only day, time and location count; capacity, staff note etc. do not.
// Returns a list of sentences (empty when nothing tutor-visible changed).
const describeSessionChange = (before, after) => {
  const changes = [];
  const name = sessionDisplayName(after.session_code ? after : before);

  const timeChanged = normaliseDay(before.day) !== normaliseDay(after.day)
    || shortTime(before.start_time) !== shortTime(after.start_time)
    || shortTime(before.end_time) !== shortTime(after.end_time);
  if (timeChanged) {
    changes.push(`${name} moved from ${formatSessionSlot(before)} to ${formatSessionSlot(after)}`);
  }

  if (!sameText(before.location, after.location)) {
    const from = String(before.location || '').trim() || 'no location';
    const to = String(after.location || '').trim() || 'no location';
    changes.push(`Location changed from ${from} to ${to}`);
  }

  return changes;
};

// True when the session's next class starts within `hours` of now.
const startsWithinHours = (session, hours, now = new Date()) => {
  const occurrence = nextWeeklyOccurrence(session.day, session.start_time, session.end_time, now);
  if (!occurrence) return false;
  return occurrence.start.getTime() - new Date(now).getTime() <= hours * HOUR_MS;
};

// Email is sent on top of the in-app notice when the class (old or new time)
// is within 48 hours.
const CHANGE_EMAIL_WINDOW_HOURS = 48;
const shouldEmailScheduleChange = (sessions, now = new Date()) =>
  (sessions || []).filter(Boolean).some(session => startsWithinHours(session, CHANGE_EMAIL_WINDOW_HOURS, now));

// "Reminder: CAB201 Tutorial tomorrow at 10:00 am"
const buildSessionReminderSubject = ({ unitCode, sessionType, startTime }) =>
  `Reminder: ${unitCode} ${sessionType || 'session'} tomorrow at ${formatClockTime(startTime)}`;

const buildAvailabilityReminderSubject = (unitCode) => `Reminder: submit your availability for ${unitCode}`;

module.exports = {
  AVAILABILITY_REMINDER_DAYS,
  isUnitInAvailabilityReminderWindow,
  checkManualAvailabilityReminder,
  TEACHING_PERIOD_ERROR,
  validateTeachingPeriod,
  resolveTeachingPeriodUpdate,
  isDateInTeachingPeriod,
  SESSION_REMINDER_WINDOW,
  occurrenceInReminderWindow,
  selectSessionsForReminder,
  coverAppliesOn,
  resolveSessionReminderRecipients,
  formatSessionSlot,
  sessionDisplayName,
  describeSessionChange,
  startsWithinHours,
  CHANGE_EMAIL_WINDOW_HOURS,
  shouldEmailScheduleChange,
  buildSessionReminderSubject,
  buildAvailabilityReminderSubject
};
