const { sanitiseFields } = require('../../utils/applicationFields');

describe('sanitiseFields', () => {
  test('LG-84: input that is not a list returns null', () => {
    expect(sanitiseFields('abc')).toBeNull();
    expect(sanitiseFields(null)).toBeNull();
    expect(sanitiseFields({ key: 'a' })).toBeNull();
  });
  test('LG-85: valid field is kept and required becomes true/false', () => {
    expect(sanitiseFields([{ key: 'uni', label: 'University', type: 'text', required: 'yes' }]))
      .toEqual([{ key: 'uni', label: 'University', type: 'text', required: true }]);
  });
  test('LG-86: unknown field type becomes text', () => {
    expect(sanitiseFields([{ key: 'a', label: 'A', type: 'password' }])[0].type).toBe('text');
  });
  test('LG-87: field with missing key or label is removed', () => {
    expect(sanitiseFields([
      { key: '', label: 'No key' },
      { key: 'nolabel', label: '   ' }
    ])).toEqual([]);
  });
  test('LG-88: second field with the same key is removed', () => {
    const result = sanitiseFields([
      { key: 'a', label: 'First' },
      { key: 'a', label: 'Second' }
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('First');
  });
  test('LG-89: null and non-object items are skipped', () => {
    expect(sanitiseFields([null, 'text', 5, { key: 'a', label: 'A' }])).toHaveLength(1);
  });
  test('LG-90: select options are trimmed and blank options removed', () => {
    const [field] = sanitiseFields([
      { key: 'c', label: 'Contract', type: 'select', options: [' Casual ', '', '  ', 'Sessional'] }
    ]);
    expect(field.options).toEqual(['Casual', 'Sessional']);
  });
  test('LG-91: checkbox without options gets an empty list', () => {
    expect(sanitiseFields([{ key: 'd', label: 'Days', type: 'checkbox' }])[0].options).toEqual([]);
  });
  test('LG-92: text field does not get an options list', () => {
    const [field] = sanitiseFields([{ key: 'a', label: 'A', type: 'text', options: ['x'] }]);
    expect(field).not.toHaveProperty('options');
  });
});
