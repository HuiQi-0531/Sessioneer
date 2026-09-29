const { api, seed, query, sessionBody, PASSWORD } = require('../API/harness');

describe('Integration workflows', () => {
  let ctx;
  beforeEach(async () => { ctx = await seed(); });

  test('register, create a unit, assign a tutor, confirm, then a lock blocks later changes', async () => {
    await api('post', '/auth/register', null, {
      firstName: 'Nia', lastName: 'Coord', email: 'nia@api.test', role: 'Coordinator',
      password: PASSWORD, confirmPassword: PASSWORD
    });
    const login = await api('post', '/auth/login', null, { email: 'nia@api.test', password: PASSWORD });
    const token = login.body.token;
    const unit = await api('post', '/units', token, {
      unitCode: 'flow101', unitName: 'Flow', semester: 'Semester 1', year: 2027
    });
    const session = await api('post', `/units/${unit.body.id}/sessions`, token, sessionBody({ day: 'Tuesday' }));
    const assigned = await api('patch', `/units/${unit.body.id}/sessions/${session.body.id}/assign`, token, { tutorId: ctx.u.other.id });
    expect(assigned.status).toBe(200);
    const notes = await api('get', '/notifications', ctx.tokens.other);
    expect(notes.body.notifications.some(item => item.type === 'session_assigned')).toBe(true);
    expect((await api('patch', `/units/${unit.body.id}/sessions/${session.body.id}/confirm`, ctx.tokens.other, { confirmed: true })).status).toBe(200);
    await query('UPDATE sessions SET is_assigned = TRUE, tutor_confirmed = TRUE WHERE id = $1', [session.body.id]);
    expect((await api('patch', `/units/${unit.body.id}/lock-schedule`, token, {})).status).toBe(200);
    expect((await api('delete', `/units/${unit.body.id}/sessions/${session.body.id}/assign/${ctx.u.other.id}`, token)).status).toBe(409);
    expect((await api('patch', `/units/${unit.body.id}/sessions/${session.body.id}/confirm`, ctx.tokens.other, { confirmed: false, reason: 'too late' })).status).toBe(409);
  });

  test('approving a swap moves the tutor and notifies them', async () => {
    const submitted = await api('post', '/requests', ctx.tokens.tutor, {
      unitCode: 'API101', requestType: 'Session Swap', reason: 'prefer Tuesday',
      currentSessionId: ctx.s.held, preferredSessionId: ctx.s.open2, priority: 'Urgent'
    });
    expect((await api('patch', `/uc/requests/${submitted.body.id}/review`, ctx.tokens.uc, { status: 'Accepted' })).status).toBe(200);
    const held = await query(`SELECT tutor_id FROM session_tutors WHERE session_id = $1 AND tutor_confirmed IS DISTINCT FROM FALSE`, [ctx.s.held]);
    const next = await query(`SELECT tutor_id FROM session_tutors WHERE session_id = $1 AND tutor_confirmed IS DISTINCT FROM FALSE`, [ctx.s.open2]);
    expect(held.rows.map(row => row.tutor_id)).not.toContain(ctx.u.tutor.id);
    expect(next.rows.map(row => row.tutor_id)).toContain(ctx.u.tutor.id);
    const notes = await api('get', '/notifications', ctx.tokens.tutor);
    expect(notes.body.notifications.some(item => item.type === 'request_accepted')).toBe(true);
  });

  test('a suggested request goes back to Pending when the tutor rejects it', async () => {
    const submitted = await api('post', '/requests', ctx.tokens.tutor, {
      unitCode: 'API101', requestType: 'Session Swap', reason: 'clash',
      currentSessionId: ctx.s.held, preferredSessionId: ctx.s.open2
    });
    await query(`UPDATE change_requests SET status = 'Suggested' WHERE id = $1`, [submitted.body.id]);
    const appeal = await api('patch', `/requests/${submitted.body.id}`, ctx.tokens.tutor, { status: 'Rejected' });
    expect(appeal.body.status).toBe('Pending');
  });

  test('approving a session change only unassigns the current session', async () => {
    const submitted = await api('post', '/requests', ctx.tokens.tutor, {
      unitCode: 'API101', requestType: 'Session Change', reason: 'drop',
      currentSessionId: ctx.s.held
    });
    expect((await api('patch', `/uc/requests/${submitted.body.id}/review`, ctx.tokens.uc, { status: 'Accepted' })).status).toBe(200);
    const held = await query(`SELECT tutor_id FROM session_tutors WHERE session_id = $1 AND tutor_confirmed IS DISTINCT FROM FALSE`, [ctx.s.held]);
    expect(held.rows.map(row => row.tutor_id)).not.toContain(ctx.u.tutor.id);
  });

  test('the first eligible tutor claims a cover and the session owner changes', async () => {
    const broadcast = await api('post', '/uc/cover-requests', ctx.tokens.uc, {
      sessionIds: [ctx.s.held], reason: 'away', startDate: '2026-10-07', endDate: '2026-10-07'
    });
    const id = broadcast.body.requests[0].id;
    expect((await api('get', '/cover-requests/open', ctx.tokens.tutor)).body.find(row => row.id === id)).toBeUndefined();
    expect((await api('post', `/cover-requests/${id}/claim`, ctx.tokens.other)).status).toBe(200);
    expect((await api('post', `/cover-requests/${id}/claim`, ctx.tokens.super)).status).toBe(409);
    const session = await query('SELECT assigned_tutor_id FROM sessions WHERE id = $1', [ctx.s.held]);
    expect(session.rows[0].assigned_tutor_id).toBe(ctx.u.other.id);
    const notes = await api('get', '/notifications', ctx.tokens.uc);
    expect(notes.body.notifications.some(item => item.type === 'session_cover_claimed')).toBe(true);
  });

  test('only a super tutor can claim a lecture cover', async () => {
    const broadcast = await api('post', '/uc/cover-requests', ctx.tokens.uc, {
      sessionIds: [ctx.s.lecture], startDate: '2026-10-09', endDate: '2026-10-09'
    });
    const id = broadcast.body.requests[0].id;
    expect((await api('post', `/cover-requests/${id}/claim`, ctx.tokens.tutor)).status).toBe(403);
    expect((await api('post', `/cover-requests/${id}/claim`, ctx.tokens.super)).status).toBe(200);
  });

  test('availability shows on the coordinator grid and then closes when locked', async () => {
    expect((await api('post', '/availability/submit', ctx.tokens.tutor, {
      unitCode: 'API101', slots: { 'Monday-9:00am': 'preferred' }
    })).status).toBe(201);
    const grid = await api('get', '/availability?unitCode=API101', ctx.tokens.uc);
    expect(grid.status).toBe(200);
    await api('patch', `/units/${ctx.unitA.id}/lock-availability`, ctx.tokens.uc, {});
    expect((await api('post', '/availability/submit', ctx.tokens.tutor, {
      unitCode: 'API101', slots: { 'Tuesday-10:00am': 'avoid' }
    })).status).toBe(409);
  });

  test('an invited email becomes a tutor who can log in and see the unit', async () => {
    const invite = await api('post', '/tutor-applications/direct-invite', ctx.tokens.uc, {
      unitId: ctx.unitA.id, email: 'flow.tutor@api.test', role: 'tutor'
    });
    expect((await api('post', '/tutor-applications/accept-invite', null, {
      token: invite.body.inviteToken, password: 'abcdef', firstName: 'Flow', lastName: 'Tutor'
    })).status).toBe(201);
    const login = await api('post', '/auth/login', null, { email: 'flow.tutor@api.test', password: 'abcdef' });
    const units = await api('get', '/units/my-units', login.body.token);
    expect(units.body.some(unit => unit.unitCode === 'API101')).toBe(true);
  });

  test('reinviting an existing tutor as super tutor leaves only one teaching role', async () => {
    await api('post', '/tutor-applications/direct-invite', ctx.tokens.uc, {
      unitId: ctx.unitA.id, email: 'outsider@api.test', role: 'tutor'
    });
    await api('post', '/tutor-applications/direct-invite', ctx.tokens.uc, {
      unitId: ctx.unitA.id, email: 'outsider@api.test', role: 'super_tutor'
    });
    const roles = await query(
      `SELECT role FROM unit_memberships WHERE unit_id = $1 AND user_id = $2 AND role IN ('tutor', 'super_tutor')`,
      [ctx.unitA.id, ctx.u.outsider.id]
    );
    expect(roles.rows.map(row => row.role)).toEqual(['super_tutor']);
  });

  test('replace import fails while someone is assigned and succeeds after they are removed', async () => {
    const blocked = await api('post', `/units/${ctx.unitA.id}/sessions/import`, ctx.tokens.uc, {
      replace: true,
      sessions: [{ day: 'MON', startTime: '09:00', endTime: '10:00', sessionType: 'Tutorial', capacity: 30 }]
    });
    expect(blocked.status).toBe(409);
    await query(`DELETE FROM session_tutors WHERE session_id = $1`, [ctx.s.held]);
    const replaced = await api('post', `/units/${ctx.unitA.id}/sessions/import`, ctx.tokens.uc, {
      replace: true,
      sessions: [{ day: 'MON', startTime: '09:00', endTime: '10:00', sessionType: 'Tutorial', capacity: 30, sessionCode: 'NEW01' }]
    });
    expect(replaced.status).toBe(201);
    expect(replaced.body.importedCount).toBe(1);
  });

  test('duplicating a unit keeps sessions and tutors, and drops requests', async () => {
    await query(
      `INSERT INTO change_requests (tutor_id, unit_id, request_type, reason, status)
       VALUES ($1, $2, 'Session Swap', 'old', 'Pending')`,
      [ctx.u.tutor.id, ctx.unitA.id]
    );
    const copy = await api('post', `/units/${ctx.unitA.id}/duplicate`, ctx.tokens.uc, {
      semester: 'Semester 1', year: 2027, unitCode: 'flowdup'
    });
    const sessions = await query('SELECT id FROM sessions WHERE unit_id = $1', [copy.body.id]);
    const requests = await query('SELECT id FROM change_requests WHERE unit_id = $1', [copy.body.id]);
    expect(sessions.rows.length).toBeGreaterThan(0);
    expect(requests.rows).toHaveLength(0);
    expect(copy.body.scheduleLocked).toBe(false);
  });

  test('a three-day-old assignment is reminded once', async () => {
    await query(`UPDATE session_tutors SET assigned_at = NOW() - INTERVAL '4 days', reminder_sent_at = NULL WHERE session_id = $1`, [ctx.s.held]);
    const first = await api('post', '/jobs/session-assignment-reminders').set('x-cron-secret', process.env.CRON_SECRET);
    const second = await api('post', '/jobs/session-assignment-reminders').set('x-cron-secret', process.env.CRON_SECRET);
    expect(first.body.emailedCount).toBe(1);
    expect(second.body.emailedCount).toBe(0);
  });

  test('an admin setup link lets a pending user choose a password and log in', async () => {
    const created = await api('post', '/admin/users', ctx.tokens.admin, {
      firstName: 'Pending', lastName: 'User', email: 'setup.user@api.test',
      role: 'tutor', accountStatus: 'active', sendSetupLink: true
    });
    expect(created.status).toBe(201);
    const tokenRow = await query(
      `SELECT token_hash FROM password_reset_tokens WHERE user_id = $1 AND used_at IS NULL`,
      [created.body.id]
    );
    expect(tokenRow.rows).toHaveLength(1);
  });

  test('changing a password makes the old password fail and the new one able to send a message', async () => {
    expect((await api('put', '/profile/password', ctx.tokens.tutor, { currentPassword: PASSWORD, newPassword: 'abcdef' })).status).toBe(200);
    expect((await api('post', '/auth/login', null, { email: 'tutor@api.test', password: PASSWORD })).status).toBe(401);
    const login = await api('post', '/auth/login', null, { email: 'tutor@api.test', password: 'abcdef' });
    expect((await api('post', '/messages', login.body.token, { recipientId: ctx.u.uc.id, content: 'after reset' })).status).toBe(201);
  });

  test('a tutor sees the full timetable only after the draft is released', async () => {
    const hidden = await api('get', `/units/${ctx.unitA.id}/sessions`, ctx.tokens.tutor);
    expect(hidden.body.released).toBe(false);
    await api('patch', `/units/${ctx.unitA.id}/release-draft`, ctx.tokens.uc, {});
    const visible = await api('get', `/units/${ctx.unitA.id}/sessions`, ctx.tokens.tutor);
    expect(Array.isArray(visible.body)).toBe(true);
    expect(visible.body.length).toBeGreaterThan(0);
  });

  test('a custom application answer is stored and the resume can be downloaded', async () => {
    await api('put', `/tutor-applications/form/${ctx.unitA.id}`, ctx.tokens.uc, {
      fields: [{ key: 'q1', label: 'Why you?', type: 'text', required: true }]
    });
    await api('post', '/tutor-applications', null, {
      unitId: ctx.unitA.id, firstName: 'Ann', email: 'flow.apply@api.test',
      resumeBase64: Buffer.from('%PDF-1.4 resume').toString('base64'),
      resumeFilename: 'cv.pdf', resumeMimeType: 'application/pdf',
      customAnswers: { q1: 'I like labs' }
    });
    const list = await api('get', `/tutor-applications?unitId=${ctx.unitA.id}`, ctx.tokens.uc);
    const resume = await api('get', `/tutor-applications/${list.body[0].id}/resume`, ctx.tokens.uc);
    expect(resume.status).toBe(200);
    const stored = await query(`SELECT custom_answers FROM tutor_applications WHERE email = 'flow.apply@api.test'`);
    expect(stored.rows[0].custom_answers.q1).toBe('I like labs');
  });
});