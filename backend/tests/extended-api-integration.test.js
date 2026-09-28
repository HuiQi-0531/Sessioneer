const request = require('supertest');
const emailUtils = require('../utils/email');
const {
  TEST_PASSWORD,
  query,
  resetTestDatabase,
  seedCoreData,
  waitForSchema
} = require('./helpers');

let app;
let server;
let io;
let pool;
let ctx;

const auth = (token) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  await resetTestDatabase();
  ({ app, server, io } = require('../server'));
  pool = require('../db');
  await waitForSchema();
  ctx = await seedCoreData();
});

afterAll(async () => {
  if (io) io.close();
  if (server) server.close();
  if (pool) await pool.end();
});

describe('Availability workflows', () => {
  test('coordinator can view tutor availability for their unit', async () => {
    const res = await request(app)
      .get(`/availability?unitCode=${ctx.unit.unit_code}`)
      .set(auth(ctx.tokens.coordinator));

    expect(res.status).toBe(200);
    expect(res.body.tutors.map((tutor) => tutor.id)).toEqual(
      expect.arrayContaining([ctx.users.tutor.id, ctx.users.superTutor.id])
    );
    expect(res.body.submissionStatus).toEqual(
      expect.arrayContaining([{ tutorId: ctx.users.tutor.id, submitted: false }])
    );
  });

  test('tutor can submit availability and the database stores the submitted slots', async () => {
    const res = await request(app)
      .post('/availability/submit')
      .set(auth(ctx.tokens.tutor))
      .send({
        unitCode: ctx.unit.unit_code,
        slots: {
          'Monday-9:00am': 'preferred',
          'Tuesday-10:00am': 'available',
          'Friday-2:00pm': 'avoid'
        }
      });

    expect(res.status).toBe(201);

    const db = await query(
      `SELECT day, start_time, preference, is_submitted
       FROM availability
       WHERE tutor_id = $1 AND unit_id = $2
       ORDER BY day, start_time`,
      [ctx.users.tutor.id, ctx.unit.id]
    );
    expect(db.rows).toHaveLength(3);
    expect(db.rows.every((row) => row.is_submitted)).toBe(true);
    expect(db.rows.map((row) => row.preference)).toEqual(
      expect.arrayContaining(['preferred', 'available', 'avoid'])
    );
  });

  test('locked availability rejects a new tutor submission', async () => {
    await query('UPDATE units SET availability_locked = TRUE WHERE id = $1', [ctx.unit.id]);

    const res = await request(app)
      .post('/availability/submit')
      .set(auth(ctx.tokens.coverTutor))
      .send({ unitCode: ctx.unit.unit_code, slots: { 'Monday-9:00am': 'available' } });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/closed/i);

    await query('UPDATE units SET availability_locked = FALSE WHERE id = $1', [ctx.unit.id]);
  });
});

