const { api, seed, query } = require('./harness');

describe('API profile, messages, notifications, dashboards', () => {
  let ctx;
  beforeEach(async () => { ctx = await seed(); });
  const T = (key) => ctx.tokens[key];

  test('API-P01 profile updates tutor-only fields and password rules', async () => {
    const before = (await query('SELECT maximum_hours FROM users WHERE id = $1', [ctx.u.uc.id])).rows[0].maximum_hours;
    const ucUpdate = await api('put', '/profile', T('uc'), { firstName: 'Una', lastName: 'Coord', maximumHours: 1, phoneNumber: '0400000000' });
    expect(ucUpdate.status).toBe(200);
    expect(ucUpdate.body.firstName || ucUpdate.body.name).toBe('Una');
    const after = (await query('SELECT maximum_hours FROM users WHERE id = $1', [ctx.u.uc.id])).rows[0].maximum_hours;
    expect(Number(after)).toBe(Number(before));

    const tutorUpdate = await api('put', '/profile', T('tutor'), { maximumHours: 6, contractType: 'Casual', workExperience: 'labs' });
    expect(tutorUpdate.status).toBe(200);
    expect(Number((await query('SELECT maximum_hours FROM users WHERE id = $1', [ctx.u.tutor.id])).rows[0].maximum_hours)).toBe(6);

    expect((await api('put', '/profile/password', T('tutor'), { newPassword: 'abcdef' })).status).toBe(400);
    expect((await api('put', '/profile/password', T('tutor'), { currentPassword: 'wrong', newPassword: 'abcdef' })).status).toBe(401);
    expect((await api('put', '/profile/password', T('tutor'), { currentPassword: ctx.password, newPassword: 'abcdef' })).status).toBe(200);

    const prefs = await api('put', '/profile/notifications', T('tutor'), { notifySessionUpdates: false, notifyRequestUpdates: true });
    expect(prefs.status).toBe(200);
    expect((await api('get', '/profile', T('tutor'))).status).toBe(200);
    expect((await api('post', '/profile/avatar', T('tutor'))).status).toBe(400);
  });

  test('API-P02 an empty max-hours field keeps the stored value (it used to crash with 500)', async () => {
    await query('UPDATE users SET maximum_hours = 7 WHERE id = $1', [ctx.u.tutor.id]);
    expect((await api('put', '/profile', T('tutor'), { maximumHours: '' })).status).toBe(200);
    expect(Number((await query('SELECT maximum_hours FROM users WHERE id = $1', [ctx.u.tutor.id])).rows[0].maximum_hours)).toBe(7);
  });

  test('API-P03 a non-number max-hours is refused with 400', async () => {
    expect((await api('put', '/profile', T('tutor'), { maximumHours: 'lots' })).status).toBe(400);
  });

  test('direct and group messages enforce content and unit access', async () => {
    expect((await api('post', '/messages', T('tutor'), { recipientId: ctx.u.uc.id, content: '   ' })).status).toBe(400);
    const sent = await api('post', '/messages', T('tutor'), { recipientId: ctx.u.uc.id, content: 'hello' });
    expect(sent.status).toBe(201);
    const thread = await api('get', `/messages/thread/${ctx.u.tutor.id}`, T('uc'));
    expect(thread.body).toHaveLength(1);
    expect((await api('patch', `/messages/thread/${ctx.u.tutor.id}/read`, T('uc'))).status).toBe(200);

    expect((await api('get', `/messages/group/${ctx.unitA.id}`, T('outsider'))).status).toBe(403);
    expect((await api('post', `/messages/group/${ctx.unitA.id}`, T('tutor'), { content: '' })).status).toBe(400);
    expect((await api('post', `/messages/group/${ctx.unitA.id}`, T('tutor'), { content: 'group hi' })).status).toBe(201);
    expect((await api('get', `/messages/group/${ctx.unitA.id}`, T('uc'))).body).toHaveLength(1);
    expect((await api('patch', `/messages/group/${ctx.unitA.id}/read`, T('uc'))).status).toBe(200);
    expect((await api('get', '/messages/my-contacts', T('tutor'))).status).toBe(200);
    expect((await api('get', `/units/${ctx.unitA.id}/messages/contacts`, T('uc'))).status).toBe(200);
    expect((await api('get', `/units/${ctx.unitA.id}/messages/contacts`, T('outsider'))).status).toBe(403);
  });

  test('notifications are scoped to the logged-in user', async () => {
    const note = await query(
      `INSERT INTO notifications (user_id, notification_type, title, content, is_read)
       VALUES ($1, 'request_submitted', 'Hi', 'tutor@api.test sent this', FALSE) RETURNING id`,
      [ctx.u.uc.id]
    );
    const list = await api('get', '/notifications', T('uc'));
    expect(list.body.unreadCount).toBeGreaterThan(0);
    expect(list.body.notifications[0].content).not.toContain('tutor@api.test');
    expect((await api('patch', `/notifications/${note.rows[0].id}/read`, T('tutor'))).status).toBe(200);
    const stillUnread = await query('SELECT is_read FROM notifications WHERE id = $1', [note.rows[0].id]);
    expect(stillUnread.rows[0].is_read).toBe(false);
    expect((await api('patch', '/notifications/read-all', T('uc'))).status).toBe(200);
    expect((await api('get', '/notifications', T('uc'))).body.unreadCount).toBe(0);
  });

  test('dashboards load for the matching role', async () => {
    expect((await api('get', '/tutor/dashboard-summary', T('tutor'))).status).toBe(200);
    expect((await api('get', '/uc/dashboard-summary', T('uc'))).status).toBe(200);
    expect((await api('get', '/uc/dashboard-summary', T('tutor'))).status).toBe(403);
  });
});