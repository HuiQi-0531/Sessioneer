const {
  joinUserName,
  splitDisplayName,
  formatUserNameFields
} = require('../../utils/userNames');

describe('joinUserName', () => {
  test('LG-65: joins first and last name with one space', () => {
    expect(joinUserName('Alex', 'Lee')).toBe('Alex Lee');
  });
  test('LG-66: only first name gives first name with no trailing space', () => {
    expect(joinUserName('Alex', '')).toBe('Alex');
  });
  test('LG-67: only last name gives last name with no leading space', () => {
    expect(joinUserName(null, 'Lee')).toBe('Lee');
  });
  test('LG-68: trims spaces around each part', () => {
    expect(joinUserName('  Alex ', ' Lee  ')).toBe('Alex Lee');
  });
  test('LG-69: both missing gives empty string', () => {
    expect(joinUserName(undefined, null)).toBe('');
  });
});

describe('splitDisplayName', () => {
  test('LG-70: two words split into first and last name', () => {
    expect(splitDisplayName('Alex Lee')).toEqual({ firstName: 'Alex', lastName: 'Lee' });
  });
  test('LG-71: three words keep everything after the first word as last name', () => {
    expect(splitDisplayName('Alex Morgan Lee')).toEqual({ firstName: 'Alex', lastName: 'Morgan Lee' });
  });
  test('LG-72: one word gives empty last name', () => {
    expect(splitDisplayName('Alex')).toEqual({ firstName: 'Alex', lastName: '' });
  });
  test('LG-73: extra spaces between and around words are ignored', () => {
    expect(splitDisplayName('  Alex    Lee  ')).toEqual({ firstName: 'Alex', lastName: 'Lee' });
  });
  test('LG-74: empty or missing name gives two empty strings', () => {
    expect(splitDisplayName('')).toEqual({ firstName: '', lastName: '' });
    expect(splitDisplayName(null)).toEqual({ firstName: '', lastName: '' });
  });
});

describe('formatUserNameFields', () => {
  test('LG-75: database row (name + last_name) builds all fields', () => {
    expect(formatUserNameFields({ name: 'Alex', last_name: 'Lee' })).toEqual({
      name: 'Alex', firstName: 'Alex', lastName: 'Lee', displayName: 'Alex Lee'
    });
  });
  test('LG-76: uses lastName (camelCase) when last_name is missing', () => {
    expect(formatUserNameFields({ name: 'Alex', lastName: 'Lee' }).lastName).toBe('Lee');
  });
  test('LG-77: missing last name gives display name of first name only', () => {
    expect(formatUserNameFields({ name: 'Alex' }).displayName).toBe('Alex');
  });
  test('LG-78: null user does not crash and gives empty fields', () => {
    expect(formatUserNameFields(null)).toEqual({
      name: '', firstName: '', lastName: '', displayName: ''
    });
  });
});