describe('Tutor application workflows', () => {
  test('public application link returns unit details and the default form', async () => {
    const res = await request(app).get(`/tutor-applications/unit/${ctx.unit.id}`);

    expect(res.status).toBe(200);
    expect(res.body.unitCode).toBe(ctx.unit.unit_code);
    expect(Array.isArray(res.body.applicationForm)).toBe(true);
  });

  test('public applicant can submit an application with custom answers', async () => {
    const res = await request(app)
      .post('/tutor-applications')
      .send({
        unitId: ctx.unit.id,
        firstName: 'Applicant',
        lastName: 'Example',
        email: 'applicant@sessioneer.test',
        workExperience: 'Two years tutoring',
        customAnswers: {
          teachingStyle: 'Practical examples',
          phoneNumber: 'should be stored in the dedicated column'
        }
      });

    expect(res.status).toBe(201);
    const db = await query(
      'SELECT status, custom_answers FROM tutor_applications WHERE email = $1',
      ['applicant@sessioneer.test']
    );
    expect(db.rows[0].status).toBe('pending');
    expect(db.rows[0].custom_answers).toEqual({ teachingStyle: 'Practical examples' });
  });

  test('coordinator can customise and reset the application form', async () => {
    const fields = [
      { key: 'teachingStyle', label: 'Teaching style', type: 'text', required: false }
    ];

    const saved = await request(app)
      .put(`/tutor-applications/form/${ctx.unit.id}`)
      .set(auth(ctx.tokens.coordinator))
      .send({ fields });

    expect(saved.status).toBe(200);
    expect(saved.body.fields).toEqual(fields);

    const reset = await request(app)
      .post(`/tutor-applications/form/${ctx.unit.id}/reset`)
      .set(auth(ctx.tokens.coordinator));

    expect(reset.status).toBe(200);
    expect(Array.isArray(reset.body.fields)).toBe(true);
    const db = await query('SELECT application_form FROM units WHERE id = $1', [ctx.unit.id]);
    expect(db.rows[0].application_form).toBeNull();
  });

  test('direct invite can be verified and accepted as a Super Tutor', async () => {
    const invited = await request(app)
      .post('/tutor-applications/direct-invite')
      .set(auth(ctx.tokens.coordinator))
      .send({
        unitId: ctx.unit.id,
        email: 'invited@sessioneer.test',
        role: 'super_tutor'
      });

    expect(invited.status).toBe(201);
    expect(invited.body.invitedRole).toBe('super_tutor');

    const verified = await request(app)
      .get(`/tutor-applications/verify-invite/${invited.body.inviteToken}`);
    expect(verified.status).toBe(200);
    expect(verified.body.email).toBe('invited@sessioneer.test');
    expect(verified.body.requiresName).toBe(true);

    const accepted = await request(app)
      .post('/tutor-applications/accept-invite')
      .send({
        token: invited.body.inviteToken,
        password: TEST_PASSWORD,
        firstName: 'Invited',
        lastName: 'Tutor'
      });

    expect(accepted.status).toBe(201);
    const db = await query(
      `SELECT u.id, um.role
       FROM users u
       JOIN unit_memberships um ON um.user_id = u.id
       WHERE u.email = $1 AND um.unit_id = $2`,
      ['invited@sessioneer.test', ctx.unit.id]
    );
    expect(db.rows).toEqual([{ id: db.rows[0].id, role: 'super_tutor' }]);
  });
});

describe('Messaging workflows', () => {
  test('user can send and retrieve a direct message thread', async () => {
    const sent = await request(app)
      .post('/messages')
      .set(auth(ctx.tokens.coordinator))
      .send({ recipientId: ctx.users.tutor.id, content: 'Please review the schedule.' });

    expect(sent.status).toBe(201);
    expect(sent.body.content).toBe('Please review the schedule.');
    expect(sent.body.isMine).toBe(true);

    const thread = await request(app)
      .get(`/messages/thread/${ctx.users.coordinator.id}`)
      .set(auth(ctx.tokens.tutor));

    expect(thread.status).toBe(200);
    expect(thread.body.some((message) => message.content === 'Please review the schedule.')).toBe(true);
  });

  test('unit member can send and retrieve a group message', async () => {
    const sent = await request(app)
      .post(`/messages/group/${ctx.unit.id}`)
      .set(auth(ctx.tokens.tutor))
      .send({ content: 'Group schedule update.' });

    expect(sent.status).toBe(201);
    expect(sent.body.content).toBe('Group schedule update.');

    const group = await request(app)
      .get(`/messages/group/${ctx.unit.id}`)
      .set(auth(ctx.tokens.coordinator));

    expect(group.status).toBe(200);
    expect(group.body.some((message) => message.content === 'Group schedule update.')).toBe(true);
  });

  test('user can mark a direct message thread as read', async () => {
    await query(
      `INSERT INTO messages (sender_id, recipient_id, content, is_read)
       VALUES ($1, $2, 'Unread message', FALSE)`,
      [ctx.users.coordinator.id, ctx.users.tutor.id]
    );

    const res = await request(app)
      .patch(`/messages/thread/${ctx.users.coordinator.id}/read`)
      .set(auth(ctx.tokens.tutor));

    expect(res.status).toBe(200);
    const db = await query(
      `SELECT COUNT(*) FROM messages
       WHERE sender_id = $1 AND recipient_id = $2 AND content = 'Unread message' AND is_read = TRUE`,
      [ctx.users.coordinator.id, ctx.users.tutor.id]
    );
    expect(db.rows[0].count).toBe('1');
  });
});

