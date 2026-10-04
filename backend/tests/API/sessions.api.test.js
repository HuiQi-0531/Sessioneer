// API: /units/:unitId/sessions
// Every assignment check looks at the outcome in session_tutors (the one
// assignment table) and at what the timetable endpoint returns, not just
// at the HTTP status.
const { api, query, sessionBody, assigned, defineApiCases } = require('./harness');

const url = (ctx, path = '') => `/units/${ctx.unitA.id}/sessions${path}`;
const timetable = async (ctx, token = ctx.tokens.uc) => (await api('get', url(ctx), token)).body;
const findSession = (list, id) => list.find(s => s.id === id);
const stConfirmed = async (sessionId, tutorId) => {
  const r = await query('SELECT tutor_confirmed FROM session_tutors WHERE session_id = $1 AND tutor_id = $2', [sessionId, tutorId]);
  return r.rows[0] ? r.rows[0].tutor_confirmed : undefined;
};

defineApiCases('API sessions: create, edit, delete, import', (add) => {
  add('API-S01 create rejects missing fields', async (ctx) => {
    expect((await api('post', url(ctx), ctx.tokens.uc, { day: 'Monday' })).status).toBe(400);
  });
  add('API-S02 create rejects capacity 0 and tutor count 0', async (ctx) => {
    expect((await api('post', url(ctx), ctx.tokens.uc, sessionBody({ capacity: 0 }))).status).toBe(400);
    expect((await api('post', url(ctx), ctx.tokens.uc, sessionBody({ requiredTutors: 0 }))).status).toBe(400);
  });
  add('API-S03 create rejects an end time before the start time', async (ctx) => {
    expect((await api('post', url(ctx), ctx.tokens.uc, sessionBody({ startTime: '11:00', endTime: '10:00' }))).status).toBe(400);
  });
  add('API-S04 create rejects a code already used in the unit (any case)', async (ctx) => {
    expect((await api('post', url(ctx), ctx.tokens.uc, sessionBody({ sessionCode: 'tut01' }))).status).toBe(409);
  });
  add('API-S05 create generates the next code for the type and normalises the day', async (ctx) => {
    const created = await api('post', url(ctx), ctx.tokens.uc, sessionBody({ day: 'Friday', sessionType: 'Workshop' }));
    expect(created.status).toBe(201);
    expect(created.body.sessionCode).toBe('WOR01');
    expect(created.body.day).toBe('FRI');
    expect(created.body.tutors).toEqual([]);
    expect(created.body.activeCovers).toEqual([]);
  });
  add('API-S06 create in another coordinator unit is 404', async (ctx) => {
    expect((await api('post', `/units/${ctx.unitB.id}/sessions`, ctx.tokens.uc, sessionBody())).status).toBe(404);
  });
  add('API-S07 edit rejects a code used by another session', async (ctx) => {
    expect((await api('put', url(ctx, `/${ctx.s.open2}`), ctx.tokens.uc, { sessionCode: 'TUT01' })).status).toBe(409);
  });
  add('API-S08 edit stores the new code in capitals and the new room', async (ctx) => {
    const res = await api('put', url(ctx, `/${ctx.s.open2}`), ctx.tokens.uc, { sessionCode: 'tut99', location: 'Z-1' });
    expect(res.status).toBe(200);
    const row = (await query('SELECT session_code, location FROM sessions WHERE id = $1', [ctx.s.open2])).rows[0];
    expect(row).toEqual({ session_code: 'TUT99', location: 'Z-1' });
  });
  add('API-S09 edit of a missing session is 404', async (ctx) => {
    expect((await api('put', url(ctx, '/00000000-0000-0000-0000-000000000000'), ctx.tokens.uc, { location: 'Z' })).status).toBe(404);
  });
  add('API-S10 edit is refused while the schedule is locked', async (ctx) => {
    await query('UPDATE units SET schedule_locked = TRUE WHERE id = $1', [ctx.unitA.id]);
    expect((await api('put', url(ctx, `/${ctx.s.open}`), ctx.tokens.uc, { location: 'Z' })).status).toBe(409);
  });
  add('API-S11 edit refuses an end time before the stored start time', async (ctx) => {
    expect((await api('put', url(ctx, `/${ctx.s.open}`), ctx.tokens.uc, { endTime: '08:00' })).status).toBe(400);
  });
  add('API-S12 edit cannot lower tutors required below those assigned', async (ctx) => {
    await query('UPDATE sessions SET required_tutors = 2 WHERE id = $1', [ctx.s.open]);
    await api('patch', url(ctx, `/${ctx.s.open}/assign`), ctx.tokens.uc, { tutorId: ctx.u.other.id });
    await api('patch', url(ctx, `/${ctx.s.open}/assign`), ctx.tokens.uc, { tutorId: ctx.u.super.id });
    expect((await api('put', url(ctx, `/${ctx.s.open}`), ctx.tokens.uc, { requiredTutors: 1 })).status).toBe(409);
  });
  add('API-S13 moving a staffed session onto its tutor\'s other session is refused', async (ctx) => {
    await api('patch', url(ctx, `/${ctx.s.open}/assign`), ctx.tokens.uc, { tutorId: ctx.u.other.id });
    await api('patch', url(ctx, `/${ctx.s.open2}/assign`), ctx.tokens.uc, { tutorId: ctx.u.other.id });
    const moved = await api('put', url(ctx, `/${ctx.s.open2}`), ctx.tokens.uc, { day: 'MON', startTime: '09:00', endTime: '10:00' });
    expect(moved.status).toBe(409);
    expect((await query('SELECT day FROM sessions WHERE id = $1', [ctx.s.open2])).rows[0].day).toBe('TUE');
  });
  add('API-S14 a staffed Tutorial cannot become a Lecture while a plain Tutor holds it', async (ctx) => {
    await api('patch', url(ctx, `/${ctx.s.open}/assign`), ctx.tokens.uc, { tutorId: ctx.u.other.id });
    expect((await api('put', url(ctx, `/${ctx.s.open}`), ctx.tokens.uc, { sessionType: 'Lecture' })).status).toBe(409);
  });
  add('API-S15 delete is blocked while a tutor holds the session', async (ctx) => {
    await api('patch', url(ctx, `/${ctx.s.open}/assign`), ctx.tokens.uc, { tutorId: ctx.u.other.id });
    expect((await api('delete', url(ctx, `/${ctx.s.open}`), ctx.tokens.uc)).status).toBe(409);
  });
  add('API-S16 delete is allowed once the only tutor declined', async (ctx) => {
    expect((await api('delete', url(ctx, `/${ctx.s.declined}`), ctx.tokens.uc)).status).toBe(200);
    expect((await query('SELECT id FROM sessions WHERE id = $1', [ctx.s.declined])).rows).toHaveLength(0);
  });
  add('API-S17 delete is blocked while the schedule is locked', async (ctx) => {
    await query('UPDATE units SET schedule_locked = TRUE WHERE id = $1', [ctx.unitA.id]);
    expect((await api('delete', url(ctx, `/${ctx.s.open}`), ctx.tokens.uc)).status).toBe(409);
  });
  add('API-S18 import with no rows is 400', async (ctx) => {
    expect((await api('post', url(ctx, '/import'), ctx.tokens.uc, { sessions: [] })).status).toBe(400);
  });
  add('API-S19 import keeps good rows and reports unreadable ones', async (ctx) => {
    const res = await api('post', url(ctx, '/import'), ctx.tokens.uc, {
      sessions: [
        { day: 'not-a-day', startTime: '09:00', endTime: '10:00' },
        { day: 'Friday', startTime: '4pm', endTime: '5pm', location: 'A1', campus: 'GP', sessionType: 'Practical', capacity: 60, sessionCode: 'prc01' }
      ]
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ importedCount: 1, skippedCount: 1 });
    const row = (await query(`SELECT day, start_time, required_tutors FROM sessions WHERE unit_id = $1 AND session_code = 'PRC01'`, [ctx.unitA.id])).rows[0];
    expect(row).toEqual({ day: 'FRI', start_time: '16:00:00', required_tutors: 3 });
  });
  add('API-S20 import cannot replace a timetable that has tutors', async (ctx) => {
    await api('patch', url(ctx, `/${ctx.s.open}/assign`), ctx.tokens.uc, { tutorId: ctx.u.other.id });
    expect((await api('post', url(ctx, '/import'), ctx.tokens.uc, {
      replace: true, sessions: [{ day: 'MON', startTime: '09:00', endTime: '10:00', sessionType: 'Tutorial', capacity: 30 }]
    })).status).toBe(409);
  });
});

