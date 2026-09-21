const request = require('supertest');
const {
  TEST_PASSWORD,
  query,
  resetTestDatabase,
  seedCoreData,
  waitForSchema
} = require('./helpers');
const emailUtils = require('../utils/email');

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

describe('API tests', () => {
  test('health check returns backend and database status', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.database).toBeTruthy();
  });

  test('valid login returns a token and user profile', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: ctx.users.admin.email, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.role).toBe('admin');
  });

  test('login rejects an incorrect password', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: ctx.users.admin.email, password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid email or password/i);
  });

  test('login rejects an unknown email', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'missing@sessioneer.test', password: TEST_PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid email or password/i);
  });

  test('login rejects missing credentials', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: ctx.users.admin.email });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email and password/i);
  });

  test('protected route rejects missing token', async () => {
    const res = await request(app).get('/profile');

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/no token/i);
  });

  test('protected route rejects invalid token', async () => {
    const res = await request(app)
      .get('/profile')
      .set('Authorization', 'Bearer not-a-real-token');

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid or expired token/i);
  });

  test('pending user is blocked from protected routes', async () => {
    const res = await request(app)
      .get('/profile')
      .set(auth(ctx.tokens.pending));

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/pending/i);
  });

  test('disabled user is blocked from protected routes', async () => {
    const res = await request(app)
      .get('/profile')
      .set(auth(ctx.tokens.disabled));

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/disabled/i);
  });

  test('tutor cannot access admin user API', async () => {
    const res = await request(app)
      .get('/admin/users')
      .set(auth(ctx.tokens.tutor));

    expect(res.status).toBe(403);
  });

  test('admin can access admin user API', async () => {
    const res = await request(app)
      .get('/admin/users')
      .set(auth(ctx.tokens.admin));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('coordinator can access unit-scoped session API for own unit', async () => {
    const res = await request(app)
      .get(`/units/${ctx.unit.id}/sessions`)
      .set(auth(ctx.tokens.coordinator));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('authenticated user can load own profile', async () => {
    const res = await request(app)
      .get('/profile')
      .set(auth(ctx.tokens.tutor));

    expect(res.status).toBe(200);
    expect(res.body.email).toBe(ctx.users.tutor.email);
  });
});

describe('Integration tests', () => {
  test('admin creates a user and the database stores it', async () => {
    const res = await request(app)
      .post('/admin/users')
      .set(auth(ctx.tokens.admin))
      .send({
        firstName: 'New',
        lastName: 'Tutor',
        email: 'new.tutor@sessioneer.test',
        role: 'tutor',
        accountStatus: 'active',
        sendSetupLink: false
      });

    expect(res.status).toBe(201);
    expect(res.body.email).toBe('new.tutor@sessioneer.test');

    const db = await query('SELECT role FROM users WHERE email = $1', ['new.tutor@sessioneer.test']);
    expect(db.rows[0].role).toBe('tutor');
  });

  test('admin updates a user account status', async () => {
    const res = await request(app)
      .put(`/admin/users/${ctx.users.tutor.id}`)
      .set(auth(ctx.tokens.admin))
      .send({
        firstName: 'Taylor',
        lastName: 'Tutor',
        email: ctx.users.tutor.email,
        role: 'tutor',
        accountStatus: 'pending'
      });

    expect(res.status).toBe(200);
    expect(res.body.accountStatus).toBe('pending');

    await query('UPDATE users SET account_status = $1 WHERE id = $2', ['active', ctx.users.tutor.id]);
  });

  test('admin can create a password reset token without sending real email', async () => {
    const before = await query('SELECT COUNT(*)::int AS count FROM password_reset_tokens WHERE user_id = $1', [ctx.users.tutor.id]);

    const res = await request(app)
      .post(`/admin/users/${ctx.users.tutor.id}/send-reset-link`)
      .set(auth(ctx.tokens.admin));

    expect(res.status).toBe(200);
    expect(emailUtils.sendEmail).toHaveBeenCalled();

    const after = await query('SELECT COUNT(*)::int AS count FROM password_reset_tokens WHERE user_id = $1', [ctx.users.tutor.id]);
    expect(after.rows[0].count).toBeGreaterThan(before.rows[0].count);
  });

  test('admin adds tutor unit access and unit_memberships is created', async () => {
    const res = await request(app)
      .post(`/admin/users/${ctx.users.coverTutor.id}/units`)
      .set(auth(ctx.tokens.admin))
      .send({ unitId: ctx.unit.id, role: 'tutor' });

    expect(res.status).toBe(201);

    const db = await query(
      'SELECT role FROM unit_memberships WHERE unit_id = $1 AND user_id = $2 AND role = $3',
      [ctx.unit.id, ctx.users.coverTutor.id, 'tutor']
    );
    expect(db.rows).toHaveLength(1);
  });

  test('admin adds super tutor unit access and replaces tutor access', async () => {
    const res = await request(app)
      .post(`/admin/users/${ctx.users.coverTutor.id}/units`)
      .set(auth(ctx.tokens.admin))
      .send({ unitId: ctx.unit.id, role: 'super_tutor' });

    expect(res.status).toBe(201);

    const db = await query(
      'SELECT role FROM unit_memberships WHERE unit_id = $1 AND user_id = $2 ORDER BY role',
      [ctx.unit.id, ctx.users.coverTutor.id]
    );
    expect(db.rows.map((row) => row.role)).toEqual(['super_tutor']);

    await query(
      'DELETE FROM unit_memberships WHERE unit_id = $1 AND user_id = $2',
      [ctx.unit.id, ctx.users.coverTutor.id]
    );
    await query(
      "INSERT INTO unit_memberships (unit_id, user_id, role) VALUES ($1, $2, 'tutor')",
      [ctx.unit.id, ctx.users.coverTutor.id]
    );
  });

  test('admin cannot add administrator account to teaching unit', async () => {
    const res = await request(app)
      .post(`/admin/users/${ctx.users.admin.id}/units`)
      .set(auth(ctx.tokens.admin))
      .send({ unitId: ctx.unit.id, role: 'tutor' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/administrator accounts/i);
  });

  test('admin prevents tutor access when the user already coordinates the unit', async () => {
    const res = await request(app)
      .post(`/admin/users/${ctx.users.coordinator.id}/units`)
      .set(auth(ctx.tokens.admin))
      .send({ unitId: ctx.unit.id, role: 'tutor' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/coordinator access/i);
  });

  test('admin unit tutor list includes tutor-like roles', async () => {
    const res = await request(app)
      .get(`/admin/units/${ctx.unit.id}/tutors`)
      .set(auth(ctx.tokens.admin));

    expect(res.status).toBe(200);
    const emails = res.body.map((tutor) => tutor.email);
    expect(emails).toContain(ctx.users.tutor.email);
    expect(emails).toContain(ctx.users.superTutor.email);
  });

  test('admin can update a unit tutor to super tutor', async () => {
    const res = await request(app)
      .patch(`/admin/units/${ctx.unit.id}/tutors/${ctx.users.tutor.id}/role`)
      .set(auth(ctx.tokens.admin))
      .send({ role: 'super_tutor' });

    expect(res.status).toBe(200);

    const db = await query(
      'SELECT role FROM unit_memberships WHERE unit_id = $1 AND user_id = $2',
      [ctx.unit.id, ctx.users.tutor.id]
    );
    expect(db.rows.map((row) => row.role)).toEqual(['super_tutor']);

    await query(
      'DELETE FROM unit_memberships WHERE unit_id = $1 AND user_id = $2',
      [ctx.unit.id, ctx.users.tutor.id]
    );
    await query(
      "INSERT INTO unit_memberships (unit_id, user_id, role) VALUES ($1, $2, 'tutor')",
      [ctx.unit.id, ctx.users.tutor.id]
    );
  });

  test('admin can remove a unit tutor', async () => {
    const temp = await query(
      `
      INSERT INTO users (email, password_hash, role, name, last_name)
      VALUES ('remove.me@sessioneer.test', 'salt:hash', 'tutor', 'Remove', 'Me')
      RETURNING id
      `
    );
    const userId = temp.rows[0].id;
    await query(
      'INSERT INTO unit_memberships (unit_id, user_id, role) VALUES ($1, $2, $3)',
      [ctx.unit.id, userId, 'tutor']
    );

    const res = await request(app)
      .delete(`/admin/units/${ctx.unit.id}/tutors/${userId}`)
      .set(auth(ctx.tokens.admin));

    expect(res.status).toBe(200);

    const db = await query('SELECT id FROM unit_memberships WHERE unit_id = $1 AND user_id = $2', [ctx.unit.id, userId]);
    expect(db.rows).toHaveLength(0);
  });

  test('coordinator assigns normal tutor to tutorial session', async () => {
    const res = await request(app)
      .patch(`/units/${ctx.unit.id}/sessions/${ctx.sessions.tutorial.id}/assign`)
      .set(auth(ctx.tokens.coordinator))
      .send({ tutorId: ctx.users.tutor.id });

    expect(res.status).toBe(200);

    const db = await query(
      'SELECT tutor_id FROM session_tutors WHERE session_id = $1 AND tutor_id = $2',
      [ctx.sessions.tutorial.id, ctx.users.tutor.id]
    );
    expect(db.rows).toHaveLength(1);
  });

  test('normal tutor cannot be assigned to lecture session', async () => {
    const res = await request(app)
      .patch(`/units/${ctx.unit.id}/sessions/${ctx.sessions.lecture.id}/assign`)
      .set(auth(ctx.tokens.coordinator))
      .send({ tutorId: ctx.users.tutor.id });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/super tutors/i);
  });

  test('super tutor can be assigned to lecture session', async () => {
    const res = await request(app)
      .patch(`/units/${ctx.unit.id}/sessions/${ctx.sessions.lecture.id}/assign`)
      .set(auth(ctx.tokens.coordinator))
      .send({ tutorId: ctx.users.superTutor.id });

    expect(res.status).toBe(200);

    const db = await query(
      'SELECT tutor_id FROM session_tutors WHERE session_id = $1 AND tutor_id = $2',
      [ctx.sessions.lecture.id, ctx.users.superTutor.id]
    );
    expect(db.rows).toHaveLength(1);
  });

  test('coordinator can self-assign to consultation without tutor membership', async () => {
    const res = await request(app)
      .patch(`/units/${ctx.unit.id}/sessions/${ctx.sessions.consultation.id}/assign`)
      .set(auth(ctx.tokens.coordinator))
      .send({ tutorId: ctx.users.coordinator.id });

    expect(res.status).toBe(200);

    const db = await query(
      'SELECT tutor_confirmed FROM session_tutors WHERE session_id = $1 AND tutor_id = $2',
      [ctx.sessions.consultation.id, ctx.users.coordinator.id]
    );
    expect(db.rows[0].tutor_confirmed).toBe(true);
  });

  test('tutor can submit a change request and database stores it', async () => {
    const res = await request(app)
      .post('/requests')
      .set(auth(ctx.tokens.tutor))
      .send({
        unitCode: ctx.unit.unit_code,
        requestType: 'Swap',
        priority: 'Normal',
        currentSession: 'Monday 09:00',
        preferredSwapTo: 'Friday 09:00',
        reason: 'Testing request workflow'
      });

    expect(res.status).toBe(201);
    expect(res.body.requestType).toBe('Swap');

    const db = await query('SELECT id FROM change_requests WHERE id = $1 AND tutor_id = $2', [res.body.id, ctx.users.tutor.id]);
    expect(db.rows).toHaveLength(1);
  });

  test('coordinator can review a tutor request', async () => {
    const created = await query(
      `
      INSERT INTO change_requests (tutor_id, unit_id, request_type, reason, status, current_session, preferred_swap_to, priority)
      VALUES ($1, $2, 'Swap', 'Needs review', 'Pending', 'Monday', 'Friday', 'Normal')
      RETURNING id
      `,
      [ctx.users.tutor.id, ctx.unit.id]
    );

    const res = await request(app)
      .patch(`/uc/requests/${created.rows[0].id}/review`)
      .set(auth(ctx.tokens.coordinator))
      .send({ status: 'Accepted', reviewNotes: 'Approved in automated test' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Accepted');

    const db = await query('SELECT status, review_notes FROM change_requests WHERE id = $1', [created.rows[0].id]);
    expect(db.rows[0].status).toBe('Accepted');
    expect(db.rows[0].review_notes).toBe('Approved in automated test');
  });

  test('coordinator creates cover request for assigned session', async () => {
    const res = await request(app)
      .post('/uc/cover-requests')
      .set(auth(ctx.tokens.coordinator))
      .send({
        sessionIds: [ctx.sessions.tutorial.id],
        reason: 'Tutor unavailable',
        startDate: '2026-09-01',
        endDate: '2026-09-07'
      });

    expect(res.status).toBe(201);
    expect(res.body.requests).toHaveLength(1);

    ctx.coverRequestId = res.body.requests[0].id;
  });

  test('tutor can view open cover requests for their unit', async () => {
    const res = await request(app)
      .get('/cover-requests/open')
      .set(auth(ctx.tokens.coverTutor));

    expect(res.status).toBe(200);
    expect(res.body.some((cover) => cover.id === ctx.coverRequestId)).toBe(true);
  });

  test('normal tutor cannot claim lecture cover request', async () => {
    const batch = await query(
      `
      INSERT INTO cover_batches (unit_id, created_by_id, reason, start_date, end_date)
      VALUES ($1, $2, 'Lecture cover', '2026-09-01', '2026-09-07')
      RETURNING id
      `,
      [ctx.unit.id, ctx.users.coordinator.id]
    );
    const cover = await query(
      `
      INSERT INTO cover_requests (batch_id, session_id, unit_id, original_tutor_id, reason, created_by_id)
      VALUES ($1, $2, $3, $4, 'Lecture cover', $5)
      RETURNING id
      `,
      [batch.rows[0].id, ctx.sessions.lecture.id, ctx.unit.id, ctx.users.superTutor.id, ctx.users.coordinator.id]
    );

    const res = await request(app)
      .post(`/cover-requests/${cover.rows[0].id}/claim`)
      .set(auth(ctx.tokens.coverTutor));

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/super tutors/i);
  });

  test('eligible tutor can claim an open cover request', async () => {
    const res = await request(app)
      .post(`/cover-requests/${ctx.coverRequestId}/claim`)
      .set(auth(ctx.tokens.coverTutor));

    expect(res.status).toBe(200);

    const db = await query('SELECT status, claimed_by_id FROM cover_requests WHERE id = $1', [ctx.coverRequestId]);
    expect(db.rows[0].status).toBe('claimed');
    expect(db.rows[0].claimed_by_id).toBe(ctx.users.coverTutor.id);
  });
});
