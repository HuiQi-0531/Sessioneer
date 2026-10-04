// Status handling for swap/change requests, used by requests.routes.js
// (tutor side) and the coordinator/admin review routes.

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
// Only a NEW "accepted" status applies it. Editing a request that is already
// accepted (no new status, or "accepted" again) must not move the tutor a
// second time.
const shouldApplyChange = (newStatus, existingStatus) =>
  String(newStatus || '').toLowerCase() === 'accepted' &&
  String(existingStatus || '').toLowerCase() !== 'accepted';

// What a tutor may do to their own request. Returns { status, error } or null.
//  - accept: only an alternative the coordinator suggested
//  - reject: only a suggestion (it goes back to Pending)
//  - pending: appeal a rejected request
//  - anything else (e.g. "Approved", "Cancelled") is not a tutor action
const TUTOR_STATUS_CHANGES = {
  accepted: ['suggested'],
  rejected: ['suggested'],
  pending: ['rejected', 'suggested']
};
const checkTutorStatusChange = (existingStatus, newStatus) => {
  if (newStatus === undefined || newStatus === null || newStatus === '') return null;
  const next = String(newStatus).toLowerCase();
  const current = String(existingStatus || '').toLowerCase();
  if (next === 'accepted' && current !== 'suggested') {
    return { status: 403, error: 'Only the unit coordinator can approve this request' };
  }
  const allowedFrom = TUTOR_STATUS_CHANGES[next];
  if (!allowedFrom) {
    return { status: 400, error: `"${newStatus}" is not a status a tutor can set` };
  }
  if (!allowedFrom.includes(current)) {
    return { status: 409, error: `A ${existingStatus || 'new'} request cannot be changed to ${newStatus}` };
  }
  return null;
};

module.exports = { resolveTutorRequestStatus, shouldApplyChange, checkTutorStatusChange };
