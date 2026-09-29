// The database is replaced by a fake, so these tests never touch the shared database.
jest.mock('../../db', () => ({ query: jest.fn() }));
const pool = require('../../db');
const { createNotification, getUserDisplayName } = require('../../utils/notify');

beforeEach(() => pool.query.mockReset());

describe('createNotification', () => {
  const base = { userId: 'u1', title: 'T', content: 'C' };

  test('LG-128: user who turned off session updates gets no session notification', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ notify_session_updates: false }] });
    await createNotification({ ...base, type: 'session_assigned' });
    expect(pool.query).toHaveBeenCalledTimes(1); // only the settings check, no insert
  });
  test('LG-129: setting not stored (null) still creates the notification', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ notify_session_updates: null }] })
      .mockResolvedValueOnce({ rows: [] });
    await createNotification({ ...base, type: 'session_assigned', unitId: 'unit1' });
    expect(pool.query).toHaveBeenCalledTimes(2);
    expect(pool.query.mock.calls[1][1]).toEqual(['u1', 'session_assigned', 'T', 'C', 'unit1', null, null]);
  });
  test('LG-130: a database error does not break the action that sent it', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    pool.query.mockRejectedValueOnce(new Error('db down'));
    await expect(createNotification({ ...base, type: 'request_approved' })).resolves.toBeUndefined();
    spy.mockRestore();
  });
});

describe('getUserDisplayName', () => {
  test('LG-131: full name when first and last name exist', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ name: 'Alex', last_name: 'Lee', email: 'alex@x.com' }] });
    expect(await getUserDisplayName('u1')).toBe('Alex Lee');
  });
  test('LG-132: no name falls back to email', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ name: null, last_name: null, email: 'alex@x.com' }] });
    expect(await getUserDisplayName('u1')).toBe('alex@x.com');
  });
  test('LG-133: user not found gives "Someone"', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    expect(await getUserDisplayName('missing')).toBe('Someone');
  });
});
