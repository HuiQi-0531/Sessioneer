// Availability deadline reminders, the UC bell, 24-hour session reminders and
// the unit teaching period. Emails are mocked (tests/rbac/mocks.js); the
// tests check who the mock was asked to email.
const { api, query, defineApiCases } = require('./harness');
const { sendEmail } = require('../../utils/email');

const CRON = () => process.env.CRON_SECRET;
const job = (path, body) => {
  const req = api('post', path).set('x-cron-secret', CRON());
  return body ? req.send(body) : req;
};
const emailedTo = () => sendEmail.mock.calls.map(([arg]) => (Array.isArray(arg.to) ? arg.to[0].email : arg.to));
const subjects = () => sendEmail.mock.calls.map(([arg]) => arg.subject);

const setDeadline = (unitId, sqlInterval) =>
  query(`UPDATE units SET availability_deadline = (NOW() AT TIME ZONE 'UTC') + INTERVAL '${sqlInterval}', availability_locked = FALSE WHERE id = $1`, [unitId]);

const submitAvailability = (unitId, tutorId) => query(
  `INSERT INTO availability (tutor_id, unit_id, day, start_time, end_time, preference, is_submitted, submitted_at)
   VALUES ($1, $2, 'MON', '09:00', '10:00', 'preferred', TRUE, NOW())`,
  [tutorId, unitId]
);

const notificationsFor = async (userId, type) =>
  (await query('SELECT * FROM notifications WHERE user_id = $1 AND notification_type = $2', [userId, type])).rows;

// Session reminder fixtures. The job runs "as of" Sun 11 Oct 2026, 10:15 am
// Brisbane (00:15 UTC), so a Monday 10:00 class is 23h45m away.
const AS_OF = '2026-10-11T00:15:00Z';
const CLASS_DATE = '2026-10-12';

const prepareSessionReminder = async (ctx, { locked = true, start = '2026-07-20', end = '2026-11-01' } = {}) => {
  await query(
    'UPDATE units SET schedule_locked = $2, teaching_start_date = $3, teaching_end_date = $4 WHERE id = $1',
    [ctx.unitA.id, locked, start, end]
  );
  const session = (await query(
    `INSERT INTO sessions (unit_id, day, start_time, end_time, location, campus, session_type, capacity, required_tutors, status, session_code)
     VALUES ($1, 'MON', '10:00', '12:00', 'GP-Z-410', 'GP', 'Tutorial', 30, 3, 'Confirmed', 'TUT10') RETURNING id`,
    [ctx.unitA.id]
  )).rows[0].id;
  await query(
    `INSERT INTO session_tutors (session_id, tutor_id, tutor_confirmed) VALUES
       ($1, $2, TRUE), ($1, $3, NULL), ($1, $4, FALSE)`,
    [session, ctx.u.tutor.id, ctx.u.super.id, ctx.u.other.id]
  );
  return session;
};

