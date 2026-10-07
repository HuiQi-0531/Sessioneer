// Server-side logout: a token stops working as soon as the user logs out,
// changes their password or resets it.
const crypto = require('crypto');
const { api, query, defineApiCases, PASSWORD } = require('./harness');
const { hashResetToken } = require('../../utils/passwords');

const login = async (email) => (await api('post', '/auth/login', null, { email, password: PASSWORD })).body.token;
const NEW_PASSWORD = 'NewPassword456!';

defineApiCases('API logout and token invalidation', (add) => {
  add('logout needs a token', async () => {
    const res = await api('post', '/auth/logout');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTH_INVALID');
  });

  add('after logout the same token gets 401 everywhere', async () => {
    const token = await login('tutor@api.test');
    expect((await api('get', '/profile', token)).status).toBe(200);

    expect((await api('post', '/auth/logout', token)).status).toBe(200);

    const after = await api('get', '/profile', token);
    expect(after.status).toBe(401);
    expect(after.body.code).toBe('AUTH_INVALID');
    expect((await api('get', '/notifications', token)).status).toBe(401);
    expect((await api('get', '/units/my-units', token)).status).toBe(401);
  });

  add('logging out does not affect other users', async () => {
    const tutorToken = await login('tutor@api.test');
    const ucToken = await login('uc@api.test');
    await api('post', '/auth/logout', tutorToken);
    expect((await api('get', '/profile', ucToken)).status).toBe(200);
  });

  add('logging out signs the user out on every device', async () => {
    const laptop = await login('tutor@api.test');
    const phone = await login('tutor@api.test');
    await api('post', '/auth/logout', laptop);
    expect((await api('get', '/profile', phone)).status).toBe(401);
  });

  add('the user can log in again after logging out', async () => {
    const token = await login('tutor@api.test');
    await api('post', '/auth/logout', token);
    const fresh = await login('tutor@api.test');
    expect((await api('get', '/profile', fresh)).status).toBe(200);
  });

  add('changing the password invalidates old tokens and returns a new one', async () => {
    const other = await login('tutor@api.test');
    const current = await login('tutor@api.test');
    const res = await api('put', '/profile/password', current, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));

    expect((await api('get', '/profile', current)).status).toBe(401);
    expect((await api('get', '/profile', other)).status).toBe(401);
    expect((await api('get', '/profile', res.body.token)).status).toBe(200);
  });

  add('a wrong current password is not a logout (no AUTH_INVALID code)', async () => {
    const token = await login('tutor@api.test');
    const res = await api('put', '/profile/password', token, { currentPassword: 'wrong', newPassword: NEW_PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.code).toBeUndefined();
    expect((await api('get', '/profile', token)).status).toBe(200);
  });

  add('resetting the password by email link invalidates old tokens', async (ctx) => {
    const token = await login('tutor@api.test');
    const raw = crypto.randomBytes(16).toString('hex');
    await query(
      "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '30 minutes')",
      [ctx.u.tutor.id, hashResetToken(raw)]
    );
    expect((await api('post', '/auth/reset-password', null, { token: raw, newPassword: NEW_PASSWORD })).status).toBe(200);
    expect((await api('get', '/profile', token)).status).toBe(401);
  });

  add('a token issued before this feature (no version) still works until the first logout', async (ctx) => {
    // ctx.tokens are signed without a version, like tokens issued before the upgrade.
    expect((await api('get', '/profile', ctx.tokens.tutor)).status).toBe(200);
    await api('post', '/auth/logout', ctx.tokens.tutor);
    expect((await api('get', '/profile', ctx.tokens.tutor)).status).toBe(401);
  });
});
