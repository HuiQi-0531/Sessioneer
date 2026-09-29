const {
  hashPassword,
  verifyPassword,
  hashResetToken,
  isValidPassword
} = require('../../utils/passwords');

describe('hashPassword', () => {
  test('LG-134: result is "salt:hash" in hex', () => {
    expect(hashPassword('secret1')).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
  });
  test('LG-135: same password gives a different hash each time (random salt)', () => {
    expect(hashPassword('secret1')).not.toBe(hashPassword('secret1'));
  });
});

describe('verifyPassword', () => {
  const stored = hashPassword('secret1');

  test('LG-136: correct password is accepted', () => {
    expect(verifyPassword('secret1', stored)).toBe(true);
  });
  test('LG-137: wrong password is rejected', () => {
    expect(verifyPassword('secret2', stored)).toBe(false);
  });
  test('LG-138: missing hash or hash without ":" is rejected', () => {
    expect(verifyPassword('secret1', null)).toBe(false);
    expect(verifyPassword('secret1', 'plaintextpassword')).toBe(false);
  });
  test('LG-139: damaged stored hash is rejected, not a crash (LOGIC-B8)', () => {
    // A hash with the wrong length makes timingSafeEqual throw, so login returns 500 instead of 401.
    expect(verifyPassword('secret1', 'abcd:1234')).toBe(false);
  });
});

describe('hashResetToken', () => {
  test('LG-140: same token always gives the same 64-character hash', () => {
    expect(hashResetToken('token-abc')).toBe(hashResetToken('token-abc'));
    expect(hashResetToken('token-abc')).toMatch(/^[0-9a-f]{64}$/);
  });
  test('LG-141: different tokens give different hashes', () => {
    expect(hashResetToken('token-abc')).not.toBe(hashResetToken('token-abd'));
  });
});

describe('isValidPassword (minimum 6 characters)', () => {
  test('LG-142: 5 characters is too short', () => {
    expect(isValidPassword('abcde')).toBe(false);
  });
  test('LG-143: exactly 6 characters is accepted', () => {
    expect(isValidPassword('abcdef')).toBe(true);
  });
  test('LG-144: empty password is too short', () => {
    expect(isValidPassword('')).toBe(false);
  });
});
