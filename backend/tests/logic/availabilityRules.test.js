const {
  availabilityTimeToSlot,
  isAvailabilityLocked,
  parseAvailabilitySlot,
  buildAvailabilityGrid
} = require('../../utils/availabilityRules');

describe('availabilityTimeToSlot (availability page slot names)', () => {
  test('LG-310: 00:00 is 12:00am', () => { expect(availabilityTimeToSlot('00:00:00')).toBe('12:00am'); });
  test('LG-311: 08:00 is 8:00am', () => { expect(availabilityTimeToSlot('08:00:00')).toBe('8:00am'); });
  test('LG-312: 12:00 is 12:00pm', () => { expect(availabilityTimeToSlot('12:00:00')).toBe('12:00pm'); });
  test('LG-313: 13:00 is 1:00pm', () => { expect(availabilityTimeToSlot('13:00:00')).toBe('1:00pm'); });
  test('LG-314: 23:00 is 11:00pm', () => { expect(availabilityTimeToSlot('23:00:00')).toBe('11:00pm'); });
});

describe('isAvailabilityLocked (clock fixed at 1 Oct 2026, 12:00 UTC)', () => {
  beforeAll(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-01T12:00:00Z')); });
  afterAll(() => jest.useRealTimers());

  test('LG-315: coordinator locked it', () => {
    expect(isAvailabilityLocked({ availability_locked: true, availability_deadline: '2026-12-01T00:00:00Z' })).toBe(true);
  });
  test('LG-316: deadline has passed', () => {
    expect(isAvailabilityLocked({ availability_locked: false, availability_deadline: '2026-09-30T00:00:00Z' })).toBe(true);
  });
  test('LG-317: deadline is still in the future', () => {
    expect(isAvailabilityLocked({ availability_locked: false, availability_deadline: '2026-10-02T00:00:00Z' })).toBe(false);
  });
  test('LG-318: no deadline set stays open', () => {
    expect(isAvailabilityLocked({ availability_locked: false, availability_deadline: null })).toBe(false);
  });
  test('LG-319: missing lock flag and no deadline stays open', () => {
    expect(isAvailabilityLocked({})).toBe(false);
  });
});

describe('parseAvailabilitySlot', () => {
  test('LG-320: "Monday-8:00am" becomes MON 08:00-09:00', () => {
    expect(parseAvailabilitySlot('Monday-8:00am', 'preferred'))
      .toEqual({ day: 'MON', startTime: '08:00:00', endTime: '09:00:00', preference: 'preferred' });
  });
  test('LG-321: "MON-1:00pm" becomes 13:00-14:00', () => {
    expect(parseAvailabilitySlot('MON-1:00pm', 'available')).toMatchObject({ startTime: '13:00:00', endTime: '14:00:00' });
  });
  test('LG-322: 12:00pm is noon', () => {
    expect(parseAvailabilitySlot('Friday-12:00pm', 'avoid').startTime).toBe('12:00:00');
  });
  test('LG-323: 12:00am is midnight', () => {
    expect(parseAvailabilitySlot('Friday-12:00am', 'avoid').startTime).toBe('00:00:00');
  });
  test('LG-324: weekend days are ignored', () => {
    expect(parseAvailabilitySlot('Saturday-9:00am', 'preferred')).toBeNull();
  });
  test('LG-325: unknown preference is ignored', () => {
    expect(parseAvailabilitySlot('Monday-9:00am', 'maybe')).toBeNull();
  });
  test('LG-326: key without "-" is ignored', () => {
    expect(parseAvailabilitySlot('Monday9:00am', 'preferred')).toBeNull();
  });
  test('LG-327: time without minutes ("8am") is ignored', () => {
    expect(parseAvailabilitySlot('Monday-8am', 'preferred')).toBeNull();
  });
  test('LG-328: impossible time "13:00pm" is ignored, not saved as 25:00 (LOGIC-B13)', () => {
    expect(parseAvailabilitySlot('Monday-13:00pm', 'preferred')).toBeNull();
  });
});

describe('buildAvailabilityGrid', () => {
  const tutors = [{ id: 't1', name: 'Amy' }, { id: 't2', name: 'Ben' }];

  test('LG-329: slots are grouped by day, then tutor, then time', () => {
    const { availability } = buildAvailabilityGrid(tutors, [], [
      { tutor_id: 't1', day: 'MON', start_time: '10:00:00', preference: 'preferred' },
      { tutor_id: 't1', day: 'Monday', start_time: '14:00:00', preference: 'avoid' }
    ]);
    expect(availability.MON).toEqual({ t1: { '10:00am': 'preferred', '2:00pm': 'avoid' } });
  });
  test('LG-330: rows for tutors not on the list are skipped', () => {
    const { availability } = buildAvailabilityGrid(tutors, [], [{ tutor_id: 'x9', day: 'MON', start_time: '10:00:00', preference: 'preferred' }]);
    expect(availability.MON).toEqual({});
  });
  test('LG-331: rows on an unknown day are skipped', () => {
    const { availability } = buildAvailabilityGrid(tutors, [], [{ tutor_id: 't1', day: 'SAT', start_time: '10:00:00', preference: 'preferred' }]);
    expect(availability).toEqual({ MON: {}, TUE: {}, WED: {}, THU: {}, FRI: {} });
  });
  test('LG-332: submission status lists every tutor, ignoring others', () => {
    const { submissionStatus } = buildAvailabilityGrid(tutors, [{ tutor_id: 't2' }, { tutor_id: 'x9' }], []);
    expect(submissionStatus).toEqual([{ tutorId: 't1', submitted: false }, { tutorId: 't2', submitted: true }]);
  });
});