describe('Notifications and dashboard workflows', () => {
  test('user can list notifications and mark one as read', async () => {
    const created = await query(
      `INSERT INTO notifications (user_id, notification_type, title, content)
       VALUES ($1, 'test', 'Test notification', 'A notification for automated testing')
       RETURNING id`,
      [ctx.users.tutor.id]
    );

    const listed = await request(app)
      .get('/notifications')
      .set(auth(ctx.tokens.tutor));

    expect(listed.status).toBe(200);
    expect(listed.body.notifications.some((item) => item.id === created.rows[0].id)).toBe(true);
    expect(listed.body.unreadCount).toBeGreaterThanOrEqual(1);

    const marked = await request(app)
      .patch(`/notifications/${created.rows[0].id}/read`)
      .set(auth(ctx.tokens.tutor));
    expect(marked.status).toBe(200);

    const db = await query('SELECT is_read FROM notifications WHERE id = $1', [created.rows[0].id]);
    expect(db.rows[0].is_read).toBe(true);
  });

  test('tutor dashboard includes unit and assignment status', async () => {
    const res = await request(app)
      .get('/tutor/dashboard-summary')
      .set(auth(ctx.tokens.tutor));

    expect(res.status).toBe(200);
    expect(res.body.unitStatuses.some((unit) => unit.unitCode === ctx.unit.unit_code)).toBe(true);
    expect(res.body.totalSessions).toBe(1);
    expect(res.body.pendingRequestsCount).toBe(0);
  });

  test('coordinator dashboard includes session and assignment counts', async () => {
    const res = await request(app)
      .get('/uc/dashboard-summary')
      .set(auth(ctx.tokens.coordinator));

    expect(res.status).toBe(200);
    expect(res.body.totalUnits).toBe(1);
    expect(res.body.totalSessions).toBe(4);
    expect(res.body.unitStatuses[0].unitCode).toBe(ctx.unit.unit_code);
  });
});

