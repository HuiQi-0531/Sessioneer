const { replaceEmailsWithNames, formatNotification } = require('../../utils/notificationRules');

const users = [
  { name: 'Alex', last_name: 'Lee', email: 'alex@x.com' },
  { name: '', last_name: '', email: 'noname@x.com' }
];

describe('replaceEmailsWithNames', () => {
  test('LG-391: an email in the text is replaced by the person\'s name', () => {
    expect(replaceEmailsWithNames('alex@x.com claimed a session', users)).toBe('Alex Lee claimed a session');
  });
  test('LG-392: every appearance is replaced', () => {
    expect(replaceEmailsWithNames('alex@x.com and alex@x.com', users)).toBe('Alex Lee and Alex Lee');
  });
  test('LG-393: a user with no name keeps their email', () => {
    expect(replaceEmailsWithNames('noname@x.com asked', users)).toBe('noname@x.com asked');
  });
  test('LG-394: empty content is returned as it is', () => {
    expect(replaceEmailsWithNames(null, users)).toBeNull();
  });
});

describe('formatNotification', () => {
  test('LG-395: maps the row and replaces emails in the content', () => {
    expect(formatNotification({ id: 'n1', notification_type: 'session_assigned', title: 'T', content: 'By alex@x.com', is_read: false }, users))
      .toMatchObject({ id: 'n1', type: 'session_assigned', content: 'By Alex Lee', isRead: false });
  });
});
