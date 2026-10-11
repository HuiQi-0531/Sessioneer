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

defineApiCases('API final sweep: admin password', (add) => {
  add('FC-15 an admin can change their own password and log in with the new one', async (ctx) => {
    const res = await api('put', '/profile/password', ctx.tokens.admin, { currentPassword: ctx.password, newPassword: 'AdminNew2026' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    const email = (await query('SELECT email FROM users WHERE id = $1', [ctx.u.admin.id])).rows[0].email;
    expect((await api('post', '/auth/login', null, { email, password: 'AdminNew2026' })).status).toBe(200);
    expect((await api('post', '/auth/login', null, { email, password: ctx.password })).status).toBe(401);
  });
});

defineApiCases('API final sweep: admin emails', (add) => {
  add('FC-16 creating a user when the setup email fails still creates them and says the email failed', async (ctx) => {
    const { sendEmail } = require('../../utils/email');
    sendEmail.mockRejectedValueOnce(new Error('Brevo email settings are not configured'));
    const res = await api('post', '/admin/users', ctx.tokens.admin, {
      firstName: 'Nora', lastName: 'New', email: 'nora.new@api.test', role: 'tutor', accountStatus: 'active', sendSetupLink: true
    });
    expect(res.status).toBe(201);
    expect(res.body.setupEmailError).toMatch(/could not be sent/);
    expect((await query("SELECT 1 FROM users WHERE email = 'nora.new@api.test'")).rows).toHaveLength(1);
  });

  add('FC-17 "Send reset link" reports a failed email as an error, not a success', async (ctx) => {
    const { sendEmail } = require('../../utils/email');
    sendEmail.mockRejectedValueOnce(new Error('Brevo email settings are not configured'));
    const res = await api('post', `/admin/users/${ctx.u.tutor.id}/send-reset-link`, ctx.tokens.admin);
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Failed to send reset link/);
  });
});

defineApiCases('API final sweep: UC and admin flows', (add) => {
  const addApplication = async (ctx, email) => (await query(
    `INSERT INTO tutor_applications (unit_id, name, last_name, email, status)
     VALUES ($1, 'App', 'Licant', $2, 'pending') RETURNING id`,
    [ctx.unitA.id, email]
  )).rows[0].id;

  add('FC-18 inviting an applicant who already has an account adds them to the unit (no dead invite link)', async (ctx) => {
    const email = (await query('SELECT email FROM users WHERE id = $1', [ctx.u.outsider.id])).rows[0].email;
    const appId = await addApplication(ctx, email.toUpperCase());
    const res = await api('patch', `/tutor-applications/${appId}/invite`, ctx.tokens.uc, { unitId: ctx.unitA.id, role: 'tutor' });
    expect(res.status).toBe(200);
    expect(res.body.addedExistingUser).toBe(true);
    const membership = await query("SELECT role FROM unit_memberships WHERE unit_id = $1 AND user_id = $2", [ctx.unitA.id, ctx.u.outsider.id]);
    expect(membership.rows.map(r => r.role)).toEqual(['tutor']);
    expect((await query('SELECT status FROM tutor_applications WHERE id = $1', [appId])).rows[0].status).toBe('accepted');
  });

  add('FC-19 a brand-new applicant still gets an invite link', async (ctx) => {
    const appId = await addApplication(ctx, 'brand.new.person@api.test');
    const res = await api('patch', `/tutor-applications/${appId}/invite`, ctx.tokens.uc, { unitId: ctx.unitA.id, role: 'tutor' });
    expect(res.status).toBe(200);
    expect(res.body.inviteToken).toBeTruthy();
    expect(res.body.addedExistingUser).toBeUndefined();
  });

  add('FC-20 a coordinator account cannot be switched to tutor or admin while it coordinates units', async (ctx) => {
    const ucRow = (await query('SELECT name, last_name, email FROM users WHERE id = $1', [ctx.u.uc.id])).rows[0];
    const body = (role) => ({ firstName: ucRow.name, lastName: ucRow.last_name || 'X', email: ucRow.email, role, accountStatus: 'active' });
    const toTutor = await api('put', `/admin/users/${ctx.u.uc.id}`, ctx.tokens.admin, body('tutor'));
    expect(toTutor.status).toBe(409);
    expect(toTutor.body.error).toMatch(/coordinator of API101/);
    expect((await query('SELECT role FROM users WHERE id = $1', [ctx.u.uc.id])).rows[0].role).toBe('coordinator');
    expect((await api('put', `/admin/users/${ctx.u.uc.id}`, ctx.tokens.admin, body('coordinator'))).status).toBe(200);
  });

  add('FC-21 a tutor with unit access cannot be made an admin; one without can', async (ctx) => {
    const row = async (id) => (await query('SELECT name, last_name, email FROM users WHERE id = $1', [id])).rows[0];
    const t = await row(ctx.u.tutor.id);
    const res = await api('put', `/admin/users/${ctx.u.tutor.id}`, ctx.tokens.admin, { firstName: t.name, lastName: t.last_name || 'X', email: t.email, role: 'admin', accountStatus: 'active' });
    expect(res.status).toBe(409);
    const o = await row(ctx.u.outsider.id);
    const ok = await api('put', `/admin/users/${ctx.u.outsider.id}`, ctx.tokens.admin, { firstName: o.name, lastName: o.last_name || 'X', email: o.email, role: 'coordinator', accountStatus: 'active' });
    expect(ok.status).toBe(200);
  });

  add('FC-22 CSV import skips a row whose code already exists, and a code repeated inside the file', async (ctx) => {
    const row = (code, day) => ({ sessionCode: code, day, startTime: '15:00', endTime: '16:00', location: 'GP-Z-1', campus: 'GP', sessionType: 'Tutorial', capacity: 30, requiredTutors: 1 });
    const res = await api('post', `/units/${ctx.unitA.id}/sessions/import`, ctx.tokens.uc, {
      replace: false,
      sessions: [row('TUT01', 'MON'), row('TUT50', 'TUE'), row('tut50', 'WED'), row('', 'THU')]
    });
    expect(res.status).toBe(201);
    expect(res.body.importedCount).toBe(2);
    expect(res.body.skipped.map(s => s.reason)).toEqual([
      'Session code TUT01 is already used in this unit',
      'Session code TUT50 is already used in this unit'
    ]);
    const dupes = await query('SELECT session_code FROM sessions WHERE unit_id = $1 GROUP BY 1 HAVING COUNT(*) > 1', [ctx.unitA.id]);
    expect(dupes.rows).toHaveLength(0);
  });
});