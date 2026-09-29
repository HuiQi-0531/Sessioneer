// Day/time reading has its own tests (normalise.test.js), so it is replaced by a
// simple fake here: this file only checks what prepareImportRow itself does.
jest.mock('../../utils/normalise', () => ({
  normaliseDay: (d) => ({ Monday: 'MON', MON: 'MON', Tuesday: 'TUE' }[d] || null),
  normaliseTime: (t) => ({ '9am': '09:00:00', '10am': '10:00:00', '11am': '11:00:00', '12pm': '12:00:00' }[t] || null)
}));

const { prepareImportRow } = require('../../utils/sessionRules');

const row = {
  day: 'Monday', startTime: '10am', endTime: '12pm', location: 'GP-P512', campus: 'GP',
  sessionType: 'Tutorial', capacity: 30, requiredTutors: 2, status: 'Draft', staffNote: 'Room change', sessionCode: ' tut05 '
};

describe('prepareImportRow (one CSV row)', () => {
  test('LG-183: a valid row is read and the session code is cleaned', () => {
    expect(prepareImportRow(row)).toEqual({
      skipReason: null,
      sessionCode: 'TUT05',
      values: {
        day: 'MON', startTime: '10:00:00', endTime: '12:00:00', location: 'GP-P512', campus: 'GP',
        sessionType: 'Tutorial', capacity: 30, requiredTutors: 2, status: 'Draft', staffNote: 'Room change'
      }
    });
  });
  test('LG-184: a day that cannot be read skips the row', () => {
    expect(prepareImportRow({ ...row, day: 'Funday' })).toEqual({ skipReason: 'Could not read day or time' });
  });
  test('LG-185: a time that cannot be read skips the row', () => {
    expect(prepareImportRow({ ...row, endTime: '25pm' })).toEqual({ skipReason: 'Could not read day or time' });
  });
  test('LG-186: no tutor count uses 1 tutor per 30 students', () => {
    expect(prepareImportRow({ ...row, capacity: 60, requiredTutors: '' }).values.requiredTutors).toBe(3);
  });
  test('LG-187: missing optional fields become null, status becomes Confirmed, no code is generated here', () => {
    const result = prepareImportRow({ day: 'MON', startTime: '9am', endTime: '10am' });
    expect(result.sessionCode).toBeNull();
    expect(result.values).toMatchObject({
      location: null, campus: null, sessionType: null, capacity: null, status: 'Confirmed', staffNote: null, requiredTutors: 1
    });
  });
  test('LG-188: a row whose end time is before its start time is skipped (LOGIC-B4)', () => {
    expect(prepareImportRow({ ...row, startTime: '11am', endTime: '10am' }).skipReason).toBeTruthy();
  });
  test('LG-189: capacity or tutor count that is not a number is skipped, not sent to the database (LOGIC-B7)', () => {
    expect(prepareImportRow({ ...row, capacity: 'abc' }).skipReason).toBeTruthy();
    expect(prepareImportRow({ ...row, requiredTutors: 'two' }).skipReason).toBeTruthy();
  });
});
