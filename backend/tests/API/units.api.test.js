const { api, query, sessionBody, defineApiCases } = require('./harness');

defineApiCases('API units', (add) => {
  add('unit list contains only the coordinator own unit', async (ctx) => {
    const list = await api('get', '/units', ctx.tokens.uc);
    expect(list.body.map(unit => unit.unitCode)).toEqual(['API101']);
  });
  add('a coordinator can read their own unit', async (ctx) => {
    expect((await api('get', `/units/${ctx.unitA.id}`, ctx.tokens.uc)).body.unitCode).toBe('API101');
  });
  add('a coordinator cannot read another coordinator unit', async (ctx) => {
    expect((await api('get', `/units/${ctx.unitB.id}`, ctx.tokens.uc)).status).toBe(404);
  });
  add('create unit rejects missing fields', async (ctx) => {
    expect((await api('post', '/units', ctx.tokens.uc, { unitCode: 'NEW' })).status).toBe(400);
  });
  add('create unit rejects an unknown coordinator email', async (ctx) => {
    expect((await api('post', '/units', ctx.tokens.uc, {
      unitCode: 'new303', unitName: 'New', semester: 'Semester 1', year: 2027, coordinatorEmails: ['ghost@api.test']
    })).status).toBe(400);
  });
  add('create unit rejects a tutor email as coordinator', async (ctx) => {
    expect((await api('post', '/units', ctx.tokens.uc, {
      unitCode: 'new303', unitName: 'New', semester: 'Semester 1', year: 2027, coordinatorEmails: ['tutor@api.test']
    })).status).toBe(400);
  });
  add('create unit uppercases the code and adds the extra coordinator', async (ctx) => {
    const created = await api('post', '/units', ctx.tokens.uc, {
      unitCode: 'new303', unitName: 'New Unit', semester: 'Semester 1', year: 2027, coordinatorEmails: ['uc2@api.test']
    });
    expect(created.status).toBe(201);
    expect(created.body.unitCode).toBe('NEW303');
    const member = await query(`SELECT role FROM unit_memberships WHERE unit_id = $1 AND user_id = $2 AND role = 'coordinator'`, [created.body.id, ctx.u.uc2.id]);
    expect(member.rows).toHaveLength(1);
  });
  add('create unit rejects the same code in the same semester', async (ctx) => {
    expect((await api('post', '/units', ctx.tokens.uc, { unitCode: 'API101', unitName: 'Again', semester: 'Semester 2', year: 2026 })).status).toBe(409);
  });
  add('lock fails while sessions are unassigned', async (ctx) => {
    const blocked = await api('patch', `/units/${ctx.unitA.id}/lock-schedule`, ctx.tokens.uc, {});
    expect(blocked.status).toBe(409);
    expect(blocked.body.unassignedCount).toBeGreaterThan(0);
  });
  add('lock fails while a confirmation is still pending', async (ctx) => {
    const unit = await api('post', '/units', ctx.tokens.uc, {
      unitCode: 'lockp1', unitName: 'Pending lock', semester: 'Semester 1', year: 2027
    });
    const session = await api('post', `/units/${unit.body.id}/sessions`, ctx.tokens.uc, sessionBody({ day: 'Monday' }));
    expect((await api('patch', `/units/${unit.body.id}/sessions/${session.body.id}/assign`, ctx.tokens.uc, { tutorId: ctx.u.other.id })).status).toBe(200);
    const pending = await api('patch', `/units/${unit.body.id}/lock-schedule`, ctx.tokens.uc, {});
    expect(pending.status).toBe(409);
    expect(pending.body.pendingCount).toBeGreaterThan(0);
  });
  add('lock succeeds when every session is assigned and confirmed', async (ctx) => {
    const unit = await api('post', '/units', ctx.tokens.uc, {
      unitCode: 'lockok', unitName: 'Ready lock', semester: 'Semester 1', year: 2027
    });
    const session = await api('post', `/units/${unit.body.id}/sessions`, ctx.tokens.uc, sessionBody({ day: 'Monday' }));
    expect((await api('patch', `/units/${unit.body.id}/sessions/${session.body.id}/assign`, ctx.tokens.uc, { tutorId: ctx.u.other.id })).status).toBe(200);
    expect((await api('patch', `/units/${unit.body.id}/sessions/${session.body.id}/confirm`, ctx.tokens.other, { confirmed: true })).status).toBe(200);
    const locked = await api('patch', `/units/${unit.body.id}/lock-schedule`, ctx.tokens.uc, {});
    expect(locked.status).toBe(200);
    expect(locked.body.scheduleLocked).toBe(true);
  });
  add('force lock succeeds while the timetable is unfinished', async (ctx) => {
    expect((await api('patch', `/units/${ctx.unitA.id}/lock-schedule`, ctx.tokens.uc, { force: true })).body.scheduleLocked).toBe(true);
  });
  add('unlock clears the schedule lock', async (ctx) => {
    await api('patch', `/units/${ctx.unitA.id}/lock-schedule`, ctx.tokens.uc, { force: true });
    expect((await api('patch', `/units/${ctx.unitA.id}/unlock-schedule`, ctx.tokens.uc, {})).body.scheduleLocked).toBe(false);
  });
  add('a coordinator cannot lock another unit', async (ctx) => {
    expect((await api('patch', `/units/${ctx.unitB.id}/lock-schedule`, ctx.tokens.uc, { force: true })).status).toBe(404);
  });
  add('release draft sets draftReleased', async (ctx) => {
    expect((await api('patch', `/units/${ctx.unitA.id}/release-draft`, ctx.tokens.uc, {})).body.draftReleased).toBe(true);
  });
  add('unrelease draft clears draftReleased', async (ctx) => {
    await api('patch', `/units/${ctx.unitA.id}/release-draft`, ctx.tokens.uc, {});
    expect((await api('patch', `/units/${ctx.unitA.id}/unrelease-draft`, ctx.tokens.uc, {})).body.draftReleased).toBe(false);
  });
  add('lock availability sets availabilityLocked', async (ctx) => {
    expect((await api('patch', `/units/${ctx.unitA.id}/lock-availability`, ctx.tokens.uc, {})).body.availabilityLocked).toBe(true);
  });
  add('unlock availability clears availabilityLocked', async (ctx) => {
    await api('patch', `/units/${ctx.unitA.id}/lock-availability`, ctx.tokens.uc, {});
    expect((await api('patch', `/units/${ctx.unitA.id}/unlock-availability`, ctx.tokens.uc, {})).body.availabilityLocked).toBe(false);
  });
  add('only the main coordinator can delete the unit', async (ctx) => {
    expect((await api('delete', `/units/${ctx.unitA.id}`, ctx.tokens.uc2)).status).toBe(404);
  });
  add('the main coordinator can delete the unit even when sessions exist', async (ctx) => {
    expect((await api('delete', `/units/${ctx.unitA.id}`, ctx.tokens.uc)).status).toBe(200);
    expect((await query('SELECT id FROM units WHERE id = $1', [ctx.unitA.id])).rows).toHaveLength(0);
  });
  add('duplicate requires a semester and year', async (ctx) => {
    expect((await api('post', `/units/${ctx.unitA.id}/duplicate`, ctx.tokens.uc, {})).status).toBe(400);
  });
  add('duplicate copies sessions and tutor memberships', async (ctx) => {
    const copy = await api('post', `/units/${ctx.unitA.id}/duplicate`, ctx.tokens.uc, { semester: 'Semester 1', year: 2027, unitCode: 'api101b' });
    expect(copy.status).toBe(201);
    expect((await query('SELECT id FROM sessions WHERE unit_id = $1', [copy.body.id])).rows.length).toBeGreaterThan(0);
    expect((await query(`SELECT role FROM unit_memberships WHERE unit_id = $1 AND user_id = $2`, [copy.body.id, ctx.u.tutor.id])).rows.map(row => row.role)).toContain('tutor');
    expect(copy.body.scheduleLocked).toBe(false);
  });
  add('duplicate does not copy change requests', async (ctx) => {
    await query(`INSERT INTO change_requests (tutor_id, unit_id, request_type, reason, status) VALUES ($1, $2, 'Session Swap', 'keep me', 'Pending')`, [ctx.u.tutor.id, ctx.unitA.id]);
    const copy = await api('post', `/units/${ctx.unitA.id}/duplicate`, ctx.tokens.uc, { semester: 'Semester 1', year: 2027, unitCode: 'api101c' });
    expect((await query('SELECT id FROM change_requests WHERE unit_id = $1', [copy.body.id])).rows).toHaveLength(0);
  });
  add('tutor marker trims empty tags', async (ctx) => {
    const marker = await api('put', `/units/${ctx.unitA.id}/tutors/${ctx.u.tutor.id}/marker`, ctx.tokens.uc, { priorityTag: 'Priority', internalNotes: 'reliable', tags: [' sql ', ''] });
    expect(marker.body.tags).toEqual(['sql']);
  });
  add('early access is stored for one tutor', async (ctx) => {
    expect((await api('put', `/units/${ctx.unitA.id}/tutors/${ctx.u.tutor.id}/early-access`, ctx.tokens.uc, { earlyAccess: true })).body.earlyAccess).toBe(true);
  });
  add('starred is stored for one tutor', async (ctx) => {
    expect((await api('put', `/units/${ctx.unitA.id}/tutors/${ctx.u.tutor.id}/starred`, ctx.tokens.uc, { starred: true })).body.starred).toBe(true);
  });
  add('flagged is stored for one tutor', async (ctx) => {
    expect((await api('put', `/units/${ctx.unitA.id}/tutors/${ctx.u.tutor.id}/flagged`, ctx.tokens.uc, { flagged: true })).body.flagged).toBe(true);
  });
  add('a marker cannot be written on another unit', async (ctx) => {
    expect((await api('put', `/units/${ctx.unitB.id}/tutors/${ctx.u.tutor.id}/starred`, ctx.tokens.uc, { starred: true })).status).toBe(404);
  });
  add('my-units includes a unit the tutor belongs to', async (ctx) => {
    const mine = await api('get', '/units/my-units', ctx.tokens.tutor);
    expect(mine.body.some(unit => unit.unitCode === 'API101')).toBe(true);
  });
  add('my-access loads for a user with no unit', async (ctx) => {
    expect((await api('get', '/units/my-access', ctx.tokens.outsider)).status).toBe(200);
  });
});