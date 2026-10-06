// API: endpoints the other API files did not reach.
// Same harness and seed as the rest of tests/API, so every case starts from
// a clean database with unit A (API101) and unit B (API202).
const { api, query, defineApiCases } = require('./harness');

const NO_ID = '00000000-0000-0000-0000-000000000000';
const PDF = Buffer.from('%PDF-1.4 test resume');

const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromToday = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return dayKey(d); };

const broadcastCover = (ctx, sessionId = ctx.s.held) => api('post', '/uc/cover-requests', ctx.tokens.uc, {
  sessionIds: [sessionId], reason: 'away', startDate: fromToday(1), endDate: fromToday(14)
});

const tutorRoles = async (unitId, userId) => (await query(
  `SELECT role FROM unit_memberships WHERE unit_id = $1 AND user_id = $2 AND role IN ('tutor', 'super_tutor')`,
  [unitId, userId]
)).rows.map(r => r.role);

const adminUnitBody = (overrides = {}) => ({
  unitCode: 'API101', unitName: 'API Unit A', semester: 'Semester 2', year: 2026,
  coordinatorEmail: 'uc@api.test', ...overrides
});

defineApiCases('API coverage: coordinator unit settings', (add) => {
  add('API-G01 a coordinator can edit their unit name and enrolment', async (ctx) => {
    const res = await api('put', `/units/${ctx.unitA.id}`, ctx.tokens.uc, { unitName: 'Renamed Unit', enrolmentSize: 120 });
    expect(res.status).toBe(200);
    const row = (await query('SELECT unit_name, enrolment_size FROM units WHERE id = $1', [ctx.unitA.id])).rows[0];
    expect(row).toEqual({ unit_name: 'Renamed Unit', enrolment_size: 120 });
  });
  add('API-G02 an edited unit code is stored in capitals', async (ctx) => {
    await api('put', `/units/${ctx.unitA.id}`, ctx.tokens.uc, { unitCode: 'api999' });
    expect((await query('SELECT unit_code FROM units WHERE id = $1', [ctx.unitA.id])).rows[0].unit_code).toBe('API999');
  });
  add('API-G03 an edit that copies another of their units in the same semester is 409', async (ctx) => {
    await api('post', '/units', ctx.tokens.uc, { unitCode: 'DUP1', unitName: 'Dup', semester: 'Semester 2', year: 2026 });
    expect((await api('put', `/units/${ctx.unitA.id}`, ctx.tokens.uc, { unitCode: 'dup1' })).status).toBe(409);
    expect((await query('SELECT unit_code FROM units WHERE id = $1', [ctx.unitA.id])).rows[0].unit_code).toBe('API101');
  });
  add('API-G04 a coordinator cannot edit another coordinator unit', async (ctx) => {
    expect((await api('put', `/units/${ctx.unitB.id}`, ctx.tokens.uc, { unitName: 'Taken' })).status).toBe(404);
    expect((await query('SELECT unit_name FROM units WHERE id = $1', [ctx.unitB.id])).rows[0].unit_name).toBe('API Unit B');
  });
  add('API-G05 the coordinator list shows the main coordinator first', async (ctx) => {
    const res = await api('get', `/units/${ctx.unitA.id}/coordinators`, ctx.tokens.uc);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ id: ctx.u.uc.id, isMain: true });
  });
  add('API-G06 adding a coordinator needs an email', async (ctx) => {
    expect((await api('post', `/units/${ctx.unitA.id}/coordinators`, ctx.tokens.uc, {})).status).toBe(400);
  });
  add('API-G07 adding an unknown email or a tutor account is refused', async (ctx) => {
    expect((await api('post', `/units/${ctx.unitA.id}/coordinators`, ctx.tokens.uc, { email: 'ghost@api.test' })).status).toBe(400);
    expect((await api('post', `/units/${ctx.unitA.id}/coordinators`, ctx.tokens.uc, { email: 'tutor@api.test' })).status).toBe(400);
  });
  add('API-G08 an added coordinator joins the unit, is notified, and can open it', async (ctx) => {
    const res = await api('post', `/units/${ctx.unitA.id}/coordinators`, ctx.tokens.uc, { email: 'UC2@api.test' });
    expect(res.status).toBe(201);
    expect(res.body.alreadyCoordinator).toBe(false);
    const list = (await api('get', `/units/${ctx.unitA.id}/coordinators`, ctx.tokens.uc)).body;
    expect(list.find(c => c.id === ctx.u.uc2.id)).toMatchObject({ isMain: false });
    const notes = (await api('get', '/notifications', ctx.tokens.uc2)).body.notifications;
    expect(notes.some(n => n.type === 'unit_coordinator_added')).toBe(true);
    expect((await api('get', `/units/${ctx.unitA.id}`, ctx.tokens.uc2)).status).toBe(200);
  });
  add('API-G09 adding the same coordinator twice does not duplicate them', async (ctx) => {
    await api('post', `/units/${ctx.unitA.id}/coordinators`, ctx.tokens.uc, { email: 'uc2@api.test' });
    const again = await api('post', `/units/${ctx.unitA.id}/coordinators`, ctx.tokens.uc, { email: 'uc2@api.test' });
    expect(again.body.alreadyCoordinator).toBe(true);
    const rows = await query(`SELECT 1 FROM unit_memberships WHERE unit_id = $1 AND user_id = $2 AND role = 'coordinator'`, [ctx.unitA.id, ctx.u.uc2.id]);
    expect(rows.rows).toHaveLength(1);
  });
  add('API-G10 the unit tutor list holds the unit tutors and nobody else', async (ctx) => {
    const res = await api('get', `/units/${ctx.unitA.id}/tutors`, ctx.tokens.uc);
    expect(res.status).toBe(200);
    const ids = res.body.map(t => t.id).sort();
    expect(ids).toEqual([ctx.u.tutor.id, ctx.u.super.id, ctx.u.other.id].sort());
  });
});

