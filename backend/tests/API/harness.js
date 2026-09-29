const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { query } = require('../rbac/testDb');

const { app } = require('../../server');

const PASSWORD = 'Password123!';

const hashPassword = (password) => {
  const salt = crypto.randomBytes(8).toString('hex');
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
};

const tokenFor = (user) => jwt.sign(
  { id: user.id, email: user.email, role: user.role },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);

const auth = (token) => ({ Authorization: `Bearer ${token}` });

const api = (method, url, token, body) => {
  let req = request(app)[method](url);
  if (token) req = req.set(auth(token));
  if (body !== undefined) req = req.send(body);
  return req;
};

const sessionBody = (overrides = {}) => ({
  day: 'MON',
  startTime: '09:00',
  endTime: '10:00',
  location: 'GP-P-101',
  campus: 'GP',
  sessionType: 'Tutorial',
  capacity: 30,
  requiredTutors: 1,
  status: 'Confirmed',
  ...overrides
});

const wipe = async () => {
  await query(`
    DO $$ DECLARE r RECORD;
    BEGIN
      FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE 'TRUNCATE TABLE public.' || quote_ident(r.tablename) || ' RESTART IDENTITY CASCADE';
      END LOOP;
    END $$;
  `);
};

const insertUser = async ({ key, role, status = 'active', hours = 10 }) => {
  const row = await query(
    `INSERT INTO users (email, password_hash, role, name, last_name, account_status, maximum_hours)
     VALUES ($1, $2, $3, $4, 'Test', $5, $6)
     RETURNING id, email, role, name, last_name`,
    [`${key}@api.test`, hashPassword(PASSWORD), role, key, status, hours]
  );
  return row.rows[0];
};

const insertSession = async (unitId, code, day, start, end, type, extra = {}) => {
  const row = await query(
    `INSERT INTO sessions (unit_id, day, start_time, end_time, location, campus, session_type,
                           capacity, required_tutors, status, session_code, assigned_tutor_id, is_assigned)
     VALUES ($1, $2, $3, $4, 'GP-P-101', 'GP', $5, 30, $6, 'Confirmed', $7, $8, $9)
     RETURNING id`,
    [unitId, day, start, end, type, extra.requiredTutors || 1, code, extra.assignedTutorId || null, extra.assignedTutorId ? true : false]
  );
  return row.rows[0].id;
};

const seed = async () => {
  await wipe();
  const u = {
    admin: await insertUser({ key: 'admin', role: 'admin', hours: 40 }),
    uc: await insertUser({ key: 'uc', role: 'coordinator', hours: 40 }),
    uc2: await insertUser({ key: 'uc2', role: 'coordinator', hours: 40 }),
    tutor: await insertUser({ key: 'tutor', role: 'tutor', hours: 2 }),
    super: await insertUser({ key: 'super', role: 'tutor', hours: 10 }),
    other: await insertUser({ key: 'other', role: 'tutor', hours: 10 }),
    outsider: await insertUser({ key: 'outsider', role: 'tutor', hours: 10 }),
    pending: await insertUser({ key: 'pending', role: 'tutor', status: 'pending' }),
    disabled: await insertUser({ key: 'disabled', role: 'tutor', status: 'disabled' })
  };

  const unitA = (await query(
    `INSERT INTO units (unit_coordinator_id, unit_code, unit_name, semester, year, enrolment_size, availability_deadline)
     VALUES ($1, 'API101', 'API Unit A', 'Semester 2', 2026, 80, '2099-12-31') RETURNING id, unit_code`,
    [u.uc.id]
  )).rows[0];
  const unitB = (await query(
    `INSERT INTO units (unit_coordinator_id, unit_code, unit_name, semester, year, enrolment_size)
     VALUES ($1, 'API202', 'API Unit B', 'Semester 2', 2026, 40) RETURNING id, unit_code`,
    [u.uc2.id]
  )).rows[0];

  await query(
    `INSERT INTO unit_memberships (unit_id, user_id, role) VALUES
      ($1, $2, 'coordinator'),
      ($1, $3, 'tutor'),
      ($1, $4, 'super_tutor'),
      ($1, $5, 'tutor'),
      ($6, $7, 'coordinator')`,
    [unitA.id, u.uc.id, u.tutor.id, u.super.id, u.other.id, unitB.id, u.uc2.id]
  );

  const s = {};
  s.open = await insertSession(unitA.id, 'TUT01', 'MON', '09:00', '10:00', 'Tutorial');
  s.open2 = await insertSession(unitA.id, 'TUT02', 'TUE', '09:00', '10:00', 'Tutorial');
  s.held = await insertSession(unitA.id, 'TUT03', 'WED', '11:00', '12:00', 'Tutorial', { assignedTutorId: u.tutor.id });
  s.declined = await insertSession(unitA.id, 'TUT04', 'THU', '09:00', '10:00', 'Tutorial');
  s.lecture = await insertSession(unitA.id, 'LEC01', 'FRI', '12:00', '14:00', 'Lecture');
  s.long = await insertSession(unitA.id, 'TUT05', 'MON', '13:00', '15:00', 'Tutorial');
  s.overlap = await insertSession(unitA.id, 'TUT06', 'MON', '09:30', '10:30', 'Tutorial');
  s.unitB = await insertSession(unitB.id, 'TUT01', 'MON', '09:00', '10:00', 'Tutorial');

  await query(
    `INSERT INTO session_tutors (session_id, tutor_id, tutor_confirmed) VALUES ($1, $2, NULL), ($3, $2, FALSE)`,
    [s.held, u.tutor.id, s.declined]
  );

  const tokens = Object.fromEntries(Object.entries(u).map(([key, user]) => [key, tokenFor(user)]));
  return { u, unitA, unitB, s, tokens, password: PASSWORD };
};

const assigned = async (sessionId, tutorId) => {
  const row = await query(
    `SELECT tutor_confirmed FROM session_tutors
     WHERE session_id = $1 AND tutor_id = $2 AND tutor_confirmed IS DISTINCT FROM FALSE`,
    [sessionId, tutorId]
  );
  return row.rows.length > 0;
};

const defineApiCases = (suiteName, register) => {
  describe(suiteName, () => {
    let ctx;
    const cases = [];
    const add = (name, fn) => cases.push([name, fn]);
    beforeEach(async () => { ctx = await seed(); });
    register(add);
    test.each(cases)('%s', async (_name, fn) => { await fn(ctx); });
  });
};

module.exports = {
  app, query, api, auth, seed, sessionBody, hashPassword, tokenFor, assigned, PASSWORD, defineApiCases
};

