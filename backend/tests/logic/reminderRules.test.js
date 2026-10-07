// Reminder jobs, teaching period and schedule-change rules
// (utils/reminderRules.js, utils/brisbaneTime.js).
//
// Dates used below (Brisbane is UTC+10, no daylight saving):
//   Sat 10 Oct 2026, Sun 11 Oct 2026, Mon 12 Oct 2026.
const {
  isUnitInAvailabilityReminderWindow,
  checkManualAvailabilityReminder,
  validateTeachingPeriod,
  resolveTeachingPeriodUpdate,
  isDateInTeachingPeriod,
  occurrenceInReminderWindow,
  selectSessionsForReminder,
  resolveSessionReminderRecipients,
  describeSessionChange,
  shouldEmailScheduleChange,
  buildSessionReminderSubject,
  buildAvailabilityReminderSubject
} = require('../../utils/reminderRules');
const {
  brisbaneDateKey,
  brisbaneLocalToUtc,
  nextWeeklyOccurrence,
  toDateKey,
  formatBrisbaneDateTime,
  formatClockTime
} = require('../../utils/brisbaneTime');

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const NOW = new Date('2026-10-07T23:00:00Z'); // Thu 8 Oct 2026, 9:00 am Brisbane
const inDays = (days) => new Date(NOW.getTime() + days * DAY);

describe('availability deadline reminder window', () => {
  const unit = (overrides) => ({ availability_deadline: inDays(2), availability_locked: false, ...overrides });

  test('LG-600: 4 days before the deadline: no reminder yet', () => {
    expect(isUnitInAvailabilityReminderWindow(unit({ availability_deadline: inDays(4) }), NOW)).toBe(false);
  });
  test('LG-601: exactly 3 days before the deadline: reminder', () => {
    expect(isUnitInAvailabilityReminderWindow(unit({ availability_deadline: inDays(3) }), NOW)).toBe(true);
  });
  test('LG-602: 1 day before the deadline: reminder', () => {
    expect(isUnitInAvailabilityReminderWindow(unit({ availability_deadline: inDays(1) }), NOW)).toBe(true);
  });
  test('LG-603: deadline already passed: no reminder', () => {
    expect(isUnitInAvailabilityReminderWindow(unit({ availability_deadline: inDays(-1) }), NOW)).toBe(false);
  });
  test('LG-604: availability locked by the UC: no reminder', () => {
    expect(isUnitInAvailabilityReminderWindow(unit({ availability_locked: true }), NOW)).toBe(false);
  });
  test('LG-605: no deadline set: no reminder', () => {
    expect(isUnitInAvailabilityReminderWindow(unit({ availability_deadline: null }), NOW)).toBe(false);
  });
  test('LG-606: 3 days and 1 minute before: no reminder (window is at most 3 days)', () => {
    expect(isUnitInAvailabilityReminderWindow(unit({ availability_deadline: new Date(inDays(3).getTime() + 60000) }), NOW)).toBe(false);
  });
  test('LG-607: an unreadable deadline is ignored', () => {
    expect(isUnitInAvailabilityReminderWindow(unit({ availability_deadline: 'not a date' }), NOW)).toBe(false);
  });
  test('LG-608: a deadline given as an ISO string works too', () => {
    expect(isUnitInAvailabilityReminderWindow(unit({ availability_deadline: inDays(2).toISOString() }), NOW)).toBe(true);
  });
});

describe('UC bell (manual availability reminder)', () => {
  test('LG-609: allowed for a tutor on the unit who has not submitted', () => {
    expect(checkManualAvailabilityReminder({ isTutorOnUnit: true, hasSubmitted: false, alreadySentToday: false })).toBeNull();
  });
  test('LG-610: refused for someone not on the unit', () => {
    expect(checkManualAvailabilityReminder({ isTutorOnUnit: false, hasSubmitted: false, alreadySentToday: false }).status).toBe(404);
  });
  test('LG-611: refused once the tutor has submitted', () => {
    expect(checkManualAvailabilityReminder({ isTutorOnUnit: true, hasSubmitted: true, alreadySentToday: false }).status).toBe(409);
  });
  test('LG-612: a second click on the same day says "Reminder already sent today"', () => {
    expect(checkManualAvailabilityReminder({ isTutorOnUnit: true, hasSubmitted: false, alreadySentToday: true }))
      .toEqual({ status: 409, error: 'Reminder already sent today' });
  });
  test('LG-613: availability reminder subject names the unit', () => {
    expect(buildAvailabilityReminderSubject('CAB201')).toBe('Reminder: submit your availability for CAB201');
  });
});

