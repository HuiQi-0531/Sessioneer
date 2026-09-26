// Never send real emails during tests.
jest.mock('../../utils/email', () => ({
  escapeHtml: (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;'),
  sendEmail: jest.fn().mockResolvedValue({ messageId: 'test-email' })
}));
