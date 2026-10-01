const { api, seed, query } = require('./harness');

describe('API cover and availability', () => {
  let ctx;
  beforeEach(async () => { ctx = await seed(); });
  const T = (key) => ctx.tokens[key];

  test('availability can be submitted, then lock blocks a later submit', async () => {
    expect((await api('post', '/availability/submit', T('tutor'), {
      unitCode: 'API101', slots: { 'Monday-9:00am': 'preferred' }
    })).status).toBe(201);
    expect((await api('get', '/availability?unitCode=API101', T('uc'))).status).toBe(200);
    await api('patch', `/units/${ctx.unitA.id}/lock-availability`, T('uc'), {});
    expect((await api('post', '/availability/submit', T('tutor'), {
      unitCode: 'API101', slots: { 'Tuesday-10:00am': 'avoid' }
    })).status).toBe(409);
  });

  test('resubmitting availability replaces the previous slots', async () => {
    await api('post', '/availability/submit', T('tutor'), {
      unitCode: 'API101', slots: { 'Monday-9:00am': 'preferred' }
    });
    await api('post', '/availability/submit', T('tutor'), {
      unitCode: 'API101', slots: { 'Tuesday-10:00am': 'avoid' }
    });
    const rows = await query(
      'SELECT day, preference FROM availability WHERE tutor_id = $1 AND unit_id = $2',
      [ctx.u.tutor.id, ctx.unitA.id]
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].preference).toBe('avoid');
  });

  test('submitting availability does not enrol an outsider as a tutor', async () => {
    const res = await api('post', '/availability/submit', T('outsider'), {
      unitCode: 'API101', slots: { 'Monday-9:00am': 'preferred' }
    });
    expect(res.status).toBe(403);
    const member = await query(
      `SELECT 1 FROM unit_memberships WHERE unit_id = $1 AND user_id = $2 AND role IN ('tutor', 'super_tutor')`,
      [ctx.unitA.id, ctx.u.outsider.id]
    );
    expect(member.rows).toHaveLength(0);
  });

  test('the first eligible tutor claims a cover and a second claim is blocked', async () => {
    const broadcast = await api('post', '/uc/cover-requests', T('uc'), {
      sessionIds: [ctx.s.held], reason: 'away', startDate: '2026-10-07', endDate: '2026-10-07'
    });
    const id = broadcast.body.requests[0].id;
    expect((await api('post', `/cover-requests/${id}/claim`, T('other'))).status).toBe(200);
    expect((await api('post', `/cover-requests/${id}/claim`, T('super'))).status).toBe(409);
    const session = await query('SELECT assigned_tutor_id FROM sessions WHERE id = $1', [ctx.s.held]);
    expect(session.rows[0].assigned_tutor_id).toBe(ctx.u.other.id);
  });

  test('the original tutor cannot claim their own cover', async () => {
    const broadcast = await api('post', '/uc/cover-requests', T('uc'), {
      sessionIds: [ctx.s.held], startDate: '2026-10-07', endDate: '2026-10-07'
    });
    const id = broadcast.body.requests[0].id;
    expect((await api('post', `/cover-requests/${id}/claim`, T('tutor'))).status).toBe(400);
  });

  test('an API-assigned tutor cannot claim cover for that session', async () => {
    expect((await api('patch', `/units/${ctx.unitA.id}/sessions/${ctx.s.open}/assign`, T('uc'), { tutorId: ctx.u.other.id })).status).toBe(200);
    const broadcast = await api('post', '/uc/cover-requests', T('uc'), {
      sessionIds: [ctx.s.open], startDate: '2026-10-05', endDate: '2026-10-05'
    });
    const id = broadcast.body.requests[0].id;
    expect((await api('post', `/cover-requests/${id}/claim`, T('other'))).status).toBe(400);
    expect((await api('post', `/cover-requests/${id}/claim`, T('super'))).status).toBe(200);
  });

  test('only a super tutor can claim a lecture cover', async () => {
    const broadcast = await api('post', '/uc/cover-requests', T('uc'), {
      sessionIds: [ctx.s.lecture], startDate: '2026-10-09', endDate: '2026-10-09'
    });
    const id = broadcast.body.requests[0].id;
    expect((await api('post', `/cover-requests/${id}/claim`, T('tutor'))).status).toBe(403);
    expect((await api('post', `/cover-requests/${id}/claim`, T('super'))).status).toBe(200);
  });
});