describe('teaching period', () => {
  test('LG-614: both dates empty is allowed', () => {
    expect(validateTeachingPeriod(null, '')).toBeNull();
  });
  test('LG-615: end on the same day as start is allowed', () => {
    expect(validateTeachingPeriod('2026-07-20', '2026-07-20')).toBeNull();
  });
  test('LG-616: end before start is refused', () => {
    expect(validateTeachingPeriod('2026-07-20', '2026-07-19')).toMatch(/on or after/);
  });
  test('LG-617: only one of the two dates is refused', () => {
    expect(validateTeachingPeriod('2026-07-20', null)).toMatch(/both/);
    expect(validateTeachingPeriod('', '2026-07-20')).toMatch(/both/);
  });
  test('LG-618: an invalid date is refused', () => {
    expect(validateTeachingPeriod('2026-13-45', '2026-12-01')).toMatch(/valid dates/);
    expect(validateTeachingPeriod('soon', '2026-12-01')).toMatch(/valid dates/);
  });
  test('LG-619: update keeps stored dates when the body leaves them out', () => {
    expect(resolveTeachingPeriodUpdate({ unitName: 'x' }, { teaching_start_date: '2026-07-20', teaching_end_date: '2026-11-01' }))
      .toEqual({ start: '2026-07-20', end: '2026-11-01' });
  });
  test('LG-620: update clears the dates when the body sends empty values', () => {
    expect(resolveTeachingPeriodUpdate({ teachingStartDate: '', teachingEndDate: null }, { teaching_start_date: '2026-07-20', teaching_end_date: '2026-11-01' }))
      .toEqual({ start: null, end: null });
  });
  test('LG-621: date inside the period (inclusive both ends)', () => {
    expect(isDateInTeachingPeriod('2026-07-20', '2026-07-20', '2026-11-01')).toBe(true);
    expect(isDateInTeachingPeriod('2026-11-01', '2026-07-20', '2026-11-01')).toBe(true);
  });
  test('LG-622: date outside the period, or no period', () => {
    expect(isDateInTeachingPeriod('2026-11-02', '2026-07-20', '2026-11-01')).toBe(false);
    expect(isDateInTeachingPeriod('2026-07-19', '2026-07-20', '2026-11-01')).toBe(false);
    expect(isDateInTeachingPeriod('2026-08-01', null, null)).toBe(false);
  });
});

describe('Brisbane time helpers', () => {
  test('LG-623: 23:30 UTC is already the next day in Brisbane', () => {
    expect(brisbaneDateKey(new Date('2026-10-10T23:30:00Z'))).toBe('2026-10-11');
  });
  test('LG-624: Brisbane wall-clock time converts to UTC (UTC+10)', () => {
    expect(brisbaneLocalToUtc('2026-10-12', '10:00').toISOString()).toBe('2026-10-12T00:00:00.000Z');
  });
  test('LG-625: a pg DATE (local-midnight Date) keeps its calendar day', () => {
    expect(toDateKey(new Date(2026, 6, 20))).toBe('2026-07-20');
    expect(toDateKey('2026-07-20T00:00:00.000Z')).toBe('2026-07-20');
  });
  test('LG-626: next Monday 10:00 class seen from Sunday morning', () => {
    const next = nextWeeklyOccurrence('MON', '10:00:00', '12:00:00', new Date('2026-10-11T00:15:00Z'));
    expect(next.dateKey).toBe('2026-10-12');
    expect(next.start.toISOString()).toBe('2026-10-12T00:00:00.000Z');
    expect(next.end.toISOString()).toBe('2026-10-12T02:00:00.000Z');
  });
  test('LG-627: a class that already started today rolls to next week', () => {
    const next = nextWeeklyOccurrence('Monday', '10:00', '11:00', new Date('2026-10-12T00:30:00Z'));
    expect(next.dateKey).toBe('2026-10-19');
  });
  test('LG-628: unreadable day gives no occurrence', () => {
    expect(nextWeeklyOccurrence('Someday', '10:00', '11:00', NOW)).toBeNull();
  });
  test('LG-629: times and deadlines are shown in Brisbane time', () => {
    expect(formatClockTime('14:30:00')).toBe('2:30 pm');
    expect(formatClockTime('00:15')).toBe('12:15 am');
    expect(formatBrisbaneDateTime(new Date('2026-10-09T07:00:00Z'))).toBe('Fri 9 Oct 2026, 5:00 pm (Brisbane time)');
  });
});

