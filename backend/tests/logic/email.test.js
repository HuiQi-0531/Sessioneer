const { escapeHtml } = require('../../utils/email');

describe('escapeHtml', () => {
  test('LG-93: escapes all five special HTML characters', () => {
    expect(escapeHtml(`<a href="x">Tom's & Co</a>`))
      .toBe('&lt;a href=&quot;x&quot;&gt;Tom&#039;s &amp; Co&lt;/a&gt;');
  });
  test('LG-94: a script tag in a name is shown as text, not run', () => {
    expect(escapeHtml('<script>alert(1)</script>'))
      .toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
  test('LG-95: normal text is unchanged', () => {
    expect(escapeHtml('Tutorial MON 10:00-12:00')).toBe('Tutorial MON 10:00-12:00');
  });
  test('LG-96: null and undefined give empty string', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
  test('LG-97: numbers (including 0) are turned into text', () => {
    expect(escapeHtml(0)).toBe('0');
    expect(escapeHtml(42)).toBe('42');
  });
});