describe('Unit management workflows', () => {
  test('coordinator can create a unit without campus or delivery mode fields', async () => {
    const res = await request(app)
      .post('/units')
      .set(auth(ctx.tokens.coordinator))
      .send({
        unitCode: 'NEW101',
        unitName: 'New Test Unit',
        semester: 'Summer',
        year: 2027,
        enrolmentSize: 80
      });

    expect(res.status).toBe(201);
    expect(res.body.unitCode).toBe('NEW101');
    const db = await query(
      'SELECT campus, delivery_mode FROM units WHERE unit_code = $1 AND year = $2',
      ['NEW101', 2027]
    );
    expect(db.rows[0].campus).toBeNull();
    expect(db.rows[0].delivery_mode).toBeNull();
  });

  test('coordinator cannot create a duplicate unit for the same semester and year', async () => {
    const res = await request(app)
      .post('/units')
      .set(auth(ctx.tokens.coordinator))
      .send({
        unitCode: ctx.unit.unit_code,
        unitName: 'Duplicate Test Unit',
        semester: 'Semester 2',
        year: 2026
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
  });

  test('authenticated user unit access returns role information', async () => {
    const res = await request(app)
      .get('/units/my-access')
      .set(auth(ctx.tokens.coordinator));

    expect(res.status).toBe(200);
    const unit = res.body.find((item) => item.unitCode === ctx.unit.unit_code);
    expect(unit.roles).toContain('coordinator');
  });
});

describe('Profile and preference workflows', () => {
  test('tutor profile edits persist editable fields', async () => {
    const res = await request(app).put('/profile').set(auth(ctx.tokens.tutor)).send({
      firstName: 'Taylor', lastName: 'Updated', phoneNumber: '0400123456',
      workExperience: 'Three years tutoring', maximumHours: 12, contractType: 'Casual'
    });
    expect(res.status).toBe(200);
    const db = await query(
      'SELECT last_name, phone_number, work_experience, maximum_hours, contract_type FROM users WHERE id = $1',
      [ctx.users.tutor.id]
    );
    expect(db.rows[0]).toMatchObject({ last_name: 'Updated', phone_number: '0400123456',
      work_experience: 'Three years tutoring', maximum_hours: 12, contract_type: 'Casual' });
  });

  test('coordinator profile update cannot alter tutor-only fields', async () => {
    const res = await request(app).put('/profile').set(auth(ctx.tokens.coordinator)).send({
      firstName: 'Casey', workExperience: 'Forged', maximumHours: 99, contractType: 'Casual'
    });
    expect(res.status).toBe(200);
    const db = await query('SELECT work_experience, maximum_hours, contract_type FROM users WHERE id = $1',
      [ctx.users.coordinator.id]);
    expect(db.rows[0]).toMatchObject({ work_experience: null, maximum_hours: null, contract_type: null });
  });

  test('notification preferences persist independently', async () => {
    const res = await request(app).put('/profile/notifications').set(auth(ctx.tokens.tutor))
      .send({ notifySessionUpdates: false, notifyRequestUpdates: true });
    expect(res.status).toBe(200);
    const db = await query('SELECT notify_session_updates, notify_request_updates FROM users WHERE id = $1',
      [ctx.users.tutor.id]);
    expect(db.rows[0]).toEqual({ notify_session_updates: false, notify_request_updates: true });
  });

  test('incorrect current password cannot change password', async () => {
    const before = await query('SELECT password_hash FROM users WHERE id = $1', [ctx.users.tutor.id]);
    const res = await request(app).put('/profile/password').set(auth(ctx.tokens.tutor))
      .send({ currentPassword: 'wrong', newPassword: 'NewPassword123!' });
    expect(res.status).toBe(401);
    const after = await query('SELECT password_hash FROM users WHERE id = $1', [ctx.users.tutor.id]);
    expect(after.rows[0].password_hash).toBe(before.rows[0].password_hash);
  });
});

describe('Tutor management and message state', () => {
  test('coordinator tutor list deduplicates roles and shows super tutor access', async () => {
    await query("INSERT INTO unit_memberships (unit_id, user_id, role) VALUES ($1, $2, 'tutor') ON CONFLICT DO NOTHING",
      [ctx.unit.id, ctx.users.superTutor.id]);
    const res = await request(app).get(`/units/${ctx.unit.id}/tutors`).set(auth(ctx.tokens.coordinator));
    expect(res.status).toBe(200);
    const matching = res.body.filter((tutor) => tutor.id === ctx.users.superTutor.id);
    expect(matching).toHaveLength(1);
    expect(matching[0].role).toBe('super_tutor');
  });

  test('coordinator marker and flags persist on the tutor-unit link', async () => {
    const base = `/units/${ctx.unit.id}/tutors/${ctx.users.tutor.id}`;
    const marker = await request(app).put(`${base}/marker`).set(auth(ctx.tokens.coordinator))
      .send({ priorityTag: 'Preferred', internalNotes: 'Reliable', tags: ['Experienced'] });
    expect(marker.status).toBe(200);
    for (const [suffix, body, key] of [
      ['early-access', { earlyAccess: true }, 'earlyAccess'],
      ['starred', { starred: true }, 'starred'],
      ['flagged', { flagged: true }, 'flagged']
    ]) {
      const res = await request(app).put(`${base}/${suffix}`).set(auth(ctx.tokens.coordinator)).send(body);
      expect(res.status).toBe(200);
      expect(res.body[key]).toBe(true);
    }
    const db = await query(
      'SELECT priority_tag, internal_notes, tags, early_access, starred, flagged FROM tutor_unit_markers WHERE unit_id = $1 AND tutor_id = $2',
      [ctx.unit.id, ctx.users.tutor.id]
    );
    expect(db.rows[0]).toMatchObject({ priority_tag: 'Preferred', internal_notes: 'Reliable',
      tags: ['Experienced'], early_access: true, starred: true, flagged: true });
  });

  test('coordinator can see linked tutor contacts', async () => {
    const res = await request(app).get(`/units/${ctx.unit.id}/messages/contacts`)
      .set(auth(ctx.tokens.coordinator));
    expect(res.status).toBe(200);
    expect(res.body.map((contact) => contact.userId)).toContain(ctx.users.tutor.id);
  });

  test('group unread count decreases after marking the group read', async () => {
    const sent = await request(app).post(`/messages/group/${ctx.unit.id}`)
      .set(auth(ctx.tokens.coordinator)).send({ content: 'Unread group update' });
    expect(sent.status).toBe(201);
    const before = await request(app).get(`/units/${ctx.unit.id}/messages/group-unread-count`)
      .set(auth(ctx.tokens.tutor));
    expect(before.status).toBe(200);
    expect(before.body.unreadCount).toBeGreaterThanOrEqual(1);
    const marked = await request(app).patch(`/messages/group/${ctx.unit.id}/read`)
      .set(auth(ctx.tokens.tutor));
    expect(marked.status).toBe(200);
    const after = await request(app).get(`/units/${ctx.unit.id}/messages/group-unread-count`)
      .set(auth(ctx.tokens.tutor));
    expect(after.body.unreadCount).toBe(0);
  });

  test('mark-all notifications only changes the current user records', async () => {
    await query(
      `INSERT INTO notifications (user_id, notification_type, title, content)
       VALUES ($1, 'test', 'Tutor notice', 'Tutor only'), ($2, 'test', 'Coordinator notice', 'Coordinator only')`,
      [ctx.users.tutor.id, ctx.users.coordinator.id]
    );
    const res = await request(app).patch('/notifications/read-all').set(auth(ctx.tokens.tutor));
    expect(res.status).toBe(200);
    const db = await query(
      "SELECT user_id, is_read FROM notifications WHERE title IN ('Tutor notice', 'Coordinator notice') ORDER BY title"
    );
    const byUser = Object.fromEntries(db.rows.map((row) => [row.user_id, row.is_read]));
    expect(byUser[ctx.users.tutor.id]).toBe(true);
    expect(byUser[ctx.users.coordinator.id]).toBe(false);
  });
});

describe('Coordinator scheduling and unit state', () => {
  test('coordinator creates, edits, and deletes an unassigned session', async () => {
    const base = `/units/${ctx.unit.id}/sessions`;
    const created = await request(app).post(base).set(auth(ctx.tokens.coordinator)).send({
      day: 'Friday', startTime: '15:00', endTime: '16:00', location: 'GP-S-501',
      campus: 'GP', sessionType: 'Tutorial', capacity: 25, requiredTutors: 1, status: 'Confirmed'
    });
    expect(created.status).toBe(201);
    expect(created.body.sessionCode).toBeTruthy();
    const updated = await request(app).put(`${base}/${created.body.id}`)
      .set(auth(ctx.tokens.coordinator)).send({ location: 'GP-S-502' });
    expect(updated.status).toBe(200);
    const db = await query('SELECT location FROM sessions WHERE id = $1', [created.body.id]);
    expect(db.rows[0].location).toBe('GP-S-502');
    const deleted = await request(app).delete(`${base}/${created.body.id}`)
      .set(auth(ctx.tokens.coordinator));
    expect(deleted.status).toBe(200);
    const after = await query('SELECT id FROM sessions WHERE id = $1', [created.body.id]);
    expect(after.rows).toHaveLength(0);
  });

  test('session import stores valid rows and reports invalid rows', async () => {
    const res = await request(app).post(`/units/${ctx.unit.id}/sessions/import`)
      .set(auth(ctx.tokens.coordinator)).send({
        replace: false,
        sessions: [
          { day: 'Friday', startTime: '11:00', endTime: '12:00', location: 'GP-S-503',
            campus: 'GP', sessionType: 'Tutorial', capacity: 25, requiredTutors: 1 },
          { day: 'not-a-day', startTime: 'bad', endTime: '12:00' }
        ]
      });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ importedCount: 1, skippedCount: 1 });
    const db = await query("SELECT id FROM sessions WHERE unit_id = $1 AND location = 'GP-S-503'", [ctx.unit.id]);
    expect(db.rows).toHaveLength(1);
  });

  test('candidate list includes eligible tutors for a tutorial', async () => {
    const res = await request(app)
      .get(`/units/${ctx.unit.id}/sessions/${ctx.sessions.tutorial.id}/candidates`)
      .set(auth(ctx.tokens.coordinator));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.candidates)).toBe(true);
    expect(res.body.candidates.some((candidate) => candidate.id === ctx.users.tutor.id)).toBe(true);
  });

  test('availability lock and draft publication persist in the unit', async () => {
    const base = `/units/${ctx.unit.id}`;
    for (const [action, column, value] of [
      ['lock-availability', 'availability_locked', true],
      ['unlock-availability', 'availability_locked', false],
      ['release-draft', 'draft_released', true],
      ['unrelease-draft', 'draft_released', false]
    ]) {
      const res = await request(app).patch(`${base}/${action}`).set(auth(ctx.tokens.coordinator)).send({});
      expect(res.status).toBe(200);
      const db = await query(`SELECT ${column} FROM units WHERE id = $1`, [ctx.unit.id]);
      expect(db.rows[0][column]).toBe(value);
    }
  });

  test('forced schedule lock blocks deletion until unlocked', async () => {
    const base = `/units/${ctx.unit.id}`;
    const locked = await request(app).patch(`${base}/lock-schedule`)
      .set(auth(ctx.tokens.coordinator)).send({ force: true });
    expect(locked.status).toBe(200);
    const attempted = await request(app).delete(`${base}/sessions/${ctx.sessions.lecture.id}`)
      .set(auth(ctx.tokens.coordinator));
    expect(attempted.status).toBe(409);
    const unlocked = await request(app).patch(`${base}/unlock-schedule`)
      .set(auth(ctx.tokens.coordinator)).send({});
    expect(unlocked.status).toBe(200);
    const db = await query('SELECT schedule_locked FROM units WHERE id = $1', [ctx.unit.id]);
    expect(db.rows[0].schedule_locked).toBe(false);
  });
});

