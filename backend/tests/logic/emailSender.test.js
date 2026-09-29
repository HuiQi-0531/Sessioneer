const { getEmailSender, sendEmail } = require('../../utils/email');

const ORIGINAL_ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  delete global.fetch;
});

describe('getEmailSender', () => {
  test('LG-122: "Name <email>" is split into sender name and email', () => {
    process.env.BREVO_API_KEY = 'key';
    process.env.EMAIL_FROM = 'Sessioneer Team <noreply@example.com>';
    expect(getEmailSender()).toEqual({ name: 'Sessioneer Team', email: 'noreply@example.com' });
  });
  test('LG-123: "<email>" with no name uses "Sessioneer" as the name', () => {
    process.env.BREVO_API_KEY = 'key';
    process.env.EMAIL_FROM = '<noreply@example.com>';
    expect(getEmailSender()).toEqual({ name: 'Sessioneer', email: 'noreply@example.com' });
  });
  test('LG-124: missing email settings throw an error', () => {
    delete process.env.BREVO_API_KEY;
    process.env.EMAIL_FROM = 'noreply@example.com';
    expect(() => getEmailSender()).toThrow('Brevo email settings are not configured');
  });
});

describe('sendEmail (email service replaced by a fake)', () => {
  beforeEach(() => {
    process.env.BREVO_API_KEY = 'key';
    process.env.EMAIL_FROM = 'Sessioneer <noreply@example.com>';
  });

  test('LG-125: a single address is sent as [{ email }]', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ messageId: '1' }) });
    await sendEmail({ to: 'tutor@example.com', subject: 'Hi', htmlContent: '<p>Hi</p>' });
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.to).toEqual([{ email: 'tutor@example.com' }]);
  });
  test('LG-126: a list of recipients is sent as it is', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    const to = [{ email: 'a@example.com', name: 'A' }, { email: 'b@example.com' }];
    await sendEmail({ to, subject: 'Hi' });
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).to).toEqual(to);
  });
  test('LG-127: a failed send throws the message from the email service', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({ message: 'Invalid sender' }) });
    await expect(sendEmail({ to: 'a@example.com', subject: 'Hi' })).rejects.toThrow('Invalid sender');
  });
});
