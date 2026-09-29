// Admin session staff assignment logic (added to admin.routes.js on 29 Sep 2026).
jest.mock('../../db', () => ({ query: jest.fn() }));
const {
  isUuid,
  formatAdminStaff,
  checkAdminSessionEdit,
  hasIneligibleForSuperTutorType,
  checkAdminAssignSlot
} = require('../../utils/adminRules');

describe('isUuid', () => {
  test('LG-457: a normal id is accepted', () => {
    expect(isUuid('11111111-2222-3333-4444-555555555555')).toBe(true);
  });
  test('LG-458: upper-case letters are accepted', () => {
    expect(isUuid('AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE')).toBe(true);
  });
  test('LG-459: wrong format, empty or missing is refused', () => {
    expect(isUuid('12345')).toBe(false);
    expect(isUuid('')).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });
});

describe('formatAdminStaff', () => {
  test('LG-460: full name is used, or the email when there is no name', () => {
    expect(formatAdminStaff({ id: 'u1', name: 'Alex', last_name: 'Lee', email: 'alex@x.com', access_role: 'tutor' }).name).toBe('Alex Lee');
    expect(formatAdminStaff({ id: 'u2', name: null, last_name: null, email: 'n@x.com', access_role: 'tutor' }).name).toBe('n@x.com');
  });
  test('LG-461: max hours becomes a number, missing stays null', () => {
    expect(formatAdminStaff({ id: 'u1', maximum_hours: '10', access_role: 'super_tutor' })).toMatchObject({ maximumHours: 10, role: 'super_tutor' });
    expect(formatAdminStaff({ id: 'u1', maximum_hours: null }).maximumHours).toBeNull();
  });
});

describe('checkAdminSessionEdit', () => {
  test('LG-462: a session with staff cannot be moved to another unit', () => {
    expect(checkAdminSessionEdit({ unit_id: 'A', assigned_count: 1 }, 'B', 2))
      .toBe('Unassign staff before moving this session to another unit');
  });
  test('LG-463: tutors required cannot go below the number already assigned', () => {
    expect(checkAdminSessionEdit({ unit_id: 'A', assigned_count: 2 }, 'A', 1))
      .toBe('Tutors required cannot be lower than the number already assigned');
  });
  test('LG-464: a session with no staff can be moved and changed', () => {
    expect(checkAdminSessionEdit({ unit_id: 'A', assigned_count: 0 }, 'B', 1)).toBeNull();
  });
});

describe('hasIneligibleForSuperTutorType', () => {
  const staff = [{ id: 't1', role: 'tutor' }, { id: 's1', role: 'super_tutor' }, { id: 'c1', role: 'coordinator' }];
  test('LG-465: a normal Tutor assigned blocks changing to a Lecture', () => {
    expect(hasIneligibleForSuperTutorType([{ tutor_id: 's1' }, { tutor_id: 't1' }], staff)).toBe(true);
  });
  test('LG-466: only Super Tutors and coordinators assigned is fine', () => {
    expect(hasIneligibleForSuperTutorType([{ tutor_id: 's1' }, { tutor_id: 'c1' }], staff)).toBe(false);
  });
});

describe('checkAdminAssignSlot', () => {
  test('LG-467: the same staff member cannot be assigned twice', () => {
    expect(checkAdminAssignSlot([{ tutor_id: 's1', tutor_confirmed: null }], 's1', 2))
      .toBe('This staff member is already assigned to the session');
  });
  test('LG-468: a full session is refused (declined staff do not count)', () => {
    const rows = [{ tutor_id: 's1', tutor_confirmed: true }, { tutor_id: 's2', tutor_confirmed: false }];
    expect(checkAdminAssignSlot(rows, 's3', 1)).toBe('This session already has its required number of staff assigned');
    expect(checkAdminAssignSlot(rows, 's3', 2)).toBeNull();
  });
});
