const crypto = require('crypto');
const { sendEmail } = require('../../utils/email');
const { api, seed, query, sessionBody, PASSWORD } = require('../API/harness');

const assign = (ctx, sessionId, token, tutorId) =>
  api('patch', `/units/${ctx.unitA.id}/sessions/${sessionId}/assign`, token, { tutorId });

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

  test('a decline without a reason is rejected, then a decline frees the session for delete', async () => {
    expect((await api('patch', `/units/${ctx.unitA.id}/sessions/${ctx.s.held}/confirm`, ctx.tokens.tutor, { confirmed: false })).status).toBe(400);
    expect((await api('patch', `/units/${ctx.unitA.id}/sessions/${ctx.s.held}/confirm`, ctx.tokens.tutor, { confirmed: false, reason: 'clash' })).status).toBe(200);
    expect((await api('delete', `/units/${ctx.unitA.id}/sessions/${ctx.s.held}`, ctx.tokens.uc)).status).toBe(200);
    const gone = await query('SELECT id FROM sessions WHERE id = $1', [ctx.s.held]);
    expect(gone.rows).toHaveLength(0);
  });

  test('an overlapping assign is blocked, then a later non-overlapping slot succeeds', async () => {
    const tutorId = ctx.u.other.id;
    const token = ctx.tokens.uc;
    expect((await assign(ctx, ctx.s.open, token, tutorId)).status).toBe(200);
    const overlap = await assign(ctx, ctx.s.overlap, token, tutorId);
    expect(overlap.status).toBe(409);
    expect(overlap.body.error).toMatch(/overlap/i);
    expect((await assign(ctx, ctx.s.open2, token, tutorId)).status).toBe(200);
  });

  test('max hours blocks a second long assignment after a two-hour session is taken', async () => {
    await query('DELETE FROM session_tutors WHERE session_id = $1 AND tutor_id = $2', [ctx.s.held, ctx.u.tutor.id]);
    expect((await assign(ctx, ctx.s.long, ctx.tokens.uc, ctx.u.tutor.id)).status).toBe(200);
    const over = await assign(ctx, ctx.s.open, ctx.tokens.uc, ctx.u.tutor.id);
    expect(over.status).toBe(409);
    expect(over.body.error).toMatch(/max hours/i);
  });

  test('a lecture cannot take a normal tutor, then a super tutor is assigned and confirms', async () => {
    expect((await assign(ctx, ctx.s.lecture, ctx.tokens.uc, ctx.u.tutor.id)).status).toBe(409);
    expect((await assign(ctx, ctx.s.lecture, ctx.tokens.uc, ctx.u.super.id)).status).toBe(200);
    expect((await api('patch', `/units/${ctx.unitA.id}/sessions/${ctx.s.lecture}/confirm`, ctx.tokens.super, { confirmed: true })).status).toBe(200);
  });

  test('force-lock blocks assignment until the schedule is unlocked', async () => {
    expect((await api('patch', `/units/${ctx.unitA.id}/lock-schedule`, ctx.tokens.uc, { force: true })).status).toBe(200);
    expect((await assign(ctx, ctx.s.open2, ctx.tokens.uc, ctx.u.other.id)).status).toBe(409);
    expect((await api('patch', `/units/${ctx.unitA.id}/unlock-schedule`, ctx.tokens.uc, {})).status).toBe(200);
    expect((await assign(ctx, ctx.s.open2, ctx.tokens.uc, ctx.u.other.id)).status).toBe(200);
  });

  test('early access shows the timetable before draft release', async () => {
    const hidden = await api('get', `/units/${ctx.unitA.id}/sessions`, ctx.tokens.other);
    expect(hidden.body.released).toBe(false);
    expect((await api('put', `/units/${ctx.unitA.id}/tutors/${ctx.u.other.id}/early-access`, ctx.tokens.uc, { earlyAccess: true })).status).toBe(200);
    const visible = await api('get', `/units/${ctx.unitA.id}/sessions`, ctx.tokens.other);
    expect(Array.isArray(visible.body)).toBe(true);
    expect(visible.body.length).toBeGreaterThan(0);
  });

  test('unreleasing a draft hides the timetable again', async () => {
    await api('patch', `/units/${ctx.unitA.id}/release-draft`, ctx.tokens.uc, {});
    expect(Array.isArray((await api('get', `/units/${ctx.unitA.id}/sessions`, ctx.tokens.tutor)).body)).toBe(true);
    await api('patch', `/units/${ctx.unitA.id}/unrelease-draft`, ctx.tokens.uc, {});
    const hidden = await api('get', `/units/${ctx.unitA.id}/sessions`, ctx.tokens.tutor);
    expect(hidden.body.released).toBe(false);
  });

  test('the original tutor cannot claim their own cover', async () => {
    const broadcast = await api('post', '/uc/cover-requests', ctx.tokens.uc, {
      sessionIds: [ctx.s.held], startDate: '2026-10-07', endDate: '2026-10-07'
    });
    const id = broadcast.body.requests[0].id;
    expect((await api('post', `/cover-requests/${id}/claim`, ctx.tokens.tutor)).status).toBe(400);
    expect((await api('post', `/cover-requests/${id}/claim`, ctx.tokens.other)).status).toBe(200);
  });

  test('another coordinator cannot review or lock this unit', async () => {
    const submitted = await api('post', '/requests', ctx.tokens.tutor, {
      unitCode: 'API101', requestType: 'Session Change', reason: 'drop',
      currentSessionId: ctx.s.held
    });
    expect((await api('patch', `/uc/requests/${submitted.body.id}/review`, ctx.tokens.uc2, { status: 'Accepted' })).status).toBe(404);
    expect((await api('patch', `/units/${ctx.unitA.id}/lock-schedule`, ctx.tokens.uc2, { force: true })).status).toBe(404);
    expect((await api('patch', `/units/${ctx.unitA.id}/lock-schedule`, ctx.tokens.tutor, { force: true })).status).toBe(403);
  });

  test('an urgent request emails coordinators, and a reject notifies the tutor', async () => {
    sendEmail.mockClear();
    const submitted = await api('post', '/requests', ctx.tokens.tutor, {
      unitCode: 'API101', requestType: 'Session Swap', reason: 'urgent clash',
      currentSessionId: ctx.s.held, preferredSessionId: ctx.s.open2, priority: 'Urgent'
    });
    expect(sendEmail).toHaveBeenCalled();
    expect((await api('patch', `/uc/requests/${submitted.body.id}/review`, ctx.tokens.uc, { status: 'Rejected', reviewNotes: 'keep Wednesday' })).status).toBe(200);
    const notes = await api('get', '/notifications', ctx.tokens.tutor);
    expect(notes.body.notifications.some(item => item.type === 'request_rejected')).toBe(true);
    const stillHeld = await query(`SELECT tutor_id FROM session_tutors WHERE session_id = $1 AND tutor_confirmed IS DISTINCT FROM FALSE`, [ctx.s.held]);
    expect(stillHeld.rows.map(row => row.tutor_id)).toContain(ctx.u.tutor.id);
  });

  test('a locked schedule cannot accept a session change or a swap', async () => {
    await query('UPDATE units SET schedule_locked = TRUE WHERE id = $1', [ctx.unitA.id]);
    const change = await api('post', '/requests', ctx.tokens.tutor, {
      unitCode: 'API101', requestType: 'Session Change', reason: 'drop',
      currentSessionId: ctx.s.held
    });
    expect((await api('patch', `/uc/requests/${change.body.id}/review`, ctx.tokens.uc, { status: 'Accepted' })).status).toBe(409);
    const swap = await api('post', '/requests', ctx.tokens.tutor, {
      unitCode: 'API101', requestType: 'Session Swap', reason: 'move',
      currentSessionId: ctx.s.held, preferredSessionId: ctx.s.open2
    });
    expect((await api('patch', `/uc/requests/${swap.body.id}/review`, ctx.tokens.uc, { status: 'Accepted' })).status).toBe(409);
  });

  test('approving a swap onto a lecture is blocked for a normal tutor', async () => {
    const submitted = await api('post', '/requests', ctx.tokens.tutor, {
      unitCode: 'API101', requestType: 'Session Swap', reason: 'want lecture',
      currentSessionId: ctx.s.held, preferredSessionId: ctx.s.lecture
    });
    const review = await api('patch', `/uc/requests/${submitted.body.id}/review`, ctx.tokens.uc, { status: 'Accepted' });
    expect(review.status).toBe(409);
    const held = await query(`SELECT tutor_id FROM session_tutors WHERE session_id = $1 AND tutor_confirmed IS DISTINCT FROM FALSE`, [ctx.s.held]);
    expect(held.rows.map(row => row.tutor_id)).toContain(ctx.u.tutor.id);
  });

  test('accept-invite rejects a short password, then creates the account', async () => {
    const invite = await api('post', '/tutor-applications/direct-invite', ctx.tokens.uc, {
      unitId: ctx.unitA.id, email: 'short.invite@api.test', role: 'tutor'
    });
    expect((await api('post', '/tutor-applications/accept-invite', null, {
      token: invite.body.inviteToken, password: 'ab', firstName: 'Short', lastName: 'Pass'
    })).status).toBe(400);
    expect((await api('post', '/tutor-applications/accept-invite', null, {
      token: invite.body.inviteToken, password: 'abcdef', firstName: 'Short', lastName: 'Pass'
    })).status).toBe(201);
    expect((await api('post', '/auth/login', null, { email: 'short.invite@api.test', password: 'abcdef' })).status).toBe(200);
  });

  test('resubmitting availability replaces slots, lock blocks, unlock allows again', async () => {
    await api('post', '/availability/submit', ctx.tokens.tutor, {
      unitCode: 'API101', slots: { 'Monday-9:00am': 'preferred' }
    });
    await api('post', '/availability/submit', ctx.tokens.tutor, {
      unitCode: 'API101', slots: { 'Tuesday-10:00am': 'avoid' }
    });
    const rows = await query('SELECT day, preference FROM availability WHERE tutor_id = $1 AND unit_id = $2', [ctx.u.tutor.id, ctx.unitA.id]);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].preference).toBe('avoid');
    await api('patch', `/units/${ctx.unitA.id}/lock-availability`, ctx.tokens.uc, {});
    expect((await api('post', '/availability/submit', ctx.tokens.tutor, {
      unitCode: 'API101', slots: { 'Wednesday-11:00am': 'preferred' }
    })).status).toBe(409);
    await api('patch', `/units/${ctx.unitA.id}/unlock-availability`, ctx.tokens.uc, {});
    expect((await api('post', '/availability/submit', ctx.tokens.tutor, {
      unitCode: 'API101', slots: { 'Wednesday-11:00am': 'preferred' }
    })).status).toBe(201);
  });

  test('unit group chat rejects an outsider then accepts a member', async () => {
    expect((await api('post', `/messages/group/${ctx.unitA.id}`, ctx.tokens.outsider, { content: 'hello' })).status).toBe(403);
    expect((await api('post', `/messages/group/${ctx.unitA.id}`, ctx.tokens.tutor, { content: 'hello unit' })).status).toBe(201);
  });

  test('assignment notifications stay on the assigned tutor, not another tutor', async () => {
    await assign(ctx, ctx.s.open2, ctx.tokens.uc, ctx.u.other.id);
    const otherNotes = await api('get', '/notifications', ctx.tokens.other);
    const tutorNotes = await api('get', '/notifications', ctx.tokens.tutor);
    expect(otherNotes.body.notifications.some(item => item.type === 'session_assigned')).toBe(true);
    expect(tutorNotes.body.notifications.some(item => item.type === 'session_assigned')).toBe(false);
  });

  test('admin can disable a tutor so login fails, but cannot disable themselves', async () => {
    expect((await api('put', `/admin/users/${ctx.u.admin.id}`, ctx.tokens.admin, {
      firstName: 'Admin', lastName: 'Test', email: 'admin@api.test', role: 'admin', accountStatus: 'disabled'
    })).status).toBe(400);
    expect((await api('put', `/admin/users/${ctx.u.outsider.id}`, ctx.tokens.admin, {
      firstName: 'Out', lastName: 'Sider', email: 'outsider@api.test', role: 'tutor', accountStatus: 'disabled'
    })).status).toBe(200);
    expect((await api('post', '/auth/login', null, { email: 'outsider@api.test', password: PASSWORD })).status).toBe(403);
  });

  test('the reminder job rejects a bad secret, then emails a stale assignment once', async () => {
    expect((await api('post', '/jobs/session-assignment-reminders').set('x-cron-secret', 'wrong')).status).toBe(401);
    await query(`UPDATE session_tutors SET assigned_at = NOW() - INTERVAL '4 days', reminder_sent_at = NULL WHERE session_id = $1`, [ctx.s.held]);
    const first = await api('post', '/jobs/session-assignment-reminders').set('x-cron-secret', process.env.CRON_SECRET);
    expect(first.status).toBe(200);
    expect(first.body.emailedCount).toBe(1);
  });

  test('duplicate copies tutor memberships onto the new unit', async () => {
    const copy = await api('post', `/units/${ctx.unitA.id}/duplicate`, ctx.tokens.uc, {
      semester: 'Semester 1', year: 2027, unitCode: 'memdup'
    });
    const tutors = await query(
      `SELECT user_id FROM unit_memberships WHERE unit_id = $1 AND role IN ('tutor', 'super_tutor')`,
      [copy.body.id]
    );
    expect(tutors.rows.map(row => row.user_id).sort()).toEqual(
      [ctx.u.tutor.id, ctx.u.super.id, ctx.u.other.id].sort()
    );
  });

  test('creating a session rejects a taken code, then succeeds with a new code', async () => {
    const clash = await api('post', `/units/${ctx.unitA.id}/sessions`, ctx.tokens.uc, sessionBody({ sessionCode: 'TUT01', day: 'FRI', startTime: '15:00', endTime: '16:00' }));
    expect(clash.status).toBe(409);
    const created = await api('post', `/units/${ctx.unitA.id}/sessions`, ctx.tokens.uc, sessionBody({ sessionCode: 'TUT99', day: 'FRI', startTime: '15:00', endTime: '16:00' }));
    expect(created.status).toBe(201);
    expect(created.body.sessionCode).toBe('TUT99');
  });

  test('a coordinator cannot delete another coordinators unit', async () => {
    expect((await api('delete', `/units/${ctx.unitA.id}`, ctx.tokens.uc2)).status).toBe(404);
  });

  test('wrong current password is rejected, then a reset token logs in with the new password only', async () => {
    expect((await api('put', '/profile/password', ctx.tokens.tutor, { currentPassword: 'nope', newPassword: 'abcdef' })).status).toBe(401);
    const raw = 'flow-reset-token';
    await query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '30 minutes')`,
      [ctx.u.tutor.id, crypto.createHash('sha256').update(raw).digest('hex')]
    );
    expect((await api('post', '/auth/reset-password', null, { token: raw, newPassword: 'newpass' })).status).toBe(200);
    expect((await api('post', '/auth/login', null, { email: 'tutor@api.test', password: PASSWORD })).status).toBe(401);
    expect((await api('post', '/auth/login', null, { email: 'tutor@api.test', password: 'newpass' })).status).toBe(200);
    expect((await api('post', '/auth/reset-password', null, { token: raw, newPassword: 'again12' })).status).toBe(400);
  });

  test('empty messages are rejected, then a direct message is stored', async () => {
    expect((await api('post', '/messages', ctx.tokens.tutor, { recipientId: ctx.u.uc.id, content: '   ' })).status).toBe(400);
    const sent = await api('post', '/messages', ctx.tokens.tutor, { recipientId: ctx.u.uc.id, content: 'need a swap' });
    expect(sent.status).toBe(201);
    const stored = await query('SELECT content FROM messages WHERE sender_id = $1 AND recipient_id = $2', [ctx.u.tutor.id, ctx.u.uc.id]);
    expect(stored.rows.some(row => row.content === 'need a swap')).toBe(true);
  });

  test('the same tutor cannot be assigned twice, then another tutor can fill a second seat after capacity is raised', async () => {
    expect((await assign(ctx, ctx.s.held, ctx.tokens.uc, ctx.u.tutor.id)).status).toBe(409);
    await query('UPDATE sessions SET required_tutors = 2 WHERE id = $1', [ctx.s.held]);
    expect((await assign(ctx, ctx.s.held, ctx.tokens.uc, ctx.u.other.id)).status).toBe(200);
  });

  test('starring a tutor is stored and listing tutors includes that flag', async () => {
    expect((await api('put', `/units/${ctx.unitA.id}/tutors/${ctx.u.tutor.id}/starred`, ctx.tokens.uc, { starred: true })).body.starred).toBe(true);
    const list = await api('get', `/units/${ctx.unitA.id}/tutors`, ctx.tokens.uc);
    const row = list.body.find(item => item.id === ctx.u.tutor.id);
    expect(row).toBeDefined();
    expect(row.starred).toBe(true);
  });

  test('a coordinator can self-assign a tutorial and the session records them', async () => {
    expect((await assign(ctx, ctx.s.open, ctx.tokens.uc, ctx.u.uc.id)).status).toBe(200);
    const row = await query(`SELECT tutor_id FROM session_tutors WHERE session_id = $1 AND tutor_id = $2`, [ctx.s.open, ctx.u.uc.id]);
    expect(row.rows).toHaveLength(1);
  });

  test('the bot rejects an empty prompt after a unit exists', async () => {
    expect((await api('post', '/bot/chat', ctx.tokens.uc, { message: '' })).status).toBe(400);
  });

  test('a tutor cannot accept their own swap request', async () => {
    const submitted = await api('post', '/requests', ctx.tokens.tutor, {
      unitCode: 'API101', requestType: 'Session Swap', reason: 'prefer Tuesday',
      currentSessionId: ctx.s.held, preferredSessionId: ctx.s.open2
    });
    expect((await api('patch', `/requests/${submitted.body.id}`, ctx.tokens.tutor, { status: 'Accepted' })).status).toBe(403);
    const held = await query(`SELECT tutor_id FROM session_tutors WHERE session_id = $1 AND tutor_confirmed IS DISTINCT FROM FALSE`, [ctx.s.held]);
    expect(held.rows.map(row => row.tutor_id)).toContain(ctx.u.tutor.id);
  });

  test('an outsider cannot join a unit by submitting a request', async () => {
    expect((await api('post', '/requests', ctx.tokens.outsider, {
      unitCode: 'API101', requestType: 'Session Swap', reason: 'join',
      currentSessionId: ctx.s.held, preferredSessionId: ctx.s.open2
    })).status).toBe(403);
    const member = await query(
      `SELECT 1 FROM unit_memberships WHERE unit_id = $1 AND user_id = $2 AND role IN ('tutor', 'super_tutor')`,
      [ctx.unitA.id, ctx.u.outsider.id]
    );
    expect(member.rows).toHaveLength(0);
  });

  test('register rejects a short password', async () => {
    expect((await api('post', '/auth/register', null, {
      firstName: 'Short', lastName: 'Pass', email: 'short.reg@api.test', role: 'tutor',
      password: '123', confirmPassword: '123'
    })).status).toBe(400);
  });

  test('the main coordinator can delete a unit that still has sessions', async () => {
    expect((await api('delete', `/units/${ctx.unitA.id}`, ctx.tokens.uc)).status).toBe(200);
    expect((await query('SELECT id FROM units WHERE id = $1', [ctx.unitA.id])).rows).toHaveLength(0);
  });

  test('an API-assigned tutor cannot claim cover for that session', async () => {
    expect((await assign(ctx, ctx.s.open, ctx.tokens.uc, ctx.u.other.id)).status).toBe(200);
    const broadcast = await api('post', '/uc/cover-requests', ctx.tokens.uc, {
      sessionIds: [ctx.s.open], startDate: '2026-10-05', endDate: '2026-10-05'
    });
    expect((await api('post', `/cover-requests/${broadcast.body.requests[0].id}/claim`, ctx.tokens.other)).status).toBe(400);
  });
});