defineApiCases('API coverage: messages, covers, resumes, legacy sessions', (add) => {
  add('API-G11 group unread count goes up for others and back to 0 after reading', async (ctx) => {
    await api('post', `/messages/group/${ctx.unitA.id}`, ctx.tokens.tutor, { content: 'hello all' });
    const before = await api('get', `/units/${ctx.unitA.id}/messages/group-unread-count`, ctx.tokens.uc);
    expect(before.status).toBe(200);
    expect(before.body.unreadCount).toBe(1);
    await api('patch', `/messages/group/${ctx.unitA.id}/read`, ctx.tokens.uc);
    expect((await api('get', `/units/${ctx.unitA.id}/messages/group-unread-count`, ctx.tokens.uc)).body.unreadCount).toBe(0);
  });
  add('API-G12 the sender\'s own group message is not counted as unread for them', async (ctx) => {
    await api('post', `/messages/group/${ctx.unitA.id}`, ctx.tokens.tutor, { content: 'mine' });
    expect((await api('get', `/units/${ctx.unitA.id}/messages/group-unread-count`, ctx.tokens.tutor)).body.unreadCount).toBe(0);
  });
  add('API-G13 an outsider cannot read the unread count of a unit chat', async (ctx) => {
    // Same rule as reading the group chat itself, which returns 403.
    await api('post', `/messages/group/${ctx.unitA.id}`, ctx.tokens.tutor, { content: 'private' });
    expect((await api('get', `/units/${ctx.unitA.id}/messages/group-unread-count`, ctx.tokens.outsider)).status).toBe(403);
  });
  add('API-G14 the coordinator sees their cover broadcast with names and occurrences', async (ctx) => {
    await broadcastCover(ctx);
    const res = await api('get', '/uc/cover-requests', ctx.tokens.uc);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ unitCode: 'API101', status: 'open', originalTutorName: 'tutor Test' });
    expect(res.body[0].occurrenceCount).toBeGreaterThan(0);
  });
  add('API-G15 the cover list shows who claimed it, and another coordinator sees nothing', async (ctx) => {
    const sent = await broadcastCover(ctx);
    await api('post', `/cover-requests/${sent.body.requests[0].id}/claim`, ctx.tokens.other);
    const row = (await api('get', '/uc/cover-requests', ctx.tokens.uc)).body[0];
    expect(row).toMatchObject({ status: 'claimed', claimedByName: 'other Test' });
    expect((await api('get', '/uc/cover-requests', ctx.tokens.uc2)).body).toEqual([]);
  });
  add('API-G16 a coordinator can open the resume of a tutor in their unit', async (ctx) => {
    await query(`UPDATE users SET resume_data = $1, resume_mime_type = 'application/pdf', resume_filename = 'cv.pdf' WHERE id = $2`, [PDF, ctx.u.tutor.id]);
    const res = await api('get', `/tutor-applications/user/${ctx.u.tutor.id}/resume`, ctx.tokens.uc);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/pdf/);
  });
  add('API-G17 a coordinator of another unit cannot open that resume', async (ctx) => {
    await query(`UPDATE users SET resume_data = $1, resume_mime_type = 'application/pdf' WHERE id = $2`, [PDF, ctx.u.tutor.id]);
    expect((await api('get', `/tutor-applications/user/${ctx.u.tutor.id}/resume`, ctx.tokens.uc2)).status).toBe(404);
  });
  add('API-G18 a tutor with no resume gives 404', async (ctx) => {
    expect((await api('get', `/tutor-applications/user/${ctx.u.other.id}/resume`, ctx.tokens.uc)).status).toBe(404);
  });
  add('API-G19 legacy /sessions lists only the caller\'s units, with the active tutor name', async (ctx) => {
    const res = await api('get', '/sessions', ctx.tokens.tutor);
    expect(res.status).toBe(200);
    expect(res.body.every(s => s.unit_id === ctx.unitA.id)).toBe(true);
    expect(res.body.find(s => s.id === ctx.s.held).assigned_tutor_name).toBe('tutor Test');
    expect(res.body.find(s => s.id === ctx.s.declined).assigned_tutor_name).toBeNull();
  });
  add('API-G20 legacy /sessions gives an outsider nothing', async (ctx) => {
    expect((await api('get', '/sessions', ctx.tokens.outsider)).body).toEqual([]);
  });
});

