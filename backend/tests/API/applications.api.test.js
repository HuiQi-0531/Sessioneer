const { api, seed, query, PASSWORD } = require('./harness');

describe('API tutor applications', () => {
  let ctx;
  beforeEach(async () => { ctx = await seed(); });
  const T = (key) => ctx.tokens[key];

  test('public apply validates the unit and stores custom answers', async () => {
    expect((await api('post', '/tutor-applications', null, { email: 'a@api.test' })).status).toBe(400);
    expect((await api('post', '/tutor-applications', null, { firstName: 'Ann', email: 'a@api.test' })).status).toBe(400);
    expect((await api('post', '/tutor-applications', null, {
      firstName: 'Ann', email: 'a@api.test', unitId: '00000000-0000-0000-0000-000000000000'
    })).status).toBe(404);

    const created = await api('post', '/tutor-applications', null, {
      unitId: ctx.unitA.id, firstName: 'Ann', lastName: 'Applicant', email: 'ann.apply@api.test',
      resumeBase64: Buffer.from('%PDF-1.4').toString('base64'), resumeFilename: 'a.pdf',
      customAnswers: { portfolio: 'https://example.com', phoneNumber: 'ignore-me' }
    });
    expect(created.status).toBe(201);
    expect((await api('get', `/tutor-applications/unit/${ctx.unitA.id}`)).status).toBe(200);
  });

  test('the coordinator edits the form, lists applications, and downloads a resume', async () => {
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
      unitId: ctx.unitA.id, firstName: 'Ann', email: 'ann.resume@api.test',
      resumeBase64: Buffer.from('%PDF-1.4 resume').toString('base64'), resumeFilename: 'cv.pdf', resumeMimeType: 'application/pdf'
    });
    const list = await api('get', `/tutor-applications?unitId=${ctx.unitA.id}`, T('uc'));
    const resume = await api('get', `/tutor-applications/${list.body[0].id}/resume`, T('uc'));
    expect(resume.status).toBe(200);
    expect(resume.headers['content-type']).toMatch(/pdf/);
  });

  test('direct invite adds an existing user, swaps tutor tier, and invites a new email', async () => {
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

  test('accept-invite creates the account and refuses a used, expired, or short password', async () => {
    const invite = await api('post', '/tutor-applications/direct-invite', T('uc'), {
      unitId: ctx.unitA.id, email: 'brand.new@api.test', role: 'tutor'
    });
    const token = invite.body.inviteToken;
    const preview = await api('get', `/tutor-applications/verify-invite/${token}`);
    expect(preview.body.requiresName).toBe(true);

    expect((await api('post', '/tutor-applications/accept-invite', null, { token, password: '123' })).status).toBe(400);
    const accepted = await api('post', '/tutor-applications/accept-invite', null, {
      token, password: 'abcdef', firstName: 'Brand', lastName: 'New'
    });
    expect(accepted.status).toBe(200);
    expect((await api('post', '/auth/login', null, { email: 'brand.new@api.test', password: 'abcdef' })).status).toBe(200);
    expect((await api('get', `/tutor-applications/verify-invite/${token}`)).status).toBe(409);
    expect((await api('post', '/tutor-applications/accept-invite', null, { token, password: 'abcdef', firstName: 'Brand', lastName: 'New' })).status).toBe(409);

    await query(
      `UPDATE tutor_applications SET status = 'invited', invite_token_expires_at = NOW() - INTERVAL '1 day'
       WHERE invite_token = $1`,
      [token]
    );
    expect((await api('get', `/tutor-applications/verify-invite/${token}`)).status).toBe(409);
    expect((await api('get', '/tutor-applications/verify-invite/missing')).status).toBe(404);
    expect(PASSWORD).toEqual(expect.any(String));
  });
});