defineApiCases('API reminders', (add) => {
  // -------------------------------------------------------------------------
  // 2a. Availability deadline reminder job
  // -------------------------------------------------------------------------
  add('availability reminder job without the secret is refused', async () => {
    expect((await api('post', '/jobs/availability-deadline-reminders')).status).toBe(401);
    expect((await api('post', '/jobs/availability-deadline-reminders').set('x-cron-secret', 'wrong')).status).toBe(401);
  });

  add('availability reminder job emails only tutors who have not submitted', async (ctx) => {
    sendEmail.mockClear();
    await setDeadline(ctx.unitA.id, '2 days');
    await submitAvailability(ctx.unitA.id, ctx.u.tutor.id);

    const res = await job('/jobs/availability-deadline-reminders');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ unitCount: 1, checkedCount: 2, emailedCount: 2, failedCount: 0 });
    expect(emailedTo().sort()).toEqual(['other@api.test', 'super@api.test']);
    expect(subjects()).toEqual(['Reminder: submit your availability for API101', 'Reminder: submit your availability for API101']);
    expect(emailedTo()).not.toContain('tutor@api.test');
  });

  add('availability reminder job also creates an in-app notification', async (ctx) => {
    await setDeadline(ctx.unitA.id, '1 day');
    await job('/jobs/availability-deadline-reminders');
    const rows = await notificationsFor(ctx.u.other.id, 'availability_reminder');
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('Reminder: submit your availability for API101');
    expect(rows[0].action_url).toBe(`/availability?unitId=${ctx.unitA.id}`);
  });

  add('availability reminder job does not send twice for the same deadline', async (ctx) => {
    await setDeadline(ctx.unitA.id, '2 days');
    await job('/jobs/availability-deadline-reminders');
    sendEmail.mockClear();
    const second = await job('/jobs/availability-deadline-reminders');
    expect(second.status).toBe(200);
    expect(second.body.emailedCount).toBe(0);
    expect(second.body.alreadySentCount).toBe(3);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  add('a changed deadline allows one more reminder', async (ctx) => {
    await setDeadline(ctx.unitA.id, '2 days');
    await job('/jobs/availability-deadline-reminders');
    await setDeadline(ctx.unitA.id, '1 day');
    sendEmail.mockClear();
    const res = await job('/jobs/availability-deadline-reminders');
    expect(res.body.emailedCount).toBe(3);
  });

  add('availability reminder job skips units 4 days out, locked, or past the deadline', async (ctx) => {
    sendEmail.mockClear();
    await setDeadline(ctx.unitA.id, '4 days');
    expect((await job('/jobs/availability-deadline-reminders')).body.emailedCount).toBe(0);
    await setDeadline(ctx.unitA.id, '2 days');
    await query('UPDATE units SET availability_locked = TRUE WHERE id = $1', [ctx.unitA.id]);
    expect((await job('/jobs/availability-deadline-reminders')).body.emailedCount).toBe(0);
    await setDeadline(ctx.unitA.id, '-1 hour');
    expect((await job('/jobs/availability-deadline-reminders')).body.emailedCount).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  add('one failed email does not stop the others, and is retried next run', async (ctx) => {
    sendEmail.mockClear();
    await setDeadline(ctx.unitA.id, '2 days');
    sendEmail.mockRejectedValueOnce(new Error('Brevo down'));
    const first = await job('/jobs/availability-deadline-reminders');
    expect(first.body).toMatchObject({ emailedCount: 2, failedCount: 1 });
    expect(first.body.failures[0].error).toBe('Brevo down');

    const retry = await job('/jobs/availability-deadline-reminders');
    expect(retry.body).toMatchObject({ emailedCount: 1, failedCount: 0, alreadySentCount: 2 });
  });

  // -------------------------------------------------------------------------
  // 2b. UC bell
  // -------------------------------------------------------------------------
  add('the unit coordinator bell sends the reminder straight away', async (ctx) => {
    sendEmail.mockClear();
    const res = await api('post', '/availability/reminders', ctx.tokens.uc, { unitId: ctx.unitA.id, tutorId: ctx.u.other.id });
    expect(res.status).toBe(201);
    expect(emailedTo()).toEqual(['other@api.test']);
    expect(await notificationsFor(ctx.u.other.id, 'availability_reminder')).toHaveLength(1);
  });

  add('a second bell click on the same day is refused', async (ctx) => {
    await api('post', '/availability/reminders', ctx.tokens.uc, { unitId: ctx.unitA.id, tutorId: ctx.u.other.id });
    sendEmail.mockClear();
    const again = await api('post', '/availability/reminders', ctx.tokens.uc, { unitId: ctx.unitA.id, tutorId: ctx.u.other.id });
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('Reminder already sent today');
    expect(sendEmail).not.toHaveBeenCalled();
  });

  add('the bell result shows up as remindersSentToday in the UC availability view', async (ctx) => {
    await api('post', '/availability/reminders', ctx.tokens.uc, { unitId: ctx.unitA.id, tutorId: ctx.u.other.id });
    const view = await api('get', `/availability?unitId=${ctx.unitA.id}`, ctx.tokens.uc);
    expect(view.status).toBe(200);
    expect(view.body.remindersSentToday).toEqual([ctx.u.other.id]);
  });

  add('a coordinator of another unit cannot use the bell', async (ctx) => {
    const res = await api('post', '/availability/reminders', ctx.tokens.uc2, { unitId: ctx.unitA.id, tutorId: ctx.u.other.id });
    expect(res.status).toBe(403);
  });

  add('a tutor cannot use the bell', async (ctx) => {
    const res = await api('post', '/availability/reminders', ctx.tokens.tutor, { unitId: ctx.unitA.id, tutorId: ctx.u.other.id });
    expect(res.status).toBe(403);
  });

  add('the bell refuses someone who is not on the unit', async (ctx) => {
    const res = await api('post', '/availability/reminders', ctx.tokens.uc, { unitId: ctx.unitA.id, tutorId: ctx.u.outsider.id });
    expect(res.status).toBe(404);
  });

  add('the bell refuses a tutor who already submitted', async (ctx) => {
    await submitAvailability(ctx.unitA.id, ctx.u.tutor.id);
    const res = await api('post', '/availability/reminders', ctx.tokens.uc, { unitId: ctx.unitA.id, tutorId: ctx.u.tutor.id });
    expect(res.status).toBe(409);
  });

  add('the bell needs unitId and tutorId', async (ctx) => {
    expect((await api('post', '/availability/reminders', ctx.tokens.uc, { unitId: ctx.unitA.id })).status).toBe(400);
  });

  add('a failed bell email can be retried the same day', async (ctx) => {
    sendEmail.mockRejectedValueOnce(new Error('Brevo down'));
    const failed = await api('post', '/availability/reminders', ctx.tokens.uc, { unitId: ctx.unitA.id, tutorId: ctx.u.other.id });
    expect(failed.status).toBe(502);
    const retry = await api('post', '/availability/reminders', ctx.tokens.uc, { unitId: ctx.unitA.id, tutorId: ctx.u.other.id });
    expect(retry.status).toBe(201);
  });

  // -------------------------------------------------------------------------
  // 3. 24-hour session reminders
  // -------------------------------------------------------------------------
  add('session reminder job without the secret is refused', async () => {
    expect((await api('post', '/jobs/session-reminders')).status).toBe(401);
  });

  add('session reminder job rejects an unreadable asOf', async () => {
    expect((await job('/jobs/session-reminders', { asOf: 'tomorrow-ish' })).status).toBe(400);
  });

  add('only the Confirmed tutor is reminded (not Pending or Declined)', async (ctx) => {
    await prepareSessionReminder(ctx);
    sendEmail.mockClear();
    const res = await job('/jobs/session-reminders', { asOf: AS_OF });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ emailedCount: 1, failedCount: 0 });
    expect(emailedTo()).toEqual(['tutor@api.test']);
    expect(subjects()).toEqual(['Reminder: API101 Tutorial tomorrow at 10:00 am']);
    const [{ textContent }] = sendEmail.mock.calls[0];
    expect(textContent).toContain('Mon 12 Oct 2026');
    expect(textContent).toContain('GP-Z-410');
    expect(textContent).toContain(`/tutor-schedule/${ctx.unitA.id}`);
  });

  add('the same class is not reminded twice', async (ctx) => {
    await prepareSessionReminder(ctx);
    await job('/jobs/session-reminders', { asOf: AS_OF });
    sendEmail.mockClear();
    const second = await job('/jobs/session-reminders', { asOf: '2026-10-11T00:45:00Z' });
    expect(second.body.emailedCount).toBe(0);
    expect(second.body.alreadySentCount).toBe(1);
    expect(sendEmail).not.toHaveBeenCalled();
    const rows = await query('SELECT occurrence_date::text AS d FROM session_reminders');
    expect(rows.rows).toEqual([{ d: CLASS_DATE }]);
  });

  add('no reminders while the unit schedule is not locked', async (ctx) => {
    await prepareSessionReminder(ctx, { locked: false });
    sendEmail.mockClear();
    const res = await job('/jobs/session-reminders', { asOf: AS_OF });
    expect(res.body.emailedCount).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  add('no reminders for a class date outside the teaching period', async (ctx) => {
    await prepareSessionReminder(ctx, { start: '2026-07-20', end: '2026-10-11' });
    sendEmail.mockClear();
    expect((await job('/jobs/session-reminders', { asOf: AS_OF })).body.emailedCount).toBe(0);
  });

  add('a covered class reminds only the tutor who claimed the cover', async (ctx) => {
    const session = await prepareSessionReminder(ctx);
    const batch = (await query(
      `INSERT INTO cover_batches (unit_id, created_by_id, reason, start_date, end_date)
       VALUES ($1, $2, 'away', $3, $3) RETURNING id`,
      [ctx.unitA.id, ctx.u.uc.id, CLASS_DATE]
    )).rows[0].id;
    await query(
      `INSERT INTO cover_requests (batch_id, session_id, unit_id, original_tutor_id, status, claimed_by_id, claimed_at)
       VALUES ($1, $2, $3, $4, 'claimed', $5, NOW())`,
      [batch, session, ctx.unitA.id, ctx.u.tutor.id, ctx.u.outsider.id]
    );
    sendEmail.mockClear();
    const res = await job('/jobs/session-reminders', { asOf: AS_OF });
    expect(res.body.emailedCount).toBe(1);
    expect(emailedTo()).toEqual(['outsider@api.test']);
  });

  add('a tutor who turned off session notifications gets no notice and no email', async (ctx) => {
    await prepareSessionReminder(ctx);
    await query('UPDATE users SET notify_session_updates = FALSE WHERE id = $1', [ctx.u.tutor.id]);
    sendEmail.mockClear();
    const res = await job('/jobs/session-reminders', { asOf: AS_OF });
    expect(res.body).toMatchObject({ emailedCount: 0, skippedCount: 1 });
    expect(await notificationsFor(ctx.u.tutor.id, 'session_reminder')).toHaveLength(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  add('a reminded tutor also gets an in-app notification', async (ctx) => {
    await prepareSessionReminder(ctx);
    await job('/jobs/session-reminders', { asOf: AS_OF });
    const rows = await notificationsFor(ctx.u.tutor.id, 'session_reminder');
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('Reminder: API101 Tutorial tomorrow at 10:00 am');
  });

  add('a class 26 hours away is not reminded yet', async (ctx) => {
    await prepareSessionReminder(ctx);
    sendEmail.mockClear();
    const res = await job('/jobs/session-reminders', { asOf: '2026-10-10T22:00:00Z' });
    expect(res.body.emailedCount).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 3a. Teaching period on units
  // -------------------------------------------------------------------------
  add('UC can create a unit with a teaching period', async (ctx) => {
    const res = await api('post', '/units', ctx.tokens.uc, {
      unitCode: 'TCH101', unitName: 'Teaching', semester: 'Semester 2', year: 2026,
      teachingStartDate: '2026-07-20', teachingEndDate: '2026-11-01'
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ teachingStartDate: '2026-07-20', teachingEndDate: '2026-11-01' });
  });

  add('UC cannot create a unit whose teaching period ends before it starts', async (ctx) => {
    const res = await api('post', '/units', ctx.tokens.uc, {
      unitCode: 'TCH102', unitName: 'Teaching', semester: 'Semester 2', year: 2026,
      teachingStartDate: '2026-11-01', teachingEndDate: '2026-07-20'
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/on or after/);
  });

  add('UC can set, keep and clear the teaching period when editing', async (ctx) => {
    const set = await api('put', `/units/${ctx.unitA.id}`, ctx.tokens.uc, {
      teachingStartDate: '2026-07-20', teachingEndDate: '2026-07-20'
    });
    expect(set.status).toBe(200);
    expect(set.body.teachingEndDate).toBe('2026-07-20');

    const kept = await api('put', `/units/${ctx.unitA.id}`, ctx.tokens.uc, { unitName: 'Renamed' });
    expect(kept.body.teachingStartDate).toBe('2026-07-20');

    const cleared = await api('put', `/units/${ctx.unitA.id}`, ctx.tokens.uc, { teachingStartDate: '', teachingEndDate: '' });
    expect(cleared.body).toMatchObject({ teachingStartDate: null, teachingEndDate: null });

    const bad = await api('put', `/units/${ctx.unitA.id}`, ctx.tokens.uc, { teachingStartDate: '2026-08-01', teachingEndDate: '2026-07-01' });
    expect(bad.status).toBe(400);
  });

  add('admin can create and edit a unit teaching period, with the same check', async (ctx) => {
    const created = await api('post', '/admin/units', ctx.tokens.admin, {
      unitCode: 'ADM101', unitName: 'Admin unit', semester: 'Semester 2', year: 2026,
      coordinatorEmail: 'uc@api.test', teachingStartDate: '2026-07-20', teachingEndDate: '2026-11-01'
    });
    expect(created.status).toBe(201);
    expect(created.body.teachingStartDate).toBe('2026-07-20');

    const bad = await api('put', `/admin/units/${created.body.id}`, ctx.tokens.admin, {
      unitCode: 'ADM101', unitName: 'Admin unit', semester: 'Semester 2', year: 2026,
      coordinatorEmail: 'uc@api.test', teachingStartDate: '2026-11-01', teachingEndDate: '2026-07-20'
    });
    expect(bad.status).toBe(400);

    const edited = await api('put', `/admin/units/${created.body.id}`, ctx.tokens.admin, {
      unitCode: 'ADM101', unitName: 'Admin unit', semester: 'Semester 2', year: 2026,
      coordinatorEmail: 'uc@api.test', teachingStartDate: '2026-07-27', teachingEndDate: '2026-10-30'
    });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ teachingStartDate: '2026-07-27', teachingEndDate: '2026-10-30' });
  });
});