defineApiCases('API coverage: admin users and units', (add) => {
  add('API-G21 the admin user list holds every account', async (ctx) => {
    const res = await api('get', '/admin/users', ctx.tokens.admin);
    expect(res.status).toBe(200);
    const total = Number((await query('SELECT COUNT(*) FROM users')).rows[0].count);
    expect(res.body).toHaveLength(total);
    expect(res.body.map(u => u.id)).toEqual(expect.arrayContaining([ctx.u.pending.id, ctx.u.disabled.id]));
  });
  add('API-G22 the admin unit list holds units from every coordinator', async (ctx) => {
    const res = await api('get', '/admin/units', ctx.tokens.admin);
    expect(res.status).toBe(200);
    expect(res.body.map(u => u.id)).toEqual(expect.arrayContaining([ctx.unitA.id, ctx.unitB.id]));
  });
  add('API-G23 admin unit edit needs every field', async (ctx) => {
    expect((await api('put', `/admin/units/${ctx.unitA.id}`, ctx.tokens.admin, { unitName: 'X' })).status).toBe(400);
  });
  add('API-G24 admin unit edit refuses a tutor as main coordinator', async (ctx) => {
    expect((await api('put', `/admin/units/${ctx.unitA.id}`, ctx.tokens.admin, adminUnitBody({ coordinatorEmail: 'tutor@api.test' }))).status).toBe(400);
  });
  add('API-G25 admin unit edit refuses a code already used that semester', async (ctx) => {
    expect((await api('put', `/admin/units/${ctx.unitB.id}`, ctx.tokens.admin, adminUnitBody({ coordinatorEmail: 'uc2@api.test' }))).status).toBe(409);
  });
  add('API-G26 admin unit edit on a missing unit is 404', async (ctx) => {
    expect((await api('put', `/admin/units/${NO_ID}`, ctx.tokens.admin, adminUnitBody({ unitCode: 'NEW1' }))).status).toBe(404);
  });
  add('API-G27 admin can rename a unit and hand it to another coordinator', async (ctx) => {
    const res = await api('put', `/admin/units/${ctx.unitA.id}`, ctx.tokens.admin, adminUnitBody({ unitName: 'Handed Over', coordinatorEmail: 'uc2@api.test' }));
    expect(res.status).toBe(200);
    const row = (await query('SELECT unit_name, unit_coordinator_id FROM units WHERE id = $1', [ctx.unitA.id])).rows[0];
    expect(row).toEqual({ unit_name: 'Handed Over', unit_coordinator_id: ctx.u.uc2.id });
    expect((await api('get', `/units/${ctx.unitA.id}`, ctx.tokens.uc2)).status).toBe(200);
  });
});

