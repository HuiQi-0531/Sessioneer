const { normaliseRegisterRole, resolveRegisterName } = require('../../utils/authRules');

describe('normaliseRegisterRole', () => {
  test('LG-304: "Coordinator" registers a coordinator', () => { expect(normaliseRegisterRole('Coordinator')).toBe('coordinator'); });
  test('LG-305: anything else registers a tutor', () => {
    expect(normaliseRegisterRole('Tutor')).toBe('tutor');
    expect(normaliseRegisterRole(undefined)).toBe('tutor');
  });
  test('LG-306: lowercase "coordinator" also registers a coordinator (LOGIC-B12)', () => {
    expect(normaliseRegisterRole('coordinator')).toBe('coordinator');
  });
});

describe('resolveRegisterName', () => {
  test('LG-307: first and last name are used and trimmed', () => {
    expect(resolveRegisterName(' Alex ', ' Lee ', undefined)).toEqual({ firstName: 'Alex', lastName: 'Lee' });
  });
  test('LG-308: only a full name is split into first and last', () => {
    expect(resolveRegisterName(undefined, undefined, 'Alex Morgan Lee')).toEqual({ firstName: 'Alex', lastName: 'Morgan Lee' });
  });
  test('LG-309: nothing given gives empty names', () => {
    expect(resolveRegisterName(undefined, undefined, undefined)).toEqual({ firstName: '', lastName: '' });
  });
});
