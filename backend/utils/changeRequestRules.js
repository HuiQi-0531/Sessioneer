// Status handling when a tutor updates their own swap/change request
// (was inline in PATCH /requests/:id). Moved here unchanged.

// A tutor rejecting a coordinator's suggestion sends the request back to Pending.
const resolveTutorRequestStatus = (existingStatus, newStatus) => {
  if (
    String(existingStatus || '').toLowerCase() === 'suggested' &&
    String(newStatus || '').toLowerCase() === 'rejected'
  ) {
    return 'Pending';
  }
  return newStatus;
};

// Whether the swap/change should be applied to the timetable now.
const shouldApplyChange = (newStatus, existingStatus) =>
  String(newStatus || existingStatus || '').toLowerCase() === 'accepted';

module.exports = { resolveTutorRequestStatus, shouldApplyChange };