defineApiCases('API coverage: admin unit staff', (add) => {
  add('API-G28 admin sees the unit tutors with their tier', async (ctx) => {
    const res = await api('get', `/admin/units/${ctx.unitA.id}/tutors`, ctx.tokens.admin);
    expect(res.status).toBe(200);
    expect(res.body.map(t => t.id).sort()).toEqual([ctx.u.tutor.id, ctx.u.super.id, ctx.u.other.id].sort());
  });
  add('API-G29 admin tutor list for a missing unit is 404', async (ctx) => {
    expect((await api('get', `/admin/units/${NO_ID}/tutors`, ctx.tokens.admin)).status).toBe(404);
  });
  add('API-G30 adding staff needs an email; unknown email is 404; admin account is 400', async (ctx) => {
    expect((await api('post', `/admin/units/${ctx.unitA.id}/tutors`, ctx.tokens.admin, { role: 'tutor' })).status).toBe(400);
    expect((await api('post', `/admin/units/${ctx.unitA.id}/tutors`, ctx.tokens.admin, { email: 'ghost@api.test' })).status).toBe(404);
    expect((await api('post', `/admin/units/${ctx.unitA.id}/tutors`, ctx.tokens.admin, { email: 'admin@api.test' })).status).toBe(400);
  });
  add('API-G31 admin adds an existing user as a tutor and they are notified', async (ctx) => {
    const res = await api('post', `/admin/units/${ctx.unitA.id}/tutors`, ctx.tokens.admin, { email: 'OUTSIDER@api.test', role: 'tutor' });
    expect(res.status).toBe(201);
    expect(await tutorRoles(ctx.unitA.id, ctx.u.outsider.id)).toEqual(['tutor']);
    const notes = (await api('get', '/notifications', ctx.tokens.outsider)).body.notifications;
    expect(notes.some(n => n.type === 'tutor_unit_added')).toBe(true);
  });
  add('API-G32 the "added to a unit" notification is linked to that unit', async (ctx) => {
    await api('post', `/admin/units/${ctx.unitA.id}/tutors`, ctx.tokens.admin, { email: 'outsider@api.test', role: 'tutor' });
    const row = (await query(`SELECT related_unit_id FROM notifications WHERE user_id = $1 AND notification_type = 'tutor_unit_added'`, [ctx.u.outsider.id])).rows[0];
    expect(row.related_unit_id).toBe(ctx.unitA.id);
  });
  add('API-G33 adding an existing tutor as super tutor replaces the tier, not adds a second one', async (ctx) => {
    await api('post', `/admin/units/${ctx.unitA.id}/tutors`, ctx.tokens.admin, { email: 'other@api.test', role: 'super_tutor' });
    expect(await tutorRoles(ctx.unitA.id, ctx.u.other.id)).toEqual(['super_tutor']);
  });
  add('API-G34 changing a tier needs a valid role; admin and missing users are refused', async (ctx) => {
    expect((await api('patch', `/admin/units/${ctx.unitA.id}/tutors/${ctx.u.other.id}/role`, ctx.tokens.admin, { role: 'boss' })).status).toBe(400);
    expect((await api('patch', `/admin/units/${ctx.unitA.id}/tutors/${ctx.u.admin.id}/role`, ctx.tokens.admin, { role: 'tutor' })).status).toBe(400);
    expect((await api('patch', `/admin/units/${ctx.unitA.id}/tutors/${NO_ID}/role`, ctx.tokens.admin, { role: 'tutor' })).status).toBe(404);
    expect((await api('patch', `/admin/units/${NO_ID}/tutors/${ctx.u.other.id}/role`, ctx.tokens.admin, { role: 'tutor' })).status).toBe(404);
  });
  add('API-G35 admin promotes a tutor to super tutor', async (ctx) => {
    const res = await api('patch', `/admin/units/${ctx.unitA.id}/tutors/${ctx.u.other.id}/role`, ctx.tokens.admin, { role: 'super_tutor' });
    expect(res.status).toBe(200);
    expect(await tutorRoles(ctx.unitA.id, ctx.u.other.id)).toEqual(['super_tutor']);
  });
  add('API-G36 a super tutor who holds a Lecture cannot be dropped to plain tutor', async (ctx) => {
    // Lectures need a Super Tutor, so the tier change would leave the lecture with an unqualified tutor.
    await api('post', `/admin/sessions/${ctx.s.lecture}/assignments`, ctx.tokens.admin, { tutorId: ctx.u.super.id });
    expect((await api('patch', `/admin/units/${ctx.unitA.id}/tutors/${ctx.u.super.id}/role`, ctx.tokens.admin, { role: 'tutor' })).status).toBe(409);
    expect(await tutorRoles(ctx.unitA.id, ctx.u.super.id)).toEqual(['super_tutor']);
  });
  add('API-G37 a tutor still on a session cannot be removed from the unit', async (ctx) => {
    expect((await api('delete', `/admin/units/${ctx.unitA.id}/tutors/${ctx.u.tutor.id}`, ctx.tokens.admin)).status).toBe(409);
    expect(await tutorRoles(ctx.unitA.id, ctx.u.tutor.id)).toEqual(['tutor']);
  });
  add('API-G38 an unassigned tutor is removed; removing a non-member is 404', async (ctx) => {
    expect((await api('delete', `/admin/units/${ctx.unitA.id}/tutors/${ctx.u.other.id}`, ctx.tokens.admin)).status).toBe(200);
    expect(await tutorRoles(ctx.unitA.id, ctx.u.other.id)).toEqual([]);
    expect((await api('delete', `/admin/units/${ctx.unitA.id}/tutors/${ctx.u.outsider.id}`, ctx.tokens.admin)).status).toBe(404);
  });
});

