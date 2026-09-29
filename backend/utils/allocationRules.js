// Allocation checks shared by the assign route and swap/change requests.
// Moved here unchanged so both use (and the tests check) one copy.
const { timeRangesOverlap, sessionDurationHours } = require('./normalise');
const { requiresSuperTutor } = require('./roles');

// The tutor's other sessions that clash with this one (same day, times overlap).
const findOverlappingSessions = (session, otherSessions) => otherSessions.filter(other =>
  other.day === session.day &&
  timeRangesOverlap(session.start_time, session.end_time, other.start_time, other.end_time)
);

// Hours the tutor would teach if also given this session.
const calcHoursIfAssigned = (session, otherSessions) => {
  const existingHours = otherSessions.reduce(
    (sum, other) => sum + sessionDurationHours(other.start_time, other.end_time),
    0
  );
  return existingHours + sessionDurationHours(session.start_time, session.end_time);
};

const exceedsMaxHours = (maximumHours, hoursIfAssigned) =>
  maximumHours != null && hoursIfAssigned > maximumHours;

// Lectures/Consultations need a Super Tutor, except when a coordinator assigns themselves.
const violatesSuperTutorRule = (sessionType, isSuperTutor, isCoordinatorSelfAssignment) =>
  !isCoordinatorSelfAssignment && requiresSuperTutor(sessionType) && !isSuperTutor;

module.exports = { findOverlappingSessions, calcHoursIfAssigned, exceedsMaxHours, violatesSuperTutorRule };
