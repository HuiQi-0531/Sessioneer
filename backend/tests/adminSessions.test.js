const express = require('express');
const request = require('supertest');
const pool = require('../db');
const { createNotification } = require('../utils/notify');

jest.mock('../db', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../middleware/auth', () => ({
  verifyToken: (req, res, next) => { req.user = { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', role: 'admin' }; next(); },
  requireRole: () => (req, res, next) => next()
}));
jest.mock('../utils/notify', () => ({ createNotification: jest.fn() }));
jest.mock('../utils/email', () => ({ escapeHtml: value => value, sendEmail: jest.fn() }));

const app = express();
app.use(express.json());
app.use('/admin', require('../routes/admin.routes'));

const sessionId = '11111111-1111-1111-1111-111111111111';
const staffId = '22222222-2222-2222-2222-222222222222';
const unitId = '33333333-3333-3333-3333-333333333333';

const mockClient = (handler) => {
  const client = { query: jest.fn(handler), release: jest.fn() };
  pool.connect.mockResolvedValue(client);
  return client;
};

beforeEach(() => {
  jest.clearAllMocks();
  createNotification.mockResolvedValue(undefined);
});

describe('Admin session deletion', () => {
  test('refuses to delete a session with an active tutor assignment', async () => {
    const client = mockClient(async (sql) => {
      if (sql.includes('SELECT s.id, un.schedule_locked')) return { rows: [{ id: sessionId, schedule_locked: false }] };
      if (sql.includes('SELECT 1 FROM session_tutors')) return { rows: [{ '?column?': 1 }] };
      return { rows: [] };
    });

    const response = await request(app).delete(`/admin/sessions/${sessionId}`);

    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/unassign/i);
    expect(client.query.mock.calls.some(([sql]) => sql.includes('DELETE FROM sessions'))).toBe(false);
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });

  test('refuses to delete from a locked schedule', async () => {
    const client = mockClient(async (sql) => {
      if (sql.includes('SELECT s.id, un.schedule_locked')) return { rows: [{ id: sessionId, schedule_locked: true }] };
      return { rows: [] };
    });

    const response = await request(app).delete(`/admin/sessions/${sessionId}`);

    expect(response.status).toBe(409);
    expect(client.query.mock.calls.some(([sql]) => sql.includes('DELETE FROM sessions'))).toBe(false);
  });

  test('deletes an unassigned session', async () => {
    const client = mockClient(async (sql) => {
      if (sql.includes('SELECT s.id, un.schedule_locked')) return { rows: [{ id: sessionId, schedule_locked: false }] };
      return { rows: [] };
    });

    const response = await request(app).delete(`/admin/sessions/${sessionId}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(client.query.mock.calls.some(([sql]) => sql.includes('DELETE FROM sessions'))).toBe(true);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });
});

describe('Admin session changes with assignments', () => {
  const body = {
    unitId,
    day: 'MON',
    startTime: '10:00:00',
    endTime: '11:00:00',
    location: 'GP-P-419',
    campus: 'GP',
    sessionType: 'Tutorial',
    capacity: 25,
    requiredTutors: 2,
    status: 'Confirmed'
  };

  test('does not move assigned staff into another unit', async () => {
    pool.query.mockResolvedValue({ rows: [{ unit_id: unitId, assigned_count: 1 }] });

    const response = await request(app)
      .put(`/admin/sessions/${sessionId}`)
      .send({ ...body, unitId: '44444444-4444-4444-4444-444444444444' });

    expect(response.status).toBe(409);
    expect(pool.query.mock.calls.some(([sql]) => sql.includes('UPDATE sessions'))).toBe(false);
  });

  test('does not reduce required staff below the assigned count', async () => {
    pool.query.mockResolvedValue({ rows: [{ unit_id: unitId, assigned_count: 2 }] });

    const response = await request(app)
      .put(`/admin/sessions/${sessionId}`)
      .send({ ...body, requiredTutors: 1 });

    expect(response.status).toBe(409);
    expect(pool.query.mock.calls.some(([sql]) => sql.includes('UPDATE sessions'))).toBe(false);
  });

  test('does not turn a Tutor-assigned session into a lecture', async () => {
    pool.query.mockImplementation(async (sql) => {
      if (sql.includes('COUNT(st.tutor_id)')) return { rows: [{ unit_id: unitId, assigned_count: 1 }] };
      if (sql.includes('SELECT st.tutor_id')) return { rows: [{ tutor_id: staffId }] };
      if (sql.includes('access_role')) return { rows: [{ id: staffId, name: 'Taylor', last_name: 'Staff', email: 'taylor@example.com', maximum_hours: 10, access_role: 'tutor' }] };
      return { rows: [] };
    });

    const response = await request(app)
      .put(`/admin/sessions/${sessionId}`)
      .send({ ...body, sessionType: 'Lecture' });

    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/Unassign Tutors/);
    expect(pool.query.mock.calls.some(([sql]) => sql.includes('UPDATE sessions'))).toBe(false);
  });
});

describe('Admin session assignments', () => {
  const session = {
    id: sessionId,
    unit_id: unitId,
    day: 'MON',
    start_time: '10:00:00',
    end_time: '11:00:00',
    session_type: 'Lecture',
    required_tutors: 2,
    unit_code: 'IFN501',
    schedule_locked: false
  };

  const mockAssignmentClient = (accessRole = 'super_tutor', overrides = {}) => mockClient(async (sql) => {
    if (sql.includes('FOR UPDATE OF s')) return { rows: [{ ...session, ...overrides }] };
    if (sql.includes('SELECT tutor_id, tutor_confirmed')) return { rows: [] };
    if (sql.includes('CASE') && sql.includes('access_role')) {
      return { rows: [{ id: staffId, name: 'Taylor', last_name: 'Staff', email: 'taylor@example.com', maximum_hours: 10, access_role: accessRole }] };
    }
    return { rows: [] };
  });

  test('assigns an eligible Super Tutor to a lecture', async () => {
    const client = mockAssignmentClient();

    const response = await request(app)
      .post(`/admin/sessions/${sessionId}/assignments`)
      .send({ tutorId: staffId });

    expect(response.status).toBe(201);
    expect(client.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO session_tutors'))).toBe(true);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: staffId, type: 'session_assigned' }));
  });

  test('rejects a normal Tutor for a lecture', async () => {
    const client = mockAssignmentClient('tutor');

    const response = await request(app)
      .post(`/admin/sessions/${sessionId}/assignments`)
      .send({ tutorId: staffId });

    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/Super Tutors/);
    expect(client.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO session_tutors'))).toBe(false);
  });

  test('rejects assignment when the schedule is locked', async () => {
    const client = mockAssignmentClient('super_tutor', { schedule_locked: true });

    const response = await request(app)
      .post(`/admin/sessions/${sessionId}/assignments`)
      .send({ tutorId: staffId });

    expect(response.status).toBe(409);
    expect(client.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO session_tutors'))).toBe(false);
  });

  test('unassigns a staff member when the schedule is open', async () => {
    pool.query.mockImplementation(async (sql) => {
      if (sql.includes('SELECT s.id, un.schedule_locked')) return { rows: [{ id: sessionId, schedule_locked: false }] };
      if (sql.includes('DELETE FROM session_tutors')) return { rows: [{ tutor_id: staffId }] };
      return { rows: [] };
    });

    const response = await request(app).delete(`/admin/sessions/${sessionId}/assignments/${staffId}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});
