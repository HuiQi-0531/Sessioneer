// API: swap / change requests (tutor, coordinator and admin review).
// Approval checks look at session_tutors afterwards: the tutor must be on
// the new session, off the old one, and moved exactly once.
const { api, query, defineApiCases } = require('./harness');

const submit = (ctx, token, body = {}) => api('post', '/requests', token, {
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
const onSession = async (sessionId, tutorId) => (await query(
  `SELECT 1 FROM session_tutors WHERE session_id = $1 AND tutor_id = $2 AND tutor_confirmed IS DISTINCT FROM FALSE`,
  [sessionId, tutorId]
)).rows.length === 1;
const putTutorOn = (sessionId, tutorId) => query(
  `INSERT INTO session_tutors (session_id, tutor_id, tutor_confirmed) VALUES ($1, $2, TRUE)
   ON CONFLICT (session_id, tutor_id) DO UPDATE SET tutor_confirmed = TRUE`,
  [sessionId, tutorId]
);
const review = (ctx, id, status, reviewNotes, token = ctx.tokens.uc) =>
  api('patch', `/uc/requests/${id}/review`, token, { status, reviewNotes });

defineApiCases('API requests: submitting and editing', (add) => {
  add('API-R01 a tutor submits a request; it starts as Pending', async (ctx) => {
    const res = await submit(ctx, ctx.tokens.tutor);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('Pending');
    expect(res.body.unitCode).toBe('API101');
  });
  add('API-R02 a request needs a reason', async (ctx) => {
    expect((await submit(ctx, ctx.tokens.tutor, { reason: '  ' })).status).toBe(400);
  });
  add('API-R03 an urgent request emails the coordinators and sorts first', async (ctx) => {
    const { sendEmail } = require('../../utils/email');
    sendEmail.mockClear();
    await submit(ctx, ctx.tokens.tutor);
    // A second open request must be about a different session (one per session),
    // so give the tutor a second session for the urgent one.
    await putTutorOn(ctx.s.long, ctx.u.tutor.id);
    const urgent = await submit(ctx, ctx.tokens.tutor, {
      priority: 'urgent', currentSessionId: ctx.s.long, currentSession: 'MON 13:00-15:00|GP-P-101'
    });
    expect(urgent.status).toBe(201);
    expect(sendEmail).toHaveBeenCalled();
    const mine = (await api('get', '/requests', ctx.tokens.tutor)).body;
    expect(mine[0].priority).toBe('Urgent');
  });
  add('API-R04 an unknown priority is stored as Normal', async (ctx) => {
    const res = await submit(ctx, ctx.tokens.tutor, { priority: 'SUPER-URGENT!!' });
    expect(res.body.priority).toBe('Normal');
  });
  add('API-R05 the coordinator of the unit sees it, another coordinator does not', async (ctx) => {
    const res = await submit(ctx, ctx.tokens.tutor);
    expect((await api('get', '/uc/requests', ctx.tokens.uc)).body.some(r => r.id === res.body.id)).toBe(true);
    expect((await api('get', '/uc/requests', ctx.tokens.uc2)).body.some(r => r.id === res.body.id)).toBe(false);
  });
  add('API-R06 an outsider cannot submit and is not enrolled', async (ctx) => {
    expect((await submit(ctx, ctx.tokens.outsider)).status).toBe(403);
    expect((await query('SELECT 1 FROM unit_memberships WHERE user_id = $1', [ctx.u.outsider.id])).rows).toHaveLength(0);
  });
  add('API-R07 only the owner can edit or delete a request', async (ctx) => {
    const res = await submit(ctx, ctx.tokens.tutor);
    expect((await api('patch', `/requests/${res.body.id}`, ctx.tokens.other, { reason: 'nope' })).status).toBe(404);
    expect((await api('delete', `/requests/${res.body.id}`, ctx.tokens.other)).status).toBe(404);
    expect((await api('patch', `/requests/${res.body.id}`, ctx.tokens.tutor, { reason: 'updated' })).body.reason).toBe('updated');
    expect((await api('delete', `/requests/${res.body.id}`, ctx.tokens.tutor)).status).toBe(200);
  });
  add('API-R08 a tutor cannot approve their own request', async (ctx) => {
    const res = await submit(ctx, ctx.tokens.tutor);
    expect((await api('patch', `/requests/${res.body.id}`, ctx.tokens.tutor, { status: 'accepted' })).status).toBe(403);
    expect(await onSession(ctx.s.open2, ctx.u.tutor.id)).toBe(false);
  });
  add('API-R09 a tutor cannot invent a status', async (ctx) => {
    const res = await submit(ctx, ctx.tokens.tutor);
    expect((await api('patch', `/requests/${res.body.id}`, ctx.tokens.tutor, { status: 'Approved' })).status).toBe(400);
  });
  add('API-R10 a tutor cannot change the coordinator\'s review notes', async (ctx) => {
    const res = await submit(ctx, ctx.tokens.tutor);
    await query(`UPDATE change_requests SET status = 'Suggested', review_notes = 'x::TUE 09:00-10:00|GP-P-101' WHERE id = $1`, [res.body.id]);
    await api('patch', `/requests/${res.body.id}`, ctx.tokens.tutor, { reviewNotes: 'x::FRI 12:00-14:00|GP-P-101' });
    expect((await query('SELECT review_notes FROM change_requests WHERE id = $1', [res.body.id])).rows[0].review_notes)
      .toBe('x::TUE 09:00-10:00|GP-P-101');
  });
  add('API-R11 rejecting a suggestion sends it back to Pending without an "appeal" notice', async (ctx) => {
    const res = await submit(ctx, ctx.tokens.tutor);
    await query(`UPDATE change_requests SET status = 'Suggested' WHERE id = $1`, [res.body.id]);
    const back = await api('patch', `/requests/${res.body.id}`, ctx.tokens.tutor, { status: 'Rejected' });
    expect(back.body.status).toBe('Pending');
    const notes = (await api('get', '/notifications', ctx.tokens.uc)).body.notifications;
    expect(notes.some(n => n.type === 'request_appealed')).toBe(false);
  });
  add('API-R12 appealing a rejected request notifies the coordinator', async (ctx) => {
    const res = await submit(ctx, ctx.tokens.tutor);
    await query(`UPDATE change_requests SET status = 'Rejected' WHERE id = $1`, [res.body.id]);
    expect((await api('patch', `/requests/${res.body.id}`, ctx.tokens.tutor, { status: 'Pending', reason: 'please' })).status).toBe(200);
    const notes = (await api('get', '/notifications', ctx.tokens.uc)).body.notifications;
    expect(notes.some(n => n.type === 'request_appealed')).toBe(true);
  });
});

defineApiCases('API requests: coordinator review moves the tutor', (add) => {
  add('API-R13 approving a swap moves the tutor in session_tutors', async (ctx) => {
    const res = await submit(ctx, ctx.tokens.tutor);
    expect((await review(ctx, res.body.id, 'accepted', 'ok')).status).toBe(200);
    expect(await onSession(ctx.s.open2, ctx.u.tutor.id)).toBe(true);
    expect(await onSession(ctx.s.held, ctx.u.tutor.id)).toBe(false);
  });
  add('API-R14 the timetable shows the tutor on the new session', async (ctx) => {
    const res = await submit(ctx, ctx.tokens.tutor);
    await review(ctx, res.body.id, 'accepted');
    const list = (await api('get', `/units/${ctx.unitA.id}/sessions`, ctx.tokens.uc)).body;
    expect(list.find(s => s.id === ctx.s.open2).tutors.map(t => t.tutorId)).toEqual([ctx.u.tutor.id]);
    expect(list.find(s => s.id === ctx.s.held).tutors).toEqual([]);
  });
  add('API-R15 approving the same request twice does not move the tutor again', async (ctx) => {
    const res = await submit(ctx, ctx.tokens.tutor);
    await review(ctx, res.body.id, 'accepted');
    const again = await review(ctx, res.body.id, 'accepted');
    expect(again.status).toBe(200);
    expect(await onSession(ctx.s.open2, ctx.u.tutor.id)).toBe(true);
  });
  add('API-R16 a full target session is refused and nothing moves', async (ctx) => {
    await putTutorOn(ctx.s.open2, ctx.u.other.id);
    const res = await submit(ctx, ctx.tokens.tutor);
    expect((await review(ctx, res.body.id, 'accepted')).status).toBe(409);
    expect(await onSession(ctx.s.held, ctx.u.tutor.id)).toBe(true);
  });
  add('API-R17 an overlapping target is refused', async (ctx) => {
    await query('DELETE FROM session_tutors WHERE tutor_id = $1', [ctx.u.tutor.id]);
    await query('UPDATE users SET maximum_hours = 10 WHERE id = $1', [ctx.u.tutor.id]);
    await putTutorOn(ctx.s.long, ctx.u.tutor.id);
    await putTutorOn(ctx.s.open, ctx.u.tutor.id);
    const res = await submit(ctx, ctx.tokens.tutor, { currentSessionId: ctx.s.long, preferredSessionId: ctx.s.overlap });
    expect((await review(ctx, res.body.id, 'accepted')).status).toBe(409);
  });
  add('API-R18 a Lecture target needs a Super Tutor', async (ctx) => {
    await query("UPDATE sessions SET session_type = 'Lecture' WHERE id = $1", [ctx.s.held]);
    const res = await submit(ctx, ctx.tokens.tutor, { preferredSessionId: ctx.s.lecture });
    expect(res.status).toBe(201);
    expect((await review(ctx, res.body.id, 'accepted')).status).toBe(409);
  });
  add('API-R19 a "Session Change" only removes the tutor', async (ctx) => {
    const res = await submit(ctx, ctx.tokens.tutor, { requestType: 'Session Change', preferredSessionId: null });
    expect((await review(ctx, res.body.id, 'accepted')).status).toBe(200);
    expect(await onSession(ctx.s.held, ctx.u.tutor.id)).toBe(false);
  });
  add('API-R20 a locked unit cannot approve a swap', async (ctx) => {
    const res = await submit(ctx, ctx.tokens.tutor);
    await query('UPDATE units SET schedule_locked = TRUE WHERE id = $1', [ctx.unitA.id]);
    expect((await review(ctx, res.body.id, 'accepted')).status).toBe(409);
  });
  add('API-R21 another coordinator cannot review it', async (ctx) => {
    const res = await submit(ctx, ctx.tokens.tutor);
    expect((await review(ctx, res.body.id, 'rejected', 'no', ctx.tokens.uc2)).status).toBe(404);
  });
  add('API-R22 an unknown review status is 400', async (ctx) => {
    const res = await submit(ctx, ctx.tokens.tutor);
    expect((await review(ctx, res.body.id, 'Maybe')).status).toBe(400);
  });
  add('API-R23 suggest, then the tutor accepts: they move to the suggested session', async (ctx) => {
    const res = await submit(ctx, ctx.tokens.tutor, { preferredSessionId: null, preferredSwapTo: null });
    const suggested = await review(ctx, res.body.id, 'suggested', `${ctx.s.open2}::TUE 09:00-10:00|GP-P-101`);
    expect(suggested.status).toBe(200);
    expect((await api('patch', `/requests/${res.body.id}`, ctx.tokens.tutor, { status: 'accepted' })).status).toBe(200);
    expect(await onSession(ctx.s.open2, ctx.u.tutor.id)).toBe(true);
    expect(await onSession(ctx.s.held, ctx.u.tutor.id)).toBe(false);
  });
});

defineApiCases('API requests: bug 8 (UC suggest -> tutor accept)', (add) => {
  const confirmedOn = async (sessionId, tutorId) => (await query(
    'SELECT tutor_confirmed FROM session_tutors WHERE session_id = $1 AND tutor_id = $2',
    [sessionId, tutorId]
  )).rows[0]?.tutor_confirmed;

  add('BUG-8i the label the old UC page sent ("09:00:00", no |) is matched and accept works', async (ctx) => {
    const res = await submit(ctx, ctx.tokens.tutor, { preferredSessionId: null, preferredSwapTo: null });
    const suggested = await review(ctx, res.body.id, 'suggested', 'TUE 09:00:00 - 10:00:00 GP-P-101');
    expect(suggested.status).toBe(200);
    const accept = await api('patch', `/requests/${res.body.id}`, ctx.tokens.tutor, { status: 'accepted' });
    expect(accept.status).toBe(200);
    expect(await onSession(ctx.s.open2, ctx.u.tutor.id)).toBe(true);
    expect(await onSession(ctx.s.held, ctx.u.tutor.id)).toBe(false);
  });
  add('BUG-8i the UC page now sends the session id; the tutor lands on the suggested session, not their preferred one', async (ctx) => {
    // Tutor prefers MON (open); UC suggests TUE (open2).
    const res = await submit(ctx, ctx.tokens.tutor, { preferredSessionId: ctx.s.open, preferredSwapTo: 'MON 09:00-10:00|GP-P-101' });
    const suggested = await api('patch', `/uc/requests/${res.body.id}/review`, ctx.tokens.uc, {
      status: 'suggested', reviewNotes: 'TUT02 · Tutorial - TUE 09:00 - 10:00 | GP-P-101', suggestedSessionId: ctx.s.open2
    });
    expect(suggested.status).toBe(200);
    expect((await api('patch', `/requests/${res.body.id}`, ctx.tokens.tutor, { status: 'accepted' })).status).toBe(200);
    expect(await onSession(ctx.s.open2, ctx.u.tutor.id)).toBe(true);
    expect(await onSession(ctx.s.open, ctx.u.tutor.id)).toBe(false);
    expect(await onSession(ctx.s.held, ctx.u.tutor.id)).toBe(false);
  });
  add('BUG-8ii after accepting, the new session is already confirmed (not "Awaiting response")', async (ctx) => {
    const res = await submit(ctx, ctx.tokens.tutor, { preferredSessionId: null, preferredSwapTo: null });
    await api('patch', `/uc/requests/${res.body.id}/review`, ctx.tokens.uc, {
      status: 'suggested', reviewNotes: 'TUE', suggestedSessionId: ctx.s.open2
    });
    await api('patch', `/requests/${res.body.id}`, ctx.tokens.tutor, { status: 'accepted' });
    expect(await confirmedOn(ctx.s.open2, ctx.u.tutor.id)).toBe(true);
  });
  add('BUG-8i a suggestion that matches no session is refused up front (400), not saved', async (ctx) => {
    const res = await submit(ctx, ctx.tokens.tutor, { preferredSessionId: null, preferredSwapTo: null });
    const suggested = await review(ctx, res.body.id, 'suggested', 'SUN 23:00 - 23:30 Nowhere');
    expect(suggested.status).toBe(400);
    expect((await query('SELECT status FROM change_requests WHERE id = $1', [res.body.id])).rows[0].status).toBe('Pending');
  });
  add('BUG-8i a suggested session id from another unit is refused', async (ctx) => {
    const res = await submit(ctx, ctx.tokens.tutor, { preferredSessionId: null, preferredSwapTo: null });
    const suggested = await api('patch', `/uc/requests/${res.body.id}/review`, ctx.tokens.uc, {
      status: 'suggested', reviewNotes: 'x', suggestedSessionId: ctx.s.unitB
    });
    expect(suggested.status).toBe(404);
  });
});

defineApiCases('API requests: bug 1 (preferred options, right unit, semester in notices)', (add) => {
  add('BUG-1i swap targets work before the draft is released: same type, has space, not my own', async (ctx) => {
    await query('UPDATE units SET draft_released = FALSE, schedule_locked = FALSE WHERE id = $1', [ctx.unitA.id]);
    // The old call a tutor used returned nothing before release.
    const all = await api('get', `/units/${ctx.unitA.id}/sessions`, ctx.tokens.tutor);
    expect(all.body.sessions || all.body).toEqual([]);
    // Fill TUT01 so it has no space.
    await query(`INSERT INTO session_tutors (session_id, tutor_id, tutor_confirmed) VALUES ($1, $2, TRUE)`, [ctx.s.open, ctx.u.other.id]);
    const res = await api('get', `/units/${ctx.unitA.id}/sessions/swap-targets?currentSessionId=${ctx.s.held}`, ctx.tokens.tutor);
    expect(res.status).toBe(200);
    const ids = res.body.map(s => s.id);
    expect(ids).toContain(ctx.s.open2);          // Tutorial with space
    expect(ids).not.toContain(ctx.s.open);       // full
    expect(ids).not.toContain(ctx.s.held);       // their own
    expect(ids).not.toContain(ctx.s.lecture);    // different type
    expect(res.body[0]).not.toHaveProperty('tutors');
  });
  add('BUG-1i swap targets refuse a session the tutor does not hold', async (ctx) => {
    const res = await api('get', `/units/${ctx.unitA.id}/sessions/swap-targets?currentSessionId=${ctx.s.open}`, ctx.tokens.tutor);
    expect(res.status).toBe(403);
  });
  add('BUG-1ii a current session from another unit is refused when submitting', async (ctx) => {
    const res = await submit(ctx, ctx.tokens.tutor, { unitId: ctx.unitA.id, currentSessionId: ctx.s.unitB, preferredSessionId: null, preferredSwapTo: null });
    expect(res.status).toBe(400);
  });
  add('BUG-1ii the coordinator notice names the semester', async (ctx) => {
    await submit(ctx, ctx.tokens.tutor, { unitId: ctx.unitA.id });
    const notice = (await query(
      `SELECT content FROM notifications WHERE user_id = $1 AND notification_type = 'request_submitted' ORDER BY created_at DESC LIMIT 1`,
      [ctx.u.uc.id]
    )).rows[0];
    expect(notice.content).toMatch(/API101 \(Semester 2, 2026\)/);
  });
});

defineApiCases('API requests: admin review', (add) => {
  add('M-13 admin suggestion with spaced times is stored and accepted exactly once', async (ctx) => {
    const res = await submit(ctx, ctx.tokens.tutor, { preferredSessionId: null, preferredSwapTo: null });
    const suggested = await api('patch', `/admin/requests/${res.body.id}/review`, ctx.tokens.admin, {
      status: 'suggested', reviewNotes: 'Tutorial - TUE 09:00 - 10:00 | GP-P-101'
    });
    expect(suggested.status).toBe(200);
    expect((await query('SELECT suggested_session_id FROM change_requests WHERE id = $1', [res.body.id])).rows[0].suggested_session_id).toBe(ctx.s.open2);
    expect((await api('patch', `/requests/${res.body.id}`, ctx.tokens.tutor, { status: 'accepted' })).status).toBe(200);
    expect(await onSession(ctx.s.open2, ctx.u.tutor.id)).toBe(true);
    expect(await onSession(ctx.s.held, ctx.u.tutor.id)).toBe(false);
    expect((await api('patch', `/requests/${res.body.id}`, ctx.tokens.tutor, { reason: 'updated explanation' })).status).toBe(200);
    expect((await query('SELECT count(*)::int AS count FROM session_tutors WHERE session_id = $1 AND tutor_id = $2', [ctx.s.open2, ctx.u.tutor.id])).rows[0].count).toBe(1);
  });
  add('M-2 a forged cross-type request is rejected at submission without creating a request', async (ctx) => {
    const res = await submit(ctx, ctx.tokens.tutor, { preferredSessionId: ctx.s.lecture });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/same session type/);
    expect((await query('SELECT id FROM change_requests WHERE tutor_id = $1', [ctx.u.tutor.id])).rows).toHaveLength(0);
    expect(await onSession(ctx.s.held, ctx.u.tutor.id)).toBe(true);
  });
  add('M-2 legacy cross-type requests cannot be approved by UC or admin', async (ctx) => {
    const res = await submit(ctx, ctx.tokens.tutor);
    await query('UPDATE change_requests SET preferred_session_id = $1 WHERE id = $2', [ctx.s.lecture, res.body.id]);
    expect((await review(ctx, res.body.id, 'accepted')).status).toBe(409);
    expect((await api('patch', `/admin/requests/${res.body.id}/review`, ctx.tokens.admin, { status: 'accepted' })).status).toBe(409);
    expect(await onSession(ctx.s.held, ctx.u.tutor.id)).toBe(true);
    expect(await onSession(ctx.s.lecture, ctx.u.tutor.id)).toBe(false);
    expect((await query('SELECT status FROM change_requests WHERE id = $1', [res.body.id])).rows[0].status).toBe('Pending');
  });
  add('M-2 UC and admin cannot suggest a different session type', async (ctx) => {
    const res = await submit(ctx, ctx.tokens.tutor);
    const label = 'FRI 12:00-14:00|GP-P-101';
    expect((await review(ctx, res.body.id, 'suggested', label)).status).toBe(409);
    expect((await api('patch', `/admin/requests/${res.body.id}/review`, ctx.tokens.admin, { status: 'suggested', reviewNotes: label })).status).toBe(409);
    expect((await query('SELECT status FROM change_requests WHERE id = $1', [res.body.id])).rows[0].status).toBe('Pending');
  });
  add('API-R24 an admin approval also moves the tutor (it used to only change the label)', async (ctx) => {
    const res = await submit(ctx, ctx.tokens.tutor);
    expect((await api('patch', `/admin/requests/${res.body.id}/review`, ctx.tokens.admin, { status: 'accepted' })).status).toBe(200);
    expect(await onSession(ctx.s.open2, ctx.u.tutor.id)).toBe(true);
    expect(await onSession(ctx.s.held, ctx.u.tutor.id)).toBe(false);
  });
  add('API-R25 an admin approval that cannot be applied is refused and the status is unchanged', async (ctx) => {
    await putTutorOn(ctx.s.open2, ctx.u.other.id);
    const res = await submit(ctx, ctx.tokens.tutor);
    expect((await api('patch', `/admin/requests/${res.body.id}/review`, ctx.tokens.admin, { status: 'accepted' })).status).toBe(409);
    expect((await query('SELECT status FROM change_requests WHERE id = $1', [res.body.id])).rows[0].status).toBe('Pending');
  });
  add('API-R26 admin suggestion sessions skip full ones and the current one', async (ctx) => {
    const res = await submit(ctx, ctx.tokens.tutor);
    const list = (await api('get', `/admin/requests/${res.body.id}/suggestion-sessions`, ctx.tokens.admin)).body;
    const ids = list.map(s => s.id);
    expect(ids).toContain(ctx.s.open2);
    expect(ids).not.toContain(ctx.s.held);
    expect(ids).not.toContain(ctx.s.lecture);
  });
  add('API-R27 a declined tutor does not make a session look full to the admin', async (ctx) => {
    const res = await submit(ctx, ctx.tokens.tutor);
    const list = (await api('get', `/admin/requests/${res.body.id}/suggestion-sessions`, ctx.tokens.admin)).body;
    expect(list.map(s => s.id)).toContain(ctx.s.declined);
  });
});