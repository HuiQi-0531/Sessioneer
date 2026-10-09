const { api, seed, query } = require('./harness');
const { sendEmail } = require('../../utils/email');

// Regression: on the UC's CAB139 page the Availability grid and the Messages
// contact list did not match the Tutors page.
//  - The UC also had an old tutor membership on their own unit, so they showed
//    up as a tutor on Availability (UCs no longer submit availability).
//  - Tutors whose account is a coordinator account (UC of another unit) were
//    left out of the Messages contacts because it filtered on users.role.
//  - Availability looked the unit up by code, so with two units sharing the
//    code it could show the other unit's tutors.
describe('API unit tutor lists (availability + message contacts)', () => {
  let ctx;

  beforeAll(async () => {
    ctx = await seed();
    const { u, unitA, unitB } = ctx;
    // UC of unit A still has an old tutor membership on it.
    await query(`INSERT INTO unit_memberships (unit_id, user_id, role) VALUES ($1, $2, 'tutor')`, [unitA.id, u.uc.id]);
    // uc2 (a coordinator account, UC of unit B) tutors on unit A.
    await query(`INSERT INTO unit_memberships (unit_id, user_id, role) VALUES ($1, $2, 'tutor')`, [unitA.id, u.uc2.id]);
    // Another unit with the same code as A, newer year, also run by uc.
    const twin = (await query(
      `INSERT INTO units (unit_coordinator_id, unit_code, unit_name, semester, year, enrolment_size)
       VALUES ($1, $2, 'Twin', 'Semester 1', 2027, 10) RETURNING id`,
      [u.uc.id, unitA.unit_code]
    )).rows[0];
    await query(`INSERT INTO unit_memberships (unit_id, user_id, role) VALUES ($1, $2, 'tutor')`, [twin.id, u.outsider.id]);
    ctx.twin = twin;
    ctx.unitB = unitB;
  });

  const names = (rows) => rows.map(r => r.name.replace(/ Test$/, '')).sort();

  test('availability by unitId lists the unit tutors, not the UC, not the twin unit', async () => {
    const res = await api('get', `/availability?unitId=${ctx.unitA.id}`, ctx.tokens.uc);
    expect(res.status).toBe(200);
    expect(names(res.body.tutors)).toEqual(['other', 'super', 'tutor', 'uc2']);
  });

  test('tutors page and availability agree (except the UC)', async () => {
    const tutors = await api('get', `/units/${ctx.unitA.id}/tutors`, ctx.tokens.uc);
    expect(tutors.status).toBe(200);
    const avail = await api('get', `/availability?unitId=${ctx.unitA.id}`, ctx.tokens.uc);
    const ucName = 'uc';
    expect(names(tutors.body).filter(n => n !== ucName)).toEqual(names(avail.body.tutors));
  });

  test('UC message contacts include coordinator-account tutors and exclude the UC', async () => {
    const res = await api('get', `/units/${ctx.unitA.id}/messages/contacts`, ctx.tokens.uc);
    expect(res.status).toBe(200);
    expect(names(res.body)).toEqual(['other', 'super', 'tutor', 'uc2']);
  });

  test('a co-UC (coordinator of the unit with a tutor row) is left out of availability but is a chat contact', async () => {
    // Same as CAB139 2026: Alexander and Hailey are both coordinators there,
    // both with an old tutor row, and Hui Qi is a coordinator account tutoring.
    const { u, unitA } = ctx;
    await query(`INSERT INTO unit_memberships (unit_id, user_id, role) VALUES ($1, $2, 'coordinator')`, [unitA.id, u.uc2.id]);
    try {
      const avail = await api('get', `/availability?unitId=${unitA.id}`, ctx.tokens.uc);
      expect(names(avail.body.tutors)).toEqual(['other', 'super', 'tutor']);
      const contacts = await api('get', `/units/${unitA.id}/messages/contacts`, ctx.tokens.uc);
      expect(names(contacts.body)).toEqual(['other', 'super', 'tutor', 'uc2']);
    } finally {
      await query(`DELETE FROM unit_memberships WHERE unit_id = $1 AND user_id = $2 AND role = 'coordinator'`, [unitA.id, u.uc2.id]);
    }
  });

  test('a coordinator account tutoring the unit can load its contacts and group chat', async () => {
    const contacts = await api('get', `/units/${ctx.unitA.id}/messages/contacts`, ctx.tokens.uc2);
    expect(contacts.status).toBe(200);
    expect(names(contacts.body)).toEqual(['other', 'super', 'tutor', 'uc']);

    const unread = await api('get', `/units/${ctx.unitA.id}/messages/group-unread-count`, ctx.tokens.uc2);
    expect(unread.status).toBe(200);
  });

  test('a tutor sees the UC once (as coordinator) and coordinator-account peers', async () => {
    const res = await api('get', `/units/${ctx.unitA.id}/messages/contacts`, ctx.tokens.tutor);
    expect(res.status).toBe(200);
    expect(names(res.body)).toEqual(['other', 'super', 'uc', 'uc2']);
  });

  test('UC cannot send an availability reminder to themselves', async () => {
    const res = await api('post', '/availability/reminders', ctx.tokens.uc, { unitId: ctx.unitA.id, tutorId: ctx.u.uc.id });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test('the UC cannot submit availability for their own unit', async () => {
    const res = await api('post', '/availability/submit', ctx.tokens.uc, {
      unitId: ctx.unitA.id, slots: { 'Monday-9:00am': 'preferred' }
    });
    expect(res.status).toBe(403);
  });

  test('the automatic deadline reminder does not email the UC', async () => {
    sendEmail.mockClear();
    await query(
      `UPDATE units SET availability_deadline = (NOW() AT TIME ZONE 'UTC') + INTERVAL '2 days', availability_locked = FALSE WHERE id = $1`,
      [ctx.unitA.id]
    );
    const res = await api('post', '/jobs/availability-deadline-reminders').set('x-cron-secret', process.env.CRON_SECRET);
    expect(res.status).toBe(200);
    const to = sendEmail.mock.calls.map(([arg]) => (Array.isArray(arg.to) ? arg.to[0].email : arg.to));
    expect(to).not.toContain('uc@api.test');
    expect(to).toContain('uc2@api.test');
  });

  test('UC dashboard "submitted" count ignores an old UC submission', async () => {
    await query(
      `INSERT INTO availability (tutor_id, unit_id, day, start_time, end_time, preference, is_submitted, submitted_at)
       VALUES ($1, $2, 'MON', '09:00', '10:00', 'avoid', TRUE, NOW())`,
      [ctx.u.uc.id, ctx.unitA.id]
    );
    const res = await api('get', '/uc/dashboard-summary', ctx.tokens.uc);
    expect(res.status).toBe(200);
    const row = res.body.unitStatuses.find(u => u.unitId === ctx.unitA.id);
    expect(row.tutorsSubmittedCount).toBe(0);
    // and the UC still does not appear on the availability grid
    const avail = await api('get', `/availability?unitId=${ctx.unitA.id}`, ctx.tokens.uc);
    expect(names(avail.body.tutors)).not.toContain('uc');
  });

  test('duplicating a unit does not copy the UC\'s leftover tutor row', async () => {
    const res = await api('post', `/units/${ctx.unitA.id}/duplicate`, ctx.tokens.uc, {
      semester: 'Semester 1', year: 2030
    });
    expect([200, 201]).toContain(res.status);
    const newId = res.body.id || res.body.unit?.id;
    const rows = (await query(
      `SELECT role FROM unit_memberships WHERE unit_id = $1 AND user_id = $2 ORDER BY role`,
      [newId, ctx.u.uc.id]
    )).rows.map(r => r.role);
    expect(rows).toEqual(['coordinator']);
  });
});
