const { formatMessage, unitChatStatus } = require('../../utils/messageRules');
const { getSupabaseConfig, buildRequestBaseUrl, isAllowedAttachmentType, isAllowedAvatarType } = require('../../utils/uploadRules');
const { formatProfile, buildProfileUpdateParams } = require('../../utils/profileRules');

const ORIGINAL_ENV = { ...process.env };
afterEach(() => { process.env = { ...ORIGINAL_ENV }; });

describe('formatMessage', () => {
  test('LG-373: my own message is marked isMine', () => {
    expect(formatMessage({ id: 'm1', sender_id: 'me', content: 'Hi' }, 'me').isMine).toBe(true);
  });
  test('LG-374: someone else\'s message is not mine', () => {
    expect(formatMessage({ id: 'm1', sender_id: 'other', content: 'Hi' }, 'me').isMine).toBe(false);
  });
  test('LG-375: no attachment gives null attachment fields', () => {
    expect(formatMessage({ id: 'm1', sender_id: 'x' }, 'me')).toMatchObject({
      recipientId: null, attachmentUrl: null, attachmentName: null, attachmentType: null, attachmentSize: null
    });
  });
});

describe('unitChatStatus', () => {
  test('LG-693: day before Semester 2 starts is upcoming', () => {
    expect(unitChatStatus('Semester 2', 2026, '2026-06-30')).toBe('upcoming');
  });
  test('LG-694: first and last day of Semester 2 are current', () => {
    expect(unitChatStatus('Semester 2', 2026, '2026-07-01')).toBe('current');
    expect(unitChatStatus('Semester 2', 2026, '2026-12-31')).toBe('current');
  });
  test('LG-695: day after Semester 2 ends is past (read-only)', () => {
    expect(unitChatStatus('Semester 2', 2026, '2027-01-01')).toBe('past');
  });
  test('LG-696: Semester 1 is past from 1 July', () => {
    expect(unitChatStatus('Semester 1', 2026, '2026-06-30')).toBe('current');
    expect(unitChatStatus('Semester 1', 2026, '2026-07-01')).toBe('past');
  });
  test('LG-697: next year\'s unit is upcoming', () => {
    expect(unitChatStatus('Semester 2', 2027, '2026-10-14')).toBe('upcoming');
  });
  test('LG-698: missing semester or year is treated as current, never locked', () => {
    expect(unitChatStatus(null, 2026, '2026-10-14')).toBe('current');
    expect(unitChatStatus('Semester 2', null, '2026-10-14')).toBe('current');
  });
});

describe('getSupabaseConfig', () => {
  test('LG-376: both settings present', () => {
    process.env.SUPABASE_URL = 'https://abc.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'key';
    expect(getSupabaseConfig()).toEqual({ supabaseUrl: 'https://abc.supabase.co', serviceKey: 'key' });
  });
  test('LG-377: a missing setting means local storage is used (null)', () => {
    process.env.SUPABASE_URL = 'https://abc.supabase.co';
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(getSupabaseConfig()).toBeNull();
  });
  test('LG-378: a trailing "/" on the URL is removed', () => {
    process.env.SUPABASE_URL = 'https://abc.supabase.co/';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'key';
    expect(getSupabaseConfig().supabaseUrl).toBe('https://abc.supabase.co');
  });
});

describe('buildRequestBaseUrl', () => {
  const req = (headers, protocol = 'http') => ({ protocol, get: (h) => headers[h.toLowerCase()] });
  test('LG-379: uses x-forwarded-proto behind a proxy (Render)', () => {
    expect(buildRequestBaseUrl(req({ 'x-forwarded-proto': 'https', host: 'api.x.com' }))).toBe('https://api.x.com');
  });
  test('LG-380: a list "https,http" uses the first', () => {
    expect(buildRequestBaseUrl(req({ 'x-forwarded-proto': 'https,http', host: 'api.x.com' }))).toBe('https://api.x.com');
  });
  test('LG-381: no proxy header uses the request protocol', () => {
    expect(buildRequestBaseUrl(req({ host: 'localhost:5001' }))).toBe('http://localhost:5001');
  });
});

describe('upload file types', () => {
  test('LG-382: PDF attachment is allowed', () => { expect(isAllowedAttachmentType('application/pdf')).toBe(true); });
  test('LG-383: an .exe attachment is refused', () => { expect(isAllowedAttachmentType('application/x-msdownload')).toBe(false); });
  test('LG-384: PNG profile picture is allowed', () => { expect(isAllowedAvatarType('image/png')).toBe(true); });
  test('LG-385: PDF profile picture is refused', () => { expect(isAllowedAvatarType('application/pdf')).toBe(false); });
});

describe('formatProfile', () => {
  test('LG-386: maps the profile row', () => {
    expect(formatProfile({ id: 'u1', name: 'Alex', last_name: 'Lee', email: 'alex@x.com', maximum_hours: 12, notify_session_updates: false }))
      .toMatchObject({ displayName: 'Alex Lee', maximumHours: 12, notifySessionUpdates: false, avatarUrl: null });
  });
});

describe('buildProfileUpdateParams', () => {
  test('LG-387: tutor-only fields are only written for a tutor', () => {
    expect(buildProfileUpdateParams({ workExperience: '2 years' }, 'tutor', 'u1')[4]).toBe(true);
    expect(buildProfileUpdateParams({ workExperience: '2 years' }, 'coordinator', 'u1')[4]).toBe(false);
  });
  test('LG-388: sending an empty last name clears it', () => {
    const p = buildProfileUpdateParams({ firstName: 'Alex', lastName: '' }, 'tutor', 'u1');
    expect(p[1]).toBe(true);
    expect(p[2]).toBeNull();
  });
  test('LG-387b: a coordinator account who tutors in another unit can save tutor fields', () => {
    expect(buildProfileUpdateParams({ maximumHours: 60 }, 'coordinator', 'u1', { hasTutorMembership: true })[4]).toBe(true);
    expect(buildProfileUpdateParams({ maximumHours: 60 }, 'coordinator', 'u1', { hasTutorMembership: false })[4]).toBe(false);
  });
  test('LG-389: not sending a last name keeps the old one', () => {
    expect(buildProfileUpdateParams({ firstName: 'Alex' }, 'tutor', 'u1')[1]).toBe(false);
  });
  test('LG-390: empty max hours "" is saved as no value, not "" (LOGIC-B17)', () => {
    expect(buildProfileUpdateParams({ maximumHours: '' }, 'tutor', 'u1')[6]).toBeNull();
  });
});