defineApiCases('API coverage: admin sessions, resumes, covers', (add) => {
  add('API-G39 admin session assignments show the slot size and who holds it', async (ctx) => {
    const res = await api('get', `/admin/sessions/${ctx.s.held}/assignments`, ctx.tokens.admin);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ scheduleLocked: false, requiredTutors: 1 });
    expect(res.body.assigned).toEqual([expect.objectContaining({ id: ctx.u.tutor.id, confirmed: null })]);
  });
  add('API-G40 admin session assignments: bad id is 400, missing session is 404', async (ctx) => {
    expect((await api('get', '/admin/sessions/not-a-uuid/assignments', ctx.tokens.admin)).status).toBe(400);
    expect((await api('get', `/admin/sessions/${NO_ID}/assignments`, ctx.tokens.admin)).status).toBe(404);
  });
  add('API-G41 admin can open an applicant resume; a missing one is 404', async (ctx) => {
    await api('post', '/tutor-applications', null, {
      unitId: ctx.unitA.id, firstName: 'Ann', email: 'ann.admin@api.test',
      resumeBase64: PDF.toString('base64'), resumeFilename: 'cv.pdf', resumeMimeType: 'application/pdf'
    });
    const appId = (await query(`SELECT id FROM tutor_applications WHERE email = 'ann.admin@api.test'`)).rows[0].id;
    const res = await api('get', `/admin/applications/${appId}/resume`, ctx.tokens.admin);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/pdf/);
    expect((await api('get', `/admin/applications/${NO_ID}/resume`, ctx.tokens.admin)).status).toBe(404);
  });
  add('API-G42 admin cancels an open cover and the away tutor is told', async (ctx) => {
    const sent = await broadcastCover(ctx);
    const id = sent.body.requests[0].id;
    expect((await api('patch', `/admin/cover-requests/${id}/cancel`, ctx.tokens.admin)).status).toBe(200);
    expect((await query('SELECT status FROM cover_requests WHERE id = $1', [id])).rows[0].status).toBe('cancelled');
    const notes = (await api('get', '/notifications', ctx.tokens.tutor)).body.notifications;
    expect(notes.some(n => n.type === 'cover_request_cancelled')).toBe(true);
  });
  add('API-G43 a cover that is already claimed or cancelled cannot be cancelled again', async (ctx) => {
    const sent = await broadcastCover(ctx);
    const id = sent.body.requests[0].id;
    await api('post', `/cover-requests/${id}/claim`, ctx.tokens.other);
    expect((await api('patch', `/admin/cover-requests/${id}/cancel`, ctx.tokens.admin)).status).toBe(404);
    expect((await query('SELECT status FROM cover_requests WHERE id = $1', [id])).rows[0].status).toBe('claimed');
  });
});

