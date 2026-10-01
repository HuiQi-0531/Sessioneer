const { api, seed, query, sessionBody, assigned } = require('./harness');

describe('API /units/:id/sessions', () => {
  let ctx;
  beforeEach(async () => { ctx = await seed(); });
  const T = (key) => ctx.tokens[key];
  const url = (path = '') => `/units/${ctx.unitA.id}/sessions${path}`;

  test('create validates fields, capacity, tutor count, and duplicate codes', async () => {
    expect((await api('post', url(), T('uc'), { day: 'Monday' })).status).toBe(400);
    expect((await api('post', url(), T('uc'), sessionBody({ capacity: 0 }))).status).toBe(400);
    expect((await api('post', url(), T('uc'), sessionBody({ requiredTutors: 0 }))).status).toBe(400);

    const duplicate = await api('post', url(), T('uc'), sessionBody({ sessionCode: 'tut01' }));
    expect(duplicate.status).toBe(409);

    const created = await api('post', url(), T('uc'), sessionBody({ day: 'Friday', sessionType: 'Workshop' }));
    expect(created.status).toBe(201);
    expect(created.body.sessionCode || created.body.session_code).toMatch(/^WOR/);
    expect((await api('post', `/units/${ctx.unitB.id}/sessions`, T('uc'), sessionBody())).status).toBe(404);
  });

  test('update rejects a taken code and a missing session', async () => {
    const clash = await api('put', url(`/${ctx.s.open2}`), T('uc'), { sessionCode: 'TUT01' });
    expect(clash.status).toBe(409);
    const renamed = await api('put', url(`/${ctx.s.open2}`), T('uc'), { sessionCode: 'tut99', location: 'Z-1' });
    expect(renamed.status).toBe(200);
    expect((await api('put', url('/00000000-0000-0000-0000-000000000000'), T('uc'), { location: 'Z' })).status).toBe(404);
  });

  test('delete is blocked by a lock or an active tutor, and allowed after a decline', async () => {
    expect((await api('delete', url(`/${ctx.s.held}`), T('uc'))).status).toBe(409);
    expect((await api('delete', url(`/${ctx.s.declined}`), T('uc'))).status).toBe(200);

    await query('UPDATE units SET schedule_locked = TRUE WHERE id = $1', [ctx.unitA.id]);
    expect((await api('delete', url(`/${ctx.s.open}`), T('uc'))).status).toBe(409);
    await query('UPDATE units SET schedule_locked = FALSE WHERE id = $1', [ctx.unitA.id]);
    expect((await api('delete', url(`/${ctx.s.open}`), T('uc'))).status).toBe(200);
  });

  test('import skips unreadable rows and refuses to replace a staffed timetable', async () => {
    expect((await api('post', url('/import'), T('uc'), { sessions: [] })).status).toBe(400);

    const mixed = await api('post', url('/import'), T('uc'), {
      sessions: [
        { day: 'not-a-day', startTime: '09:00', endTime: '10:00' },
        { day: 'Friday', startTime: '4pm', endTime: '5pm', location: 'A1', campus: 'GP', sessionType: 'Practical', capacity: 60, sessionCode: 'prc01' }
      ]
    });
    expect(mixed.status).toBe(201);
    expect(mixed.body.importedCount).toBe(1);
    expect(mixed.body.skippedCount).toBe(1);

    const replace = await api('post', url('/import'), T('uc'), {
      replace: true,
      sessions: [{ day: 'MON', startTime: '09:00', endTime: '10:00', sessionType: 'Tutorial', capacity: 30 }]
    });
    expect(replace.status).toBe(409);
  });

  test('assignment enforces capacity, role, overlap, hours, and lock', async () => {
    expect((await api('patch', url(`/${ctx.s.open}/assign`), T('uc'), {})).status).toBe(400);
    expect((await api('patch', url(`/${ctx.s.held}/assign`), T('uc'), { tutorId: ctx.u.other.id })).status).toBe(409);
    expect((await api('patch', url(`/${ctx.s.lecture}/assign`), T('uc'), { tutorId: ctx.u.tutor.id })).status).toBe(409);

    const superOk = await api('patch', url(`/${ctx.s.lecture}/assign`), T('uc'), { tutorId: ctx.u.super.id });
    expect(superOk.status).toBe(200);
    expect(await assigned(ctx.s.lecture, ctx.u.super.id)).toBe(true);

    const self = await api('patch', url(`/${ctx.s.open2}/assign`), T('uc'), { tutorId: ctx.u.uc.id });
    expect(self.status).toBe(200);

    const first = await api('patch', url(`/${ctx.s.open}/assign`), T('uc'), { tutorId: ctx.u.tutor.id });
    expect(first.status).toBe(200);
    expect(first.body.isAssigned).toBe(true);
    const stored = await query('SELECT is_assigned, assigned_tutor_id FROM sessions WHERE id = $1', [ctx.s.open]);
    expect(stored.rows[0].is_assigned).toBe(true);
    expect(stored.rows[0].assigned_tutor_id).toBe(ctx.u.tutor.id);
    expect((await api('patch', url(`/${ctx.s.open}/assign`), T('uc'), { tutorId: ctx.u.tutor.id })).status).toBe(409);
    expect((await api('patch', url(`/${ctx.s.overlap}/assign`), T('uc'), { tutorId: ctx.u.tutor.id })).status).toBe(409);

    await query(
      'DELETE FROM session_tutors WHERE tutor_id = $1 AND session_id IN ($2, $3)',
      [ctx.u.tutor.id, ctx.s.open, ctx.s.held]
    );
    const tooLong = await api('patch', url(`/${ctx.s.long}/assign`), T('uc'), { tutorId: ctx.u.tutor.id });
    expect(tooLong.status).toBe(200);
    const overHours = await api('patch', url(`/${ctx.s.open}/assign`), T('uc'), { tutorId: ctx.u.tutor.id });
    expect(overHours.status).toBe(409);
    expect(overHours.body.error).toMatch(/max hours/i);

    await query('UPDATE units SET schedule_locked = TRUE WHERE id = $1', [ctx.unitA.id]);
    expect((await api('patch', url(`/${ctx.s.open2}/assign`), T('uc'), { tutorId: ctx.u.other.id })).status).toBe(409);
  });

  test('unassign and confirm update the assignment and notify rules', async () => {
    expect((await api('delete', url(`/${ctx.s.held}/assign/${ctx.u.tutor.id}`), T('uc'))).status).toBe(200);
    expect(await assigned(ctx.s.held, ctx.u.tutor.id)).toBe(false);
    const cleared = await query('SELECT is_assigned, assigned_tutor_id FROM sessions WHERE id = $1', [ctx.s.held]);
    expect(cleared.rows[0].is_assigned).toBe(false);
    expect(cleared.rows[0].assigned_tutor_id).toBeNull();

    await api('patch', url(`/${ctx.s.open}/assign`), T('uc'), { tutorId: ctx.u.other.id });
    const noReason = await api('patch', url(`/${ctx.s.open}/confirm`), T('other'), { confirmed: false });
    expect(noReason.status).toBe(400);
    const declined = await api('patch', url(`/${ctx.s.open}/confirm`), T('other'), { confirmed: false, reason: '  clash  ' });
    expect(declined.status).toBe(200);

    await api('patch', url(`/${ctx.s.open2}/assign`), T('uc'), { tutorId: ctx.u.other.id });
    const accepted = await api('patch', url(`/${ctx.s.open2}/confirm`), T('other'), { confirmed: true });
    expect(accepted.status).toBe(200);
    const confirmed = await query('SELECT tutor_confirmed FROM sessions WHERE id = $1', [ctx.s.open2]);
    expect(confirmed.rows[0].tutor_confirmed).toBe(true);
    expect((await api('patch', url(`/${ctx.s.open2}/confirm`), T('tutor'), { confirmed: true })).status).toBe(404);

    await query('UPDATE units SET schedule_locked = TRUE WHERE id = $1', [ctx.unitA.id]);
    expect((await api('patch', url(`/${ctx.s.open2}/confirm`), T('other'), { confirmed: false, reason: 'late' })).status).toBe(409);
  });

  test('linked tutors can read sessions and candidates exist for the coordinator', async () => {
    expect((await api('get', url(), T('outsider'))).status).toBe(403);
    expect((await api('get', url(), T('tutor'))).status).toBe(200);
    const candidates = await api('get', url(`/${ctx.s.lecture}/candidates`), T('uc'));
    expect(candidates.status).toBe(200);
    expect((await api('get', '/units/my-assigned-unused', T('tutor'))).status).toBe(403);
    expect((await api('get', url('/my-assigned'), T('tutor'))).status).toBe(200);
  });
});