describe('Reminder job integration', () => {
  test('authorized job sends one reminder and marks the assignment', async () => {
    const inserted = await query(
      `INSERT INTO session_tutors (session_id, tutor_id, tutor_confirmed, assigned_at)
       VALUES ($1, $2, NULL, NOW() - INTERVAL '4 days')
       RETURNING id`,
      [ctx.sessions.consultation.id, ctx.users.coverTutor.id]
    );
    const url = '/jobs/session-assignment-reminders';
    const first = await request(app).post(url).set('x-cron-secret', process.env.CRON_SECRET);
    expect(first.status).toBe(200);
    expect(first.body.emailedCount).toBeGreaterThanOrEqual(1);
    expect(emailUtils.sendEmail).toHaveBeenCalled();
    const db = await query('SELECT reminder_sent_at FROM session_tutors WHERE id = $1', [inserted.rows[0].id]);
    expect(db.rows[0].reminder_sent_at).not.toBeNull();
    const second = await request(app).post(url).set('x-cron-secret', process.env.CRON_SECRET);
    expect(second.status).toBe(200);
    expect(second.body.emailedCount).toBe(0);
  });
});

describe('Cross-unit API boundaries', () => {
  let outside;

  beforeAll(async () => {
    const people = await query(
      `INSERT INTO users (email, password_hash, role, name, last_name)
       VALUES ('outside.uc@sessioneer.test', 'salt:hash', 'coordinator', 'Outside', 'UC'),
              ('outside.tutor@sessioneer.test', 'salt:hash', 'tutor', 'Outside', 'Tutor')
       RETURNING id, role`
    );
    const coordinatorId = people.rows.find((user) => user.role === 'coordinator').id;
    const tutorId = people.rows.find((user) => user.role === 'tutor').id;
    const unit = await query(
      `INSERT INTO units (unit_coordinator_id, unit_code, unit_name, semester, year, enrolment_size)
       VALUES ($1, 'EXT901', 'Outside Unit', 'Semester 2', 2026, 50) RETURNING id`,
      [coordinatorId]
    );
    const unitId = unit.rows[0].id;
    await query("INSERT INTO unit_memberships (unit_id, user_id, role) VALUES ($1, $2, 'tutor')",
      [unitId, tutorId]);
    const session = await query(
      `INSERT INTO sessions (unit_id, day, start_time, end_time, location, session_type, capacity, required_tutors, status)
       VALUES ($1, 'Friday', '09:00', '10:00', 'GP-S-901', 'Tutorial', 25, 1, 'Confirmed') RETURNING id`,
      [unitId]
    );
    await query('INSERT INTO session_tutors (session_id, tutor_id) VALUES ($1, $2)',
      [session.rows[0].id, tutorId]);
    const application = await query(
      `INSERT INTO tutor_applications
         (unit_id, email, name, last_name, status, resume_filename, resume_mime_type, resume_data)
       VALUES ($1, 'outside.applicant@sessioneer.test', 'Outside', 'Applicant', 'pending', 'resume.pdf', 'application/pdf', $2)
       RETURNING id`,
      [unitId, Buffer.from('test resume')]
    );
    await query(
      "UPDATE users SET resume_filename = 'resume.pdf', resume_mime_type = 'application/pdf', resume_data = $1 WHERE id = $2",
      [Buffer.from('test resume'), tutorId]
    );
    outside = { unitId, tutorId, sessionId: session.rows[0].id, applicationId: application.rows[0].id };
  });

  test('coordinator cannot remove an assignment through their own unit URL', async () => {
    const res = await request(app)
      .delete(`/units/${ctx.unit.id}/sessions/${outside.sessionId}/assign/${outside.tutorId}`)
      .set(auth(ctx.tokens.coordinator));
    expect(res.status).toBe(404);
    const db = await query('SELECT 1 FROM session_tutors WHERE session_id = $1 AND tutor_id = $2',
      [outside.sessionId, outside.tutorId]);
    expect(db.rows).toHaveLength(1);
  });

  test('coordinator cannot download another unit applicant resume', async () => {
    const res = await request(app).get(`/tutor-applications/${outside.applicationId}/resume`)
      .set(auth(ctx.tokens.coordinator));
    expect(res.status).toBe(404);
  });

  test('coordinator cannot download an unrelated tutor resume', async () => {
    const res = await request(app).get(`/tutor-applications/user/${outside.tutorId}/resume`)
      .set(auth(ctx.tokens.coordinator));
    expect(res.status).toBe(404);
  });

  test('tutor cannot use the legacy all-sessions endpoint', async () => {
    const res = await request(app).get('/sessions').set(auth(ctx.tokens.tutor));
    expect(res.status).toBe(403);
  });

  test('tutor cannot approve a request through the owner-edit endpoint', async () => {
    const created = await query(
      `INSERT INTO change_requests (tutor_id, unit_id, request_type, reason, status)
       VALUES ($1, $2, 'Session Swap', 'Self approval attempt', 'Pending') RETURNING id`,
      [ctx.users.tutor.id, ctx.unit.id]
    );
    const res = await request(app).patch(`/requests/${created.rows[0].id}`)
      .set(auth(ctx.tokens.tutor)).send({ status: 'Accepted' });
    expect(res.status).toBe(403);
    const db = await query('SELECT status FROM change_requests WHERE id = $1', [created.rows[0].id]);
    expect(db.rows[0].status).toBe('Pending');
  });

  test('direct messages require a shared unit', async () => {
    const res = await request(app).post('/messages').set(auth(ctx.tokens.tutor))
      .send({ recipientId: outside.tutorId, content: 'Outside message' });
    expect(res.status).toBe(403);
    const db = await query('SELECT 1 FROM messages WHERE sender_id = $1 AND recipient_id = $2',
      [ctx.users.tutor.id, outside.tutorId]);
    expect(db.rows).toHaveLength(0);
  });
});
