// Integration workflows: each test follows one user story across several
// parts of the system (accounts, units, sessions, availability, requests,
// covers, notifications, jobs) and checks the END RESULT the people involved
// would see - "open the phone and look", not "ask if it was written".
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { sendEmail } = require('../../utils/email');
const { migrate } = require('../../scripts/migrate');
const { api, seed, query, sessionBody, PASSWORD } = require('../API/harness');

const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromToday = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return dayKey(d); };

const login = async (email, password = PASSWORD) => (await api('post', '/auth/login', null, { email, password })).body.token;
const notesOf = async (token) => (await api('get', '/notifications', token)).body.notifications;
const timetable = async (unitId, token) => (await api('get', `/units/${unitId}/sessions`, token)).body;
const tutorsOn = async (sessionId) => (await query(
  `SELECT tutor_id, tutor_confirmed FROM session_tutors WHERE session_id = $1 ORDER BY tutor_id`, [sessionId]
)).rows;
const tokenFromLastEmail = () => {
  const call = sendEmail.mock.calls[sendEmail.mock.calls.length - 1][0];
  return /token=([a-f0-9]+)/.exec(call.textContent || call.htmlContent)[1];
};

describe('Integration workflows', () => {
  let ctx;
  beforeEach(async () => { ctx = await seed(); sendEmail.mockClear(); });

  test('INT-01 semester set-up: register, create unit, import timetable, invite tutor, availability, assign, accept, lock', async () => {
    // A new coordinator registers and logs in.
    expect((await api('post', '/auth/register', null, {
      firstName: 'Nia', lastName: 'Coord', email: 'Nia@API.test', role: 'Coordinator', password: PASSWORD, confirmPassword: PASSWORD
    })).status).toBe(201);
    const uc = await login('nia@api.test');

    // Creates a unit and imports the timetable from a CSV.
    const unit = (await api('post', '/units', uc, { unitCode: 'flow101', unitName: 'Flow', semester: 'Semester 1', year: 2027 })).body;
    const imported = await api('post', `/units/${unit.id}/sessions/import`, uc, { sessions: [
      { day: 'Monday', startTime: '9am', endTime: '11am', location: 'P-101', campus: 'GP', sessionType: 'Tutorial', capacity: 25 },
      { day: 'Tuesday', startTime: '13:00', endTime: '14:00', location: 'P-102', campus: 'GP', sessionType: 'Tutorial', capacity: 25 }
    ] });
    expect(imported.body.importedCount).toBe(2);
    const [mon, tue] = (await timetable(unit.id, uc)).sort((a, b) => a.day.localeCompare(b.day));

    // Invites a brand-new tutor, who accepts and logs in.
    const invite = await api('post', '/tutor-applications/direct-invite', uc, { unitId: unit.id, email: 'Fresh.Tutor@api.test' });
    expect((await api('post', '/tutor-applications/accept-invite', null, {
      token: invite.body.inviteToken, password: 'abcdef', firstName: 'Fresh', lastName: 'Tutor'
    })).status).toBe(201);
    const tutor = await login('fresh.tutor@api.test', 'abcdef');
    const tutorId = (await api('get', '/profile', tutor)).body.id;
    expect((await api('get', '/units/my-units', tutor)).body.map(u => u.unitCode)).toContain('FLOW101');

    // The tutor submits availability and the coordinator sees it on the grid.
    await api('post', '/availability/submit', tutor, { unitId: unit.id, unitCode: 'FLOW101', slots: {
      'Monday-9:00am': 'preferred', 'Monday-10:00am': 'preferred', 'Tuesday-1:00pm': 'avoid'
    } });
    const grid = (await api('get', `/availability?unitId=${unit.id}`, uc)).body;
    expect(grid.submissionStatus).toEqual([{ tutorId, submitted: true }]);

    // Assign Staff ranks the tutor and shows "avoid" on Tuesday.
    const monCandidates = (await api('get', `/units/${unit.id}/sessions/${mon.id}/candidates`, uc)).body.candidates;
    expect(monCandidates.find(c => c.id === tutorId).allPreferred).toBe(true);
    const tueCandidates = (await api('get', `/units/${unit.id}/sessions/${tue.id}/candidates`, uc)).body.candidates;
    expect(tueCandidates.find(c => c.id === tutorId).warnings).toContain('Marked "avoid" for this time');

    // Assign Monday; the tutor is notified and accepts.
    await api('patch', `/units/${unit.id}/sessions/${mon.id}/assign`, uc, { tutorId });
    expect((await notesOf(tutor)).some(n => n.type === 'session_assigned')).toBe(true);
    await api('patch', `/units/${unit.id}/sessions/${mon.id}/confirm`, tutor, { confirmed: true });
    expect((await notesOf(uc)).some(n => n.type === 'session_confirmed')).toBe(true);

    // Lock is refused while Tuesday is empty, then forced.
    const notReady = await api('patch', `/units/${unit.id}/lock-schedule`, uc, {});
    expect(notReady.body).toMatchObject({ unassignedCount: 1, pendingCount: 0 });
    expect((await api('patch', `/units/${unit.id}/lock-schedule`, uc, { force: true })).body.scheduleLocked).toBe(true);

    // After locking nothing can change, and the tutor's schedule shows Monday as accepted.
    expect((await api('patch', `/units/${unit.id}/sessions/${tue.id}/assign`, uc, { tutorId })).status).toBe(409);
    expect((await api('patch', `/units/${unit.id}/sessions/${mon.id}/confirm`, tutor, { confirmed: false, reason: 'x' })).status).toBe(409);
    const mine = (await api('get', `/units/${unit.id}/sessions/my-assigned`, tutor)).body;
    expect(mine.map(s => [s.id, s.tutorConfirmed])).toEqual([[mon.id, true]]);
  });

  test('INT-02 Sarah in two units: the second coordinator cannot book the same time, and the time shows as avoid', async () => {
    // "other" is Sarah: a tutor in API101 and API202.
    await query(`INSERT INTO unit_memberships (unit_id, user_id, role) VALUES ($1, $2, 'tutor')`, [ctx.unitB.id, ctx.u.other.id]);
    await api('post', '/availability/submit', ctx.tokens.other, { unitId: ctx.unitB.id, slots: { 'Monday-9:00am': 'preferred' } });

    // UC A offers MON 9-10. While it is only an offer, UC B already sees her as blocked.
    await api('patch', `/units/${ctx.unitA.id}/sessions/${ctx.s.open}/assign`, ctx.tokens.uc, { tutorId: ctx.u.other.id });
    const cands = (await api('get', `/units/${ctx.unitB.id}/sessions/${ctx.s.unitB}/candidates`, ctx.tokens.uc2)).body.candidates;
    const sarah = cands.find(c => c.id === ctx.u.other.id);
    expect(sarah.hardBlocked).toBe(true);
    expect(sarah.tentativeConflict).toBe(true);
    const blocked = await api('patch', `/units/${ctx.unitB.id}/sessions/${ctx.s.unitB}/assign`, ctx.tokens.uc2, { tutorId: ctx.u.other.id });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toMatch(/API101/);

    // Sarah accepts A. B's availability grid now shows MON 9am as avoid, with the reason.
    await api('patch', `/units/${ctx.unitA.id}/sessions/${ctx.s.open}/confirm`, ctx.tokens.other, { confirmed: true });
    const gridB = (await api('get', `/availability?unitId=${ctx.unitB.id}`, ctx.tokens.uc2)).body;
    expect(gridB.availability.MON[ctx.u.other.id]['9:00am']).toBe('avoid');
    expect(gridB.committed.MON[ctx.u.other.id]['9:00am']).toBe('API101');
    // ...but what she typed is still stored unchanged.
    expect((await query('SELECT preference FROM availability WHERE tutor_id = $1 AND unit_id = $2', [ctx.u.other.id, ctx.unitB.id])).rows)
      .toEqual([{ preference: 'preferred' }]);

    // A non-clashing time in B still works.
    const later = (await api('post', `/units/${ctx.unitB.id}/sessions`, ctx.tokens.uc2, sessionBody({ day: 'MON', startTime: '11:00', endTime: '12:00' }))).body;
    expect((await api('patch', `/units/${ctx.unitB.id}/sessions/${later.id}/assign`, ctx.tokens.uc2, { tutorId: ctx.u.other.id })).status).toBe(200);
  });

  test('INT-03 a double booking that slips in is stopped when the tutor accepts', async () => {
    // Two coordinators pressed Assign at the same instant: both offers exist.
    await query(`INSERT INTO unit_memberships (unit_id, user_id, role) VALUES ($1, $2, 'tutor')`, [ctx.unitB.id, ctx.u.other.id]);
    await query('INSERT INTO session_tutors (session_id, tutor_id) VALUES ($1, $3), ($2, $3)', [ctx.s.open, ctx.s.unitB, ctx.u.other.id]);

    expect((await api('patch', `/units/${ctx.unitB.id}/sessions/${ctx.s.unitB}/confirm`, ctx.tokens.other, { confirmed: true })).status).toBe(200);
    const second = await api('patch', `/units/${ctx.unitA.id}/sessions/${ctx.s.open}/confirm`, ctx.tokens.other, { confirmed: true });
    expect(second.status).toBe(409);
    expect(second.body.error).toMatch(/API202/);

    // She declines the second one; UC A sees it needs a tutor again.
    await api('patch', `/units/${ctx.unitA.id}/sessions/${ctx.s.open}/confirm`, ctx.tokens.other, { confirmed: false, reason: 'double booked' });
    const row = (await timetable(ctx.unitA.id, ctx.tokens.uc)).find(s => s.id === ctx.s.open);
    expect(row.isAssigned).toBe(false);
    expect(row.declinedTutors[0].rejectReason).toBe('double booked');
    expect((await notesOf(ctx.tokens.uc)).some(n => n.type === 'session_declined')).toBe(true);
  });

  test('INT-04 cover from start to finish: broadcast, claim, everyone sees the cover, then it expires', async () => {
    const start = fromToday(1);
    const end = fromToday(8);
    // The frontend payload (with dates and the away tutor).
    const sent = await api('post', '/uc/cover-requests', ctx.tokens.uc, {
      sessionIds: [ctx.s.held], reason: 'conference', startDate: start, endDate: end, originalTutorId: ctx.u.tutor.id
    });
    expect(sent.status).toBe(201);
    const id = sent.body.requests[0].id;

    // Everyone except the away tutor is told, and sees it in their open list.
    expect((await notesOf(ctx.tokens.tutor)).some(n => n.type === 'session_cover_open')).toBe(false);
    expect((await notesOf(ctx.tokens.other)).some(n => n.type === 'session_cover_open')).toBe(true);
    expect((await api('get', '/cover-requests/open', ctx.tokens.other)).body.map(r => r.id)).toContain(id);
    expect((await api('get', '/cover-requests/open', ctx.tokens.tutor)).body.map(r => r.id)).not.toContain(id);

    // First claim wins.
    expect((await api('post', `/cover-requests/${id}/claim`, ctx.tokens.other)).status).toBe(200);
    expect((await api('post', `/cover-requests/${id}/claim`, ctx.tokens.super)).status).toBe(409);

    // UC timetable shows the cover; the permanent tutor is unchanged.
    const ucRow = (await timetable(ctx.unitA.id, ctx.tokens.uc)).find(s => s.id === ctx.s.held);
    expect(ucRow.activeCovers.map(c => c.claimedByName)).toEqual(['other Test']);
    expect(ucRow.tutors.map(t => t.tutorId)).toEqual([ctx.u.tutor.id]);
    expect(await tutorsOn(ctx.s.held)).toEqual([{ tutor_id: ctx.u.tutor.id, tutor_confirmed: null }]);

    // The claimer sees it in their schedule; the away tutor and UC are told.
    const covering = (await api('get', `/units/${ctx.unitA.id}/sessions/my-assigned`, ctx.tokens.other)).body.find(s => s.id === ctx.s.held);
    expect(covering).toMatchObject({ isCovering: true, coverOccurrenceCount: expect.any(Number) });
    expect((await notesOf(ctx.tokens.tutor)).some(n => n.type === 'session_cover_claimed')).toBe(true);
    expect((await api('get', '/uc/cover-requests', ctx.tokens.uc)).body.find(r => r.id === id).claimedByName).toBe('other Test');

    // When the cover period is over it disappears by itself.
    await query(`UPDATE cover_batches SET start_date = CURRENT_DATE - 9, end_date = CURRENT_DATE - 1 WHERE id = $1`, [sent.body.batchId]);
    expect((await timetable(ctx.unitA.id, ctx.tokens.uc)).find(s => s.id === ctx.s.held).activeCovers).toEqual([]);
    expect((await api('get', `/units/${ctx.unitA.id}/sessions/my-assigned`, ctx.tokens.other)).body.find(s => s.id === ctx.s.held)).toBeUndefined();
  });

  test('INT-05 a cover cannot double-book the person claiming it, and a cancelled cover disappears', async () => {
    await query(`INSERT INTO unit_memberships (unit_id, user_id, role) VALUES ($1, $2, 'tutor')`, [ctx.unitB.id, ctx.u.other.id]);
    await api('patch', `/units/${ctx.unitB.id}/sessions/${ctx.s.unitB}/assign`, ctx.tokens.uc2, { tutorId: ctx.u.other.id });
    await api('patch', `/units/${ctx.unitA.id}/sessions/${ctx.s.open}/assign`, ctx.tokens.uc, { tutorId: ctx.u.super.id });
    const sent = await api('post', '/uc/cover-requests', ctx.tokens.uc, { sessionIds: [ctx.s.open], startDate: fromToday(1), endDate: fromToday(3) });
    const id = sent.body.requests[0].id;

    const clash = await api('post', `/cover-requests/${id}/claim`, ctx.tokens.other);
    expect(clash.status).toBe(409);
    expect(clash.body.error).toMatch(/API202/);

    await api('delete', `/uc/cover-requests/batch/${sent.body.batchId}`, ctx.tokens.uc);
    expect((await api('get', '/cover-requests/open', ctx.tokens.tutor)).body.map(r => r.id)).not.toContain(id);
    expect((await api('post', `/cover-requests/${id}/claim`, ctx.tokens.tutor)).status).toBe(409);
  });

  test('INT-06 swap by suggestion: tutor asks, UC suggests, tutor accepts, timetable updates once', async () => {
    const req = (await api('post', '/requests', ctx.tokens.tutor, {
      unitId: ctx.unitA.id, unitCode: 'API101', requestType: 'Session Swap', reason: 'class clash',
      currentSession: 'WED 11:00-12:00|GP-P-101', currentSessionId: ctx.s.held, priority: 'Urgent'
    })).body;
    expect(sendEmail).toHaveBeenCalled(); // urgent -> coordinators emailed
    expect((await notesOf(ctx.tokens.uc)).some(n => n.type === 'request_submitted')).toBe(true);

    // Suggest TUE 09-10 using the label format the UI sends ("id::label").
    await api('patch', `/uc/requests/${req.id}/review`, ctx.tokens.uc, { status: 'suggested', reviewNotes: `${ctx.s.open2}::TUE 09:00 - 10:00 | GP-P-101` });
    expect((await notesOf(ctx.tokens.tutor)).some(n => n.type === 'request_suggested')).toBe(true);
    expect((await api('patch', `/requests/${req.id}`, ctx.tokens.tutor, { status: 'accepted' })).status).toBe(200);

    const rows = await timetable(ctx.unitA.id, ctx.tokens.uc);
    expect(rows.find(s => s.id === ctx.s.open2).tutors.map(t => t.tutorId)).toEqual([ctx.u.tutor.id]);
    expect(rows.find(s => s.id === ctx.s.held).tutors).toEqual([]);

    // Pressing approve again must not move anything a second time.
    expect((await api('patch', `/uc/requests/${req.id}/review`, ctx.tokens.uc, { status: 'accepted' })).status).toBe(200);
    expect(await tutorsOn(ctx.s.open2)).toEqual([{ tutor_id: ctx.u.tutor.id, tutor_confirmed: null }]);
  });

  test('INT-07 an admin approval really moves the tutor, and a blocked one leaves everything as it was', async () => {
    const ok = (await api('post', '/requests', ctx.tokens.tutor, {
      unitCode: 'API101', requestType: 'Session Swap', reason: 'x', currentSessionId: ctx.s.held, preferredSessionId: ctx.s.open2
    })).body;
    await api('patch', `/admin/requests/${ok.id}/review`, ctx.tokens.admin, { status: 'accepted' });
    expect((await timetable(ctx.unitA.id, ctx.tokens.uc)).find(s => s.id === ctx.s.open2).tutors.map(t => t.tutorId)).toEqual([ctx.u.tutor.id]);
    expect((await notesOf(ctx.tokens.tutor)).some(n => n.type === 'request_accepted')).toBe(true);

    await query('INSERT INTO session_tutors (session_id, tutor_id, tutor_confirmed) VALUES ($1, $2, TRUE)', [ctx.s.open, ctx.u.other.id]);
    const full = (await api('post', '/requests', ctx.tokens.tutor, {
      unitCode: 'API101', requestType: 'Session Swap', reason: 'y', currentSessionId: ctx.s.open2, preferredSessionId: ctx.s.open
    })).body;
    expect((await api('patch', `/admin/requests/${full.id}/review`, ctx.tokens.admin, { status: 'accepted' })).status).toBe(409);
    expect((await query('SELECT status FROM change_requests WHERE id = $1', [full.id])).rows[0].status).toBe('Pending');
    expect(await tutorsOn(ctx.s.open)).toEqual([{ tutor_id: ctx.u.other.id, tutor_confirmed: true }]);
  });

  test('INT-08 decline, refill and lock: a declined session is reopened and filled by someone else', async () => {
    const unit = (await api('post', '/units', ctx.tokens.uc, { unitCode: 'refill', unitName: 'Refill', semester: 'Semester 1', year: 2027 })).body;
    const s = (await api('post', `/units/${unit.id}/sessions`, ctx.tokens.uc, sessionBody())).body;
    await api('patch', `/units/${unit.id}/sessions/${s.id}/assign`, ctx.tokens.uc, { tutorId: ctx.u.other.id });
    await api('patch', `/units/${unit.id}/sessions/${s.id}/confirm`, ctx.tokens.other, { confirmed: false, reason: 'busy' });

    expect((await api('patch', `/units/${unit.id}/lock-schedule`, ctx.tokens.uc, {})).body).toMatchObject({ unassignedCount: 1 });
    // The declining tutor cannot take it back on their own.
    expect((await api('patch', `/units/${unit.id}/sessions/${s.id}/confirm`, ctx.tokens.other, { confirmed: true })).status).toBe(409);

    await api('patch', `/units/${unit.id}/sessions/${s.id}/assign`, ctx.tokens.uc, { tutorId: ctx.u.super.id });
    expect((await api('patch', `/units/${unit.id}/lock-schedule`, ctx.tokens.uc, {})).body).toMatchObject({ unassignedCount: 0, pendingCount: 1 });
    await api('patch', `/units/${unit.id}/sessions/${s.id}/confirm`, ctx.tokens.super, { confirmed: true });
    expect((await api('patch', `/units/${unit.id}/lock-schedule`, ctx.tokens.uc, {})).status).toBe(200);
  });

  test('INT-09 next semester: duplicate the unit, staff it fresh, and availability goes to the right semester', async () => {
    await api('patch', `/units/${ctx.unitA.id}/sessions/${ctx.s.held}/confirm`, ctx.tokens.tutor, { confirmed: true });
    const copy = (await api('post', `/units/${ctx.unitA.id}/duplicate`, ctx.tokens.uc, { semester: 'Semester 1', year: 2027 })).body;
    expect(copy.unitCode).toBe('API101');

    // Same sessions, same tutors on the unit, but nobody assigned yet.
    const copied = await timetable(copy.id, ctx.tokens.uc);
    expect(copied).toHaveLength(7);
    expect(copied.every(s => s.tutors.length === 0 && s.declinedTutors.length === 0)).toBe(true);
    expect((await api('get', `/availability?unitId=${copy.id}`, ctx.tokens.uc)).body.tutors.map(t => t.id)).toContain(ctx.u.tutor.id);

    // Availability sent with the new unitId is stored on the new unit only.
    await api('post', '/availability/submit', ctx.tokens.tutor, { unitId: copy.id, unitCode: 'API101', slots: { 'Friday-9:00am': 'preferred' } });
    const units = (await query('SELECT DISTINCT unit_id FROM availability WHERE tutor_id = $1', [ctx.u.tutor.id])).rows.map(r => r.unit_id);
    expect(units).toEqual([copy.id]);

    // The old semester is untouched.
    expect(await tutorsOn(ctx.s.held)).toEqual([{ tutor_id: ctx.u.tutor.id, tutor_confirmed: true }]);
  });

  test('INT-10 moving a staffed session: a clash is refused, a free time moves it for everyone', async () => {
    await query('UPDATE users SET maximum_hours = 10 WHERE id = $1', [ctx.u.tutor.id]);
    await api('patch', `/units/${ctx.unitA.id}/sessions/${ctx.s.open}/assign`, ctx.tokens.uc, { tutorId: ctx.u.tutor.id });
    // tutor now holds MON 09-10 and WED 11-12. Moving WED onto MON 09:30 clashes.
    expect((await api('put', `/units/${ctx.unitA.id}/sessions/${ctx.s.held}`, ctx.tokens.uc, { day: 'MON', startTime: '09:30', endTime: '10:30' })).status).toBe(409);
    expect((await api('put', `/units/${ctx.unitA.id}/sessions/${ctx.s.held}`, ctx.tokens.uc, { day: 'FRI', startTime: '15:00', endTime: '16:00' })).status).toBe(200);
    await api('patch', `/units/${ctx.unitA.id}/release-draft`, ctx.tokens.uc, {});
    const seen = (await api('get', `/units/${ctx.unitA.id}/sessions/my-assigned`, ctx.tokens.tutor)).body.find(s => s.id === ctx.s.held);
    expect(seen).toMatchObject({ day: 'FRI', startTime: '15:00:00' });
  });

  test('INT-11 deleting a unit removes everything that belonged to it and nothing else', async () => {
    await api('post', '/availability/submit', ctx.tokens.tutor, { unitCode: 'API101', slots: { 'Monday-9:00am': 'preferred' } });
    await api('post', '/requests', ctx.tokens.tutor, { unitCode: 'API101', requestType: 'Session Change', reason: 'x', currentSessionId: ctx.s.held });
    await api('post', '/uc/cover-requests', ctx.tokens.uc, { sessionIds: [ctx.s.held], startDate: fromToday(1), endDate: fromToday(2) });
    await api('post', `/messages/group/${ctx.unitA.id}`, ctx.tokens.tutor, { content: 'bye' });

    expect((await api('delete', `/units/${ctx.unitA.id}`, ctx.tokens.uc)).status).toBe(200);
    expect((await api('get', '/units', ctx.tokens.uc)).body).toEqual([]);
    expect((await api('get', '/units/my-units', ctx.tokens.tutor)).body).toEqual([]);
    expect((await api('get', '/requests', ctx.tokens.tutor)).body).toEqual([]);
    expect((await api('get', '/cover-requests/open', ctx.tokens.other)).body).toEqual([]);
    expect((await timetable(ctx.unitB.id, ctx.tokens.uc2))).toHaveLength(1);
  });

  test('INT-12 account life cycle: admin creates, user sets a password, logs in, is disabled, is locked out', async () => {
    const created = await api('post', '/admin/users', ctx.tokens.admin, {
      firstName: 'Setup', lastName: 'User', email: 'setup.user@api.test', role: 'tutor', accountStatus: 'active', sendSetupLink: true
    });
    expect(created.status).toBe(201);
    const token = tokenFromLastEmail();
    expect((await api('post', '/auth/reset-password', null, { token, newPassword: 'chosen1' })).status).toBe(200);
    const userToken = await login('setup.user@api.test', 'chosen1');
    expect((await api('get', '/profile', userToken)).body.email).toBe('setup.user@api.test');

    await api('put', `/admin/users/${created.body.id}`, ctx.tokens.admin, {
      firstName: 'Setup', lastName: 'User', email: 'setup.user@api.test', role: 'tutor', accountStatus: 'disabled'
    });
    expect((await api('post', '/auth/login', null, { email: 'setup.user@api.test', password: 'chosen1' })).status).toBe(403);
    expect((await api('get', '/profile', userToken)).status).toBe(403); // the old token stops working too
  });

  test('INT-13 forgot password: email link works once, old password stops working', async () => {
    await api('post', '/auth/forgot-password', null, { email: 'TUTOR@api.test' });
    const token = tokenFromLastEmail();
    expect((await api('post', '/auth/reset-password', null, { token, newPassword: 'brandnew' })).status).toBe(200);
    expect((await api('post', '/auth/login', null, { email: 'tutor@api.test', password: PASSWORD })).status).toBe(401);
    expect((await api('post', '/auth/login', null, { email: 'tutor@api.test', password: 'brandnew' })).status).toBe(200);
    expect((await api('post', '/auth/reset-password', null, { token, newPassword: 'again12' })).status).toBe(400);
  });

  test('INT-14 reminders: a 3-day-old unanswered offer is emailed once, an answered one never', async () => {
    await query(`UPDATE session_tutors SET assigned_at = NOW() - INTERVAL '4 days' WHERE session_id = $1`, [ctx.s.held]);
    const run = () => api('post', '/jobs/session-assignment-reminders').set('x-cron-secret', process.env.CRON_SECRET);
    expect((await run()).body.emailedCount).toBe(1);
    expect((await run()).body.emailedCount).toBe(0);

    await api('patch', `/units/${ctx.unitA.id}/sessions/${ctx.s.open}/assign`, ctx.tokens.uc, { tutorId: ctx.u.other.id });
    await api('patch', `/units/${ctx.unitA.id}/sessions/${ctx.s.open}/confirm`, ctx.tokens.other, { confirmed: true });
    await query(`UPDATE session_tutors SET assigned_at = NOW() - INTERVAL '4 days' WHERE session_id = $1`, [ctx.s.open]);
    expect((await run()).body.emailedCount).toBe(0);
  });

  test('INT-15 who can see the timetable and talk: release, early access, group chat, outsiders', async () => {
    expect((await timetable(ctx.unitA.id, ctx.tokens.other)).released).toBe(false);
    await api('put', `/units/${ctx.unitA.id}/tutors/${ctx.u.other.id}/early-access`, ctx.tokens.uc, { earlyAccess: true });
    expect(Array.isArray(await timetable(ctx.unitA.id, ctx.tokens.other))).toBe(true);
    expect((await timetable(ctx.unitA.id, ctx.tokens.super)).released).toBe(false);
    await api('patch', `/units/${ctx.unitA.id}/release-draft`, ctx.tokens.uc, {});
    expect(Array.isArray(await timetable(ctx.unitA.id, ctx.tokens.super))).toBe(true);

    expect((await api('post', `/messages/group/${ctx.unitA.id}`, ctx.tokens.outsider, { content: 'hi' })).status).toBe(403);
    expect((await api('post', `/messages/group/${ctx.unitA.id}`, ctx.tokens.super, { content: 'hello team' })).status).toBe(201);
    expect((await api('get', `/messages/group/${ctx.unitA.id}`, ctx.tokens.uc)).body.map(m => m.content)).toEqual(['hello team']);
    expect((await api('post', '/messages', ctx.tokens.tutor, { recipientId: ctx.u.uc.id, content: 'question' })).status).toBe(201);
    expect((await api('get', `/messages/thread/${ctx.u.tutor.id}`, ctx.tokens.uc)).body.map(m => m.content)).toEqual(['question']);
  });

  test('INT-16 migration 001 turns an old database into the new one without losing real assignments', async () => {
    const base = process.env.TEST_DATABASE_URL;
    const legacyName = `${new URL(base).pathname.slice(1)}_legacy`;
    const legacyUrl = Object.assign(new URL(base), { pathname: `/${legacyName}` }).toString();
    const admin = new Client({ connectionString: base });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${legacyName}`);
    await admin.query(`CREATE DATABASE ${legacyName}`);
    await admin.end();

    const db = new Client({ connectionString: legacyUrl });
    await db.connect();
    try {
      await db.query(fs.readFileSync(path.join(__dirname, 'fixtures', 'legacy-schema.sql'), 'utf8'));
      // Old data: a swap stored only in the old column, a cover claim stored
      // in the old column, and a normal assignment already in session_tutors.
      await db.query(`
        INSERT INTO users (id, email, password_hash, role, name) VALUES
          ('00000000-0000-0000-0000-0000000000a1', 'swap@old.test', 'x', 'tutor', 'Swap'),
          ('00000000-0000-0000-0000-0000000000a2', 'cover@old.test', 'x', 'tutor', 'Cover'),
          ('00000000-0000-0000-0000-0000000000a3', 'normal@old.test', 'x', 'tutor', 'Normal');
        INSERT INTO units (id, unit_code, unit_name, semester, year) VALUES
          ('00000000-0000-0000-0000-0000000000b1', 'OLD1', 'Old', 'Semester 2', 2026);
        INSERT INTO sessions (id, unit_id, day, start_time, end_time, assigned_tutor_id, is_assigned, tutor_confirmed) VALUES
          ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 'MON', '09:00', '10:00', '00000000-0000-0000-0000-0000000000a1', TRUE, TRUE),
          ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b1', 'TUE', '09:00', '10:00', '00000000-0000-0000-0000-0000000000a2', TRUE, TRUE),
          ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000b1', 'WED', '09:00', '10:00', '00000000-0000-0000-0000-0000000000a3', TRUE, NULL);
        INSERT INTO session_tutors (session_id, tutor_id, tutor_confirmed) VALUES
          ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000a3', NULL);
        INSERT INTO cover_batches (id, unit_id) VALUES ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1');
        INSERT INTO cover_requests (batch_id, session_id, unit_id, status, claimed_by_id) VALUES
          ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b1', 'claimed', '00000000-0000-0000-0000-0000000000a2');
      `);
      await db.end();

      await migrate(legacyUrl, () => {});
      await migrate(legacyUrl, () => {}); // running twice is safe

      const check = new Client({ connectionString: legacyUrl });
      await check.connect();
      const st = (await check.query(`
        SELECT u.email, st.tutor_confirmed FROM session_tutors st JOIN users u ON u.id = st.tutor_id ORDER BY u.email
      `)).rows;
      const cols = (await check.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'sessions'`)).rows.map(r => r.column_name);
      const applied = (await check.query('SELECT name FROM schema_migrations ORDER BY name')).rows.map(r => r.name);
      // Migration 002 only adds: existing units get no teaching period (so no
      // class reminders until a UC sets one) and existing users token_version 0.
      const unit = (await check.query(`SELECT teaching_start_date, teaching_end_date, unit_code FROM units`)).rows;
      const versions = (await check.query(`SELECT DISTINCT token_version FROM users`)).rows;
      const reminderTables = (await check.query(
        `SELECT to_regclass('public.availability_reminders') AS a, to_regclass('public.session_reminders') AS s`
      )).rows[0];
      await check.end();

      expect(st).toEqual([
        { email: 'normal@old.test', tutor_confirmed: null }, // untouched
        { email: 'swap@old.test', tutor_confirmed: true }    // rescued from the old column
      ]);                                                     // cover claim NOT made permanent
      expect(cols).not.toEqual(expect.arrayContaining(['assigned_tutor_id']));
      expect(cols).not.toContain('is_assigned');
      expect(cols).not.toContain('tutor_confirmed');
      expect(applied).toEqual(['001_single_assignment_table.sql', '002_reminders_teaching_period_token_version.sql']);
      expect(unit).toEqual([{ teaching_start_date: null, teaching_end_date: null, unit_code: 'OLD1' }]);
      expect(versions).toEqual([{ token_version: 0 }]);
      expect(reminderTables).toEqual({ a: 'availability_reminders', s: 'session_reminders' });
    } finally {
      await db.end().catch(() => {});
      const cleanup = new Client({ connectionString: base });
      await cleanup.connect();
      await cleanup.query(`DROP DATABASE IF EXISTS ${legacyName}`).catch(() => {});
      await cleanup.end();
    }
  }, 60000);
});
