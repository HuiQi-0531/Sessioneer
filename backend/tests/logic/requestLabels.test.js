const {
  labelFromSessionValue,
  normaliseSessionLabel,
  getSessionComparableLabel,
  buildSuggestionSessions,
  buildReviewEmailSubject,
  buildAdminReviewNotification,
  buildCoordinatorReviewNotification,
  isValidReviewStatus
} = require('../../utils/requestLabels');

describe('labelFromSessionValue', () => {
  test('LG-238: missing value shows "Not specified"', () => {
    expect(labelFromSessionValue(null)).toBe('Not specified');
  });
  test('LG-239: "id::label" shows the label with spaced " | "', () => {
    expect(labelFromSessionValue('abc::MON 10:00-12:00|GP-P512')).toBe('MON 10:00-12:00 | GP-P512');
  });
  test('LG-240: value without "::" is shown as it is', () => {
    expect(labelFromSessionValue('MON 10:00-12:00')).toBe('MON 10:00-12:00');
  });
  test('LG-241: value with more than one "::" is shown as it is', () => {
    expect(labelFromSessionValue('a::b::MON')).toBe('a::b::MON');
  });
});

describe('normaliseSessionLabel', () => {
  test('LG-242: spaces around "|" are removed', () => {
    expect(normaliseSessionLabel('x::MON 10:00-12:00 | GP')).toBe('MON 10:00-12:00|GP');
  });
  test('LG-243: repeated spaces become one', () => {
    expect(normaliseSessionLabel('MON   10:00-12:00')).toBe('MON 10:00-12:00');
  });
  test('LG-244: text becomes uppercase', () => {
    expect(normaliseSessionLabel('x::mon 10:00-12:00|gp-p512')).toBe('MON 10:00-12:00|GP-P512');
  });
});

describe('getSessionComparableLabel', () => {
  test('LG-245: builds DAY START-END|ROOM', () => {
    expect(getSessionComparableLabel({ day: 'MON', start_time: '10:00:00', end_time: '12:00:00', location: 'GP-P512' }))
      .toBe('MON 10:00-12:00|GP-P512');
  });
  test('LG-246: seconds are cut from database times', () => {
    expect(getSessionComparableLabel({ day: 'TUE', start_time: '09:30:00', end_time: '10:30:00', location: 'Z-411' }))
      .toBe('TUE 09:30-10:30|Z-411');
  });
  test('LG-247: missing values become TBC / TBA', () => {
    expect(getSessionComparableLabel({})).toBe('TBC TBC-TBC|TBA');
  });
  test('LG-248: a stored label written "10:00 - 12:00" still matches its session (LOGIC-B10)', () => {
    const session = { day: 'MON', start_time: '10:00:00', end_time: '12:00:00', location: 'GP-P512' };
    expect(normaliseSessionLabel('abc::MON 10:00 - 12:00|GP-P512')).toBe(getSessionComparableLabel(session));
  });
});

describe('buildSuggestionSessions (sessions an admin can suggest instead)', () => {
  test('M-2: suggestions match the current session type', () => {
    const rows = [
      { id: 'A', day: 'MON', start_time: '10:00', end_time: '12:00', location: 'GP', session_type: 'Tutorial' },
      { id: 'B', day: 'TUE', start_time: '10:00', end_time: '12:00', location: 'GP', session_type: 'Tutorial' },
      { id: 'C', day: 'WED', start_time: '10:00', end_time: '12:00', location: 'GP', session_type: 'Lecture' }
    ];
    expect(buildSuggestionSessions(rows, 'MON 10:00-12:00|GP', []).map(s => s.id)).toEqual(['B']);
  });
  const s = (id, day, tutors = [], required = 1) => ({
    id, day, start_time: '10:00:00', end_time: '12:00:00', location: 'GP', required_tutors: required, tutors
  });

  test('LG-249: the tutor\'s current session is not suggested', () => {
    const result = buildSuggestionSessions([s('A', 'MON'), s('B', 'TUE')], 'x::MON 10:00-12:00|GP', []);
    expect(result.map(r => r.id)).toEqual(['B']);
  });
  test('LG-250: a full session is not suggested', () => {
    const result = buildSuggestionSessions([s('B', 'TUE', [{ tutorId: 't2' }])], 'x::MON 10:00-12:00|GP', []);
    expect(result).toEqual([]);
  });
  test('LG-251: a full session is suggested if its tutor also asked to swap out', () => {
    const result = buildSuggestionSessions([s('B', 'TUE', [{ tutorId: 't2' }])], 'x::MON 10:00-12:00|GP', ['y::TUE 10:00-12:00|GP']);
    expect(result.map(r => r.availabilityLabel)).toEqual(['Swap/change requested']);
  });
  test('LG-252: an empty session is labelled "Unassigned"', () => {
    expect(buildSuggestionSessions([s('B', 'TUE')], null, [])[0].availabilityLabel).toBe('Unassigned');
  });
  test('LG-253: a part-filled session is labelled "Space available"', () => {
    expect(buildSuggestionSessions([s('B', 'TUE', [{ tutorId: 't2' }], 2)], null, [])[0].availabilityLabel).toBe('Space available');
  });
});

describe('buildReviewEmailSubject', () => {
  test('LG-254: accepted is shown as "approved"', () => {
    expect(buildReviewEmailSubject('Accepted', 'CAB201').subject).toBe('Your CAB201 request was approved');
  });
  test('LG-255: suggested has its own subject', () => {
    expect(buildReviewEmailSubject('suggested', 'CAB201').subject).toBe('Alternative session suggested for CAB201');
  });
  test('LG-256: no status is shown as "updated"', () => {
    expect(buildReviewEmailSubject(undefined, 'CAB201').subject).toBe('Your CAB201 request was updated');
  });
});

describe('review notifications', () => {
  test('LG-257: admin approval says it was approved by an administrator', () => {
    expect(buildAdminReviewNotification('accepted', 'CAB201')).toEqual({
      title: 'Request approved', content: 'Your request in CAB201 was approved by an administrator.'
    });
  });
  test('LG-258: admin rejection includes the note when there is one', () => {
    expect(buildAdminReviewNotification('rejected', 'CAB201', 'Room full').content)
      .toBe('Your request in CAB201 was rejected by an administrator. Note: Room full');
  });
  test('LG-259: coordinator rejection without a note has no "Note:"', () => {
    expect(buildCoordinatorReviewNotification('rejected', 'Rejected', 'CAB201', '').content)
      .toBe('Your request in CAB201 was rejected.');
  });
  test('LG-260: coordinator suggestion has its own title', () => {
    expect(buildCoordinatorReviewNotification('suggested', 'Suggested', 'CAB201').title).toBe('Alternative session suggested');
  });
});

describe('isValidReviewStatus', () => {
  test('LG-261: accepted, rejected and suggested are valid', () => {
    ['accepted', 'rejected', 'suggested'].forEach(st => expect(isValidReviewStatus(st)).toBe(true));
  });
  test('LG-262: anything else is invalid', () => {
    ['approved', 'pending', ''].forEach(st => expect(isValidReviewStatus(st)).toBe(false));
  });
});
