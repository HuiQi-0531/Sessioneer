const { api, seed, query, PASSWORD } = require('./harness');

describe('API tutor applications', () => {
  let ctx;
  beforeEach(async () => { ctx = await seed(); });
  const T = (key) => ctx.tokens[key];

  test('API-A01 public apply validates the unit and stores custom answers', async () => {
    expect((await api('post', '/tutor-applications', null, { email: 'a@api.test' })).status).toBe(400);
    expect((await api('post', '/tutor-applications', null, { firstName: 'Ann', email: 'a@api.test' })).status).toBe(400);
    expect((await api('post', '/tutor-applications', null, {
      firstName: 'Ann', email: 'a@api.test', unitId: '00000000-0000-0000-0000-000000000000'
    })).status).toBe(404);

    const created = await api('post', '/tutor-applications', null, {
      unitId: ctx.unitA.id, firstName: 'Ann', lastName: 'Applicant', email: 'ann.apply@api.test', maximumHours: 10,
      resumeBase64: Buffer.from('%PDF-1.4').toString('base64'), resumeFilename: 'a.pdf',
      customAnswers: { portfolio: 'https://example.com', phoneNumber: 'ignore-me' }
    });
    expect(created.status).toBe(201);
    expect((await api('get', `/tutor-applications/unit/${ctx.unitA.id}`)).status).toBe(200);
  });

  test('API-A02 the coordinator edits the form, lists applications, and downloads a resume', async () => {
    expect((await api('get', '/tutor-applications', T('uc'))).status).toBe(400);
    expect((await api('get', `/tutor-applications?unitId=${ctx.unitB.id}`, T('uc'))).status).toBe(404);

    const form = await api('get', `/tutor-applications/form/${ctx.unitA.id}`, T('uc'));
    expect(form.body.isCustomised).toBe(false);
    expect((await api('put', `/tutor-applications/form/${ctx.unitA.id}`, T('uc'), { fields: 'nope' })).status).toBe(400);
    const saved = await api('put', `/tutor-applications/form/${ctx.unitA.id}`, T('uc'), {
      fields: [{ key: 'q1', label: 'Why you?', type: 'text', required: true }]
    });
    expect(saved.status).toBe(200);
    const reset = await api('post', `/tutor-applications/form/${ctx.unitA.id}/reset`, T('uc'), {});
    expect(reset.body.fields.length).toBeGreaterThan(0);

    await api('post', '/tutor-applications', null, {
      unitId: ctx.unitA.id, firstName: 'Ann', email: 'ann.resume@api.test', maximumHours: 10,
      resumeBase64: Buffer.from('%PDF-1.4 resume').toString('base64'), resumeFilename: 'cv.pdf', resumeMimeType: 'application/pdf'
    });
    const list = await api('get', `/tutor-applications?unitId=${ctx.unitA.id}`, T('uc'));
    const resume = await api('get', `/tutor-applications/${list.body[0].id}/resume`, T('uc'));
    expect(resume.status).toBe(200);
    expect(resume.headers['content-type']).toMatch(/pdf/);
  });

  test('API-A03 direct invite adds an existing user, swaps tutor tier, and invites a new email', async () => {
    expect((await api('post', '/tutor-applications/direct-invite', T('uc'), { unitId: ctx.unitA.id })).status).toBe(400);
    const added = await api('post', '/tutor-applications/direct-invite', T('uc'), {
      unitId: ctx.unitA.id, email: 'OUTSIDER@api.test', role: 'tutor'
    });
    expect(added.body.addedExistingUser).toBe(true);
    expect(added.body.alreadyTutor).toBe(false);

    const swapped = await api('post', '/tutor-applications/direct-invite', T('uc'), {
      unitId: ctx.unitA.id, email: 'outsider@api.test', role: 'super_tutor'
    });
    expect(swapped.body.invitedRole).toBe('super_tutor');
    const roles = await query(
      `SELECT role FROM unit_memberships WHERE unit_id = $1 AND user_id = $2 AND role IN ('tutor', 'super_tutor')`,
      [ctx.unitA.id, ctx.u.outsider.id]
    );
    expect(roles.rows.map(row => row.role)).toEqual(['super_tutor']);

    const fresh = await api('post', '/tutor-applications/direct-invite', T('uc'), {
      unitId: ctx.unitA.id, email: 'new.tutor@api.test'
    });
    expect(fresh.status).toBe(201);
    expect(fresh.body.inviteToken).toEqual(expect.any(String));
  });

  test('API-A04 accept-invite creates the account and refuses a used, expired, or short password', async () => {
  const invite = await api('post', '/tutor-applications/direct-invite', T('uc'), {
    unitId: ctx.unitA.id, email: 'brand.new@api.test', role: 'tutor'
  });
  const token = invite.body.inviteToken;
  const preview = await api('get', `/tutor-applications/verify-invite/${token}`);
  expect(preview.body.requiresName).toBe(true);

  expect((await api('post', '/tutor-applications/accept-invite', null, { token, password: '123' })).status).toBe(400);
  const accepted = await api('post', '/tutor-applications/accept-invite', null, {
    token, password: 'Abcdef12', firstName: 'Brand', lastName: 'New'
  });
  expect(accepted.status).toBe(201);
  expect((await api('post', '/auth/login', null, { email: 'brand.new@api.test', password: 'Abcdef12' })).status).toBe(200);
  expect((await api('get', `/tutor-applications/verify-invite/${token}`)).status).toBe(409);
  expect((await api('post', '/tutor-applications/accept-invite', null, { token, password: 'Abcdef12', firstName: 'Brand', lastName: 'New' })).status).toBe(409);

  const expiredInvite = await api('post', '/tutor-applications/direct-invite', T('uc'), {
    unitId: ctx.unitA.id, email: 'expired.invite@api.test', role: 'tutor'
  });
  await query(
    `UPDATE tutor_applications SET invite_token_expires_at = NOW() - INTERVAL '1 day' WHERE invite_token = $1`,
    [expiredInvite.body.inviteToken]
  );
  expect((await api('get', `/tutor-applications/verify-invite/${expiredInvite.body.inviteToken}`)).status).toBe(410);
  expect((await api('get', '/tutor-applications/verify-invite/missing')).status).toBe(404);
  expect(PASSWORD).toEqual(expect.any(String));
});

  test('API-A05 an applicant who typed a capitalised email can log in after accepting', async () => {
    await api('post', '/tutor-applications', null, {
      unitId: ctx.unitA.id, firstName: 'Mixed', lastName: 'Case', email: 'Mixed.Case@API.test', maximumHours: 10
    });
    const list = await api('get', `/tutor-applications?unitId=${ctx.unitA.id}`, T('uc'));
    const app = list.body.find(a => a.email === 'mixed.case@api.test');
    expect(app).toBeDefined();
    const invite = await api('patch', `/tutor-applications/${app.id}/invite`, T('uc'), { unitId: ctx.unitA.id });
    expect((await api('post', '/tutor-applications/accept-invite', null, { token: invite.body.inviteToken, password: 'Abcdef12' })).status).toBe(201);
    expect((await api('post', '/auth/login', null, { email: 'Mixed.Case@api.test', password: 'Abcdef12' })).status).toBe(200);
  });

  test('API-A06 an old application with the whole name in one field is split on accept', async () => {
    const invite = await api('post', '/tutor-applications/direct-invite', T('uc'), { unitId: ctx.unitA.id, email: 'legacy.name@api.test' });
    await query(`UPDATE tutor_applications SET name = 'Alex Lee', last_name = NULL WHERE invite_token = $1`, [invite.body.inviteToken]);
    await api('post', '/tutor-applications/accept-invite', null, { token: invite.body.inviteToken, password: 'Abcdef12' });
    const user = (await query(`SELECT name, last_name FROM users WHERE email = 'legacy.name@api.test'`)).rows[0];
    expect(user).toEqual({ name: 'Alex', last_name: 'Lee' });
  });

  test('API-A07 a public application with a bad email is refused', async () => {
    expect((await api('post', '/tutor-applications', null, { unitId: ctx.unitA.id, firstName: 'Ann', email: 'nope' })).status).toBe(400);
  });

  test('API-A08 accepting an invite makes the person a member with the invited role', async () => {
    const invite = await api('post', '/tutor-applications/direct-invite', T('uc'), { unitId: ctx.unitA.id, email: 'super.new@api.test', role: 'super_tutor' });
    await api('post', '/tutor-applications/accept-invite', null, { token: invite.body.inviteToken, password: 'Abcdef12', firstName: 'Sue', lastName: 'Per' });
    const roles = await query(
      `SELECT um.role FROM unit_memberships um JOIN users u ON u.id = um.user_id WHERE u.email = 'super.new@api.test' AND um.unit_id = $1`,
      [ctx.unitA.id]
    );
    expect(roles.rows.map(r => r.role)).toEqual(['super_tutor']);
  });
});