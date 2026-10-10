// Swap/change request status rules, registration, profile hours, invite
// names, schedule readiness and bot keyword matching.
// unitRules loads the database module; replace it so no connection is attempted.
jest.mock('../../db', () => ({ query: jest.fn() }));
const { shouldApplyChange, checkTutorStatusChange, resolveTutorRequestStatus } = require('../../utils/changeRequestRules');
const { validateRegistration, isValidEmail, normaliseRegisterRole } = require('../../utils/authRules');
const { parseMaximumHours, buildProfileUpdateParams } = require('../../utils/profileRules');
const { resolveInviteName } = require('../../utils/applicationRules');
const { summariseScheduleReadiness, canLockSchedule } = require('../../utils/unitRules');
const { isValidPassword } = require('../../utils/passwords');
const { keywordMatches, searchKnowledge } = require('../../bot/knowledge');

describe('shouldApplyChange: a swap is applied exactly once', () => {
  test('LG-526: a new approval applies it', () => {
    expect(shouldApplyChange('accepted', 'Pending')).toBe(true);
  });
  test('LG-527: approving an already-approved request again does not move the tutor twice', () => {
    expect(shouldApplyChange('Accepted', 'accepted')).toBe(false);
  });
  test('LG-528: rejecting or suggesting never applies', () => {
    expect(shouldApplyChange('rejected', 'Pending')).toBe(false);
    expect(shouldApplyChange('suggested', 'Pending')).toBe(false);
  });
});

describe('checkTutorStatusChange: what a tutor may do to their own request', () => {
  test('LG-529: accept a coordinator suggestion', () => {
    expect(checkTutorStatusChange('Suggested', 'accepted')).toBeNull();
  });
  test('LG-530: approve their own pending request is refused (403)', () => {
    expect(checkTutorStatusChange('Pending', 'accepted').status).toBe(403);
  });
  test('LG-531: reject a suggestion (it goes back to Pending)', () => {
    expect(checkTutorStatusChange('Suggested', 'rejected')).toBeNull();
    expect(resolveTutorRequestStatus('Suggested', 'rejected')).toBe('Pending');
  });
  test('LG-532: appeal a rejected request', () => {
    expect(checkTutorStatusChange('Rejected', 'Pending')).toBeNull();
  });
  test('LG-533: invent a status like "Approved" is refused (400)', () => {
    expect(checkTutorStatusChange('Pending', 'Approved').status).toBe(400);
  });
  test('LG-534: reject their own pending request is refused (409)', () => {
    expect(checkTutorStatusChange('Pending', 'rejected').status).toBe(409);
  });
  test('LG-535: editing only the reason (no status) is allowed', () => {
    expect(checkTutorStatusChange('Pending', undefined)).toBeNull();
  });
});

describe('validateRegistration', () => {
  const ok = { firstName: 'Ann', lastName: 'Lee', email: 'ann@uni.edu', role: 'Tutor', password: 'Secret12', confirmPassword: 'Secret12' };
  test('LG-536: a complete form is valid', () => {
    expect(validateRegistration(ok)).toBeNull();
  });
  test('LG-537: a 3-character password is refused (regression: it used to be accepted)', () => {
    expect(validateRegistration({ ...ok, password: '123', confirmPassword: '123' })).toBe('Password must be at least 8 characters');
  });
  test('LG-538: mismatched passwords are refused first', () => {
    expect(validateRegistration({ ...ok, confirmPassword: 'other12' })).toBe('Passwords do not match');
  });
  test('LG-539: a bad email is refused', () => {
    expect(validateRegistration({ ...ok, email: 'not-an-email' })).toBe('Please enter a valid email address');
  });
  test('LG-540: a missing field is refused', () => {
    expect(validateRegistration({ ...ok, lastName: '' })).toBe('Please fill in all fields');
  });
  test('LG-541: isValidEmail trims spaces', () => {
    expect(isValidEmail('  ann@uni.edu ')).toBe(true);
  });
  test('LG-542: "COORDINATOR" in capitals registers a coordinator; "admin" never does', () => {
    expect(normaliseRegisterRole('COORDINATOR')).toBe('coordinator');
    expect(normaliseRegisterRole('admin')).toBe('tutor');
  });
});