defineApiCases('API sessions: assign and unassign (session_tutors)', (add) => {
  add('API-S21 assign needs a tutorId', async (ctx) => {
    expect((await api('patch', url(ctx, `/${ctx.s.open}/assign`), ctx.tokens.uc, {})).status).toBe(400);
  });
  add('API-S22 assigning writes one pending row in session_tutors', async (ctx) => {
    const res = await api('patch', url(ctx, `/${ctx.s.open}/assign`), ctx.tokens.uc, { tutorId: ctx.u.tutor.id });
    expect(res.status).toBe(200);
    expect(await stConfirmed(ctx.s.open, ctx.u.tutor.id)).toBeNull();
    expect(res.body.isAssigned).toBe(true);
    expect(res.body.tutors.map(t => t.tutorId)).toEqual([ctx.u.tutor.id]);
  });
  add('API-S23 the timetable shows the assigned tutor by name', async (ctx) => {
    await api('patch', url(ctx, `/${ctx.s.open}/assign`), ctx.tokens.uc, { tutorId: ctx.u.other.id });
    const row = findSession(await timetable(ctx), ctx.s.open);
    expect(row.tutors.map(t => t.tutorName)).toEqual(['other Test']);
    expect(row.assignedTutorId).toBe(ctx.u.other.id);
  });
  add('API-S24 a full session refuses another tutor', async (ctx) => {
    await api('patch', url(ctx, `/${ctx.s.open}/assign`), ctx.tokens.uc, { tutorId: ctx.u.other.id });
    expect((await api('patch', url(ctx, `/${ctx.s.open}/assign`), ctx.tokens.uc, { tutorId: ctx.u.super.id })).status).toBe(409);
  });
  add('API-S25 a two-tutor session holds two tutors, both on the timetable', async (ctx) => {
    await query('UPDATE sessions SET required_tutors = 2 WHERE id = $1', [ctx.s.open]);
    await api('patch', url(ctx, `/${ctx.s.open}/assign`), ctx.tokens.uc, { tutorId: ctx.u.other.id });
    expect((await api('patch', url(ctx, `/${ctx.s.open}/assign`), ctx.tokens.uc, { tutorId: ctx.u.super.id })).status).toBe(200);
    expect(findSession(await timetable(ctx), ctx.s.open).tutors).toHaveLength(2);
  });
  add('API-S26 a plain Tutor cannot be put on a Lecture, a Super Tutor can', async (ctx) => {
    expect((await api('patch', url(ctx, `/${ctx.s.lecture}/assign`), ctx.tokens.uc, { tutorId: ctx.u.other.id })).status).toBe(409);
    expect((await api('patch', url(ctx, `/${ctx.s.lecture}/assign`), ctx.tokens.uc, { tutorId: ctx.u.super.id })).status).toBe(200);
    expect(await assigned(ctx.s.lecture, ctx.u.super.id)).toBe(true);
  });
  add('API-S27 the coordinator assigning themselves is confirmed straight away', async (ctx) => {
    expect((await api('patch', url(ctx, `/${ctx.s.lecture}/assign`), ctx.tokens.uc, { tutorId: ctx.u.uc.id })).status).toBe(200);
    expect(await stConfirmed(ctx.s.lecture, ctx.u.uc.id)).toBe(true);
  });
  add('API-S28 overlapping sessions in the same unit are refused', async (ctx) => {
    await api('patch', url(ctx, `/${ctx.s.open}/assign`), ctx.tokens.uc, { tutorId: ctx.u.other.id });
    expect((await api('patch', url(ctx, `/${ctx.s.overlap}/assign`), ctx.tokens.uc, { tutorId: ctx.u.other.id })).status).toBe(409);
    expect(await assigned(ctx.s.overlap, ctx.u.other.id)).toBe(false);
  });
  add('API-S29 overlapping sessions across units are refused (Sarah case)', async (ctx) => {
    await query(`INSERT INTO unit_memberships (unit_id, user_id, role) VALUES ($1, $2, 'tutor')`, [ctx.unitB.id, ctx.u.other.id]);
    expect((await api('patch', `/units/${ctx.unitB.id}/sessions/${ctx.s.unitB}/assign`, ctx.tokens.uc2, { tutorId: ctx.u.other.id })).status).toBe(200);
    const res = await api('patch', url(ctx, `/${ctx.s.open}/assign`), ctx.tokens.uc, { tutorId: ctx.u.other.id });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/API202/);
  });
  add('API-S30 going over maximum hours is refused', async (ctx) => {
    // tutor has max 2 hours and already holds WED 11-12 (1h). TUT05 is 2h.
    const res = await api('patch', url(ctx, `/${ctx.s.long}/assign`), ctx.tokens.uc, { tutorId: ctx.u.tutor.id });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/max hours/i);
  });
  add('API-S31 a declined session does not count towards hours', async (ctx) => {
    await query('DELETE FROM session_tutors WHERE session_id = $1', [ctx.s.held]);
    // only the declined THU row remains, so 2h is allowed
    expect((await api('patch', url(ctx, `/${ctx.s.long}/assign`), ctx.tokens.uc, { tutorId: ctx.u.tutor.id })).status).toBe(200);
  });
  add('API-S32 assign is refused while locked', async (ctx) => {
    await query('UPDATE units SET schedule_locked = TRUE WHERE id = $1', [ctx.unitA.id]);
    expect((await api('patch', url(ctx, `/${ctx.s.open2}/assign`), ctx.tokens.uc, { tutorId: ctx.u.other.id })).status).toBe(409);
  });
  add('API-S33 assigning sends the tutor a notification', async (ctx) => {
    await api('patch', url(ctx, `/${ctx.s.open}/assign`), ctx.tokens.uc, { tutorId: ctx.u.other.id });
    const notes = (await api('get', '/notifications', ctx.tokens.other)).body.notifications;
    expect(notes.some(n => n.type === 'session_assigned')).toBe(true);
  });
  add('API-S34 unassign removes the row and the timetable shows Unassigned', async (ctx) => {
    expect((await api('delete', url(ctx, `/${ctx.s.held}/assign/${ctx.u.tutor.id}`), ctx.tokens.uc)).status).toBe(200);
    expect(await stConfirmed(ctx.s.held, ctx.u.tutor.id)).toBeUndefined();
    const row = findSession(await timetable(ctx), ctx.s.held);
    expect(row.isAssigned).toBe(false);
    expect(row.assignedTutorId).toBeNull();
  });
  add('API-S35 unassign through another unit URL is 404', async (ctx) => {
    expect((await api('delete', `/units/${ctx.unitA.id}/sessions/${ctx.s.unitB}/assign/${ctx.u.tutor.id}`, ctx.tokens.uc)).status).toBe(404);
  });
});

