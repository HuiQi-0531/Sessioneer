const { api, seed, query } = require('./harness');

describe('API change requests', () => {
  let ctx;
  beforeEach(async () => { ctx = await seed(); });
  const T = (key) => ctx.tokens[key];

  const submit = (token, body) => api('post', '/requests', token, {
    unitCode: 'API101',
    requestType: 'Session Swap',
    currentSession: 'WED 11:00-12:00|GP-P-101',
    preferredSwapTo: 'TUE 09:00-10:00|GP-P-101',
    currentSessionId: ctx.s.held,
    preferredSessionId: ctx.s.open2,
    reason: 'clash',
    priority: 'Normal',
    ...body
  });

  const putTutorOn = (sessionId, tutorId) => query(
    `INSERT INTO session_tutors (session_id, tutor_id, tutor_confirmed) VALUES ($1, $2, TRUE)
     ON CONFLICT (session_id, tutor_id) DO UPDATE SET tutor_confirmed = TRUE`,
    [sessionId, tutorId]
  );

  test('a tutor submits a request and an urgent one emails coordinators', async () => {
    const { sendEmail } = require('../../utils/email');
    sendEmail.mockClear();
    const normal = await submit(T('tutor'));
    expect(normal.status).toBe(201);
    expect(normal.body.status).toBe('Pending');

    const urgent = await submit(T('tutor'), { priority: 'Urgent', preferredSessionId: ctx.s.open });
    expect(urgent.status).toBe(201);
    expect(sendEmail).toHaveBeenCalled();

    const mine = await api('get', '/requests', T('tutor'));
    expect(mine.body[0].priority.toLowerCase()).toBe('urgent');
    const ucList = await api('get', '/uc/requests', T('uc'));
    expect(ucList.body.some(row => row.id === normal.body.id)).toBe(true);
    expect((await api('get', '/uc/requests', T('uc2'))).body.some(row => row.id === normal.body.id)).toBe(false);
  });

  test('the owner can edit and delete only their own request', async () => {
    const created = await submit(T('tutor'));
    expect((await api('patch', `/requests/${created.body.id}`, T('other'), { reason: 'nope' })).status).toBe(404);
    expect((await api('delete', `/requests/${created.body.id}`, T('other'))).status).toBe(404);

    const edited = await api('patch', `/requests/${created.body.id}`, T('tutor'), { reason: 'updated' });
    expect(edited.body.reason).toBe('updated');
    expect((await api('delete', `/requests/${created.body.id}`, T('tutor'))).status).toBe(200);
  });

  test('rejecting a suggestion sends the request back to Pending', async () => {
    const created = await submit(T('tutor'));
    await query(`UPDATE change_requests SET status = 'Suggested' WHERE id = $1`, [created.body.id]);
    const appeal = await api('patch', `/requests/${created.body.id}`, T('tutor'), { status: 'Rejected' });
    expect(appeal.status).toBe(200);
    expect(appeal.body.status).toBe('Pending');
  });

  test('approving a swap moves the tutor and blocks a full, overlapping, over-hours, or lecture target', async () => {
    const created = await submit(T('tutor'));
    const approved = await api('patch', `/uc/requests/${created.body.id}/review`, T('uc'), { status: 'Accepted', reviewNotes: 'ok' });
    expect(approved.status).toBe(200);
    const onNew = await query(
      `SELECT 1 FROM session_tutors WHERE session_id = $1 AND tutor_id = $2 AND tutor_confirmed IS DISTINCT FROM FALSE`,
      [ctx.s.open2, ctx.u.tutor.id]
    );
    const onOld = await query(
      `SELECT 1 FROM session_tutors WHERE session_id = $1 AND tutor_id = $2 AND tutor_confirmed IS DISTINCT FROM FALSE`,
      [ctx.s.held, ctx.u.tutor.id]
    );
    expect(onNew.rows).toHaveLength(1);
    expect(onOld.rows).toHaveLength(0);

    await query(`DELETE FROM session_tutors WHERE tutor_id = $1`, [ctx.u.tutor.id]);
    await putTutorOn(ctx.s.held, ctx.u.tutor.id);
    const full = await submit(T('tutor'), { preferredSessionId: ctx.s.open });
    await putTutorOn(ctx.s.open, ctx.u.other.id);
    expect((await api('patch', `/uc/requests/${full.body.id}/review`, T('uc'), { status: 'Accepted' })).status).toBe(409);

    await query(`DELETE FROM session_tutors WHERE tutor_id = $1`, [ctx.u.tutor.id]);
    await putTutorOn(ctx.s.long, ctx.u.tutor.id);
    await putTutorOn(ctx.s.open, ctx.u.tutor.id);
    const overlapReq = await submit(T('tutor'), { currentSessionId: ctx.s.long, preferredSessionId: ctx.s.overlap });
    expect((await api('patch', `/uc/requests/${overlapReq.body.id}/review`, T('uc'), { status: 'Accepted' })).status).toBe(409);

    await query(`DELETE FROM session_tutors WHERE tutor_id = $1`, [ctx.u.tutor.id]);
    await putTutorOn(ctx.s.held, ctx.u.tutor.id);
    const lecture = await submit(T('tutor'), { currentSessionId: ctx.s.held, preferredSessionId: ctx.s.lecture });
    expect((await api('patch', `/uc/requests/${lecture.body.id}/review`, T('uc'), { status: 'Accepted' })).status).toBe(409);
  });

  test('a session change only removes the tutor, and a locked unit cannot be approved', async () => {
    const change = await submit(T('tutor'), { requestType: 'Session Change', preferredSessionId: null });
    const reviewed = await api('patch', `/uc/requests/${change.body.id}/review`, T('uc'), { status: 'Accepted' });
    expect(reviewed.status).toBe(200);
    const stillThere = await query(
      `SELECT 1 FROM session_tutors WHERE session_id = $1 AND tutor_id = $2 AND tutor_confirmed IS DISTINCT FROM FALSE`,
      [ctx.s.held, ctx.u.tutor.id]
    );
    expect(stillThere.rows).toHaveLength(0);

    await query(
      `INSERT INTO session_tutors (session_id, tutor_id, tutor_confirmed) VALUES ($1, $2, TRUE)
       ON CONFLICT (session_id, tutor_id) DO UPDATE SET tutor_confirmed = TRUE`,
      [ctx.s.held, ctx.u.tutor.id]
    );
    const again = await submit(T('tutor'));
    await query('UPDATE units SET schedule_locked = TRUE WHERE id = $1', [ctx.unitA.id]);
    const locked = await api('patch', `/uc/requests/${again.body.id}/review`, T('uc'), { status: 'Accepted' });
    expect(locked.status).toBe(409);

    expect((await api('patch', `/uc/requests/${again.body.id}/review`, T('uc2'), { status: 'Rejected' })).status).toBe(404);
    await query('UPDATE units SET schedule_locked = FALSE WHERE id = $1', [ctx.unitA.id]);
    const rejected = await api('patch', `/uc/requests/${again.body.id}/review`, T('uc'), { status: 'Rejected', reviewNotes: 'no' });
    expect(rejected.status).toBe(200);
    expect(rejected.body.status).toBe('Rejected');
  });

  const { api, seed, query } = require('./harness');

describe('API change requests', () => {
  let ctx;
  beforeEach(async () => { ctx = await seed(); });
  const T = (key) => ctx.tokens[key];

  const submit = (token, body) => api('post', '/requests', token, {
    unitCode: 'API101',
    requestType: 'Session Swap',
    currentSession: 'WED 11:00-12:00|GP-P-101',
    preferredSwapTo: 'TUE 09:00-10:00|GP-P-101',
    currentSessionId: ctx.s.held,
    preferredSessionId: ctx.s.open2,
    reason: 'clash',
    priority: 'Normal',
    ...body
  });

  const putTutorOn = (sessionId, tutorId) => query(
    `INSERT INTO session_tutors (session_id, tutor_id, tutor_confirmed) VALUES ($1, $2, TRUE)
     ON CONFLICT (session_id, tutor_id) DO UPDATE SET tutor_confirmed = TRUE`,
    [sessionId, tutorId]
  );

  test('a tutor submits a request and an urgent one emails coordinators', async () => {
    const { sendEmail } = require('../../utils/email');
    sendEmail.mockClear();
    const normal = await submit(T('tutor'));
    expect(normal.status).toBe(201);
    expect(normal.body.status).toBe('Pending');

    const urgent = await submit(T('tutor'), { priority: 'Urgent', preferredSessionId: ctx.s.open });
    expect(urgent.status).toBe(201);
    expect(sendEmail).toHaveBeenCalled();

    const mine = await api('get', '/requests', T('tutor'));
    expect(mine.body[0].priority.toLowerCase()).toBe('urgent');
    const ucList = await api('get', '/uc/requests', T('uc'));
    expect(ucList.body.some(row => row.id === normal.body.id)).toBe(true);
    expect((await api('get', '/uc/requests', T('uc2'))).body.some(row => row.id === normal.body.id)).toBe(false);
  });

  test('the owner can edit and delete only their own request', async () => {
    const created = await submit(T('tutor'));
    expect((await api('patch', `/requests/${created.body.id}`, T('other'), { reason: 'nope' })).status).toBe(404);
    expect((await api('delete', `/requests/${created.body.id}`, T('other'))).status).toBe(404);

    const edited = await api('patch', `/requests/${created.body.id}`, T('tutor'), { reason: 'updated' });
    expect(edited.body.reason).toBe('updated');
    expect((await api('delete', `/requests/${created.body.id}`, T('tutor'))).status).toBe(200);
  });

  test('rejecting a suggestion sends the request back to Pending', async () => {
    const created = await submit(T('tutor'));
    await query(`UPDATE change_requests SET status = 'Suggested' WHERE id = $1`, [created.body.id]);
    const appeal = await api('patch', `/requests/${created.body.id}`, T('tutor'), { status: 'Rejected' });
    expect(appeal.status).toBe(200);
    expect(appeal.body.status).toBe('Pending');
  });

  test('a tutor cannot accept their own request', async () => {
    const created = await submit(T('tutor'));
    const self = await api('patch', `/requests/${created.body.id}`, T('tutor'), { status: 'Accepted' });
    expect(self.status).toBe(403);
    const held = await query(
      `SELECT 1 FROM session_tutors WHERE session_id = $1 AND tutor_id = $2 AND tutor_confirmed IS DISTINCT FROM FALSE`,
      [ctx.s.held, ctx.u.tutor.id]
    );
    expect(held.rows).toHaveLength(1);
    const status = await query('SELECT status FROM change_requests WHERE id = $1', [created.body.id]);
    expect(String(status.rows[0].status).toLowerCase()).toBe('pending');
  });

  test('submitting a request does not enrol an outsider as a tutor', async () => {
    const res = await submit(T('outsider'));
    expect(res.status).toBe(403);
    const member = await query(
      `SELECT 1 FROM unit_memberships WHERE unit_id = $1 AND user_id = $2 AND role IN ('tutor', 'super_tutor')`,
      [ctx.unitA.id, ctx.u.outsider.id]
    );
    expect(member.rows).toHaveLength(0);
  });

  test('approving a swap moves the tutor and blocks a full, overlapping, or lecture target', async () => {
    const created = await submit(T('tutor'));
    const approved = await api('patch', `/uc/requests/${created.body.id}/review`, T('uc'), { status: 'Accepted', reviewNotes: 'ok' });
    expect(approved.status).toBe(200);
    const onNew = await query(
      `SELECT 1 FROM session_tutors WHERE session_id = $1 AND tutor_id = $2 AND tutor_confirmed IS DISTINCT FROM FALSE`,
      [ctx.s.open2, ctx.u.tutor.id]
    );
    const onOld = await query(
      `SELECT 1 FROM session_tutors WHERE session_id = $1 AND tutor_id = $2 AND tutor_confirmed IS DISTINCT FROM FALSE`,
      [ctx.s.held, ctx.u.tutor.id]
    );
    expect(onNew.rows).toHaveLength(1);
    expect(onOld.rows).toHaveLength(0);

    await query(`DELETE FROM session_tutors WHERE tutor_id = $1`, [ctx.u.tutor.id]);
    await putTutorOn(ctx.s.held, ctx.u.tutor.id);
    const full = await submit(T('tutor'), { preferredSessionId: ctx.s.open });
    await putTutorOn(ctx.s.open, ctx.u.other.id);
    expect((await api('patch', `/uc/requests/${full.body.id}/review`, T('uc'), { status: 'Accepted' })).status).toBe(409);

    await query(`DELETE FROM session_tutors WHERE tutor_id = $1`, [ctx.u.tutor.id]);
    await putTutorOn(ctx.s.long, ctx.u.tutor.id);
    await putTutorOn(ctx.s.open, ctx.u.tutor.id);
    const overlapReq = await submit(T('tutor'), { currentSessionId: ctx.s.long, preferredSessionId: ctx.s.overlap });
    expect((await api('patch', `/uc/requests/${overlapReq.body.id}/review`, T('uc'), { status: 'Accepted' })).status).toBe(409);

    await query(`DELETE FROM session_tutors WHERE tutor_id = $1`, [ctx.u.tutor.id]);
    await putTutorOn(ctx.s.held, ctx.u.tutor.id);
    const lecture = await submit(T('tutor'), { currentSessionId: ctx.s.held, preferredSessionId: ctx.s.lecture });
    expect((await api('patch', `/uc/requests/${lecture.body.id}/review`, T('uc'), { status: 'Accepted' })).status).toBe(409);
  });

  test('a session change only removes the tutor, and a locked unit cannot be approved', async () => {
    const change = await submit(T('tutor'), { requestType: 'Session Change', preferredSessionId: null });
    const reviewed = await api('patch', `/uc/requests/${change.body.id}/review`, T('uc'), { status: 'Accepted' });
    expect(reviewed.status).toBe(200);
    const stillThere = await query(
      `SELECT 1 FROM session_tutors WHERE session_id = $1 AND tutor_id = $2 AND tutor_confirmed IS DISTINCT FROM FALSE`,
      [ctx.s.held, ctx.u.tutor.id]
    );
    expect(stillThere.rows).toHaveLength(0);

    await query(
      `INSERT INTO session_tutors (session_id, tutor_id, tutor_confirmed) VALUES ($1, $2, TRUE)
       ON CONFLICT (session_id, tutor_id) DO UPDATE SET tutor_confirmed = TRUE`,
      [ctx.s.held, ctx.u.tutor.id]
    );
    const again = await submit(T('tutor'));
    await query('UPDATE units SET schedule_locked = TRUE WHERE id = $1', [ctx.unitA.id]);
    const locked = await api('patch', `/uc/requests/${again.body.id}/review`, T('uc'), { status: 'Accepted' });
    expect(locked.status).toBe(409);

    expect((await api('patch', `/uc/requests/${again.body.id}/review`, T('uc2'), { status: 'Rejected' })).status).toBe(404);
    await query('UPDATE units SET schedule_locked = FALSE WHERE id = $1', [ctx.unitA.id]);
    const rejected = await api('patch', `/uc/requests/${again.body.id}/review`, T('uc'), { status: 'Rejected', reviewNotes: 'no' });
    expect(rejected.status).toBe(200);
    expect(rejected.body.status).toBe('Rejected');
  });
});
});