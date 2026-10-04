// API: cover requests and availability.
// A claimed cover must show up where people look (the timetable's
// activeCovers, the claimer's own schedule) and must NOT be written into
// sessions or session_tutors.
const { api, query, defineApiCases } = require('./harness');

const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromToday = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return dayKey(d); };
const START = fromToday(1);
const END = fromToday(14);

const broadcast = (ctx, sessionIds, extra = {}) => api('post', '/uc/cover-requests', ctx.tokens.uc, {
  sessionIds, reason: 'away', startDate: START, endDate: END, ...extra
});
const coverId = async (ctx, sessionId, extra) => (await broadcast(ctx, [sessionId], extra)).body.requests[0].id;
const timetableRow = async (ctx, sessionId) =>
  (await api('get', `/units/${ctx.unitA.id}/sessions`, ctx.tokens.uc)).body.find(s => s.id === sessionId);

defineApiCases('API cover: broadcast', (add) => {
  add('API-C01 a broadcast needs a date range', async (ctx) => {
    const res = await api('post', '/uc/cover-requests', ctx.tokens.uc, { sessionIds: [ctx.s.held] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/date range/);
  });
  add('API-C02 a broadcast needs at least one session', async (ctx) => {
    expect((await api('post', '/uc/cover-requests', ctx.tokens.uc, { sessionIds: [], startDate: START, endDate: END })).status).toBe(400);
  });
  add('API-C03 the away tutor is read from session_tutors and stored on the request', async (ctx) => {
    const res = await broadcast(ctx, [ctx.s.held]);
    expect(res.status).toBe(201);
    const row = (await query('SELECT original_tutor_id FROM cover_requests WHERE id = $1', [res.body.requests[0].id])).rows[0];
    expect(row.original_tutor_id).toBe(ctx.u.tutor.id);
  });
  add('API-C04 everyone on the unit except the away tutor is notified', async (ctx) => {
    const res = await broadcast(ctx, [ctx.s.held]);
    expect(res.body.notifiedCount).toBe(2); // super + other, not tutor
    const tutorNotes = (await api('get', '/notifications', ctx.tokens.tutor)).body.notifications;
    expect(tutorNotes.some(n => n.type === 'session_cover_open')).toBe(false);
  });
  add('API-C05 a two-tutor session needs the UC to say who is away', async (ctx) => {
    await query('UPDATE sessions SET required_tutors = 2 WHERE id = $1', [ctx.s.held]);
    await query('INSERT INTO session_tutors (session_id, tutor_id, tutor_confirmed) VALUES ($1, $2, TRUE)', [ctx.s.held, ctx.u.other.id]);
    expect((await broadcast(ctx, [ctx.s.held])).status).toBe(400);
    const named = await broadcast(ctx, [ctx.s.held], { originalTutorId: ctx.u.other.id });
    expect(named.status).toBe(201);
    const row = (await query('SELECT original_tutor_id FROM cover_requests WHERE id = $1', [named.body.requests[0].id])).rows[0];
    expect(row.original_tutor_id).toBe(ctx.u.other.id);
  });
  add('API-C06 naming a tutor who does not hold the session is refused', async (ctx) => {
    expect((await broadcast(ctx, [ctx.s.held], { originalTutorId: ctx.u.super.id })).status).toBe(400);
  });
  add('API-C07 sessions from two units cannot be mixed', async (ctx) => {
    expect((await broadcast(ctx, [ctx.s.held, ctx.s.unitB])).status).toBe(400);
  });
  add('API-C08 a UC can cancel their open broadcast', async (ctx) => {
    const res = await broadcast(ctx, [ctx.s.held]);
    const cancel = await api('delete', `/uc/cover-requests/batch/${res.body.batchId}`, ctx.tokens.uc);
    expect(cancel.body.cancelledCount).toBe(1);
    expect((await query('SELECT status FROM cover_requests WHERE batch_id = $1', [res.body.batchId])).rows[0].status).toBe('cancelled');
  });
});

defineApiCases('API cover: claiming', (add) => {
  add('API-C09 the first eligible tutor wins, the second gets 409', async (ctx) => {
    const id = await coverId(ctx, ctx.s.held);
    expect((await api('post', `/cover-requests/${id}/claim`, ctx.tokens.other)).status).toBe(200);
    expect((await api('post', `/cover-requests/${id}/claim`, ctx.tokens.super)).status).toBe(409);
  });
  add('API-C10 a claim is stored only in cover_requests: sessions and session_tutors are unchanged', async (ctx) => {
    const id = await coverId(ctx, ctx.s.held);
    await api('post', `/cover-requests/${id}/claim`, ctx.tokens.other);
    const cr = (await query('SELECT status, claimed_by_id FROM cover_requests WHERE id = $1', [id])).rows[0];
    expect(cr).toEqual({ status: 'claimed', claimed_by_id: ctx.u.other.id });
    const st = (await query('SELECT tutor_id FROM session_tutors WHERE session_id = $1', [ctx.s.held])).rows.map(r => r.tutor_id);
    expect(st).toEqual([ctx.u.tutor.id]);
    const cols = (await query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'sessions'`)).rows.map(r => r.column_name);
    expect(cols).not.toContain('assigned_tutor_id');
  });
  add('API-C11 the UC timetable shows who is covering ("look at the wall")', async (ctx) => {
    const id = await coverId(ctx, ctx.s.held);
    await api('post', `/cover-requests/${id}/claim`, ctx.tokens.other);
    const row = await timetableRow(ctx, ctx.s.held);
    expect(row.activeCovers).toHaveLength(1);
    expect(row.activeCovers[0]).toMatchObject({ claimedById: ctx.u.other.id, claimedByName: 'other Test', originalTutorId: ctx.u.tutor.id });
    expect(row.tutors.map(t => t.tutorId)).toEqual([ctx.u.tutor.id]);
  });
  add('API-C12 the claimer sees the session on their own schedule as covering', async (ctx) => {
    const id = await coverId(ctx, ctx.s.held);
    await api('post', `/cover-requests/${id}/claim`, ctx.tokens.other);
    const mine = (await api('get', `/units/${ctx.unitA.id}/sessions/my-assigned`, ctx.tokens.other)).body;
    const covering = mine.find(s => s.id === ctx.s.held);
    expect(covering.isCovering).toBe(true);
  });
  add('API-C13 the original tutor and the UC are notified of the claim', async (ctx) => {
    const id = await coverId(ctx, ctx.s.held);
    await api('post', `/cover-requests/${id}/claim`, ctx.tokens.other);
    const tutorNotes = (await api('get', '/notifications', ctx.tokens.tutor)).body.notifications;
    const ucNotes = (await api('get', '/notifications', ctx.tokens.uc)).body.notifications;
    expect(tutorNotes.some(n => n.type === 'session_cover_claimed')).toBe(true);
    expect(ucNotes.some(n => n.type === 'session_cover_claimed')).toBe(true);
  });
  add('API-C14 the original tutor cannot claim their own cover', async (ctx) => {
    const id = await coverId(ctx, ctx.s.held);
    expect((await api('post', `/cover-requests/${id}/claim`, ctx.tokens.tutor)).status).toBe(400);
  });
  add('API-C15 a tutor who already teaches the session cannot cover it', async (ctx) => {
    await query('UPDATE sessions SET required_tutors = 2 WHERE id = $1', [ctx.s.held]);
    await query('INSERT INTO session_tutors (session_id, tutor_id, tutor_confirmed) VALUES ($1, $2, TRUE)', [ctx.s.held, ctx.u.other.id]);
    const id = await coverId(ctx, ctx.s.held, { originalTutorId: ctx.u.tutor.id });
    expect((await api('post', `/cover-requests/${id}/claim`, ctx.tokens.other)).status).toBe(400);
  });
  add('API-C16 claiming a cover that clashes with your own session is refused', async (ctx) => {
    // other teaches MON 09:00-10:00 (TUT01); TUT06 is MON 09:30-10:30.
    await api('patch', `/units/${ctx.unitA.id}/sessions/${ctx.s.open}/assign`, ctx.tokens.uc, { tutorId: ctx.u.other.id });
    await api('patch', `/units/${ctx.unitA.id}/sessions/${ctx.s.overlap}/assign`, ctx.tokens.uc, { tutorId: ctx.u.super.id });
    const id = await coverId(ctx, ctx.s.overlap);
    const res = await api('post', `/cover-requests/${id}/claim`, ctx.tokens.other);
    expect(res.status).toBe(409);
    expect((await query('SELECT status FROM cover_requests WHERE id = $1', [id])).rows[0].status).toBe('open');
  });
  add('API-C17 claiming a cover that clashes with a session in another unit is refused', async (ctx) => {
    await query(`INSERT INTO unit_memberships (unit_id, user_id, role) VALUES ($1, $2, 'tutor')`, [ctx.unitB.id, ctx.u.other.id]);
    await query('INSERT INTO session_tutors (session_id, tutor_id, tutor_confirmed) VALUES ($1, $2, TRUE)', [ctx.s.unitB, ctx.u.other.id]);
    await api('patch', `/units/${ctx.unitA.id}/sessions/${ctx.s.open}/assign`, ctx.tokens.uc, { tutorId: ctx.u.super.id });
    const id = await coverId(ctx, ctx.s.open);
    const res = await api('post', `/cover-requests/${id}/claim`, ctx.tokens.other);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/API202/);
  });
  add('API-C18 only a Super Tutor can claim a Lecture cover', async (ctx) => {
    const id = await coverId(ctx, ctx.s.lecture);
    expect((await api('post', `/cover-requests/${id}/claim`, ctx.tokens.other)).status).toBe(403);
    expect((await api('post', `/cover-requests/${id}/claim`, ctx.tokens.super)).status).toBe(200);
  });
  add('API-C19 a cover whose period already ended cannot be claimed or seen', async (ctx) => {
    const id = await coverId(ctx, ctx.s.held);
    await query(`UPDATE cover_batches SET start_date = CURRENT_DATE - 10, end_date = CURRENT_DATE - 3
                 WHERE id = (SELECT batch_id FROM cover_requests WHERE id = $1)`, [id]);
    expect((await api('get', '/cover-requests/open', ctx.tokens.other)).body.map(r => r.id)).not.toContain(id);
    expect((await api('post', `/cover-requests/${id}/claim`, ctx.tokens.other)).status).toBe(409);
  });
  add('API-C20 a finished cover drops off the timetable by itself', async (ctx) => {
    const id = await coverId(ctx, ctx.s.held);
    await api('post', `/cover-requests/${id}/claim`, ctx.tokens.other);
    await query(`UPDATE cover_batches SET end_date = CURRENT_DATE - 1 WHERE id = (SELECT batch_id FROM cover_requests WHERE id = $1)`, [id]);
    expect((await timetableRow(ctx, ctx.s.held)).activeCovers).toEqual([]);
  });
  add('API-C21 the open list hides sessions the tutor already teaches', async (ctx) => {
    await query('UPDATE sessions SET required_tutors = 2 WHERE id = $1', [ctx.s.held]);
    await query('INSERT INTO session_tutors (session_id, tutor_id, tutor_confirmed) VALUES ($1, $2, TRUE)', [ctx.s.held, ctx.u.other.id]);
    const id = await coverId(ctx, ctx.s.held, { originalTutorId: ctx.u.tutor.id });
    expect((await api('get', '/cover-requests/open', ctx.tokens.other)).body.map(r => r.id)).not.toContain(id);
    expect((await api('get', '/cover-requests/open', ctx.tokens.super)).body.map(r => r.id)).toContain(id);
  });
  add('API-C22 an outsider cannot claim', async (ctx) => {
    const id = await coverId(ctx, ctx.s.held);
    expect((await api('post', `/cover-requests/${id}/claim`, ctx.tokens.outsider)).status).toBe(404);
  });
  add('API-C23 accepting a weekly session that clashes with a cover you are doing is refused', async (ctx) => {
    const id = await coverId(ctx, ctx.s.held); // WED 11-12
    await api('post', `/cover-requests/${id}/claim`, ctx.tokens.other);
    const wed = (await query(`INSERT INTO sessions (unit_id, day, start_time, end_time, session_type, required_tutors, session_code)
      VALUES ($1, 'WED', '11:30', '12:30', 'Tutorial', 1, 'TUT77') RETURNING id`, [ctx.unitA.id])).rows[0].id;
    await query('INSERT INTO session_tutors (session_id, tutor_id) VALUES ($1, $2)', [wed, ctx.u.other.id]);
    expect((await api('patch', `/units/${ctx.unitA.id}/sessions/${wed}/confirm`, ctx.tokens.other, { confirmed: true })).status).toBe(409);
  });
});

defineApiCases('API cover: seen at assignment time', (add) => {
  add('API-C33 Assign Staff shows a tutor who is covering at that time as blocked', async (ctx) => {
    const id = await coverId(ctx, ctx.s.held); // WED 11-12, other claims it
    await api('post', `/cover-requests/${id}/claim`, ctx.tokens.other);
    const wed = (await api('post', `/units/${ctx.unitA.id}/sessions`, ctx.tokens.uc,
      { day: 'WED', startTime: '11:30', endTime: '12:30', location: 'X', campus: 'GP', sessionType: 'Tutorial', capacity: 20, requiredTutors: 1, status: 'Confirmed' })).body;
    const cands = (await api('get', `/units/${ctx.unitA.id}/sessions/${wed.id}/candidates`, ctx.tokens.uc)).body.candidates;
    const other = cands.find(c => c.id === ctx.u.other.id);
    expect(other.hardBlocked).toBe(true);
    expect(other.warnings.join(' ')).toMatch(/Covering an overlapping session in API101 until/);
  });
  add('API-C34 assigning that tutor is refused straight away (409)', async (ctx) => {
    const id = await coverId(ctx, ctx.s.held);
    await api('post', `/cover-requests/${id}/claim`, ctx.tokens.other);
    const wed = (await api('post', `/units/${ctx.unitA.id}/sessions`, ctx.tokens.uc,
      { day: 'WED', startTime: '11:30', endTime: '12:30', location: 'X', campus: 'GP', sessionType: 'Tutorial', capacity: 20, requiredTutors: 1, status: 'Confirmed' })).body;
    const res = await api('patch', `/units/${ctx.unitA.id}/sessions/${wed.id}/assign`, ctx.tokens.uc, { tutorId: ctx.u.other.id });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/covering an overlapping session in API101/);
    const admin = await api('post', `/admin/sessions/${wed.id}/assignments`, ctx.tokens.admin, { tutorId: ctx.u.other.id });
    expect(admin.status).toBe(409);
  });
  add('API-C35 once the cover has ended the same assignment is allowed', async (ctx) => {
    const sent = await broadcast(ctx, [ctx.s.held]);
    await api('post', `/cover-requests/${sent.body.requests[0].id}/claim`, ctx.tokens.other);
    await query('UPDATE cover_batches SET start_date = CURRENT_DATE - 9, end_date = CURRENT_DATE - 1 WHERE id = $1', [sent.body.batchId]);
    const wed = (await api('post', `/units/${ctx.unitA.id}/sessions`, ctx.tokens.uc,
      { day: 'WED', startTime: '11:30', endTime: '12:30', location: 'X', campus: 'GP', sessionType: 'Tutorial', capacity: 20, requiredTutors: 1, status: 'Confirmed' })).body;
    expect((await api('patch', `/units/${ctx.unitA.id}/sessions/${wed.id}/assign`, ctx.tokens.uc, { tutorId: ctx.u.other.id })).status).toBe(200);
  });
});

defineApiCases('API availability', (add) => {
  add('API-C24 a tutor on the unit can submit, and the slots are stored', async (ctx) => {
    expect((await api('post', '/availability/submit', ctx.tokens.tutor, {
      unitCode: 'API101', slots: { 'Monday-9:00am': 'preferred', 'Monday-10:00am': 'avoid' }
    })).status).toBe(201);
    const rows = (await query('SELECT day, start_time, preference FROM availability WHERE tutor_id = $1 ORDER BY start_time', [ctx.u.tutor.id])).rows;
    expect(rows).toEqual([
      { day: 'MON', start_time: '09:00:00', preference: 'preferred' },
      { day: 'MON', start_time: '10:00:00', preference: 'avoid' }
    ]);
  });
  add('API-C25 resubmitting replaces the previous slots', async (ctx) => {
    await api('post', '/availability/submit', ctx.tokens.tutor, { unitCode: 'API101', slots: { 'Monday-9:00am': 'preferred' } });
    await api('post', '/availability/submit', ctx.tokens.tutor, { unitCode: 'API101', slots: { 'Tuesday-10:00am': 'avoid' } });
    const rows = (await query('SELECT preference FROM availability WHERE tutor_id = $1', [ctx.u.tutor.id])).rows;
    expect(rows).toEqual([{ preference: 'avoid' }]);
  });
  add('API-C26 locking availability blocks a later submit', async (ctx) => {
    await api('patch', `/units/${ctx.unitA.id}/lock-availability`, ctx.tokens.uc, {});
    expect((await api('post', '/availability/submit', ctx.tokens.tutor, { unitCode: 'API101', slots: {} })).status).toBe(409);
  });
  add('API-C27 an outsider cannot submit, and is not enrolled into the unit', async (ctx) => {
    expect((await api('post', '/availability/submit', ctx.tokens.outsider, { unitCode: 'API101', slots: { 'Monday-9:00am': 'preferred' } })).status).toBe(403);
    const member = await query('SELECT 1 FROM unit_memberships WHERE unit_id = $1 AND user_id = $2', [ctx.unitA.id, ctx.u.outsider.id]);
    expect(member.rows).toHaveLength(0);
  });
  add('API-C28 GET without a unit is 400 (it used to fall back to FIT3077)', async (ctx) => {
    expect((await api('get', '/availability', ctx.tokens.uc)).status).toBe(400);
  });
  add('API-C29 the same unit code in a newer semester is resolved to the unit the user is in', async (ctx) => {
    // uc2 runs another "API101" in a later year; tutor only belongs to the original.
    await query(`INSERT INTO units (unit_coordinator_id, unit_code, unit_name, semester, year)
                 VALUES ($1, 'API101', 'Clone', 'Semester 1', 2027)`, [ctx.u.uc2.id]);
    expect((await api('post', '/availability/submit', ctx.tokens.tutor, { unitCode: 'API101', slots: { 'Friday-9:00am': 'available' } })).status).toBe(201);
    const unitIds = (await query('SELECT DISTINCT unit_id FROM availability WHERE tutor_id = $1', [ctx.u.tutor.id])).rows.map(r => r.unit_id);
    expect(unitIds).toEqual([ctx.unitA.id]);
  });
  add('API-C30 after accepting MON 9-10 in another unit, this unit\'s grid shows MON 9am as avoid (situation 2)', async (ctx) => {
    await query(`INSERT INTO unit_memberships (unit_id, user_id, role) VALUES ($1, $2, 'tutor')`, [ctx.unitB.id, ctx.u.other.id]);
    await api('post', '/availability/submit', ctx.tokens.other, { unitCode: 'API101', slots: { 'Monday-9:00am': 'preferred', 'Monday-10:00am': 'preferred' } });
    await query('INSERT INTO session_tutors (session_id, tutor_id, tutor_confirmed) VALUES ($1, $2, NULL)', [ctx.s.unitB, ctx.u.other.id]);
    const before = (await api('get', '/availability?unitCode=API101', ctx.tokens.uc)).body;
    expect(before.availability.MON[ctx.u.other.id]['9:00am']).toBe('preferred'); // only an offer so far
    await api('patch', `/units/${ctx.unitB.id}/sessions/${ctx.s.unitB}/confirm`, ctx.tokens.other, { confirmed: true });
    const after = (await api('get', '/availability?unitCode=API101', ctx.tokens.uc)).body;
    expect(after.availability.MON[ctx.u.other.id]['9:00am']).toBe('avoid');
    expect(after.availability.MON[ctx.u.other.id]['10:00am']).toBe('preferred');
    expect(after.committed.MON[ctx.u.other.id]['9:00am']).toBe('API202');
  });
  add('API-C31 the stored availability itself is not changed by accepting', async (ctx) => {
    await query(`INSERT INTO unit_memberships (unit_id, user_id, role) VALUES ($1, $2, 'tutor')`, [ctx.unitB.id, ctx.u.other.id]);
    await api('post', '/availability/submit', ctx.tokens.other, { unitCode: 'API101', slots: { 'Monday-9:00am': 'preferred' } });
    await query('INSERT INTO session_tutors (session_id, tutor_id, tutor_confirmed) VALUES ($1, $2, TRUE)', [ctx.s.unitB, ctx.u.other.id]);
    const stored = (await query('SELECT preference FROM availability WHERE tutor_id = $1', [ctx.u.other.id])).rows;
    expect(stored).toEqual([{ preference: 'preferred' }]);
  });
  add('API-C32 the tutor sees their own avoid hours too, and once declined they disappear', async (ctx) => {
    await query(`INSERT INTO unit_memberships (unit_id, user_id, role) VALUES ($1, $2, 'tutor')`, [ctx.unitB.id, ctx.u.other.id]);
    await query('INSERT INTO session_tutors (session_id, tutor_id, tutor_confirmed) VALUES ($1, $2, TRUE)', [ctx.s.unitB, ctx.u.other.id]);
    const own = (await api('get', '/availability?unitCode=API101', ctx.tokens.other)).body;
    expect(own.availability.MON[ctx.u.other.id]['9:00am']).toBe('avoid');
    await query('UPDATE session_tutors SET tutor_confirmed = FALSE WHERE session_id = $1', [ctx.s.unitB]);
    const later = (await api('get', '/availability?unitCode=API101', ctx.tokens.other)).body;
    expect(later.availability.MON[ctx.u.other.id]).toBeUndefined();
  });
});