defineApiCases('API sessions: accept and decline', (add) => {
  add('API-S36 accepting stores true in session_tutors', async (ctx) => {
    expect((await api('patch', url(ctx, `/${ctx.s.held}/confirm`), ctx.tokens.tutor, { confirmed: true })).status).toBe(200);
    expect(await stConfirmed(ctx.s.held, ctx.u.tutor.id)).toBe(true);
  });
  add('API-S37 declining needs a reason', async (ctx) => {
    expect((await api('patch', url(ctx, `/${ctx.s.held}/confirm`), ctx.tokens.tutor, { confirmed: false })).status).toBe(400);
  });
  add('API-S38 declining stores false and the trimmed reason', async (ctx) => {
    await api('patch', url(ctx, `/${ctx.s.held}/confirm`), ctx.tokens.tutor, { confirmed: false, reason: '  clash  ' });
    const row = (await query('SELECT tutor_confirmed, tutor_reject_reason FROM session_tutors WHERE session_id = $1', [ctx.s.held])).rows[0];
    expect(row).toEqual({ tutor_confirmed: false, tutor_reject_reason: 'clash' });
  });
  add('API-S39 a declined session shows as needing a tutor again', async (ctx) => {
    await api('patch', url(ctx, `/${ctx.s.held}/confirm`), ctx.tokens.tutor, { confirmed: false, reason: 'busy' });
    const row = findSession(await timetable(ctx), ctx.s.held);
    expect(row.isAssigned).toBe(false);
    expect(row.declinedTutors.map(t => t.tutorId)).toEqual([ctx.u.tutor.id]);
  });
  add('API-S40 a decline is final: the tutor cannot accept it afterwards', async (ctx) => {
    expect((await api('patch', url(ctx, `/${ctx.s.declined}/confirm`), ctx.tokens.tutor, { confirmed: true })).status).toBe(409);
    expect(await stConfirmed(ctx.s.declined, ctx.u.tutor.id)).toBe(false);
  });
  add('API-S41 a tutor cannot answer someone else\'s session', async (ctx) => {
    expect((await api('patch', url(ctx, `/${ctx.s.held}/confirm`), ctx.tokens.other, { confirmed: true })).status).toBe(404);
  });
  add('API-S42 answering is refused once locked', async (ctx) => {
    await query('UPDATE units SET schedule_locked = TRUE WHERE id = $1', [ctx.unitA.id]);
    expect((await api('patch', url(ctx, `/${ctx.s.held}/confirm`), ctx.tokens.tutor, { confirmed: false, reason: 'late' })).status).toBe(409);
  });
  add('API-S43 accepting a session that overlaps one already accepted is refused (situation 1)', async (ctx) => {
    // A double booking slipped in directly (e.g. two UCs at the same instant).
    await query(`INSERT INTO unit_memberships (unit_id, user_id, role) VALUES ($1, $2, 'tutor')`, [ctx.unitB.id, ctx.u.other.id]);
    await query('INSERT INTO session_tutors (session_id, tutor_id, tutor_confirmed) VALUES ($1, $2, TRUE), ($3, $2, NULL)',
      [ctx.s.unitB, ctx.u.other.id, ctx.s.open]);
    const res = await api('patch', url(ctx, `/${ctx.s.open}/confirm`), ctx.tokens.other, { confirmed: true });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/API202/);
    expect(await stConfirmed(ctx.s.open, ctx.u.other.id)).toBeNull();
  });
  add('API-S44 the clashing offer can still be declined', async (ctx) => {
    await query(`INSERT INTO unit_memberships (unit_id, user_id, role) VALUES ($1, $2, 'tutor')`, [ctx.unitB.id, ctx.u.other.id]);
    await query('INSERT INTO session_tutors (session_id, tutor_id, tutor_confirmed) VALUES ($1, $2, TRUE), ($3, $2, NULL)',
      [ctx.s.unitB, ctx.u.other.id, ctx.s.open]);
    expect((await api('patch', url(ctx, `/${ctx.s.open}/confirm`), ctx.tokens.other, { confirmed: false, reason: 'clash' })).status).toBe(200);
  });
  add('API-S45 accepting notifies the coordinator', async (ctx) => {
    await api('patch', url(ctx, `/${ctx.s.held}/confirm`), ctx.tokens.tutor, { confirmed: true });
    const notes = (await api('get', '/notifications', ctx.tokens.uc)).body.notifications;
    expect(notes.some(n => n.type === 'session_confirmed')).toBe(true);
  });
});