describe('isValidPassword accepts only text', () => {
  test('LG-543: a number or null is refused instead of crashing', () => {
    expect(isValidPassword(1234567)).toBe(false);
    expect(isValidPassword(null)).toBe(false);
    expect(isValidPassword(undefined)).toBe(false);
  });
});

describe('parseMaximumHours', () => {
  test('LG-544: blank means "not given"', () => {
    expect(parseMaximumHours('')).toEqual({ value: null });
    expect(parseMaximumHours(undefined)).toEqual({ value: null });
  });
  test('LG-545: a whole number is kept', () => {
    expect(parseMaximumHours('12')).toEqual({ value: 12 });
  });
  test('LG-546: text, decimals and more than a week of hours are refused', () => {
    expect(parseMaximumHours('ten').error).toBeDefined();
    expect(parseMaximumHours('7.5').error).toBeDefined();
    expect(parseMaximumHours('200').error).toBeDefined();
  });
  test('LG-547: the UPDATE gets a number, never a string', () => {
    expect(buildProfileUpdateParams({ maximumHours: '8' }, 'tutor', 'u1')[6]).toBe(8);
  });
});

describe('resolveInviteName', () => {
  test('LG-548: first and last name stored separately are used as-is', () => {
    expect(resolveInviteName({ name: 'Mary Ann', last_name: 'Lee' }, '', '')).toEqual({ firstName: 'Mary Ann', lastName: 'Lee' });
  });
  test('LG-549: a direct invite (no stored name) uses the form', () => {
    expect(resolveInviteName({ name: '', last_name: null }, ' Sam ', ' Wu ')).toEqual({ firstName: 'Sam', lastName: 'Wu' });
  });
  test('LG-550: a single stored first name takes the last name from the form', () => {
    expect(resolveInviteName({ name: 'Cher', last_name: null }, '', 'Smith')).toEqual({ firstName: 'Cher', lastName: 'Smith' });
  });
});

describe('summariseScheduleReadiness (lock-schedule, read from session_tutors)', () => {
  test('LG-551: a session short of tutors counts as unassigned', () => {
    expect(summariseScheduleReadiness([{ required_tutors: 2, active_count: '1', pending_count: '0' }]))
      .toEqual({ unassignedCount: 1, pendingCount: 0 });
  });
  test('LG-552: a tutor who has not answered counts as pending', () => {
    expect(summariseScheduleReadiness([{ required_tutors: 1, active_count: '1', pending_count: '1' }]))
      .toEqual({ unassignedCount: 0, pendingCount: 1 });
  });
  test('LG-553: fully staffed and confirmed sessions are ready to lock', () => {
    const r = summariseScheduleReadiness([
      { required_tutors: 1, active_count: 1, pending_count: 0 },
      { required_tutors: 2, active_count: 2, pending_count: 0 }
    ]);
    expect(r).toEqual({ unassignedCount: 0, pendingCount: 0 });
    expect(canLockSchedule(r.unassignedCount, r.pendingCount, false)).toBe(true);
  });
  test('LG-554: a missing required_tutors is treated as 1', () => {
    expect(summariseScheduleReadiness([{ required_tutors: null, active_count: 0, pending_count: 0 }]).unassignedCount).toBe(1);
  });
});

describe('bot keywordMatches', () => {
  test('LG-555: "dm" does not match inside "admin"', () => {
    expect(keywordMatches('how do i disable a user in admin?', 'dm')).toBe(false);
  });
  test('LG-556: a whole word still matches', () => {
    expect(keywordMatches('can i dm my tutor?', 'dm')).toBe(true);
  });
  test('LG-557: phrases and Chinese keywords still match', () => {
    expect(keywordMatches('where is user management', 'user management')).toBe(true);
    expect(keywordMatches('怎么禁用账号', '禁用')).toBe(true);
  });
  test('LG-558: an admin question no longer pulls in Messages', () => {
    expect(searchKnowledge('How do I disable a user in admin?', 'coordinator', 4).map(s => s.id)).not.toContain('uc_messages');
  });
});