defineApiCases('API coverage: rules on endpoints already reached', (add) => {
  add('API-G44 a direct message to someone outside your units is refused', async (ctx) => {
    expect((await api('post', '/messages', ctx.tokens.tutor, { recipientId: ctx.u.uc2.id, content: 'hi' })).status).toBe(403);
    expect((await query('SELECT 1 FROM messages WHERE recipient_id = $1', [ctx.u.uc2.id])).rows).toHaveLength(0);
  });
  add('API-G45 the UC dashboard counts declined sessions as unassigned and pending ones as waiting', async (ctx) => {
    // Unit A: 7 sessions. TUT03 has a pending tutor; TUT04 only has a declined one.
    const res = await api('get', '/uc/dashboard-summary', ctx.tokens.uc);
    expect(res.body).toMatchObject({ totalUnits: 1, totalSessions: 7, unassignedSessions: 6, pendingConfirmations: 1, pendingRequestsCount: 0 });
    expect(res.body.unitStatuses[0]).toMatchObject({ unitCode: 'API101', sessionCount: 7, unassignedCount: 6 });
  });
  add('API-G46 the tutor dashboard leaves out sessions the tutor declined', async (ctx) => {
    const res = await api('get', '/tutor/dashboard-summary', ctx.tokens.tutor);
    expect(res.body).toMatchObject({ totalSessions: 1, confirmedSessions: 0, pendingRequestsCount: 0 });
    expect(res.body.unitStatuses.find(u => u.unitCode === 'API101').assignedSessionCount).toBe(1);
  });
});

defineApiCases('API coverage: other ways a Super Tutor could be dropped to Tutor', (add) => {
  const holdLecture = (ctx) => api('post', `/admin/sessions/${ctx.s.lecture}/assignments`, ctx.tokens.admin, { tutorId: ctx.u.super.id });
  add('API-G47 admin "add staff" as Tutor cannot drop a Super Tutor who holds a Lecture', async (ctx) => {
    await holdLecture(ctx);
    expect((await api('post', `/admin/units/${ctx.unitA.id}/tutors`, ctx.tokens.admin, { email: 'super@api.test', role: 'tutor' })).status).toBe(409);
    expect(await tutorRoles(ctx.unitA.id, ctx.u.super.id)).toEqual(['super_tutor']);
  });
  add('API-G48 admin user unit access as Tutor cannot drop a Super Tutor who holds a Lecture', async (ctx) => {
    await holdLecture(ctx);
    expect((await api('post', `/admin/users/${ctx.u.super.id}/units`, ctx.tokens.admin, { unitId: ctx.unitA.id, role: 'tutor' })).status).toBe(409);
    expect(await tutorRoles(ctx.unitA.id, ctx.u.super.id)).toEqual(['super_tutor']);
  });
  add('API-G49 a coordinator re-inviting as Tutor cannot drop a Super Tutor who holds a Lecture', async (ctx) => {
    await holdLecture(ctx);
    expect((await api('post', '/tutor-applications/direct-invite', ctx.tokens.uc, { unitId: ctx.unitA.id, email: 'super@api.test', role: 'tutor' })).status).toBe(409);
    expect(await tutorRoles(ctx.unitA.id, ctx.u.super.id)).toEqual(['super_tutor']);
  });
});