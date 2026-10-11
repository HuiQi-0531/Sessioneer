// Bugs found in the final code sweep (after the tutor walkthrough).
const { api, query, defineApiCases } = require('./harness');

const submit = (ctx, token, body = {}) => api('post', '/requests', token, {
  unitId: ctx.unitA.id,
  requestType: 'Session Swap',
  currentSessionId: ctx.s.held,
  preferredSessionId: ctx.s.open2,
  reason: 'clash',
  ...body
});

defineApiCases('API final sweep', (add) => {
  add('FC-01 a second open request for the same session is refused', async (ctx) => {
    expect((await submit(ctx, ctx.tokens.tutor)).status).toBe(201);
    const again = await submit(ctx, ctx.tokens.tutor, { preferredSessionId: ctx.s.open });
    expect(again.status).toBe(409);
    expect(again.body.error).toMatch(/already have an open request/);
  });

  add('FC-02 a pending request can be deleted, an approved one cannot', async (ctx) => {
    const first = await submit(ctx, ctx.tokens.tutor);
    expect((await api('delete', `/requests/${first.body.id}`, ctx.tokens.tutor)).status).toBe(200);

    const second = await submit(ctx, ctx.tokens.tutor);
    await query("UPDATE change_requests SET status = 'accepted' WHERE id = $1", [second.body.id]);
    const del = await api('delete', `/requests/${second.body.id}`, ctx.tokens.tutor);
    expect(del.status).toBe(409);
    expect((await query('SELECT 1 FROM change_requests WHERE id = $1', [second.body.id])).rows).toHaveLength(1);
  });

  add('FC-03 a coordinator account that only tutors in a unit does not see co-tutors in my-assigned', async (ctx) => {
    // uc2 coordinates unit B but is a plain tutor in unit A, sharing TUT03 with "tutor".
    await query("INSERT INTO unit_memberships (unit_id, user_id, role) VALUES ($1, $2, 'tutor')", [ctx.unitA.id, ctx.u.uc2.id]);
    await query('INSERT INTO session_tutors (session_id, tutor_id, tutor_confirmed) VALUES ($1, $2, TRUE)', [ctx.s.held, ctx.u.uc2.id]);
    await query("UPDATE session_tutors SET tutor_confirmed = FALSE, tutor_reject_reason = 'private reason' WHERE session_id = $1 AND tutor_id = $2", [ctx.s.held, ctx.u.tutor.id]);

    const res = await api('get', `/units/${ctx.unitA.id}/sessions/my-assigned?includeDeclined=true`, ctx.tokens.uc2);
    expect(res.status).toBe(200);
    const row = res.body.find(r => r.id === ctx.s.held);
    expect(row.tutors.map(t => t.tutorId)).toEqual([ctx.u.uc2.id]);
    expect(JSON.stringify(res.body)).not.toMatch(/private reason/);
  });

  add('FC-04 the real coordinator of the unit still sees every tutor in my-assigned', async (ctx) => {
    await query('INSERT INTO session_tutors (session_id, tutor_id, tutor_confirmed) VALUES ($1, $2, TRUE)', [ctx.s.held, ctx.u.uc.id]);
    const res = await api('get', `/units/${ctx.unitA.id}/sessions/my-assigned`, ctx.tokens.uc);
    const row = res.body.find(r => r.id === ctx.s.held);
    expect(row.tutors.map(t => t.tutorId).sort()).toEqual([ctx.u.tutor.id, ctx.u.uc.id].sort());
  });

  add('FC-05 legacy GET /sessions: a coordinator account only sees other names in units it coordinates', async (ctx) => {
    await query("INSERT INTO unit_memberships (unit_id, user_id, role) VALUES ($1, $2, 'tutor')", [ctx.unitA.id, ctx.u.uc2.id]);
    await query('INSERT INTO session_tutors (session_id, tutor_id, tutor_confirmed) VALUES ($1, $2, TRUE)', [ctx.s.open, ctx.u.other.id]);
    const res = await api('get', '/sessions', ctx.tokens.uc2);
    expect(res.status).toBe(200);
    const unitARow = res.body.find(r => r.id === ctx.s.open);
    expect(unitARow.assigned_tutor_name || null).toBeNull();
    const own = await api('get', '/sessions', ctx.tokens.uc);
    expect(own.body.find(r => r.id === ctx.s.open).assigned_tutor_name).toBeTruthy();
  });

  add('FC-06 availability with many slots is saved in full (one bulk insert)', async (ctx) => {
    const slots = {};
    for (const day of ['MON', 'TUE', 'WED', 'THU', 'FRI']) {
      for (const t of ['8:00am', '9:00am', '10:00am', '11:00am', '12:00pm', '1:00pm', '2:00pm', '3:00pm', '4:00pm', '5:00pm', '11:00pm']) {
        slots[`${day}-${t}`] = 'available';
      }
    }
    slots['MON-9:00am'] = 'preferred';
    slots['Bad-slot'] = 'available';
    const res = await api('post', '/availability/submit', ctx.tokens.tutor, { unitId: ctx.unitA.id, slots });
    expect(res.status).toBe(201);
    const rows = (await query('SELECT day, start_time, end_time, preference FROM availability WHERE tutor_id = $1 AND unit_id = $2', [ctx.u.tutor.id, ctx.unitA.id])).rows;
    expect(rows).toHaveLength(55);
    expect(rows.find(r => r.day === 'MON' && r.start_time === '09:00:00').preference).toBe('preferred');
    expect(rows.some(r => r.start_time === '23:00:00')).toBe(true);
  });
});

