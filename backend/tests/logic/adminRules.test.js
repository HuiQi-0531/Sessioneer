// adminRules pulls in unitRules, which loads the database connection: replace it with a fake.
jest.mock('../../db', () => ({ query: jest.fn() }));
const a = require('../../utils/adminRules');
const { normaliseUnitCode } = require('../../utils/unitRules');

describe('normaliseRole', () => {
  test('LG-263: "unit coordinator" becomes coordinator', () => { expect(a.normaliseRole('Unit Coordinator')).toBe('coordinator'); });
  test('LG-264: "UC" becomes coordinator', () => { expect(a.normaliseRole('UC')).toBe('coordinator'); });
  test('LG-265: "Administrator" becomes admin', () => { expect(a.normaliseRole('Administrator')).toBe('admin'); });
  test('LG-266: " TUTOR " becomes tutor', () => { expect(a.normaliseRole(' TUTOR ')).toBe('tutor'); });
  test('LG-267: super_tutor is not an account role', () => { expect(a.normaliseRole('super_tutor')).toBe(''); });
  test('LG-268: missing role gives ""', () => { expect(a.normaliseRole(null)).toBe(''); });
});

describe('normaliseMembershipRole', () => {
  test('LG-269: "Unit Coordinator" becomes coordinator', () => { expect(a.normaliseMembershipRole('Unit Coordinator')).toBe('coordinator'); });
  test('LG-270: "uc" becomes coordinator', () => { expect(a.normaliseMembershipRole('uc')).toBe('coordinator'); });
  test('LG-271: "Super Tutor" and "super-tutor" become super_tutor', () => {
    expect(a.normaliseMembershipRole('Super Tutor')).toBe('super_tutor');
    expect(a.normaliseMembershipRole('super-tutor')).toBe('super_tutor');
  });
  test('LG-272: "supertutor" becomes super_tutor', () => { expect(a.normaliseMembershipRole('supertutor')).toBe('super_tutor'); });
  test('LG-273: "tutor" stays tutor', () => { expect(a.normaliseMembershipRole('tutor')).toBe('tutor'); });
  test('LG-274: "admin" is not a unit role', () => { expect(a.normaliseMembershipRole('admin')).toBe(''); });
});

describe('isTutorMembershipRole', () => {
  test('LG-275: tutor and super_tutor are tutor roles', () => {
    expect(a.isTutorMembershipRole('tutor')).toBe(true);
    expect(a.isTutorMembershipRole('super_tutor')).toBe(true);
  });
  test('LG-276: coordinator is not a tutor role', () => { expect(a.isTutorMembershipRole('coordinator')).toBe(false); });
});

describe('normaliseAccountStatus', () => {
  test('LG-277: missing status becomes active', () => { expect(a.normaliseAccountStatus(undefined)).toBe('active'); });
  test('LG-278: "DISABLED" becomes disabled', () => { expect(a.normaliseAccountStatus('DISABLED')).toBe('disabled'); });
  test('LG-279: pending stays pending', () => { expect(a.normaliseAccountStatus('pending')).toBe('pending'); });
  test('LG-280: unknown status gives ""', () => { expect(a.normaliseAccountStatus('banned')).toBe(''); });
});

describe('normaliseUnitCode', () => {
  test('LG-281: spaces removed and uppercase', () => { expect(normaliseUnitCode(' cab201 ')).toBe('CAB201'); });
  test('LG-282: missing code gives ""', () => { expect(normaliseUnitCode(null)).toBe(''); });
});

describe('isValidEmail', () => {
  test('LG-283: normal email is valid', () => { expect(a.isValidEmail('tutor@qut.edu.au')).toBe(true); });
  test('LG-284: no @ is invalid', () => { expect(a.isValidEmail('tutor.qut.edu.au')).toBe(false); });
  test('LG-285: no dot after @ is invalid', () => { expect(a.isValidEmail('tutor@qut')).toBe(false); });
  test('LG-286: a space is invalid', () => { expect(a.isValidEmail('tu tor@qut.edu.au')).toBe(false); });
});

describe('getSelfEditError', () => {
  test('LG-287: admin cannot remove their own admin role', () => {
    expect(a.getSelfEditError('me', 'me', 'coordinator', 'active')).toBe('You cannot remove admin access from your own account');
  });
  test('LG-288: admin cannot disable their own account', () => {
    expect(a.getSelfEditError('me', 'me', 'admin', 'disabled')).toBe('You cannot disable your own admin account');
  });
  test('LG-289: editing someone else is allowed', () => {
    expect(a.getSelfEditError('other', 'me', 'tutor', 'disabled')).toBeNull();
  });
});

