const request = require('supertest');
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