describe('24-hour session reminder: which classes', () => {
  const monday10 = { id: 's1', day: 'MON', start_time: '10:00:00', end_time: '12:00:00' };
  const unitFields = { schedule_locked: true, teaching_start_date: '2026-07-20', teaching_end_date: '2026-11-01' };

  test('LG-630: Mon 10:00 class is picked by the Sunday 10:15 run (23h45m ahead)', () => {
    const hit = occurrenceInReminderWindow(monday10, new Date('2026-10-11T00:15:00Z'));
    expect(hit && hit.dateKey).toBe('2026-10-12');
  });
  test('LG-631: Mon 10:00 class is NOT picked by the Sunday 08:00 run (26h ahead)', () => {
    expect(occurrenceInReminderWindow(monday10, new Date('2026-10-10T22:00:00Z'))).toBeNull();
  });
  test('LG-632: exactly 24h ahead is not picked (the next hourly run takes it)', () => {
    expect(occurrenceInReminderWindow(monday10, new Date('2026-10-11T00:00:00Z'))).toBeNull();
  });
  test('LG-633: exactly 23h ahead is picked', () => {
    expect(occurrenceInReminderWindow(monday10, new Date('2026-10-11T01:00:00Z'))).not.toBeNull();
  });
  test('LG-634: across the week: Saturday 21:30 run finds the Sunday 21:00 class', () => {
    const sunday = { id: 's2', day: 'SUN', start_time: '21:00', end_time: '22:00' };
    const hit = occurrenceInReminderWindow(sunday, new Date('2026-10-10T11:30:00Z'));
    expect(hit && hit.dateKey).toBe('2026-10-11');
  });
  test('LG-635: across the week: Monday 10:30 run skips this Monday and finds Tuesday 10:00', () => {
    const run = new Date('2026-10-12T00:30:00Z');
    expect(occurrenceInReminderWindow(monday10, run)).toBeNull();
    const tuesday = { id: 's3', day: 'TUE', start_time: '10:00', end_time: '11:00' };
    expect(occurrenceInReminderWindow(tuesday, run).dateKey).toBe('2026-10-13');
  });
  test('LG-636: a class date outside the teaching period is not picked', () => {
    const session = { ...monday10, ...unitFields, teaching_end_date: '2026-10-11' };
    expect(selectSessionsForReminder([session], new Date('2026-10-11T00:15:00Z'))).toEqual([]);
  });
  test('LG-637: a unit with no teaching period is not picked', () => {
    const session = { ...monday10, ...unitFields, teaching_start_date: null, teaching_end_date: null };
    expect(selectSessionsForReminder([session], new Date('2026-10-11T00:15:00Z'))).toEqual([]);
  });
  test('LG-638: a unit whose schedule is not locked is not picked', () => {
    const session = { ...monday10, ...unitFields, schedule_locked: false };
    expect(selectSessionsForReminder([session], new Date('2026-10-11T00:15:00Z'))).toEqual([]);
  });
  test('LG-639: locked unit, date inside the period: picked with its class date', () => {
    const session = { ...monday10, ...unitFields };
    const picked = selectSessionsForReminder([session], new Date('2026-10-11T00:15:00Z'));
    expect(picked).toHaveLength(1);
    expect(picked[0].occurrence.dateKey).toBe('2026-10-12');
  });
  test('LG-640: subject line names unit, type and start time', () => {
    expect(buildSessionReminderSubject({ unitCode: 'CAB201', sessionType: 'Tutorial', startTime: '14:00:00' }))
      .toBe('Reminder: CAB201 Tutorial tomorrow at 2:00 pm');
  });
});

