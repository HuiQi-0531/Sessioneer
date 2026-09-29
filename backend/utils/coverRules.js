// Cover-request logic moved here unchanged from cover.routes.js and sessions.routes.js.
const { requiresSuperTutor } = require('./roles');

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

// Everyone on the unit except the tutor(s) who can't make these sessions.
const getCoverRecipients = (tutorRows, sessionRows) => {
  const excludedTutorIds = new Set(sessionRows.map(s => s.assigned_tutor_id).filter(Boolean));
  return tutorRows.filter(tutor => tutor.id && !excludedTutorIds.has(tutor.id));
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
const checkCoverClaim = (request, userId) => {
  if (request.original_tutor_id === userId) {
    return { status: 400, error: "You can't claim your own session." };
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
  buildCoverSummary,
  checkCoverClaim
};
