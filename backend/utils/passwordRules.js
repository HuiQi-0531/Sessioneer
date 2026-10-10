// Same rules as backend/utils/passwords.js passwordRuleError.
// Returns the first failing rule, or '' when the password is acceptable.
export const passwordRuleError = (password) => {
  if (typeof password !== 'string' || password.length < 8) {
    return 'Password must be at least 8 characters';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must include at least one uppercase letter';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must include at least one lowercase letter';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must include at least one number';
  }
  return '';
};

export const PASSWORD_HINT = 'At least 8 characters, with an uppercase letter, a lowercase letter, and a number.';