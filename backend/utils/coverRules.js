// Cover-request rules used by cover.routes.js and sessions.routes.js.
const { requiresSuperTutor } = require('./roles');
const { timeRangesOverlap } = require('./normalise');

const WEEKDAY_INDEX = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };

// Counts how many times `day` (e.g. 'THU') falls between startDate and endDate inclusive.
const countWeekdayOccurrences = (day, startDate, endDate) => {
  const targetIdx = WEEKDAY_INDEX[String(day).toUpperCase()];
  if (targetIdx === undefined || !startDate || !endDate) return 0;
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return 0;

  const cursor = new Date(start);
  cursor.setDate(cursor.getDate() + ((targetIdx - cursor.getDay() + 7) % 7));

  let count = 0;
  while (cursor <= end) {
    count++;
    cursor.setDate(cursor.getDate() + 7);
  }
  return count;
};

const formatDateRange = (startDate, endDate) => {
  const opts = { day: 'numeric', month: 'short' };
  const start = new Date(startDate).toLocaleDateString('en-AU', opts);
  const end = new Date(endDate).toLocaleDateString('en-AU', opts);
  return `${start} - ${end}`;
};

const formatTimeRange = (start, end) => `${String(start).slice(0, 5)} - ${String(end).slice(0, 5)}`;

const formatCoverSession = (session) => {
  const time = formatTimeRange(session.start_time || session.startTime, session.end_time || session.endTime);
  const location = session.location ? ` at ${session.location}` : '';
  return `${session.day} ${time}${location}`;
};

// Date range check for a new cover broadcast. Returns the error message or null.
const validateCoverDates = (startDate, endDate) => {
  if (!startDate || !endDate) {
    return 'Select the date range this cover request applies to.';
  }
  if (new Date(startDate) > new Date(endDate)) {
    return 'Start date must be before the end date.';
  }
  return null;
};

// Everyone on the unit except the tutor(s) who are away for these sessions.
// awayTutorIds is a list/Set of user ids (read from session_tutors).
const getCoverRecipients = (tutorRows, awayTutorIds) => {
  const excluded = new Set(awayTutorIds || []);
  return tutorRows.filter(tutor => tutor.id && !excluded.has(tutor.id));
};

// Works out who the cover is for, from each session's active tutors
// (session_tutors). sessionRows carry active_tutor_ids.
//  - originalTutorId given: that tutor must hold every selected session.
//  - not given: each session must have at most one active tutor, otherwise
//    the UC has to say which tutor is away.
// Returns { error } or { bySession: {sessionId: tutorId|null}, awayTutorIds: [] }.
const resolveOriginalTutors = (sessionRows, originalTutorId) => {
  const bySession = {};
  if (originalTutorId) {
    const missing = sessionRows.find(s => !(s.active_tutor_ids || []).includes(originalTutorId));
    if (missing) {
      return { error: 'That tutor is not assigned to every selected session.' };
    }
    sessionRows.forEach(s => { bySession[s.id] = originalTutorId; });
    return { bySession, awayTutorIds: [originalTutorId] };
  }
  const ambiguous = sessionRows.find(s => (s.active_tutor_ids || []).length > 1);
  if (ambiguous) {
    return { error: 'This session has more than one tutor. Choose which tutor needs cover.' };
  }
  sessionRows.forEach(s => { bySession[s.id] = (s.active_tutor_ids || [])[0] || null; });
  const awayTutorIds = [...new Set(Object.values(bySession).filter(Boolean))];
  return { bySession, awayTutorIds };
};

// Two date ranges overlap. A missing range means "every week" (a permanent
// assignment), which overlaps any cover period.
// Calendar day as 'YYYY-MM-DD'. pg returns DATE columns as a local-midnight
// Date, so a Date is read in local time (toISOString could shift the day).
const toDateKey = (value) => {
  if (value instanceof Date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  return String(value).slice(0, 10);
};

const dateRangesOverlap = (startA, endA, startB, endB) => {
  if (!startA || !endA || !startB || !endB) return true;
  return toDateKey(startA) <= toDateKey(endB) && toDateKey(startB) <= toDateKey(endA);
};

// Would claiming this cover double-book the tutor? `request` is the cover
// (day, start_time, end_time, start_date, end_date, session_id) and
// `commitments` are their assigned sessions (no dates) and claimed covers
// (with dates). Returns { status, error } or null.
const findCoverClash = (request, commitments) => {
  const clash = (commitments || []).find(other =>
    other.session_id !== request.session_id &&
    other.day === request.day &&
    timeRangesOverlap(request.start_time, request.end_time, other.start_time, other.end_time) &&
    dateRangesOverlap(request.start_date, request.end_date, other.start_date, other.end_date)
  );
  if (!clash) return null;
  return {
    status: 409,
    error: `You already have an overlapping session in ${clash.unit_code} at that time.`
  };
};

// Text used in the "Cover needed" notification.
const buildCoverSummary = (sessionRows, startDate, endDate) => sessionRows.length === 1
  ? (() => {
      const s = sessionRows[0];
      const occurrences = countWeekdayOccurrences(s.day, startDate, endDate);
      return `${formatDateRange(startDate, endDate)} · ${s.day} ${formatTimeRange(s.start_time, s.end_time)} (${occurrences} session${occurrences === 1 ? '' : 's'})`;
    })()
  : `${formatDateRange(startDate, endDate)} · ${sessionRows.length} sessions`;

// Whether this tutor may claim this cover request. Returns { status, error } or null.
// `today` is injectable so the rule can be unit tested.
const checkCoverClaim = (request, userId, today = new Date()) => {
  if (request.original_tutor_id === userId) {
    return { status: 400, error: "You can't claim your own session." };
  }
  if (request.already_teaches_session) {
    return { status: 400, error: 'You already teach this session, so you cannot cover it.' };
  }
  if (request.status && request.status !== 'open') {
    return { status: 409, error: 'This cover request is no longer open.' };
  }
  if (request.end_date && toDateKey(request.end_date) < toDateKey(today instanceof Date ? today : new Date(today))) {
    return { status: 409, error: 'This cover period has already ended.' };
  }
  if (requiresSuperTutor(request.session_type) && !request.is_super_tutor) {
    return { status: 403, error: `Only Super Tutors can claim ${request.session_type} sessions.` };
  }
  return null;
};

module.exports = {
  countWeekdayOccurrences,
  formatDateRange,
  formatTimeRange,
  formatCoverSession,
  validateCoverDates,
  getCoverRecipients,
  resolveOriginalTutors,
  toDateKey,
  dateRangesOverlap,
  findCoverClash,
  buildCoverSummary,
  checkCoverClaim
};