describe('24-hour session reminder: who gets it', () => {
  const date = '2026-10-12';
  const cover = (overrides) => ({
    status: 'claimed', original_tutor_id: 'tA', claimed_by_id: 'tC',
    start_date: '2026-10-12', end_date: '2026-10-12', ...overrides
  });

  test('LG-641: only Confirmed tutors (not Pending or Declined)', () => {
    const recipients = resolveSessionReminderRecipients([
      { tutor_id: 'tA', tutor_confirmed: true },
      { tutor_id: 'tB', tutor_confirmed: null },
      { tutor_id: 'tD', tutor_confirmed: false }
    ], [], date);
    expect(recipients).toEqual([{ tutorId: 'tA', via: 'assignment' }]);
  });
  test('LG-642: a claimed cover on that day reminds the cover tutor, not the original', () => {
    const recipients = resolveSessionReminderRecipients([{ tutor_id: 'tA', tutor_confirmed: true }], [cover()], date);
    expect(recipients).toEqual([{ tutorId: 'tC', via: 'cover' }]);
  });
  test('LG-643: a cover for other dates does not change that day', () => {
    const recipients = resolveSessionReminderRecipients(
      [{ tutor_id: 'tA', tutor_confirmed: true }],
      [cover({ start_date: '2026-10-19', end_date: '2026-10-25' })],
      date
    );
    expect(recipients).toEqual([{ tutorId: 'tA', via: 'assignment' }]);
  });
  test('LG-644: an open (unclaimed) cover does not change who is reminded', () => {
    const recipients = resolveSessionReminderRecipients(
      [{ tutor_id: 'tA', tutor_confirmed: true }],
      [cover({ status: 'open', claimed_by_id: null })],
      date
    );
    expect(recipients).toEqual([{ tutorId: 'tA', via: 'assignment' }]);
  });
  test('LG-645: with two tutors, only the covered one is swapped', () => {
    const recipients = resolveSessionReminderRecipients([
      { tutor_id: 'tA', tutor_confirmed: true },
      { tutor_id: 'tB', tutor_confirmed: true }
    ], [cover()], date);
    expect(recipients.map(r => r.tutorId).sort()).toEqual(['tB', 'tC']);
  });
  test('LG-646: cover dates from pg (local-midnight Date objects) are read correctly', () => {
    const recipients = resolveSessionReminderRecipients(
      [{ tutor_id: 'tA', tutor_confirmed: true }],
      [cover({ start_date: new Date(2026, 9, 12), end_date: new Date(2026, 9, 12) })],
      date
    );
    expect(recipients).toEqual([{ tutorId: 'tC', via: 'cover' }]);
  });
});

describe('schedule-change notices', () => {
  const before = { session_code: 'TUT02', day: 'MON', start_time: '10:00:00', end_time: '12:00:00', location: 'GP-P-101', capacity: 30 };

  test('LG-647: moving day and time is described', () => {
    expect(describeSessionChange(before, { ...before, day: 'TUE', start_time: '14:00', end_time: '16:00' }))
      .toEqual(['TUT02 moved from Mon 10:00–12:00 to Tue 14:00–16:00']);
  });
  test('LG-648: changing the location is described', () => {
    expect(describeSessionChange(before, { ...before, location: 'GP-Z-410' }))
      .toEqual(['Location changed from GP-P-101 to GP-Z-410']);
  });
  test('LG-649: capacity or staff note only: nothing to tell tutors', () => {
    expect(describeSessionChange(before, { ...before, capacity: 50, staff_note: 'bring markers' })).toEqual([]);
  });
  test('LG-650: "10:00" and "10:00:00" are the same time', () => {
    expect(describeSessionChange(before, { ...before, start_time: '10:00', end_time: '12:00' })).toEqual([]);
  });
  test('LG-651: email only when the class is within 48 hours', () => {
    const now = new Date('2026-10-11T00:15:00Z'); // Sun 10:15 Brisbane
    expect(shouldEmailScheduleChange([{ day: 'MON', start_time: '10:00', end_time: '11:00' }], now)).toBe(true);
    expect(shouldEmailScheduleChange([{ day: 'WED', start_time: '10:00', end_time: '11:00' }], now)).toBe(false);
    expect(shouldEmailScheduleChange([
      { day: 'WED', start_time: '10:00', end_time: '11:00' },
      { day: 'MON', start_time: '10:00', end_time: '11:00' }
    ], now)).toBe(true);
  });
  test('LG-652: 48 hours is measured to the class start', () => {
    const now = new Date(brisbaneLocalToUtc('2026-10-12', '10:00').getTime() - 48 * HOUR);
    expect(shouldEmailScheduleChange([{ day: 'MON', start_time: '10:00', end_time: '11:00' }], now)).toBe(true);
    const later = new Date(now.getTime() - 60000);
    expect(shouldEmailScheduleChange([{ day: 'MON', start_time: '10:00', end_time: '11:00' }], later)).toBe(false);
  });
});
