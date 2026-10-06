// Session labels and review messages for swap/change requests,
// used by admin.routes.js and requests.routes.js.

const labelFromSessionValue = (value) => {
  if (!value) return 'Not specified';
  const parts = String(value).split('::');
  if (parts.length !== 2) return value;
  return parts[1].replace(/\|/g, ' | ');
};

// Comparable form of a label. "MON 10:00 - 12:00 | GP-P512" and
// "MON 10:00-12:00|GP-P512" are the same session, so spacing around "-"
// and "|" is removed before comparing.
const normaliseSessionLabel = (value) => {
  return String(labelFromSessionValue(value))
    .replace(/\s*[-–]\s*/g, '-')
    .replace(/\s*\|\s*/g, '|')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
};

const getSessionComparableLabel = (session) => {
  const start = session.start_time ? String(session.start_time).slice(0, 5) : 'TBC';
  const end = session.end_time ? String(session.end_time).slice(0, 5) : 'TBC';
  const room = session.location || 'TBA';
  return normaliseSessionLabel(`${session.day || 'TBC'} ${start}-${end}|${room}`);
};

// Sessions an admin can suggest instead (was inline in GET /admin/requests/:id/suggestion-sessions).
const buildSuggestionSessions = (sessionRows, currentSessionValue, otherPendingSessionValues) => {
  const currentRequestLabel = normaliseSessionLabel(currentSessionValue);
  const currentSession = sessionRows.find(session => getSessionComparableLabel(session) === currentRequestLabel);
  const currentType = String(currentSession?.session_type || '').trim().toLowerCase();
  const swapOpenSessionLabels = new Set(
    otherPendingSessionValues
      .map(value => normaliseSessionLabel(value))
      .filter(Boolean)
  );

  return sessionRows
    .filter(session => !currentType || String(session.session_type || '').trim().toLowerCase() === currentType)
    .map((session) => {
      const comparableLabel = getSessionComparableLabel(session);
      const assignedCount = Array.isArray(session.tutors) ? session.tutors.length : 0;
      const requiredTutors = Number(session.required_tutors || 1);
      const isSwapOpen = swapOpenSessionLabels.has(comparableLabel);

      return {
        id: session.id,
        day: session.day,
        startTime: session.start_time,
        endTime: session.end_time,
        location: session.location,
        campus: session.campus,
        sessionType: session.session_type,
        capacity: session.capacity,
        requiredTutors: session.required_tutors,
        status: session.status,
        tutors: session.tutors || [],
        comparableLabel,
        availabilityLabel: isSwapOpen
          ? 'Swap/change requested'
          : assignedCount === 0
            ? 'Unassigned'
            : 'Space available'
      };
    })
    .filter(session => session.comparableLabel && session.comparableLabel !== currentRequestLabel)
    .filter(session => {
      const assignedCount = Array.isArray(session.tutors) ? session.tutors.length : 0;
      const requiredTutors = Number(session.requiredTutors || 1);
      return assignedCount < requiredTutors || swapOpenSessionLabels.has(session.comparableLabel);
    });
};

// Email subject for a reviewed request (same rule in admin and coordinator emails).
const buildReviewEmailSubject = (status, unitCode) => {
  const statusLower = String(status || '').toLowerCase();
  const displayStatus = statusLower === 'accepted' ? 'approved' : statusLower || 'updated';
  const subject = statusLower === 'suggested'
    ? `Alternative session suggested for ${unitCode}`
    : `Your ${unitCode} request was ${displayStatus}`;
  return { statusLower, displayStatus, subject };
};

// In-app notification when an ADMIN reviews a request.
const buildAdminReviewNotification = (statusLower, unitCode, reviewNotes) => {
  let title = 'Request updated';
  let content = `Your request in ${unitCode} was updated.`;
  if (statusLower === 'accepted') {
    title = 'Request approved';
    content = `Your request in ${unitCode} was approved by an administrator.`;
  } else if (statusLower === 'rejected') {
    title = 'Request rejected';
    content = `Your request in ${unitCode} was rejected by an administrator.${reviewNotes ? ` Note: ${reviewNotes}` : ''}`;
  } else if (statusLower === 'suggested') {
    title = 'Alternative session suggested';
    content = `An administrator suggested an alternative session for your request in ${unitCode}.`;
  }
  return { title, content };
};

// In-app notification when a COORDINATOR reviews a request.
const buildCoordinatorReviewNotification = (statusLower, status, unitCode, reviewNotes) => {
  let title, content;
  if (statusLower === 'accepted') {
    title = 'Request approved';
    content = `Your request in ${unitCode} was approved. Your timetable has been updated.`;
  } else if (statusLower === 'rejected') {
    title = 'Request rejected';
    content = `Your request in ${unitCode} was rejected.${reviewNotes ? ` Note: ${reviewNotes}` : ''}`;
  } else if (statusLower === 'suggested') {
    title = 'Alternative session suggested';
    content = `Your coordinator suggested an alternative session for your request in ${unitCode}.`;
  } else {
    title = 'Request updated';
    content = `Your request in ${unitCode} was updated to "${status}".`;
  }
  return { title, content };
};

const REVIEW_STATUSES = new Set(['accepted', 'rejected', 'suggested']);
const isValidReviewStatus = (statusLower) => REVIEW_STATUSES.has(statusLower);

module.exports = {
  labelFromSessionValue,
  normaliseSessionLabel,
  getSessionComparableLabel,
  buildSuggestionSessions,
  buildReviewEmailSubject,
  buildAdminReviewNotification,
  buildCoordinatorReviewNotification,
  isValidReviewStatus
};
