const crypto = require('crypto');
const { api, query, PASSWORD, defineApiCases } = require('./harness');

const registerBody = (overrides = {}) => ({
  firstName: 'Ann', lastName: 'Lee', email: 'ann@api.test', role: 'tutor',
  password: PASSWORD, confirmPassword: PASSWORD, ...overrides
});

defineApiCases('API auth', (add) => {
  for (const field of ['firstName', 'lastName', 'email', 'role', 'password', 'confirmPassword']) {
    add(`register rejects a missing ${field}`, async () => {
      const body = registerBody();
      delete body[field];
      expect((await api('post', '/auth/register', null, body)).status).toBe(400);
    });
  }
  add('register rejects mismatched passwords', async () => {
    const res = await api('post', '/auth/register', null, registerBody({ confirmPassword: 'other-pass' }));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/do not match/i);
  });
  add('register stores tutor when the client asks for admin', async () => {
    const res = await api('post', '/auth/register', null, registerBody({ email: 'evil.admin@api.test', role: 'admin' }));
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('tutor');
  });
  add('register stores the email in lowercase', async () => {
    const res = await api('post', '/auth/register', null, registerBody({ email: 'Ann.Upper@api.test' }));
    expect(res.body.user.email).toBe('ann.upper@api.test');
  });
  add('register accepts the Coordinator label', async () => {
    const res = await api('post', '/auth/register', null, registerBody({ email: 'casey.role@api.test', role: 'Coordinator' }));
    expect(res.body.user.role).toBe('coordinator');
  });
  add('register accepts a single fullName', async () => {
    const res = await api('post', '/auth/register', null, {
      fullName: 'Casey Ng', email: 'casey.name@api.test', role: 'tutor', password: PASSWORD, confirmPassword: PASSWORD
    });
    expect(res.status).toBe(201);
  });
  add('register rejects a duplicate email', async () => {
    await api('post', '/auth/register', null, registerBody({ email: 'dup@api.test' }));
    expect((await api('post', '/auth/register', null, registerBody({ email: 'dup@api.test' }))).status).toBe(409);
  });
  add('login rejects a missing password', async () => {
    expect((await api('post', '/auth/login', null, { email: 'uc@api.test' })).status).toBe(400);
  });
  add('login rejects a wrong password', async () => {
    expect((await api('post', '/auth/login', null, { email: 'uc@api.test', password: 'nope' })).status).toBe(401);
  });
  add('login rejects an unknown email with the same error', async () => {
    const unknown = await api('post', '/auth/login', null, { email: 'nobody@api.test', password: PASSWORD });
    const wrong = await api('post', '/auth/login', null, { email: 'uc@api.test', password: 'nope' });
    expect(unknown.status).toBe(401);
    expect(unknown.body.error).toBe(wrong.body.error);
  });
  add('login rejects a pending account', async () => {
    expect((await api('post', '/auth/login', null, { email: 'pending@api.test', password: PASSWORD })).status).toBe(403);
  });
  add('login rejects a disabled account', async () => {
    expect((await api('post', '/auth/login', null, { email: 'disabled@api.test', password: PASSWORD })).status).toBe(403);
  });
  add('login returns a token for an active account', async () => {
    const res = await api('post', '/auth/login', null, { email: 'uc@api.test', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
  });
  add('login matches the email regardless of case', async () => {
    expect((await api('post', '/auth/login', null, { email: 'UC@api.test', password: PASSWORD })).status).toBe(200);
  });
  add('forgot-password rejects a missing email', async () => {
    expect((await api('post', '/auth/forgot-password', null, {})).status).toBe(400);
  });
  add('forgot-password does not create a token for an unknown email', async (ctx) => {
    await api('post', '/auth/forgot-password', null, { email: 'missing@api.test' });
    const rows = await query('SELECT id FROM password_reset_tokens WHERE user_id = $1', [ctx.u.uc.id]);
    expect(rows.rows).toHaveLength(0);
  });
  add('forgot-password creates a token for a known email', async (ctx) => {
    await api('post', '/auth/forgot-password', null, { email: 'uc@api.test' });
    const rows = await query('SELECT id FROM password_reset_tokens WHERE user_id = $1 AND used_at IS NULL', [ctx.u.uc.id]);
    expect(rows.rows).toHaveLength(1);
  });
  add('forgot-password uses the same message either way', async () => {
    const known = await api('post', '/auth/forgot-password', null, { email: 'uc@api.test' });
    const unknown = await api('post', '/auth/forgot-password', null, { email: 'missing@api.test' });
    expect(unknown.body.message).toBe(known.body.message);
  });
  add('a second forgot-password invalidates the previous unused token', async (ctx) => {
    await api('post', '/auth/forgot-password', null, { email: 'uc@api.test' });
    await api('post', '/auth/forgot-password', null, { email: 'uc@api.test' });
    const rows = await query('SELECT id FROM password_reset_tokens WHERE user_id = $1 AND used_at IS NULL', [ctx.u.uc.id]);
    expect(rows.rows).toHaveLength(1);
  });
  add('reset-password rejects a missing password', async () => {
    expect((await api('post', '/auth/reset-password', null, { token: 'x' })).status).toBe(400);
  });
  add('reset-password rejects a short password', async () => {
    expect((await api('post', '/auth/reset-password', null, { token: 'x', newPassword: '123' })).status).toBe(400);
  });
  add('reset-password rejects an unknown token', async () => {
    expect((await api('post', '/auth/reset-password', null, { token: 'missing', newPassword: 'abcdef' })).status).toBe(400);
  });
  add('reset-password rejects an expired token', async (ctx) => {
    const raw = 'expired-token';
    await query(`INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() - INTERVAL '1 minute')`, [ctx.u.tutor.id, crypto.createHash('sha256').update(raw).digest('hex')]);
    expect((await api('post', '/auth/reset-password', null, { token: raw, newPassword: 'abcdef' })).status).toBe(400);
  });
  add('reset-password lets the user log in with the new password', async (ctx) => {
    const raw = 'valid-reset-token';
    await query(`INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '30 minutes')`, [ctx.u.tutor.id, crypto.createHash('sha256').update(raw).digest('hex')]);
    expect((await api('post', '/auth/reset-password', null, { token: raw, newPassword: 'newpass' })).status).toBe(200);
    expect((await api('post', '/auth/login', null, { email: 'tutor@api.test', password: 'newpass' })).status).toBe(200);
  });
  add('reset-password rejects the old password after a reset', async (ctx) => {
    const raw = 'valid-reset-token-2';
    await query(`INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '30 minutes')`, [ctx.u.tutor.id, crypto.createHash('sha256').update(raw).digest('hex')]);
    await api('post', '/auth/reset-password', null, { token: raw, newPassword: 'newpass' });
    expect((await api('post', '/auth/login', null, { email: 'tutor@api.test', password: PASSWORD })).status).toBe(401);
  });
  add('reset-password cannot use the same token twice', async (ctx) => {
    const raw = 'valid-reset-token-3';
    await query(`INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '30 minutes')`, [ctx.u.tutor.id, crypto.createHash('sha256').update(raw).digest('hex')]);
    await api('post', '/auth/reset-password', null, { token: raw, newPassword: 'newpass' });
    expect((await api('post', '/auth/reset-password', null, { token: raw, newPassword: 'abcdef' })).status).toBe(400);
  });
  add('health is public', async () => {
    expect((await api('get', '/health')).status).toBe(200);
  });
  add('an unknown route is 404', async () => {
    expect((await api('get', '/does-not-exist')).status).toBe(404);
  });
});