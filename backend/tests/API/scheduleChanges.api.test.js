// Tutors are told when their session changes (day, time, location) or when
// they are removed from it, from the UC pages and the Admin pages alike.
const { api, query, defineApiCases } = require('./harness');
const { sendEmail } = require('../../utils/email');
const { brisbaneParts } = require('../../utils/brisbaneTime');

const notices = async (userId) =>
  (await query(
    `SELECT notification_type, title, content FROM notifications
     WHERE user_id = $1 AND notification_type IN ('session_updated', 'session_removed')
     ORDER BY created_at`,
    [userId]
  )).rows;

// Weekday code `days` days from now, in Brisbane.
const weekdayIn = (days) => brisbaneParts(new Date(Date.now() + days * 24 * 60 * 60 * 1000)).weekday;

const ucEdit = (ctx, sessionId, body) =>
  api('put', `/units/${ctx.unitA.id}/sessions/${sessionId}`, ctx.tokens.uc, body);

const adminEditBody = (ctx, overrides = {}) => ({
  unitId: ctx.unitA.id, day: 'WED', startTime: '11:00', endTime: '12:00', location: 'GP-P-101',
  campus: 'GP', sessionType: 'Tutorial', capacity: 30, requiredTutors: 1, status: 'Confirmed', ...overrides
});

defineApiCases('API schedule change notices', (add) => {
  add('moving a session tells its (pending) tutor what changed', async (ctx) => {
    const res = await ucEdit(ctx, ctx.s.held, { day: 'THU', startTime: '14:00', endTime: '16:00' });
    expect(res.status).toBe(200);
    const rows = await notices(ctx.u.tutor.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      notification_type: 'session_updated',
      title: 'API101 TUT03 has changed',
      content: 'TUT03 moved from Wed 11:00–12:00 to Thu 14:00–16:00.'
    });
  });

  add('changing the location is described', async (ctx) => {
    await ucEdit(ctx, ctx.s.held, { location: 'GP-Z-410' });
    expect((await notices(ctx.u.tutor.id))[0].content).toBe('Location changed from GP-P-101 to GP-Z-410.');
  });

  add('changing only capacity sends nothing', async (ctx) => {
    sendEmail.mockClear();
    const res = await ucEdit(ctx, ctx.s.held, { capacity: 45 });
    expect(res.status).toBe(200);
    expect(await notices(ctx.u.tutor.id)).toHaveLength(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  add('a tutor who declined the session is not told about edits', async (ctx) => {
    await ucEdit(ctx, ctx.s.declined, { location: 'GP-Z-410' });
    expect(await notices(ctx.u.tutor.id)).toHaveLength(0);
  });

  add('a tutor with session notifications off gets nothing', async (ctx) => {
    await query('UPDATE users SET notify_session_updates = FALSE WHERE id = $1', [ctx.u.tutor.id]);
    await ucEdit(ctx, ctx.s.held, { location: 'GP-Z-410' });
    expect(await notices(ctx.u.tutor.id)).toHaveLength(0);
  });

  add('a change to a class in the next 48 hours is also emailed', async (ctx) => {
    sendEmail.mockClear();
    await ucEdit(ctx, ctx.s.held, { day: weekdayIn(1), startTime: '12:00', endTime: '13:00' });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].subject).toBe('API101 TUT03 has changed');
  });

  add('a change to a class more than 48 hours away is not emailed', async (ctx) => {
    await query("UPDATE sessions SET day = $2, start_time = '12:00', end_time = '13:00' WHERE id = $1", [ctx.s.held, weekdayIn(4)]);
    sendEmail.mockClear();
    await ucEdit(ctx, ctx.s.held, { day: weekdayIn(5) });
    expect(await notices(ctx.u.tutor.id)).toHaveLength(1);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  add('removing a tutor tells that tutor', async (ctx) => {
    const res = await api('delete', `/units/${ctx.unitA.id}/sessions/${ctx.s.held}/assign/${ctx.u.tutor.id}`, ctx.tokens.uc);
    expect(res.status).toBe(200);
    const rows = await notices(ctx.u.tutor.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      notification_type: 'session_removed',
      content: 'You have been removed from API101 TUT03 (Wed 11:00–12:00).'
    });
  });

  add('clearing out a declined assignment sends nothing', async (ctx) => {
    await api('delete', `/units/${ctx.unitA.id}/sessions/${ctx.s.declined}/assign/${ctx.u.tutor.id}`, ctx.tokens.uc);
    expect(await notices(ctx.u.tutor.id)).toHaveLength(0);
  });

  add('admin editing a session notifies its tutor the same way', async (ctx) => {
    const res = await api('put', `/admin/sessions/${ctx.s.held}`, ctx.tokens.admin, adminEditBody(ctx, { location: 'GP-Z-410' }));
    expect(res.status).toBe(200);
    expect((await notices(ctx.u.tutor.id))[0].content).toBe('Location changed from GP-P-101 to GP-Z-410.');
  });

  add('admin changing only capacity sends nothing', async (ctx) => {
    const res = await api('put', `/admin/sessions/${ctx.s.held}`, ctx.tokens.admin, adminEditBody(ctx, { capacity: 50 }));
    expect(res.status).toBe(200);
    expect(await notices(ctx.u.tutor.id)).toHaveLength(0);
  });

  add('admin removing a tutor notifies that tutor', async (ctx) => {
    const res = await api('delete', `/admin/sessions/${ctx.s.held}/assignments/${ctx.u.tutor.id}`, ctx.tokens.admin);
    expect(res.status).toBe(200);
    expect((await notices(ctx.u.tutor.id))[0].notification_type).toBe('session_removed');
  });
});
