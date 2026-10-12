// Invite and decline rules for tutor applications, shared by the coordinator
// and admin pages. The database is replaced by a fake, so no real data is used.
jest.mock('../../db', () => ({ query: jest.fn(), connect: jest.fn() }));
const pool = require('../../db');
const { inviteApplication, declineApplication } = require('../../utils/applicationActions');

const APP = { id: 'app-1', unit_id: 'unit-1', email: 'alex@x.com', status: 'pending' };

// Answers each query by what it looks for. Anything not listed returns no rows.
const setDb = ({ application = APP, user = null, isCoordinator = false, held = [], updateRows } = {}) => {
  const calls = [];
  pool.query.mockImplementation(async (sql, params) => {
    calls.push({ sql, params });
    if (/FROM tutor_applications WHERE id = \$1/.test(sql)) {
      const sameUnit = !params[1] || (application && application.unit_id === params[1]);
      return { rows: application && sameUnit ? [application] : [] };
    }
    if (/FROM users WHERE LOWER\(email\)/.test(sql)) return { rows: user ? [user] : [] };
    if (/LEFT JOIN unit_memberships/.test(sql)) return { rows: isCoordinator ? [{ id: 'unit-1' }] : [] };
    if (/FROM session_tutors st/.test(sql)) return { rows: held };
    if (/UPDATE tutor_applications/.test(sql)) {
      return { rows: updateRows !== undefined ? updateRows : [{ ...application, status: 'invited', invite_token: params[1] }] };
    }
    return { rows: [] };
  });
  return calls;
};

// Fake connection for the "existing account" path, which runs in a transaction.
const setClient = ({ updateRows = [{ ...APP, status: 'accepted' }] } = {}) => {
  const client = {
    calls: [],
    query: jest.fn(async (sql) => {
      client.calls.push(sql.trim());
      if (/UPDATE tutor_applications/.test(sql)) return { rows: updateRows };
      if (/SELECT unit_code FROM units/.test(sql)) return { rows: [{ unit_code: 'CAB201' }] };
      return { rows: [] };
    }),
    release: jest.fn()
  };
  pool.connect.mockResolvedValue(client);
  return client;
};

const updates = (calls) => calls.filter(c => /UPDATE tutor_applications/.test(c.sql));

beforeEach(() => jest.clearAllMocks());

describe('inviteApplication', () => {
  beforeAll(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-01T12:00:00Z')); });
  afterAll(() => jest.useRealTimers());

  test('LG-681: a new applicant gets an invite link that lasts 7 days', async () => {
    const calls = setDb();
    const result = await inviteApplication({ applicationId: 'app-1', role: 'tutor', invitedById: 'uc-1' });
    expect(result.status).toBe('invited');
    expect(result.inviteToken).toMatch(/^[0-9a-f]{64}$/);
    const [update] = updates(calls);
    expect(update.params[2].toISOString()).toBe('2026-10-08T12:00:00.000Z');
    expect(update.sql).toMatch(/AND status = 'pending'/);
  });

  test('LG-682: an application that is no longer pending is refused and not changed', async () => {
    const calls = setDb({ application: { ...APP, status: 'rejected' } });
    await expect(inviteApplication({ applicationId: 'app-1', role: 'tutor', invitedById: 'uc-1' }))
      .rejects.toMatchObject({ status: 409 });
    expect(updates(calls)).toHaveLength(0);
  });

  test('LG-683: a coordinator cannot act on an application for another unit', async () => {
    setDb();
    await expect(inviteApplication({ applicationId: 'app-1', unitId: 'unit-2', role: 'tutor', invitedById: 'uc-1' }))
      .rejects.toMatchObject({ status: 404, message: 'Application not found' });
  });

  test('LG-684: an administrator email cannot be added as a tutor', async () => {
    setDb({ user: { id: 'admin-1', role: 'admin' } });
    await expect(inviteApplication({ applicationId: 'app-1', role: 'tutor', invitedById: 'uc-1' }))
      .rejects.toMatchObject({ status: 409 });
    expect(pool.connect).not.toHaveBeenCalled();
  });

  test('LG-685: someone who is already a coordinator of the unit is refused', async () => {
    setDb({ user: { id: 'user-1', role: 'coordinator' }, isCoordinator: true });
    await expect(inviteApplication({ applicationId: 'app-1', role: 'tutor', invitedById: 'uc-1' }))
      .rejects.toMatchObject({ status: 409, message: 'This person is already a coordinator of this unit.' });
  });

  test('LG-686: a Super Tutor who still teaches a Lecture cannot be added back as a Tutor', async () => {
    setDb({ user: { id: 'user-1', role: 'tutor' }, held: [{ session_code: 'LEC01', session_type: 'Lecture' }] });
    await expect(inviteApplication({ applicationId: 'app-1', role: 'tutor', invitedById: 'uc-1' }))
      .rejects.toMatchObject({ status: 409, message: expect.stringContaining('LEC01') });
    expect(pool.connect).not.toHaveBeenCalled();
  });

  test('LG-687: an existing account is added to the unit straight away, in one transaction', async () => {
    setDb({ user: { id: 'user-1', role: 'tutor' } });
    const client = setClient();
    const result = await inviteApplication({ applicationId: 'app-1', role: 'super_tutor', invitedById: 'uc-1' });
    expect(result.addedExistingUser).toBe(true);
    expect(result.inviteToken).toBeNull();
    expect(client.calls[0]).toBe('BEGIN');
    expect(client.calls).toContainEqual(expect.stringMatching(/INSERT INTO unit_memberships/));
    expect(client.calls).toContainEqual(expect.stringMatching(/INSERT INTO notifications/));
    expect(client.calls[client.calls.length - 1]).toBe('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  test('LG-688: if the application changed while adding an existing account, nothing is saved', async () => {
    setDb({ user: { id: 'user-1', role: 'tutor' } });
    const client = setClient({ updateRows: [] });
    await expect(inviteApplication({ applicationId: 'app-1', role: 'tutor', invitedById: 'uc-1' }))
      .rejects.toMatchObject({ status: 409 });
    expect(client.calls).toContain('ROLLBACK');
    expect(client.calls).not.toContainEqual(expect.stringMatching(/INSERT INTO unit_memberships/));
    expect(client.release).toHaveBeenCalled();
  });

  test('LG-689: if someone else invited the applicant first, the second invite is refused', async () => {
    setDb({ updateRows: [] });
    await expect(inviteApplication({ applicationId: 'app-1', role: 'tutor', invitedById: 'uc-1' }))
      .rejects.toMatchObject({ status: 409 });
  });
});

describe('declineApplication', () => {
  test('LG-690: a note longer than 500 characters is refused before any query', async () => {
    setDb();
    await expect(declineApplication({ applicationId: 'app-1', note: 'x'.repeat(501) }))
      .rejects.toMatchObject({ status: 400 });
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('LG-691: the note is trimmed, and an empty note is saved as no value', async () => {
    let calls = setDb({ updateRows: [{ ...APP, status: 'rejected' }] });
    await declineApplication({ applicationId: 'app-1', note: '  Not enough hours  ' });
    expect(updates(calls)[0].params[0]).toBe('Not enough hours');

    calls = setDb({ updateRows: [{ ...APP, status: 'rejected' }] });
    await declineApplication({ applicationId: 'app-1', note: '   ' });
    expect(updates(calls)[0].params[0]).toBeNull();
  });

  test('LG-692: an application that is no longer pending cannot be declined', async () => {
    setDb({ updateRows: [] });
    await expect(declineApplication({ applicationId: 'app-1', note: '' }))
      .rejects.toMatchObject({ status: 409 });
  });
});