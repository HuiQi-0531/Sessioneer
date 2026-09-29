// Tutor ranking for "Assign Staff" (was inline in GET /units/:unitId/sessions/:sessionId/candidates).
// Moved here unchanged so it can be unit tested.
const { sessionDurationHours, timeRangesOverlap, timeToSlot } = require('./normalise');

const scoreCandidate = (tutor, { session, coveredSlots, thisDuration, availRows, otherSessions, sessionNeedsSuperTutor, currentTutorIds }) => {
  const isCoordinatorCandidate = tutor.membership_role === 'coordinator';
  const tutorAvail = availRows.filter(a => a.tutor_id === tutor.id);
  const slotPreferences = coveredSlots.map(slot => {
    const match = tutorAvail.find(a => timeToSlot(a.start_time) === slot);
    return match ? match.preference : null;
  });

  const hasAnyAvailabilityData = isCoordinatorCandidate || tutorAvail.length > 0;
  const hasAvoid = slotPreferences.includes('avoid');
  const allPreferred = slotPreferences.length > 0 && slotPreferences.every(p => p === 'preferred');
  const allKnown = slotPreferences.every(p => p !== null);

  const overlappingSessions = otherSessions.filter(other =>
    other.tutor_id === tutor.id &&
    other.day === session.day &&
    timeRangesOverlap(session.start_time, session.end_time, other.start_time, other.end_time)
  );
  const conflict = overlappingSessions.length > 0;
  // A conflict where the OTHER assignment is still pending (not yet
  // confirmed by the tutor) gets a distinct "tentative" warning, since
  // it may resolve itself if the tutor declines that other session.
  const tentativeConflict = overlappingSessions.some(other => other.tutor_confirmed === null);
  const confirmedConflict = overlappingSessions.some(other => other.tutor_confirmed === true);
  const conflictUnitCodes = [...new Set(overlappingSessions.map(other => other.unit_code))];

  const existingHours = otherSessions
    .filter(other => other.tutor_id === tutor.id)
    .reduce((sum, other) => sum + sessionDurationHours(other.start_time, other.end_time), 0);
  const hoursIfAssigned = existingHours + thisDuration;
  const overMaxHours = tutor.maximum_hours != null && hoursIfAssigned > tutor.maximum_hours;

  const isSuperTutor = tutor.membership_role === 'super_tutor';
  const notEligibleForType = !isCoordinatorCandidate && sessionNeedsSuperTutor && !isSuperTutor;

  const hardBlocked = conflict || overMaxHours || notEligibleForType;
  const warnings = [];
  if (notEligibleForType) warnings.push(`Only Super Tutors can be assigned to ${session.session_type} sessions`);
  if (confirmedConflict) {
    warnings.push(`Already confirmed on an overlapping session in ${conflictUnitCodes.join(', ')}`);
  } else if (tentativeConflict) {
    warnings.push(`Tentatively assigned to an overlapping session in ${conflictUnitCodes.join(', ')} — awaiting their confirmation`);
  }
  if (overMaxHours) warnings.push(`Would exceed max hours (${hoursIfAssigned}/${tutor.maximum_hours} hrs)`);
  if (hasAvoid) warnings.push('Marked "avoid" for this time');
  if (isCoordinatorCandidate) warnings.push('Unit coordinator assignment; availability not required');
  if (!isCoordinatorCandidate && !hasAnyAvailabilityData) warnings.push('No availability submitted');
  if ((tutor.priority_tag || 'Standard') === 'Risk') warnings.push('Flagged as risk');

  let availabilityScore = 0;
  slotPreferences.forEach(p => {
    if (p === 'preferred') availabilityScore += 2;
    else if (p === 'available') availabilityScore += 1;
    else if (p === 'avoid') availabilityScore -= 2;
  });

  const priorityTag = isCoordinatorCandidate ? 'Coordinator' : (tutor.priority_tag || 'Standard');
  const priorityBonus = {
    Preferred: 2, Standard: 0, Backup: -1, Risk: -1, Coordinator: 0
  }[priorityTag] || 0;

  const score = availabilityScore + priorityBonus;

  return {
    id: tutor.id,
    name: tutor.name,
    email: tutor.email,
    maximumHours: tutor.maximum_hours,
    isSuperTutor,
    roleLabel: isCoordinatorCandidate ? 'Unit Coordinator' : (isSuperTutor ? 'Super Tutor' : 'Tutor'),
    priorityTag,
    starred: tutor.starred || false,
    flagged: tutor.flagged || false,
    hoursIfAssigned,
    allPreferred,
    allKnown,
    hardBlocked,
    tentativeConflict,
    warnings,
    isAssignedToThisSession: currentTutorIds.has(tutor.id),
    score
  };
};

// Already-assigned first, hard-blocked last, then highest score.
const sortCandidates = (candidates) => candidates.sort((a, b) => {
  if (a.isAssignedToThisSession !== b.isAssignedToThisSession) return a.isAssignedToThisSession ? -1 : 1;
  if (a.hardBlocked !== b.hardBlocked) return a.hardBlocked ? 1 : -1;
  return b.score - a.score;
});

module.exports = { scoreCandidate, sortCandidates };
