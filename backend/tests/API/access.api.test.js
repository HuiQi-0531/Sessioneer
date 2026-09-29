const jwt = require('jsonwebtoken');
const { api, seed, query } = require('./harness');

describe('API access boundaries', () => {
  let ctx;
  const cases = [];
  const add = (name, fn) => cases.push([name, fn]);

  beforeEach(async () => { ctx = await seed(); });

  const blocked = [
    ['no token cannot open the UC dashboard', (c) => api('get', '/uc/dashboard-summary'), 401],
    ['no token cannot open a unit timetable', (c) => api('get', `/units/${c.unitA.id}/sessions`), 401],
    ['no token cannot open the admin user list', (c) => api('get', '/admin/users'), 401],
    ['no token cannot open a profile', (c) => api('get', '/profile'), 401],
    ['a forged token cannot open a profile', () => api('get', '/profile', 'not-a-real-token'), 401],
    ['a token signed with the wrong secret is rejected', (c) => api('get', '/profile', jwt.sign({ id: c.u.admin.id, role: 'admin' }, 'wrong-secret')), 401],
    ['a pending account cannot open a profile', (c) => api('get', '/profile', c.tokens.pending), 403],
    ['a disabled account cannot open a profile', (c) => api('get', '/profile', c.tokens.disabled), 403],
    ['a tutor token rewritten as admin still cannot open admin', (c) => api('get', '/admin/users', jwt.sign({ id: c.u.tutor.id, email: c.u.tutor.email, role: 'admin' }, process.env.JWT_SECRET)), 403],

    ['a UC cannot read another unit timetable', (c) => api('get', `/units/${c.unitB.id}/sessions`, c.tokens.uc), 403],
    ['a UC cannot create a session in another unit', (c) => api('post', `/units/${c.unitB.id}/sessions`, c.tokens.uc, { day: 'MON' }), 404],
    ['a UC cannot delete a session in another unit', (c) => api('delete', `/units/${c.unitB.id}/sessions/${c.s.unitB}`, c.tokens.uc), 404],
    ['a UC cannot edit another unit session through their own unit URL', (c) => api('put', `/units/${c.unitA.id}/sessions/${c.s.unitB}`, c.tokens.uc, { location: 'HACKED' }), 404],
    ['a UC cannot lock another unit', (c) => api('patch', `/units/${c.unitB.id}/lock-schedule`, c.tokens.uc, { force: true }), 404],
    ['a UC cannot release another unit draft', (c) => api('patch', `/units/${c.unitB.id}/release-draft`, c.tokens.uc, {}), 404],
    ['a UC cannot lock another unit availability', (c) => api('patch', `/units/${c.unitB.id}/lock-availability`, c.tokens.uc, {}), 404],
    ['a UC cannot delete another unit', (c) => api('delete', `/units/${c.unitB.id}`, c.tokens.uc), 404],
    ['a UC cannot list tutors of another unit', (c) => api('get', `/units/${c.unitB.id}/tutors`, c.tokens.uc), 404],
    ['a UC cannot flag a tutor in another unit', (c) => api('put', `/units/${c.unitB.id}/tutors/${c.u.other.id}/flagged`, c.tokens.uc, { flagged: true }), 404],
    ['a UC cannot star a tutor in another unit', (c) => api('put', `/units/${c.unitB.id}/tutors/${c.u.other.id}/starred`, c.tokens.uc, { starred: true }), 404],
    ['a UC cannot read another unit availability', (c) => api('get', '/availability?unitCode=API202', c.tokens.uc), 403],
    ['a UC cannot list another unit applications', (c) => api('get', `/tutor-applications?unitId=${c.unitB.id}`, c.tokens.uc), 404],
    ['a UC cannot edit another unit application form', (c) => api('put', `/tutor-applications/form/${c.unitB.id}`, c.tokens.uc, { fields: [] }), 404],
    ['a UC cannot add themselves to another unit', (c) => api('post', `/units/${c.unitB.id}/coordinators`, c.tokens.uc, { email: 'uc@api.test' }), 404],
    ['a UC cannot broadcast cover for another unit', (c) => api('post', '/uc/cover-requests', c.tokens.uc, { sessionIds: [c.s.unitB], startDate: '2026-10-05', endDate: '2026-10-05' }), 403],
    ['a UC cannot read another unit group chat', (c) => api('get', `/messages/group/${c.unitB.id}`, c.tokens.uc), 403],
    ['a UC cannot post in another unit group chat', (c) => api('post', `/messages/group/${c.unitB.id}`, c.tokens.uc, { content: 'hi' }), 403],
    ['a UC cannot open unit message contacts for another unit', (c) => api('get', `/units/${c.unitB.id}/messages/contacts`, c.tokens.uc), 404],
    ['a UC cannot open the admin user list', (c) => api('get', '/admin/users', c.tokens.uc), 403],
    ['a UC cannot change a role through the admin API', (c) => api('put', `/admin/users/${c.u.tutor.id}`, c.tokens.uc, { firstName: 'A', lastName: 'B', email: 'tutor@api.test', role: 'admin', accountStatus: 'active' }), 403],

    ['a tutor cannot open the UC dashboard', (c) => api('get', '/uc/dashboard-summary', c.tokens.tutor), 403],
    ['a tutor cannot list coordinator units', (c) => api('get', '/units', c.tokens.tutor), 403],
    ['a tutor cannot create a session', (c) => api('post', `/units/${c.unitA.id}/sessions`, c.tokens.tutor, { day: 'MON' }), 403],
    ['a tutor cannot delete a session', (c) => api('delete', `/units/${c.unitA.id}/sessions/${c.s.open}`, c.tokens.tutor), 403],
    ['a tutor cannot assign themselves', (c) => api('patch', `/units/${c.unitA.id}/sessions/${c.s.open}/assign`, c.tokens.tutor, { tutorId: c.u.tutor.id }), 403],
    ['a tutor cannot lock the schedule', (c) => api('patch', `/units/${c.unitA.id}/lock-schedule`, c.tokens.tutor, { force: true }), 403],
    ['a tutor cannot release a draft', (c) => api('patch', `/units/${c.unitA.id}/release-draft`, c.tokens.tutor, {}), 403],
    ['a tutor cannot lock availability', (c) => api('patch', `/units/${c.unitA.id}/lock-availability`, c.tokens.tutor, {}), 403],
    ['a tutor cannot open the tutor list', (c) => api('get', `/units/${c.unitA.id}/tutors`, c.tokens.tutor), 403],
    ['a tutor cannot open applications', (c) => api('get', `/tutor-applications?unitId=${c.unitA.id}`, c.tokens.tutor), 403],
    ['a tutor cannot review a request as a UC', (c) => api('patch', '/uc/requests/00000000-0000-0000-0000-000000000000/review', c.tokens.tutor, { status: 'Rejected' }), 403],
    ['a tutor cannot broadcast cover', (c) => api('post', '/uc/cover-requests', c.tokens.tutor, { sessionIds: [c.s.open], startDate: '2026-10-05', endDate: '2026-10-05' }), 403],
    ['a tutor cannot use the help bot', (c) => api('post', '/bot/chat', c.tokens.tutor, { message: 'hi' }), 403],
    ['a tutor cannot open admin', (c) => api('get', '/admin/users', c.tokens.tutor), 403],
    ['a tutor cannot read a unit they are not in', (c) => api('get', `/units/${c.unitB.id}/sessions`, c.tokens.tutor), 403],
    ['a tutor cannot read availability of a unit they are not in', (c) => api('get', '/availability?unitCode=API202', c.tokens.tutor), 403],
    ['a tutor cannot read a group chat they are not in', (c) => api('get', `/messages/group/${c.unitB.id}`, c.tokens.tutor), 403],
    ['a tutor cannot confirm a session assigned to someone else', (c) => api('patch', `/units/${c.unitA.id}/sessions/${c.s.open}/confirm`, c.tokens.tutor, { confirmed: true }), 404],

    ['a super tutor cannot create a session', (c) => api('post', `/units/${c.unitA.id}/sessions`, c.tokens.super, { day: 'MON' }), 403],
    ['a super tutor cannot assign staff', (c) => api('patch', `/units/${c.unitA.id}/sessions/${c.s.open}/assign`, c.tokens.super, { tutorId: c.u.super.id }), 403],
    ['a super tutor cannot open the UC dashboard', (c) => api('get', '/uc/dashboard-summary', c.tokens.super), 403],
    ['a super tutor cannot open admin', (c) => api('get', '/admin/users', c.tokens.super), 403],
    ['an outsider cannot read a unit timetable', (c) => api('get', `/units/${c.unitA.id}/sessions`, c.tokens.outsider), 403],
    ['an outsider cannot open unit contacts', (c) => api('get', `/units/${c.unitA.id}/messages/contacts`, c.tokens.outsider), 403],

    ['an admin cannot use the UC session creator', (c) => api('post', `/units/${c.unitA.id}/sessions`, c.tokens.admin, { day: 'MON' }), 403],
    ['an admin cannot submit availability', (c) => api('post', '/availability/submit', c.tokens.admin, { unitCode: 'API101', slots: {} }), 403],
    ['an admin cannot open the UC dashboard', (c) => api('get', '/uc/dashboard-summary', c.tokens.admin), 403],
    ['an admin cannot open the tutor dashboard', (c) => api('get', '/tutor/dashboard-summary', c.tokens.admin), 403]
  ];

  for (const [name, run, status] of blocked) {
    add(name, async (current) => {
      expect((await run(current)).status).toBe(status);
    });
  }

  add('a UC unit list does not contain another coordinator unit', async (current) => {
    const list = await api('get', '/units', current.tokens.uc);
    expect(list.body.map(unit => unit.unitCode)).not.toContain('API202');
  });

  add('a tutor availability page contains only that tutor', async (current) => {
    const res = await api('get', '/availability?unitCode=API101', current.tokens.tutor);
    expect(res.status).toBe(200);
    expect(res.body.tutors.every(tutor => tutor.id === current.u.tutor.id)).toBe(true);
  });

  add('a tutor cannot edit another tutor request', async (current) => {
    const created = await api('post', '/requests', current.tokens.other, {
      unitCode: 'API101', requestType: 'Session Swap', reason: 'mine', currentSessionId: current.s.open
    });
    expect((await api('patch', `/requests/${created.body.id}`, current.tokens.tutor, { reason: 'stolen' })).status).toBe(404);
  });

  add('a tutor cannot delete another tutor request', async (current) => {
    const created = await api('post', '/requests', current.tokens.other, {
      unitCode: 'API101', requestType: 'Session Swap', reason: 'mine', currentSessionId: current.s.open
    });
    expect((await api('delete', `/requests/${created.body.id}`, current.tokens.tutor)).status).toBe(404);
  });

  add('editing another unit session does not change its room', async (current) => {
    await api('put', `/units/${current.unitA.id}/sessions/${current.s.unitB}`, current.tokens.uc, { location: 'HACKED' });
    const room = await query('SELECT location FROM sessions WHERE id = $1', [current.s.unitB]);
    expect(room.rows[0].location).toBe('GP-P-101');
  });

  add('a super tutor can still open the tutor dashboard', async (current) => {
    expect((await api('get', '/tutor/dashboard-summary', current.tokens.super)).status).toBe(200);
  });

  test.each(cases)('%s', async (_name, fn) => { await fn(ctx); });
});