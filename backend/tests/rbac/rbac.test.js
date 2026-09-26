/**
 * Automation Test 3 - Authority / RBAC
 *
 * Checks the permission boundary of every role:
 *   UC (Unit Coordinator), Tutor, Super Tutor (Lecture / Consultation), Admin,
 *   plus unauthenticated and blocked (pending / disabled) accounts.
 *
 * Two units are seeded so we can also test cross-unit access
 * (a UC or tutor of unit A must not be able to touch unit B).
 *
 * Every case is data-driven: role x operation x expected result.
 * After the run, results are written to tests/results/rbac-results.json
 * so the case table and pass rate in the report come from a real run.
 *
 * Run:  npm run test:rbac   (setup: tests/rbac/README.md)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { query, resetTestDatabase, waitForSchema } = require('./testDb');

let app;
let server;
let io;
let pool;
const ctx = {};
const results = [];

const auth = (token) => ({ Authorization: `Bearer ${token}` });
const tokenFor = (user) => jwt.sign(
  { id: user.id, email: user.email, role: user.role },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);
const hash = (pw) => {
  const salt = crypto.randomBytes(8).toString('hex');
  return `${salt}:${crypto.scryptSync(pw, salt, 64).toString('hex')}`;
};

const insertUser = async (key, role, status = 'active') => {
  const r = await query(
    `INSERT INTO users (email, password_hash, role, name, last_name, account_status, maximum_hours)
     VALUES ($1, $2, $3, $4, 'Test', $5, 40) RETURNING id, email, role`,
    [`${key.toLowerCase()}@rbac.test`, hash('Password123!'), role, key, status]
  );
  return r.rows[0];
};

const insertSession = async (unitId, code, day, start, end, type) => {
  const r = await query(
    `INSERT INTO sessions (unit_id, day, start_time, end_time, location, campus, session_type,
                           capacity, required_tutors, status, session_code)
     VALUES ($1, $2, $3, $4, 'GP-P-101', 'GP', $5, 30, 1, 'Confirmed', $6) RETURNING id`,
    [unitId, day, start, end, type, code]
  );
  return r.rows[0].id;
};

const seed = async () => {
  const u = {};
  u.admin = await insertUser('Admin', 'admin');
  u.ucA = await insertUser('UcA', 'coordinator');
  u.ucB = await insertUser('UcB', 'coordinator');
  u.tutorA = await insertUser('TutorA', 'tutor');
  u.superA = await insertUser('SuperA', 'tutor');
  u.tutorA2 = await insertUser('TutorA2', 'tutor');
  u.tutorB = await insertUser('TutorB', 'tutor');
  u.pending = await insertUser('Pending', 'tutor', 'pending');
  u.disabled = await insertUser('Disabled', 'tutor', 'disabled');

  const unitA = (await query(
    `INSERT INTO units (unit_coordinator_id, unit_code, unit_name, semester, year, enrolment_size)
     VALUES ($1, 'RBA101', 'RBAC Unit A', 'Semester 2', 2026, 100) RETURNING id, unit_code`,
    [u.ucA.id]
  )).rows[0];
  const unitB = (await query(
    `INSERT INTO units (unit_coordinator_id, unit_code, unit_name, semester, year, enrolment_size)
     VALUES ($1, 'RBB202', 'RBAC Unit B', 'Semester 2', 2026, 100) RETURNING id, unit_code`,
    [u.ucB.id]
  )).rows[0];

  await query(
    `INSERT INTO unit_memberships (unit_id, user_id, role) VALUES
      ($1, $3, 'coordinator'), ($1, $4, 'tutor'), ($1, $5, 'super_tutor'), ($1, $6, 'tutor'),
      ($2, $7, 'coordinator'), ($2, $8, 'tutor')`,
    [unitA.id, unitB.id, u.ucA.id, u.tutorA.id, u.superA.id, u.tutorA2.id, u.ucB.id, u.tutorB.id]
  );

  const s = {};
  s.aTut = await insertSession(unitA.id, 'TUT01', 'MON', '09:00', '10:00', 'Tutorial');
  s.aTut2 = await insertSession(unitA.id, 'TUT02', 'TUE', '09:00', '10:00', 'Tutorial');
  s.aTut3 = await insertSession(unitA.id, 'TUT03', 'THU', '15:00', '16:00', 'Tutorial');
  s.aLec = await insertSession(unitA.id, 'LEC01', 'WED', '12:00', '14:00', 'Lecture');
  s.aLec2 = await insertSession(unitA.id, 'LEC02', 'FRI', '12:00', '14:00', 'Lecture');
  s.aCon = await insertSession(unitA.id, 'CON01', 'THU', '10:00', '11:00', 'Consultation');
  s.aCon2 = await insertSession(unitA.id, 'CON02', 'FRI', '09:00', '10:00', 'Consultation');
  s.aTut4 = await insertSession(unitA.id, 'TUT04', 'WED', '16:00', '17:00', 'Tutorial');
  s.bTut = await insertSession(unitB.id, 'TUT01', 'MON', '13:00', '14:00', 'Tutorial');
  s.bTut2 = await insertSession(unitB.id, 'TUT02', 'TUE', '13:00', '14:00', 'Tutorial');

  // Existing assignments
  await query(
    `INSERT INTO session_tutors (session_id, tutor_id, tutor_confirmed) VALUES
      ($1, $2, NULL), ($3, $4, TRUE), ($5, $6, TRUE), ($7, $8, TRUE)`,
    [s.aTut2, u.tutorA.id, s.bTut, u.tutorB.id, s.aTut3, u.tutorA2.id, s.bTut2, u.tutorB.id]
  );

  // Cover requests: one Lecture, one Consultation, one Tutorial, all in unit A
  const batch = (await query(
    `INSERT INTO cover_batches (unit_id, created_by_id, reason, start_date, end_date)
     VALUES ($1, $2, 'RBAC cover', '2026-10-01', '2026-10-07') RETURNING id`,
    [unitA.id, u.ucA.id]
  )).rows[0].id;
  const cover = async (sessionId) => (await query(
    `INSERT INTO cover_requests (batch_id, session_id, unit_id, original_tutor_id, reason, created_by_id)
     VALUES ($1, $2, $3, $4, 'RBAC cover', $5) RETURNING id`,
    [batch, sessionId, unitA.id, u.tutorA2.id, u.ucA.id]
  )).rows[0].id;
  const covers = {
    lec: await cover(s.aLec),
    con: await cover(s.aCon),
    lec2: await cover(s.aLec2),
    tut: await cover(s.aTut)
  };
  const batchB = (await query(
    `INSERT INTO cover_batches (unit_id, created_by_id, reason, start_date, end_date)
     VALUES ($1, $2, 'B cover', '2026-10-01', '2026-10-07') RETURNING id`,
    [unitB.id, u.ucB.id]
  )).rows[0].id;
  await query(
    `INSERT INTO cover_requests (batch_id, session_id, unit_id, original_tutor_id, reason, created_by_id)
     VALUES ($1, $2, $3, $4, 'B cover', $5)`,
    [batchB, s.bTut, unitB.id, u.tutorB.id, u.ucB.id]
  );

  // Change requests
  const changeReq = async (tutorId, unitId, cur, pref, status = 'Pending') => (await query(
    `INSERT INTO change_requests (tutor_id, unit_id, request_type, reason, status, current_session,
                                  preferred_swap_to, priority, current_session_id, preferred_session_id)
     VALUES ($1, $2, 'Session Swap', 'RBAC', $5, 'cur', 'pref', 'Normal', $3, $4) RETURNING id`,
    [tutorId, unitId, cur, pref, status]
  )).rows[0].id;
  const reqs = {
    aTutor: await changeReq(u.tutorA2.id, unitA.id, s.aTut3, s.aTut),
    aToLecture: await changeReq(u.tutorA2.id, unitA.id, s.aTut3, s.aLec2),
    bTutor: await changeReq(u.tutorB.id, unitB.id, s.bTut, null),
    selfApprove: await changeReq(u.tutorA.id, unitA.id, s.aTut2, s.aTut4)
  };

  // Applications + resumes (personal data)
  const pdf = Buffer.from('%PDF-1.4 rbac test resume');
  const appB = (await query(
    `INSERT INTO tutor_applications (unit_id, name, last_name, email, status, resume_filename, resume_mime_type, resume_data)
     VALUES ($1, 'Applicant', 'B', 'applicant.b@rbac.test', 'pending', 'b.pdf', 'application/pdf', $2) RETURNING id`,
    [unitB.id, pdf]
  )).rows[0].id;
  await query(
    `UPDATE users SET resume_filename = 'tutorb.pdf', resume_mime_type = 'application/pdf', resume_data = $1 WHERE id = $2`,
    [pdf, u.tutorB.id]
  );

  const tokens = Object.fromEntries(Object.entries(u).map(([k, v]) => [k, tokenFor(v)]));
  Object.assign(ctx, { u, unitA, unitB, s, covers, reqs, appB, tokens });
};

// ---------------------------------------------------------------------------
// Case runner
// expected: 'Allow' -> 2xx
//           'Deny'  -> 401 / 403 / 404 (404 = resource hidden from this user)
//                      or 409 for Super Tutor business-rule rejections
// verify (optional): extra DB / body check, must return true for the case to pass
// ---------------------------------------------------------------------------
const DENY_CODES = [401, 403, 404, 409];

const call = (method, url, token, body) => {
  let r = request(app)[method](url);
  if (token) r = r.set(auth(token));
  if (body !== undefined) r = r.send(body);
  return r;
};

const runCase = (c) => {
  test(`${c.id} [${c.role}] ${c.action} -> ${c.expected}`, async () => {
    const res = await c.run();
    let pass = c.acceptStatus
      ? c.acceptStatus.includes(res.status)
      : c.expected === 'Allow'
        ? res.status >= 200 && res.status < 300
        : DENY_CODES.includes(res.status);
    let note = '';
    if (c.verify) {
      const ok = await c.verify(res);
      if (pass && !ok) { pass = false; note = c.verifyNote || 'Side-effect check failed'; }
      else if (!pass && !ok) { note = `Got HTTP ${res.status}; confirmed in DB: ${c.verifyNote}`; }
    }
    results.push({
      id: c.id, area: c.area, role: c.role, action: c.action,
      expected: c.expected, actualStatus: res.status, result: pass ? 'PASS' : 'FAIL',
      note: pass ? '' : (note || `Got HTTP ${res.status}`)
    });
    expect({ id: c.id, pass, status: res.status, note }).toEqual({ id: c.id, pass: true, status: res.status, note: '' });
  });
};

const A = () => ctx.unitA.id;
const B = () => ctx.unitB.id;
const T = (k) => ctx.tokens[k];

// ---------------------------------------------------------------------------
// 1. Authentication gate
// ---------------------------------------------------------------------------
const authCases = [
  { id: 'AUTH-01', role: 'Anonymous', action: 'View UC dashboard with no token', expected: 'Deny',
    run: () => call('get', '/uc/dashboard-summary') },
  { id: 'AUTH-02', role: 'Anonymous', action: 'View unit sessions with no token', expected: 'Deny',
    run: () => call('get', `/units/${A()}/sessions`) },
  { id: 'AUTH-03', role: 'Anonymous', action: 'Open admin user list with no token', expected: 'Deny',
    run: () => call('get', '/admin/users') },
  { id: 'AUTH-04', role: 'Anonymous', action: 'Use a forged / invalid token', expected: 'Deny',
    run: () => call('get', '/profile', 'not-a-real-token') },
  { id: 'AUTH-05', role: 'Anonymous', action: 'Use a token signed with the wrong secret', expected: 'Deny',
    run: () => call('get', '/profile', jwt.sign({ id: ctx.u.admin.id, role: 'admin' }, 'wrong-secret')) },
  { id: 'AUTH-06', role: 'Pending account', action: 'Use a valid token while account is pending', expected: 'Deny',
    run: () => call('get', '/profile', T('pending')) },
  { id: 'AUTH-07', role: 'Disabled account', action: 'Use a valid token while account is disabled', expected: 'Deny',
    run: () => call('get', '/profile', T('disabled')) },
  { id: 'AUTH-08', role: 'Tutor', action: 'Forge role=admin inside own token to open admin area', expected: 'Deny',
    run: () => call('get', '/admin/users', jwt.sign({ id: ctx.u.tutorA.id, email: ctx.u.tutorA.email, role: 'admin' }, process.env.JWT_SECRET)) },
  { id: 'AUTH-09', role: 'Anonymous', action: 'Self-register asking for role=admin (must not receive admin)', expected: 'Allow',
    run: () => call('post', '/auth/register', undefined, {
      firstName: 'Evil', lastName: 'Admin', email: 'evil.admin@rbac.test', role: 'admin',
      password: 'Password123!', confirmPassword: 'Password123!'
    }),
    verify: async () => (await query("SELECT role FROM users WHERE email = 'evil.admin@rbac.test'")).rows[0]?.role !== 'admin',
    verifyNote: 'Account was created with admin role' }
];

// ---------------------------------------------------------------------------
// 2. Unit Coordinator
// ---------------------------------------------------------------------------
const ucCases = [
  // own unit - allowed
  { id: 'UC-01', role: 'UC', action: 'View UC dashboard', expected: 'Allow',
    run: () => call('get', '/uc/dashboard-summary', T('ucA')) },
  { id: 'UC-02', role: 'UC', action: 'View sessions of own unit', expected: 'Allow',
    run: () => call('get', `/units/${A()}/sessions`, T('ucA')) },
  { id: 'UC-03', role: 'UC', action: 'Create a session in own unit', expected: 'Allow',
    run: () => call('post', `/units/${A()}/sessions`, T('ucA'), {
      day: 'FRI', startTime: '15:00', endTime: '16:00', location: 'GP-P-200', campus: 'GP',
      sessionType: 'Tutorial', capacity: 20, requiredTutors: 1, status: 'Draft'
    }) },
  { id: 'UC-04', role: 'UC', action: 'Edit a session in own unit', expected: 'Allow',
    run: () => call('put', `/units/${A()}/sessions/${ctx.s.aTut}`, T('ucA'), { location: 'GP-P-999' }) },
  { id: 'UC-05', role: 'UC', action: 'View tutor list of own unit', expected: 'Allow',
    run: () => call('get', `/units/${A()}/tutors`, T('ucA')) },
  { id: 'UC-06', role: 'UC', action: 'Set tutor priority/tags in own unit', expected: 'Allow',
    run: () => call('put', `/units/${A()}/tutors/${ctx.u.tutorA.id}/marker`, T('ucA'), { priorityTag: 'Preferred', tags: ['Friendly'] }) },
  { id: 'UC-07', role: 'UC', action: 'View availability of own unit', expected: 'Allow',
    run: () => call('get', `/availability?unitCode=${ctx.unitA.unit_code}`, T('ucA')) },
  { id: 'UC-08', role: 'UC', action: 'View applications of own unit', expected: 'Allow',
    run: () => call('get', `/tutor-applications?unitId=${A()}`, T('ucA')) },
  { id: 'UC-09', role: 'UC', action: 'Assign tutor to a tutorial in own unit', expected: 'Allow',
    run: () => call('patch', `/units/${A()}/sessions/${ctx.s.aTut}/assign`, T('ucA'), { tutorId: ctx.u.tutorA.id }) },
  { id: 'UC-10', role: 'UC', action: 'Review a tutor request in own unit', expected: 'Allow',
    run: () => call('patch', `/uc/requests/${ctx.reqs.aTutor}/review`, T('ucA'), { status: 'Rejected', reviewNotes: 'No' }) },
  { id: 'UC-11', role: 'UC', action: 'Create cover request in own unit', expected: 'Allow',
    run: () => call('post', '/uc/cover-requests', T('ucA'), {
      sessionIds: [ctx.s.aTut3], reason: 'Sick', startDate: '2026-10-10', endDate: '2026-10-17'
    }) },
  { id: 'UC-12', role: 'UC', action: 'Lock / unlock availability of own unit', expected: 'Allow',
    run: async () => { await call('patch', `/units/${A()}/lock-availability`, T('ucA')); return call('patch', `/units/${A()}/unlock-availability`, T('ucA')); } },
  { id: 'UC-13', role: 'UC', action: 'Post in own unit group chat', expected: 'Allow',
    run: () => call('post', `/messages/group/${A()}`, T('ucA'), { content: 'Hello unit A' }) },
  { id: 'UC-14', role: 'UC', action: 'Use the help bot', expected: 'Allow',
    run: () => call('post', '/bot/chat', T('ucA'), { message: '' }),
    // Empty message returns 400 before Ollama is called, so this checks only the
    // role gate (400 = got past auth + role check; 401/403 would be a denial).
    acceptStatus: [400] },

  // other unit - denied
  { id: 'UC-15', role: 'UC', action: 'View sessions of another UC\'s unit', expected: 'Deny',
    run: () => call('get', `/units/${B()}/sessions`, T('ucA')) },
  { id: 'UC-16', role: 'UC', action: 'Create a session in another UC\'s unit', expected: 'Deny',
    run: () => call('post', `/units/${B()}/sessions`, T('ucA'), {
      day: 'FRI', startTime: '15:00', endTime: '16:00', location: 'X', campus: 'GP',
      sessionType: 'Tutorial', capacity: 20, requiredTutors: 1, status: 'Draft'
    }) },
  { id: 'UC-17', role: 'UC', action: 'Delete a session in another UC\'s unit', expected: 'Deny',
    run: () => call('delete', `/units/${B()}/sessions/${ctx.s.bTut2}`, T('ucA')) },
  { id: 'UC-18', role: 'UC', action: 'Edit another unit\'s session via own unit URL', expected: 'Deny',
    run: () => call('put', `/units/${A()}/sessions/${ctx.s.bTut2}`, T('ucA'), { location: 'HACKED' }) },
  { id: 'UC-19', role: 'UC', action: 'Lock schedule of another UC\'s unit', expected: 'Deny',
    run: () => call('patch', `/units/${B()}/lock-schedule`, T('ucA'), {}) },
  { id: 'UC-20', role: 'UC', action: 'View tutor list of another UC\'s unit', expected: 'Deny',
    run: () => call('get', `/units/${B()}/tutors`, T('ucA')) },
  { id: 'UC-21', role: 'UC', action: 'Flag a tutor in another UC\'s unit', expected: 'Deny',
    run: () => call('put', `/units/${B()}/tutors/${ctx.u.tutorB.id}/flagged`, T('ucA'), { flagged: true }) },
  { id: 'UC-22', role: 'UC', action: 'View availability of another UC\'s unit', expected: 'Deny',
    run: () => call('get', `/availability?unitCode=${ctx.unitB.unit_code}`, T('ucA')) },
  { id: 'UC-23', role: 'UC', action: 'View applications of another UC\'s unit', expected: 'Deny',
    run: () => call('get', `/tutor-applications?unitId=${B()}`, T('ucA')) },
  { id: 'UC-24', role: 'UC', action: 'Edit application form of another UC\'s unit', expected: 'Deny',
    run: () => call('put', `/tutor-applications/form/${B()}`, T('ucA'), { fields: [] }) },
  { id: 'UC-25', role: 'UC', action: 'Add self as coordinator of another UC\'s unit', expected: 'Deny',
    run: () => call('post', `/units/${B()}/coordinators`, T('ucA'), { email: ctx.u.ucA.email }) },
  { id: 'UC-26', role: 'UC', action: 'Delete another UC\'s unit', expected: 'Deny',
    run: () => call('delete', `/units/${B()}`, T('ucA')) },
  { id: 'UC-27', role: 'UC', action: 'Review a request from another UC\'s unit', expected: 'Deny',
    run: () => call('patch', `/uc/requests/${ctx.reqs.bTutor}/review`, T('ucA'), { status: 'Rejected' }) },
  { id: 'UC-28', role: 'UC', action: 'Create cover request for another unit\'s session', expected: 'Deny',
    run: () => call('post', '/uc/cover-requests', T('ucA'), {
      sessionIds: [ctx.s.bTut], reason: 'x', startDate: '2026-10-10', endDate: '2026-10-17'
    }) },
  { id: 'UC-29', role: 'UC', action: 'Read another unit\'s group chat', expected: 'Deny',
    run: () => call('get', `/messages/group/${B()}`, T('ucA')) },
  { id: 'UC-30', role: 'UC', action: 'Remove a tutor from another unit\'s session via own unit URL', expected: 'Deny',
    run: () => call('delete', `/units/${A()}/sessions/${ctx.s.bTut}/assign/${ctx.u.tutorB.id}`, T('ucA')),
    verify: async () => (await query('SELECT 1 FROM session_tutors WHERE session_id = $1 AND tutor_id = $2', [ctx.s.bTut, ctx.u.tutorB.id])).rows.length === 1,
    verifyNote: 'Tutor B was actually removed from unit B\'s session' },
  { id: 'UC-31', role: 'UC', action: 'Download resume of an applicant to another unit', expected: 'Deny',
    run: () => call('get', `/tutor-applications/${ctx.appB}/resume`, T('ucA')) },
  { id: 'UC-32', role: 'UC', action: 'Download resume of a tutor not in any of own units', expected: 'Deny',
    run: () => call('get', `/tutor-applications/user/${ctx.u.tutorB.id}/resume`, T('ucA')) },

  // admin area
  { id: 'UC-33', role: 'UC', action: 'Open admin user list', expected: 'Deny',
    run: () => call('get', '/admin/users', T('ucA')) },
  { id: 'UC-34', role: 'UC', action: 'Change a user\'s role via admin API', expected: 'Deny',
    run: () => call('put', `/admin/users/${ctx.u.ucA.id}`, T('ucA'), { firstName: 'a', lastName: 'b', email: ctx.u.ucA.email, role: 'admin', accountStatus: 'active' }) }
];

// ---------------------------------------------------------------------------
// 3. Tutor
// ---------------------------------------------------------------------------
const tutorCases = [
  { id: 'TU-01', role: 'Tutor', action: 'View tutor dashboard', expected: 'Allow',
    run: () => call('get', '/tutor/dashboard-summary', T('tutorA')) },
  { id: 'TU-02', role: 'Tutor', action: 'View own unit timetable', expected: 'Allow',
    run: () => call('get', `/units/${A()}/sessions`, T('tutorA')) },
  { id: 'TU-03', role: 'Tutor', action: 'Submit own availability', expected: 'Allow',
    run: () => call('post', '/availability/submit', T('tutorA'), { unitCode: ctx.unitA.unit_code, slots: { 'Monday-9:00am': 'preferred' } }) },
  { id: 'TU-04', role: 'Tutor', action: 'Accept a session assigned to them', expected: 'Allow',
    run: () => call('patch', `/units/${A()}/sessions/${ctx.s.aTut2}/confirm`, T('tutorA'), { confirmed: true }) },
  { id: 'TU-05', role: 'Tutor', action: 'View open cover requests', expected: 'Allow',
    run: () => call('get', '/cover-requests/open', T('tutorA')) },
  { id: 'TU-06', role: 'Tutor', action: 'Claim a Tutorial cover request', expected: 'Allow',
    run: () => call('post', `/cover-requests/${ctx.covers.tut}/claim`, T('tutorA')) },
  { id: 'TU-07', role: 'Tutor', action: 'Post in own unit group chat', expected: 'Allow',
    run: () => call('post', `/messages/group/${A()}`, T('tutorA'), { content: 'hi' }) },

  { id: 'TU-08', role: 'Tutor', action: 'View UC dashboard', expected: 'Deny',
    run: () => call('get', '/uc/dashboard-summary', T('tutorA')) },
  { id: 'TU-09', role: 'Tutor', action: 'Create a session', expected: 'Deny',
    run: () => call('post', `/units/${A()}/sessions`, T('tutorA'), { day: 'MON' }) },
  { id: 'TU-10', role: 'Tutor', action: 'Delete a session', expected: 'Deny',
    run: () => call('delete', `/units/${A()}/sessions/${ctx.s.aTut}`, T('tutorA')) },
  { id: 'TU-11', role: 'Tutor', action: 'Assign self to a session', expected: 'Deny',
    run: () => call('patch', `/units/${A()}/sessions/${ctx.s.aCon}/assign`, T('tutorA'), { tutorId: ctx.u.tutorA.id }) },
  { id: 'TU-12', role: 'Tutor', action: 'Lock / finalise the schedule', expected: 'Deny',
    run: () => call('patch', `/units/${A()}/lock-schedule`, T('tutorA'), {}) },
  { id: 'TU-13', role: 'Tutor', action: 'View tutor list with UC notes', expected: 'Deny',
    run: () => call('get', `/units/${A()}/tutors`, T('tutorA')) },
  { id: 'TU-14', role: 'Tutor', action: 'View tutor applications', expected: 'Deny',
    run: () => call('get', `/tutor-applications?unitId=${A()}`, T('tutorA')) },
  { id: 'TU-15', role: 'Tutor', action: 'Approve a change request (UC review)', expected: 'Deny',
    run: () => call('patch', `/uc/requests/${ctx.reqs.aTutor}/review`, T('tutorA'), { status: 'Accepted' }) },
  { id: 'TU-16', role: 'Tutor', action: 'Create a cover request (UC action)', expected: 'Deny',
    run: () => call('post', '/uc/cover-requests', T('tutorA'), { sessionIds: [ctx.s.aTut2], startDate: '2026-10-01', endDate: '2026-10-02' }) },
  { id: 'TU-17', role: 'Tutor', action: 'Use the help bot (UC only)', expected: 'Deny',
    run: () => call('post', '/bot/chat', T('tutorA'), { message: 'hi' }) },
  { id: 'TU-18', role: 'Tutor', action: 'Open admin user list', expected: 'Deny',
    run: () => call('get', '/admin/users', T('tutorA')) },
  { id: 'TU-19', role: 'Tutor', action: 'Open own unit availability page (must see only own row)', expected: 'Allow',
    run: () => call('get', `/availability?unitCode=${ctx.unitA.unit_code}`, T('tutorA')),
    verify: async (res) => (res.body.tutors || []).every((t) => t.id === ctx.u.tutorA.id),
    verifyNote: 'Response contains other tutors\' availability' },
  { id: 'TU-20', role: 'Tutor', action: 'View timetable of a unit they are not in', expected: 'Deny',
    run: () => call('get', `/units/${B()}/sessions`, T('tutorA')) },
  { id: 'TU-21', role: 'Tutor', action: 'View availability of a unit they are not in', expected: 'Deny',
    run: () => call('get', `/availability?unitCode=${ctx.unitB.unit_code}`, T('tutorA')) },
  { id: 'TU-22', role: 'Tutor', action: 'Read group chat of a unit they are not in', expected: 'Deny',
    run: () => call('get', `/messages/group/${B()}`, T('tutorA')) },
  { id: 'TU-23', role: 'Tutor', action: 'Confirm a session assigned to someone else', expected: 'Deny',
    run: () => call('patch', `/units/${A()}/sessions/${ctx.s.aTut3}/confirm`, T('tutorA'), { confirmed: false, reason: 'x' }) },
  { id: 'TU-24', role: 'Tutor', action: 'Edit another tutor\'s request', expected: 'Deny',
    run: () => call('patch', `/requests/${ctx.reqs.aTutor}`, T('tutorA'), { reason: 'changed by someone else' }) },
  { id: 'TU-25', role: 'Tutor', action: 'Delete another tutor\'s request', expected: 'Deny',
    run: () => call('delete', `/requests/${ctx.reqs.aTutor}`, T('tutorA')) },
  { id: 'TU-26', role: 'Tutor', action: 'Claim a cover request in a unit they are not in', expected: 'Deny',
    run: async () => {
      const id = (await query('SELECT id FROM cover_requests WHERE unit_id = $1 LIMIT 1', [B()])).rows[0].id;
      return call('post', `/cover-requests/${id}/claim`, T('tutorA'));
    } },
  { id: 'TU-27', role: 'Tutor', action: 'List all sessions of every unit (legacy GET /sessions)', expected: 'Deny',
    run: () => call('get', '/sessions', T('tutorA')),
    verify: async (res) => !(Array.isArray(res.body) && res.body.some((s) => s.unit_id === B())),
    verifyNote: 'Returned sessions from unit B the tutor has no access to' },
  { id: 'TU-28', role: 'Tutor', action: 'Join another unit by submitting a request with its unit code', expected: 'Deny',
    run: () => call('post', '/requests', T('tutorA'), {
      unitCode: ctx.unitB.unit_code, requestType: 'Session Swap', priority: 'Normal',
      currentSession: 'x', preferredSwapTo: 'y', reason: 'let me in'
    }),
    verify: async () => (await query('SELECT 1 FROM unit_memberships WHERE unit_id = $1 AND user_id = $2', [B(), ctx.u.tutorA.id])).rows.length === 0,
    verifyNote: 'Tutor A was added as a member of unit B' },
  { id: 'TU-29', role: 'Tutor', action: 'Approve own pending swap request (skip UC)', expected: 'Deny',
    run: () => call('patch', `/requests/${ctx.reqs.selfApprove}`, T('tutorA'), { status: 'Accepted' }),
    verify: async () => {
      const st = (await query('SELECT status FROM change_requests WHERE id = $1', [ctx.reqs.selfApprove])).rows[0].status;
      const moved = (await query('SELECT 1 FROM session_tutors WHERE session_id = $1 AND tutor_id = $2', [ctx.s.aTut4, ctx.u.tutorA.id])).rows.length > 0;
      return String(st).toLowerCase() !== 'accepted' && !moved;
    },
    verifyNote: 'Request became Accepted and the swap was applied without UC review' },
  { id: 'TU-30', role: 'Tutor', action: 'Direct-message a user who shares no unit', expected: 'Deny',
    run: () => call('post', '/messages', T('tutorA'), { recipientId: ctx.u.tutorB.id, content: 'hello stranger' }),
    verify: async () => (await query("SELECT 1 FROM messages WHERE content = 'hello stranger'")).rows.length === 0,
    verifyNote: 'Message was stored and delivered' },
  { id: 'TU-31', role: 'Tutor', action: 'Read unit B group chat after the TU-28 request (impact check)', expected: 'Deny',
    run: () => call('get', `/messages/group/${B()}`, T('tutorA')) }
];

// ---------------------------------------------------------------------------
// 4. Super Tutor (Lecture / Consultation)
// ---------------------------------------------------------------------------
const superCases = [
  { id: 'ST-01', role: 'UC', action: 'Assign a normal Tutor to a Lecture (LEC)', expected: 'Deny',
    run: () => call('patch', `/units/${A()}/sessions/${ctx.s.aLec}/assign`, T('ucA'), { tutorId: ctx.u.tutorA2.id }) },
  { id: 'ST-02', role: 'UC', action: 'Assign a normal Tutor to a Consultation (CON)', expected: 'Deny',
    run: () => call('patch', `/units/${A()}/sessions/${ctx.s.aCon}/assign`, T('ucA'), { tutorId: ctx.u.tutorA2.id }) },
  { id: 'ST-03', role: 'UC', action: 'Assign a Super Tutor to a Lecture (LEC)', expected: 'Allow',
    run: () => call('patch', `/units/${A()}/sessions/${ctx.s.aLec}/assign`, T('ucA'), { tutorId: ctx.u.superA.id }) },
  { id: 'ST-04', role: 'UC', action: 'Assign a Super Tutor to a Consultation (CON)', expected: 'Allow',
    run: () => call('patch', `/units/${A()}/sessions/${ctx.s.aCon}/assign`, T('ucA'), { tutorId: ctx.u.superA.id }) },
  { id: 'ST-05', role: 'Tutor', action: 'Claim a Lecture cover request', expected: 'Deny',
    run: () => call('post', `/cover-requests/${ctx.covers.lec}/claim`, T('tutorA')) },
  { id: 'ST-06', role: 'Tutor', action: 'Claim a Consultation cover request', expected: 'Deny',
    run: () => call('post', `/cover-requests/${ctx.covers.con}/claim`, T('tutorA')) },
  { id: 'ST-07', role: 'Super Tutor', action: 'Claim a Lecture cover request', expected: 'Allow',
    run: () => call('post', `/cover-requests/${ctx.covers.lec2}/claim`, T('superA')) },
  { id: 'ST-08', role: 'UC', action: 'Approve a swap that moves a normal Tutor into a Lecture', expected: 'Deny',
    run: () => call('patch', `/uc/requests/${ctx.reqs.aToLecture}/review`, T('ucA'), { status: 'Accepted' }),
    verify: async () => (await query('SELECT 1 FROM session_tutors WHERE session_id = $1 AND tutor_id = $2', [ctx.s.aLec2, ctx.u.tutorA2.id])).rows.length === 0,
    verifyNote: 'Normal tutor ended up assigned to the lecture' },
  { id: 'ST-09', role: 'Super Tutor', action: 'Use tutor features (tutor dashboard)', expected: 'Allow',
    run: () => call('get', '/tutor/dashboard-summary', T('superA')) },
  { id: 'ST-10', role: 'Super Tutor', action: 'View own unit timetable', expected: 'Allow',
    run: () => call('get', `/units/${A()}/sessions`, T('superA')) },
  { id: 'ST-11', role: 'Super Tutor', action: 'Create a session (UC action)', expected: 'Deny',
    run: () => call('post', `/units/${A()}/sessions`, T('superA'), { day: 'MON' }) },
  { id: 'ST-12', role: 'Super Tutor', action: 'Assign staff to a session (UC action)', expected: 'Deny',
    run: () => call('patch', `/units/${A()}/sessions/${ctx.s.aCon2}/assign`, T('superA'), { tutorId: ctx.u.superA.id }) },
  { id: 'ST-13', role: 'Super Tutor', action: 'View UC dashboard', expected: 'Deny',
    run: () => call('get', '/uc/dashboard-summary', T('superA')) },
  { id: 'ST-14', role: 'Super Tutor', action: 'Open admin area', expected: 'Deny',
    run: () => call('get', '/admin/users', T('superA')) }
];

// ---------------------------------------------------------------------------
// 5. Admin
// ---------------------------------------------------------------------------
const adminCases = [
  { id: 'AD-01', role: 'Admin', action: 'View all users', expected: 'Allow',
    run: () => call('get', '/admin/users', T('admin')) },
  { id: 'AD-02', role: 'Admin', action: 'Create a user account', expected: 'Allow',
    run: () => call('post', '/admin/users', T('admin'), { firstName: 'New', lastName: 'User', email: 'new.user@rbac.test', role: 'tutor', accountStatus: 'active', sendSetupLink: false }) },
  { id: 'AD-03', role: 'Admin', action: 'Edit a user account', expected: 'Allow',
    run: () => call('put', `/admin/users/${ctx.u.tutorA2.id}`, T('admin'), { firstName: 'TutorA2', lastName: 'Test', email: ctx.u.tutorA2.email, role: 'tutor', accountStatus: 'active' }) },
  { id: 'AD-04', role: 'Admin', action: 'View all units', expected: 'Allow',
    run: () => call('get', '/admin/units', T('admin')) },
  { id: 'AD-05', role: 'Admin', action: 'View tutors of any unit', expected: 'Allow',
    run: () => call('get', `/admin/units/${B()}/tutors`, T('admin')) },
  { id: 'AD-06', role: 'Admin', action: 'Change a unit tutor to Super Tutor', expected: 'Allow',
    run: () => call('patch', `/admin/units/${B()}/tutors/${ctx.u.tutorB.id}/role`, T('admin'), { role: 'super_tutor' }) },
  { id: 'AD-07', role: 'Admin', action: 'View sessions across all units', expected: 'Allow',
    run: () => call('get', '/admin/sessions', T('admin')) },
  { id: 'AD-08', role: 'Admin', action: 'View requests across all units', expected: 'Allow',
    run: () => call('get', '/admin/requests', T('admin')) },
  { id: 'AD-09', role: 'Admin', action: 'View applications across all units', expected: 'Allow',
    run: () => call('get', '/admin/applications', T('admin')) },
  { id: 'AD-10', role: 'Admin', action: 'Use UC-only page API (create session in UC console)', expected: 'Deny',
    run: () => call('post', `/units/${A()}/sessions`, T('admin'), { day: 'MON' }) },
  { id: 'AD-11', role: 'Admin', action: 'Use tutor-only API (submit availability)', expected: 'Deny',
    run: () => call('post', '/availability/submit', T('admin'), { unitCode: ctx.unitA.unit_code, slots: {} }) }
];

beforeAll(async () => {
  await resetTestDatabase();
  ({ app, server, io } = require('../../server'));
  pool = require('../../db');
  await waitForSchema();
  await seed();
}, 120000);

afterAll(async () => {
  const outDir = path.join(__dirname, 'results');
  fs.mkdirSync(outDir, { recursive: true });
  const passed = results.filter((r) => r.result === 'PASS').length;
  fs.writeFileSync(path.join(outDir, 'rbac-results.json'), JSON.stringify({
    runAt: new Date().toISOString(),
    total: results.length,
    passed,
    failed: results.length - passed,
    passRate: results.length ? Math.round((passed / results.length) * 1000) / 10 : 0,
    cases: results
  }, null, 2));
  if (io) io.close();
  if (server) server.close();
  if (pool) await pool.end();
});

const tag = (area, list) => list.map((c) => ({ ...c, area }));
describe('RBAC 1 - Authentication gate', () => tag('Authentication', authCases).forEach(runCase));
describe('RBAC 2 - Unit Coordinator', () => tag('Unit Coordinator', ucCases).forEach(runCase));
describe('RBAC 3 - Tutor', () => tag('Tutor', tutorCases).forEach(runCase));
describe('RBAC 4 - Super Tutor (LEC / CON)', () => tag('Super Tutor', superCases).forEach(runCase));
describe('RBAC 5 - Admin', () => tag('Admin', adminCases).forEach(runCase));