const fs = require('fs');
const path = require('path');

const adminSessionBody = (ctx, overrides = {}) => ({
  unitId: ctx.unitA.id, day: 'THU', startTime: '15:00', endTime: '16:00', location: 'GP-P-999',
  campus: 'GP', sessionType: 'Tutorial', capacity: 30, requiredTutors: 1, status: 'Draft', ...overrides
});

defineApiCases('API final sweep: session codes', (add) => {
  add('FC-07 a session added by an admin gets the next code for its type', async (ctx) => {
    const res = await api('post', '/admin/sessions', ctx.tokens.admin, adminSessionBody(ctx));
    expect(res.status).toBe(201);
    // unit A already has TUT01-TUT06 from the seed
    expect(res.body.sessionCode).toBe('TUT07');
    const lec = await api('post', '/admin/sessions', ctx.tokens.admin, adminSessionBody(ctx, { sessionType: 'Lecture', day: 'FRI' }));
    expect(lec.body.sessionCode).toBe('LEC02');
  });

  add('FC-08 the admin session list includes each session code', async (ctx) => {
    const res = await api('get', '/admin/sessions', ctx.tokens.admin);
    expect(res.status).toBe(200);
    expect(res.body.find(s => s.id === ctx.s.held).sessionCode).toBe('TUT03');
  });

  add('FC-09 migration 003 fills in missing codes without touching existing ones', async (ctx) => {
    await query("UPDATE sessions SET session_code = NULL WHERE id = ANY($1)", [[ctx.s.lecture, ctx.s.long, ctx.s.overlap]]);
    await query("UPDATE sessions SET session_code = '  ' WHERE id = $1", [ctx.s.declined]);
    const sql = fs.readFileSync(path.join(__dirname, '../../db/migrations/003_backfill_session_codes.sql'), 'utf8');
    await query(sql);
    const code = async (id) => (await query('SELECT session_code FROM sessions WHERE id = $1', [id])).rows[0].session_code;
    expect(await code(ctx.s.held)).toBe('TUT03');      // untouched
    expect(await code(ctx.s.lecture)).toBe('LEC01');   // no lecture codes left, starts at 01
    // missing tutorials continue after the highest existing TUT (TUT03), ordered by day/time:
    // TUT06 slot MON 09:30 -> TUT04, TUT05 slot MON 13:00 -> TUT05, TUT04 slot THU -> TUT06
    expect(await code(ctx.s.overlap)).toBe('TUT04');
    expect(await code(ctx.s.long)).toBe('TUT05');
    expect(await code(ctx.s.declined)).toBe('TUT06');
    const dupes = await query(`SELECT unit_id, session_code, COUNT(*) FROM sessions GROUP BY 1, 2 HAVING COUNT(*) > 1`);
    expect(dupes.rows).toHaveLength(0);
  });
});

defineApiCases('API final sweep: admin session code field', (add) => {
  const sessionRow = async (id) => (await query('SELECT session_code, session_type FROM sessions WHERE id = $1', [id])).rows[0];
  const editBody = (ctx, overrides = {}) => adminSessionBody(ctx, {
    day: 'WED', startTime: '11:00', endTime: '12:00', location: 'GP-P-101', status: 'Confirmed', ...overrides
  });

  add('FC-10 a code typed in the Add form is used as-is (upper-cased)', async (ctx) => {
    const res = await api('post', '/admin/sessions', ctx.tokens.admin, adminSessionBody(ctx, { sessionCode: 'tut99' }));
    expect(res.status).toBe(201);
    expect(res.body.sessionCode).toBe('TUT99');
  });

  add('FC-11 a code already used in the unit is refused, on add and on edit', async (ctx) => {
    const add1 = await api('post', '/admin/sessions', ctx.tokens.admin, adminSessionBody(ctx, { sessionCode: 'TUT01' }));
    expect(add1.status).toBe(409);
    expect(add1.body.error).toMatch(/TUT01 is already used/);
    const edit = await api('put', `/admin/sessions/${ctx.s.held}`, ctx.tokens.admin, editBody(ctx, { sessionCode: 'TUT02' }));
    expect(edit.status).toBe(409);
    expect((await sessionRow(ctx.s.held)).session_code).toBe('TUT03');
  });

  add('FC-12 saving with its own unchanged code is fine', async (ctx) => {
    const res = await api('put', `/admin/sessions/${ctx.s.held}`, ctx.tokens.admin, editBody(ctx, { sessionCode: 'TUT03', capacity: 40 }));
    expect(res.status).toBe(200);
    expect((await sessionRow(ctx.s.held)).session_code).toBe('TUT03');
  });

  add('FC-13 changing the type with the code the form proposed saves both', async (ctx) => {
    const res = await api('put', `/admin/sessions/${ctx.s.held}`, ctx.tokens.admin, editBody(ctx, { sessionType: 'Practical', sessionCode: 'PRC01' }));
    expect(res.status).toBe(200);
    expect(await sessionRow(ctx.s.held)).toEqual({ session_code: 'PRC01', session_type: 'Practical' });
  });

  add('FC-14 changing the type without sending a code still regenerates it', async (ctx) => {
    const res = await api('put', `/admin/sessions/${ctx.s.held}`, ctx.tokens.admin, editBody(ctx, { sessionType: 'Workshop' }));
    expect(res.status).toBe(200);
    expect((await sessionRow(ctx.s.held)).session_code).toBe('WOR01');
  });
});