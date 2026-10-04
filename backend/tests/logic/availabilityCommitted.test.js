// "After a tutor accepts MON 8-10, their availability for MON 8-10 shows
// avoid" (situation 2). Worked out when the grid is read, never written to
// the availability table.
const a = require('../../utils/availabilityRules');
const { getHourlySlotsInRange } = require('../../utils/normalise');

const grid = () => ({
  tutors: [{ id: 'sarah', name: 'Sarah' }, { id: 'tom', name: 'Tom' }],
  submissionStatus: [],
  availability: {
    MON: { sarah: { '8:00am': 'preferred', '9:00am': 'available', '10:00am': 'preferred' } },
    TUE: {}, WED: {}, THU: {}, FRI: {}
  }
});

describe('sessionAvailabilitySlots', () => {
  test('LG-514: 08:00-10:00 covers the 8am and 9am slots', () => {
    expect(a.sessionAvailabilitySlots('08:00:00', '10:00:00')).toEqual(['8:00am', '9:00am']);
  });
  test('LG-515: 08:30-09:15 touches both 8am and 9am', () => {
    expect(a.sessionAvailabilitySlots('08:30:00', '09:15:00')).toEqual(['8:00am', '9:00am']);
  });
  test('LG-516: afternoon times use pm labels', () => {
    expect(a.sessionAvailabilitySlots('12:00:00', '14:00:00')).toEqual(['12:00pm', '1:00pm']);
  });
});

describe('applyCommittedSessions', () => {
  const sarahMon = { tutor_id: 'sarah', day: 'MON', start_time: '08:00:00', end_time: '10:00:00', unit_code: 'CAB201' };

  test('LG-517: an accepted MON 8-10 session shows MON 8am and 9am as avoid', () => {
    const out = a.applyCommittedSessions(grid(), [sarahMon]);
    expect(out.availability.MON.sarah['8:00am']).toBe('avoid');
    expect(out.availability.MON.sarah['9:00am']).toBe('avoid');
  });
  test('LG-518: hours outside the session keep the tutor\'s own answer', () => {
    expect(a.applyCommittedSessions(grid(), [sarahMon]).availability.MON.sarah['10:00am']).toBe('preferred');
  });
  test('LG-519: committed records which unit the time is taken by', () => {
    expect(a.applyCommittedSessions(grid(), [sarahMon]).committed.MON.sarah).toEqual({ '8:00am': 'CAB201', '9:00am': 'CAB201' });
  });
  test('LG-520: a tutor with no submitted availability still gets the avoid hours', () => {
    const out = a.applyCommittedSessions(grid(), [{ ...sarahMon, tutor_id: 'tom' }]);
    expect(out.availability.MON.tom).toEqual({ '8:00am': 'avoid', '9:00am': 'avoid' });
  });
  test('LG-521: tutors not on this grid are ignored', () => {
    const out = a.applyCommittedSessions(grid(), [{ ...sarahMon, tutor_id: 'stranger' }]);
    expect(out.availability.MON.stranger).toBeUndefined();
  });
  test('LG-522: weekend sessions are ignored (the grid is Mon-Fri)', () => {
    const out = a.applyCommittedSessions(grid(), [{ ...sarahMon, day: 'SAT' }]);
    expect(out.committed).toEqual({ MON: {}, TUE: {}, WED: {}, THU: {}, FRI: {} });
  });
  test('LG-523: no accepted sessions leaves the grid as it was', () => {
    const before = grid();
    const out = a.applyCommittedSessions(before, []);
    expect(out.availability).toEqual(grid().availability);
  });
});

describe('getHourlySlotsInRange (used by Assign Staff scoring)', () => {
  test('LG-524: a half-past start still covers the next hour (regression)', () => {
    expect(getHourlySlotsInRange('08:30:00', '09:15:00')).toEqual(['8am', '9am']);
  });
  test('LG-525: whole hours are unchanged', () => {
    expect(getHourlySlotsInRange('10:00:00', '12:00:00')).toEqual(['10am', '11am']);
  });
});
