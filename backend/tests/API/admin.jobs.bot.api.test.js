const { api, query, sessionBody, defineApiCases } = require('./harness');

const adminSession = (ctx, overrides = {}) => sessionBody({
  unitId: ctx.unitA.id, day: 'MON', startTime: '10:00', endTime: '11:00', ...overrides
});

defineApiCases('API admin jobs bot', (add) => {
  add('admin user create rejects missing fields', async (ctx) => {
    expect((await api('post', '/admin/users', ctx.tokens.admin, { firstName: 'A' })).status).toBe(400);
  });

  add('admin user create rejects an invalid email', async (ctx) => {
    expect((await api('post', '/admin/users', ctx.tokens.admin, {
      firstName: 'A', lastName: 'B', email: 'not-an-email', role: 'tutor', accountStatus: 'active'
    })).status).toBe(400);
  });

  add('admin user create maps uc to coordinator and can leave the account pending', async (ctx) => {
    const created = await api('post', '/admin/users', ctx.tokens.admin, {
      firstName: 'New', lastName: 'Tutor', email: 'NEW.TUTOR@api.test', role: 'uc', accountStatus: 'pending', sendSetupLink: false
    });
    expect(created.status).toBe(201);
    expect(created.body.role).toBe('coordinator');
    expect(created.body.accountStatus).toBe('pending');
  });

  add('admin user create rejects a duplicate email', async (ctx) => {
    expect((await api('post', '/admin/users', ctx.tokens.admin, {
      firstName: 'Tutor', lastName: 'Test', email: 'tutor@api.test', role: 'tutor', accountStatus: 'active', sendSetupLink: false
    })).status).toBe(409);
  });

  add('an admin cannot remove their own admin role', async (ctx) => {
    expect((await api('put', `/admin/users/${ctx.u.admin.id}`, ctx.tokens.admin, {
      firstName: 'Admin', lastName: 'Test', email: 'admin@api.test', role: 'tutor', accountStatus: 'active'
    })).status).toBe(400);
  });

  add('an admin cannot disable their own account', async (ctx) => {
    expect((await api('put', `/admin/users/${ctx.u.admin.id}`, ctx.tokens.admin, {
      firstName: 'Admin', lastName: 'Test', email: 'admin@api.test', role: 'admin', accountStatus: 'disabled'
    })).status).toBe(400);
  });

  add('an admin can rename another user', async (ctx) => {
    const renamed = await api('put', `/admin/users/${ctx.u.tutor.id}`, ctx.tokens.admin, {
      firstName: 'Tutor', lastName: 'Renamed', email: 'tutor@api.test', role: 'tutor', accountStatus: 'active'
    });
    expect(renamed.status).toBe(200);
  });

  add('an admin can send a reset link', async (ctx) => {
    expect((await api('post', `/admin/users/${ctx.u.tutor.id}/send-reset-link`, ctx.tokens.admin, {})).status).toBe(200);
  });

  add('an admin can list a user unit access', async (ctx) => {
    expect((await api('get', `/admin/users/${ctx.u.tutor.id}/units`, ctx.tokens.admin)).status).toBe(200);
  });

  add('an admin account cannot be added to a teaching unit', async (ctx) => {
    expect((await api('post', `/admin/users/${ctx.u.admin.id}/units`, ctx.tokens.admin, {
      unitId: ctx.unitA.id, role: 'tutor'
    })).status).toBe(400);
  });

  add('adding unit access requires a unit and a role', async (ctx) => {
    expect((await api('post', `/admin/users/${ctx.u.outsider.id}/units`, ctx.tokens.admin, { role: 'tutor' })).status).toBe(400);
  });

  add('an admin can add tutor access', async (ctx) => {
    expect((await api('post', `/admin/users/${ctx.u.outsider.id}/units`, ctx.tokens.admin, {
      unitId: ctx.unitA.id, role: 'tutor'
    })).status).toBe(201);
  });

  add('the main coordinator cannot be removed from their unit', async (ctx) => {
    expect((await api('delete', `/admin/users/${ctx.u.uc.id}/units/${ctx.unitA.id}/coordinator`, ctx.tokens.admin)).status).toBe(409);
  });

  add('a tutor with an assignment cannot be removed', async (ctx) => {
    expect((await api('delete', `/admin/users/${ctx.u.tutor.id}/units/${ctx.unitA.id}/tutor`, ctx.tokens.admin)).status).toBe(409);
  });

  add('an unassigned membership can be removed', async (ctx) => {
    await api('post', `/admin/users/${ctx.u.outsider.id}/units`, ctx.tokens.admin, { unitId: ctx.unitA.id, role: 'tutor' });
    expect((await api('delete', `/admin/users/${ctx.u.outsider.id}/units/${ctx.unitA.id}/tutor`, ctx.tokens.admin)).status).toBe(200);
  });

  add('admin unit create rejects missing fields', async (ctx) => {
    expect((await api('post', '/admin/units', ctx.tokens.admin, { unitName: 'X' })).status).toBe(400);
  });

  add('admin unit create rejects a tutor as the main coordinator', async (ctx) => {
    expect((await api('post', '/admin/units', ctx.tokens.admin, {
      unitCode: 'ADM1', unitName: 'Admin Unit', semester: 'Semester 1', year: 2027, coordinatorEmail: 'tutor@api.test'
    })).status).toBe(400);
  });

  add('admin unit create rejects a duplicate semester', async (ctx) => {
    expect((await api('post', '/admin/units', ctx.tokens.admin, {
      unitCode: 'API101', unitName: 'Dup', semester: 'Semester 2', year: 2026, coordinatorEmail: 'uc@api.test'
    })).status).toBe(409);
  });

  add('admin unit create succeeds for a new semester', async (ctx) => {
    const unit = await api('post', '/admin/units', ctx.tokens.admin, {
      unitCode: 'adm1', unitName: 'Admin Unit', semester: 'Semester 1', year: 2027, coordinatorEmail: 'uc@api.test'
    });
    expect(unit.status).toBe(201);
  });

  for (const [field, label] of [
    ['unitId', 'Unit'], ['day', 'Day'], ['startTime', 'Start time'], ['endTime', 'End time'],
    ['location', 'Location'], ['campus', 'Campus'], ['sessionType', 'Type'],
    ['capacity', 'Capacity'], ['requiredTutors', 'Tutor'], ['status', 'Status']
  ]) {
    add(`admin session create rejects a missing ${label}`, async (ctx) => {
      const body = adminSession(ctx);
      delete body[field];
      const res = await api('post', '/admin/sessions', ctx.tokens.admin, body);
      expect(res.status).toBe(400);
      expect(res.body.error).toContain(label);
    });
  }

  add('admin session create rejects capacity below 1', async (ctx) => {
    expect((await api('post', '/admin/sessions', ctx.tokens.admin, adminSession(ctx, { capacity: -1 }))).status).toBe(400);
  });

  add('admin session create stores a complete session', async (ctx) => {
    expect((await api('post', '/admin/sessions', ctx.tokens.admin, adminSession(ctx))).status).toBe(201);
  });

  add('admin cannot move an assigned session to another unit', async (ctx) => {
    expect((await api('put', `/admin/sessions/${ctx.s.held}`, ctx.tokens.admin, adminSession(ctx, { unitId: ctx.unitB.id }))).status).toBe(409);
  });

  add('admin cannot delete a session that still has a tutor', async (ctx) => {
    expect((await api('delete', `/admin/sessions/${ctx.s.held}`, ctx.tokens.admin)).status).toBe(409);
  });

  add('admin can delete an unassigned session', async (ctx) => {
    expect((await api('delete', `/admin/sessions/${ctx.s.open}`, ctx.tokens.admin)).status).toBe(200);
  });

  add('admin cannot assign a normal tutor to a lecture', async (ctx) => {
    expect((await api('post', `/admin/sessions/${ctx.s.lecture}/assignments`, ctx.tokens.admin, { tutorId: ctx.u.tutor.id })).status).toBe(409);
  });

  add('admin can assign a super tutor to a lecture', async (ctx) => {
    expect((await api('post', `/admin/sessions/${ctx.s.lecture}/assignments`, ctx.tokens.admin, { tutorId: ctx.u.super.id })).status).toBe(201);
  });

  add('admin cannot change assignments while the schedule is locked', async (ctx) => {
    await api('post', `/admin/sessions/${ctx.s.lecture}/assignments`, ctx.tokens.admin, { tutorId: ctx.u.super.id });
    await query('UPDATE units SET schedule_locked = TRUE WHERE id = $1', [ctx.unitA.id]);
    expect((await api('delete', `/admin/sessions/${ctx.s.lecture}/assignments/${ctx.u.super.id}`, ctx.tokens.admin)).status).toBe(409);
  });

  add('admin can list sessions', async (ctx) => {
    expect((await api('get', '/admin/sessions', ctx.tokens.admin)).status).toBe(200);
  });

  add('admin can list requests', async (ctx) => {
    expect((await api('get', '/admin/requests', ctx.tokens.admin)).status).toBe(200);
  });

  add('admin can list applications', async (ctx) => {
    expect((await api('get', '/admin/applications', ctx.tokens.admin)).status).toBe(200);
  });

  add('the reminder job rejects a missing secret', async () => {
    expect((await api('post', '/jobs/session-assignment-reminders')).status).toBe(401);
  });

  add('the reminder job rejects the wrong secret', async () => {
    expect((await api('post', '/jobs/session-assignment-reminders').set('x-cron-secret', 'wrong')).status).toBe(401);
  });

  add('the reminder job ignores an assignment younger than 3 days', async () => {
    const res = await api('post', '/jobs/session-assignment-reminders').set('x-cron-secret', process.env.CRON_SECRET);
    expect(res.status).toBe(200);
    expect(res.body.emailedCount).toBe(0);
  });

  add('the reminder job emails an assignment that is at least 3 days old', async (ctx) => {
    await query(`UPDATE session_tutors SET assigned_at = NOW() - INTERVAL '4 days', reminder_sent_at = NULL WHERE session_id = $1`, [ctx.s.held]);
    const res = await api('post', '/jobs/session-assignment-reminders').set('x-cron-secret', process.env.CRON_SECRET);
    expect(res.body.emailedCount).toBe(1);
  });

  add('the reminder job does not email the same assignment twice', async (ctx) => {
    await query(`UPDATE session_tutors SET assigned_at = NOW() - INTERVAL '4 days', reminder_sent_at = NULL WHERE session_id = $1`, [ctx.s.held]);
    await api('post', '/jobs/session-assignment-reminders').set('x-cron-secret', process.env.CRON_SECRET);
    const second = await api('post', '/jobs/session-assignment-reminders').set('x-cron-secret', process.env.CRON_SECRET);
    expect(second.body.emailedCount).toBe(0);
  });

  add('the bot rejects an empty message', async (ctx) => {
    expect((await api('post', '/bot/chat', ctx.tokens.uc, { message: '   ' })).status).toBe(400);
  });

  add('the bot reports that Ollama is down', async (ctx) => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn(async () => ({ ok: false, json: async () => ({}) }));
    expect((await api('post', '/bot/chat', ctx.tokens.uc, { message: 'who has not submitted?' })).status).toBe(502);
    global.fetch = originalFetch;
  });

  add('the bot returns a plain reply', async (ctx) => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ message: { content: 'Plain answer' } })
    }));
    const res = await api('post', '/bot/chat', ctx.tokens.uc, { message: 'hello', history: [{ role: 'user', content: 'earlier' }] });
    expect(res.body.reply).toBe('Plain answer');
    global.fetch = originalFetch;
  });

  add('the bot names tutors who have not submitted availability', async (ctx) => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        message: {
          tool_calls: [{ function: { name: 'list_unsubmitted_tutors', arguments: { unitCode: 'API101' } } }]
        }
      })
    }));
    const res = await api('post', '/bot/chat', ctx.tokens.uc, { message: 'who is missing availability?' });
    expect(res.status).toBe(200);
    expect(res.body.reply).toMatch(/API101/);
    global.fetch = originalFetch;
  });
});