describe('admin format functions', () => {
  test('LG-290: formatAdminUser maps a full row', () => {
    const u = a.formatAdminUser({ id: 'u1', name: 'Alex', last_name: 'Lee', email: 'alex@x.com', role: 'tutor', account_status: 'pending', unit_count: '3' });
    expect(u).toMatchObject({ id: 'u1', displayName: 'Alex Lee', accountStatus: 'pending', unitCount: 3 });
  });
  test('LG-291: formatAdminUser fills defaults', () => {
    expect(a.formatAdminUser({ id: 'u1' })).toMatchObject({ accountStatus: 'active', avatarUrl: null, phoneNumber: '', unitCount: 0, unitSummary: '', createdAt: null });
  });
  test('LG-292: formatAdminUnit maps coordinator name and counts', () => {
    const u = a.formatAdminUnit({ id: 'x', unit_code: 'CAB201', main_coordinator_name: 'Sam', main_coordinator_last_name: 'B', tutor_count: '4' });
    expect(u).toMatchObject({ unitCode: 'CAB201', mainCoordinatorName: 'Sam B', tutorCount: 4 });
  });
  test('LG-293: formatAdminUnit fills defaults', () => {
    expect(a.formatAdminUnit({ id: 'x' })).toMatchObject({ mainCoordinatorName: '', mainCoordinatorEmail: '', coordinators: '', coordinatorCount: 0, sessionCount: 0 });
  });
  test('LG-294: formatAdminUnitTutor marks a Super Tutor', () => {
    expect(a.formatAdminUnitTutor({ id: 't', membership_role: 'super_tutor', assigned_session_count: '2' }))
      .toMatchObject({ membershipRole: 'super_tutor', isSuperTutor: true, assignedSessionCount: 2 });
  });
  test('LG-295: formatAdminUnitTutor defaults to tutor', () => {
    expect(a.formatAdminUnitTutor({ id: 't' })).toMatchObject({ membershipRole: 'tutor', isSuperTutor: false, avatarUrl: null, assignedSessionCount: 0 });
  });
  test('LG-296: formatAdminUserUnitAccess maps a full row', () => {
    expect(a.formatAdminUserUnitAccess({ unit_id: 'u', unit_code: 'CAB201', access_role: 'coordinator', is_primary_coordinator: 1, assigned_session_count: '5' }))
      .toMatchObject({ unitCode: 'CAB201', role: 'coordinator', isPrimaryCoordinator: true, assignedSessionCount: 5 });
  });
  test('LG-297: formatAdminUserUnitAccess defaults', () => {
    expect(a.formatAdminUserUnitAccess({ unit_id: 'u' })).toMatchObject({ isPrimaryCoordinator: false, assignedSessionCount: 0 });
  });
  test('LG-298: formatAdminSession maps a full row', () => {
    expect(a.formatAdminSession({ id: 's', day: 'MON', start_time: '10:00:00', status: 'Confirmed', assigned_tutor_count: '2', tutor_confirmation_state: 'Confirmed' }))
      .toMatchObject({ day: 'MON', startTime: '10:00:00', status: 'Confirmed', assignedTutorCount: 2, tutorConfirmationState: 'Confirmed' });
    expect(a.formatAdminSession({ id: 's', schedule_locked: true }).scheduleLocked).toBe(true);
  });
  test('LG-299: formatAdminSession defaults', () => {
    expect(a.formatAdminSession({ id: 's' })).toMatchObject({ location: '', campus: '', sessionType: '', status: 'Draft', assignedTutorCount: 0, assignedTutors: '', tutorConfirmationState: 'Unassigned', scheduleLocked: false });
  });
  test('LG-300: formatAdminApplication joins names and flags a resume', () => {
    expect(a.formatAdminApplication({ id: 'a', name: 'Alex', last_name: 'Lee', resume_filename: 'cv.pdf', invited_by_name: 'Sam', invited_by_last_name: 'B' }))
      .toMatchObject({ fullName: 'Alex Lee', hasResume: true, invitedByName: 'Sam B' });
  });
  test('LG-301: formatAdminApplication with no name shows "Pending profile"', () => {
    expect(a.formatAdminApplication({ id: 'a' })).toMatchObject({ fullName: 'Pending profile', status: 'pending', hasResume: false, createdUserId: null });
  });
  test('LG-302: formatAdminRequest maps tutor and claimer names', () => {
    expect(a.formatAdminRequest({ id: 'r', tutor_name: 'Amy', tutor_last_name: 'Lee', claimed_by_name: 'Ben' }))
      .toMatchObject({ tutorName: 'Amy Lee', claimedByName: 'Ben' });
  });
  test('LG-303: formatAdminRequest falls back to email, then "Unknown tutor"', () => {
    expect(a.formatAdminRequest({ id: 'r', tutor_email: 'amy@x.com' }).tutorName).toBe('amy@x.com');
    expect(a.formatAdminRequest({ id: 'r' }).tutorName).toBe('Unknown tutor');
  });
});
