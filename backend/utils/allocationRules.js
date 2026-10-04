// Allocation checks shared by the assign route and swap/change requests.
// Both use (and the tests check) this one copy.
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

// Editing a session's day/time while tutors hold it: none of those tutors
// may end up double-booked. Returns an error message or null.
const findEditClash = async (clientOrPool, sessionId, day, startTime, endTime) => {
  const result = await clientOrPool.query(
    `
    SELECT other.day, other.start_time, other.end_time, un.unit_code,
           TRIM(CONCAT(u.name, ' ', COALESCE(u.last_name, ''))) AS tutor_name
    FROM session_tutors mine
    JOIN session_tutors theirs ON theirs.tutor_id = mine.tutor_id AND theirs.session_id <> mine.session_id
    JOIN sessions other ON other.id = theirs.session_id
    JOIN units un ON un.id = other.unit_id
    JOIN users u ON u.id = mine.tutor_id
    WHERE mine.session_id = $1
      AND mine.tutor_confirmed IS DISTINCT FROM FALSE
      AND theirs.tutor_confirmed IS DISTINCT FROM FALSE
    `,
    [sessionId]
  );
  const [clash] = findOverlappingSessions({ day, start_time: startTime, end_time: endTime }, result.rows);
  return clash
    ? `${clash.tutor_name} already has an overlapping session in ${clash.unit_code} at that time`
    : null;
};

// Covers a tutor has claimed that are still running (cover_requests). A cover
// is temporary, so it is not in session_tutors, but while it runs the tutor
// is busy at that time. Rows: tutor_id, session_id, day, start_time,
// end_time, unit_code, end_date. Optional $1 = one tutor.
const ACTIVE_COVERS_SQL = `
  SELECT cr.claimed_by_id AS tutor_id, s.id AS session_id, s.day, s.start_time, s.end_time,
         un.unit_code, cb.end_date
  FROM cover_requests cr
  JOIN cover_batches cb ON cb.id = cr.batch_id
  JOIN sessions s ON s.id = cr.session_id
  JOIN units un ON un.id = s.unit_id
  WHERE cr.status = 'claimed' AND cb.end_date >= CURRENT_DATE
    AND ($1::uuid IS NULL OR cr.claimed_by_id = $1)
`;

// Running covers that clash with this weekly session (the session itself is
// ignored: covering it and being assigned to it are different checks).
const findCoverConflicts = (session, coverRows) =>
  findOverlappingSessions(session, (coverRows || []).filter(c => c.session_id !== session.id));

// "Covering an overlapping session in CAB201 until 2026-10-16"
const describeCoverConflict = (cover) => {
  const end = cover.end_date instanceof Date
    ? `${cover.end_date.getFullYear()}-${String(cover.end_date.getMonth() + 1).padStart(2, '0')}-${String(cover.end_date.getDate()).padStart(2, '0')}`
    : String(cover.end_date || '').slice(0, 10);
  return `Covering an overlapping session in ${cover.unit_code} until ${end}`;
};

module.exports = {
  findOverlappingSessions,
  calcHoursIfAssigned,
  exceedsMaxHours,
  violatesSuperTutorRule,
  findEditClash,
  ACTIVE_COVERS_SQL,
  findCoverConflicts,
  describeCoverConflict
};