defineApiCases('API sessions: reading the timetable', (add) => {
  add('API-S46 an outsider cannot read the timetable', async (ctx) => {
    expect((await api('get', url(ctx), ctx.tokens.outsider)).status).toBe(403);
  });
  add('API-S47 a linked tutor sees nothing until the draft is released', async (ctx) => {
    expect((await api('get', url(ctx), ctx.tokens.tutor)).body).toEqual({ released: false, sessions: [] });
    await api('patch', `/units/${ctx.unitA.id}/release-draft`, ctx.tokens.uc, {});
    expect(Array.isArray((await api('get', url(ctx), ctx.tokens.tutor)).body)).toBe(true);
  });
  add('API-S48 my-assigned lists only the tutor\'s pending and accepted sessions', async (ctx) => {
    const mine = (await api('get', url(ctx, '/my-assigned'), ctx.tokens.tutor)).body;
    expect(mine.map(s => s.id)).toEqual([ctx.s.held]);
  });
  add('API-S49 candidates rank a clashing tutor last and say why', async (ctx) => {
    await api('patch', url(ctx, `/${ctx.s.open}/assign`), ctx.tokens.uc, { tutorId: ctx.u.other.id });
    const res = await api('get', url(ctx, `/${ctx.s.overlap}/candidates`), ctx.tokens.uc);
    expect(res.status).toBe(200);
    const other = res.body.candidates.find(c => c.id === ctx.u.other.id);
    expect(other.hardBlocked).toBe(true);
    expect(other.warnings.join(' ')).toMatch(/overlapping session in API101/);
    expect(res.body.candidates[res.body.candidates.length - 1].hardBlocked).toBe(true);
  });
  add('API-S50 candidates flag "avoid" from submitted availability', async (ctx) => {
    await api('post', '/availability/submit', ctx.tokens.other, { unitCode: 'API101', slots: { 'Tuesday-9:00am': 'avoid' } });
    const res = await api('get', url(ctx, `/${ctx.s.open2}/candidates`), ctx.tokens.uc);
    const other = res.body.candidates.find(c => c.id === ctx.u.other.id);
    expect(other.warnings).toContain('Marked "avoid" for this time');
    expect(other.hardBlocked).toBe(false);
  });
});
