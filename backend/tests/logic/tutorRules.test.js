const { formatTutor, cleanTagList } = require('../../utils/tutorRules');

describe('formatTutor', () => {
  test('LG-412: maps a full tutor row', () => {
    expect(formatTutor({ id: 't1', name: 'Amy', membership_role: 'super_tutor', priority_tag: 'Preferred', tags: ['Friendly'], starred: true }))
      .toMatchObject({ id: 't1', role: 'super_tutor', isSuperTutor: true, priorityTag: 'Preferred', tags: ['Friendly'], starred: true });
  });
  test('LG-413: missing values get defaults', () => {
    expect(formatTutor({ id: 't1' })).toMatchObject({
      role: 'tutor', isSuperTutor: false, priorityTag: 'Standard', internalNotes: '', tags: [], earlyAccess: false, starred: false, flagged: false
    });
  });
});

describe('cleanTagList', () => {
  test('LG-414: tags are trimmed and blank tags removed', () => {
    expect(cleanTagList([' Friendly ', '', '  ', 'Experienced'])).toEqual(['Friendly', 'Experienced']);
  });
  test('LG-415: not a list gives []', () => {
    expect(cleanTagList('Friendly')).toEqual([]);
  });
  test('LG-416: a tag that is not text does not crash the save (LOGIC-B16)', () => {
    expect(() => cleanTagList(['Friendly', 5])).not.toThrow();
  });
});
