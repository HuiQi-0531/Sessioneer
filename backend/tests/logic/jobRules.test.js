const { verifyCronSecret, formatTime, formatSessionLabel } = require('../../utils/jobRules');
const { frontendUrl, jobsFrontendUrl } = require('../../utils/urls');

const ORIGINAL_ENV = { ...process.env };
afterEach(() => { process.env = { ...ORIGINAL_ENV }; });

const fakeRes = () => { const res = {}; res.status = jest.fn(() => res); res.json = jest.fn(() => res); return res; };

describe('verifyCronSecret (reminder job protection)', () => {
  test('LG-360: no secret configured → 503', () => {
    delete process.env.CRON_SECRET;
    const res = fakeRes(); const next = jest.fn();
    verifyCronSecret({ headers: {} }, res, next);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();
  });
  test('LG-361: correct Bearer token is let through', () => {
    process.env.CRON_SECRET = 's3cret';
    const next = jest.fn();
    verifyCronSecret({ headers: { authorization: 'Bearer s3cret' } }, fakeRes(), next);
    expect(next).toHaveBeenCalled();
  });
  test('LG-362: correct x-cron-secret header is let through', () => {
    process.env.CRON_SECRET = 's3cret';
    const next = jest.fn();
    verifyCronSecret({ headers: { 'x-cron-secret': 's3cret' } }, fakeRes(), next);
    expect(next).toHaveBeenCalled();
  });
  test('LG-363: wrong secret → 401', () => {
    process.env.CRON_SECRET = 's3cret';
    const res = fakeRes(); const next = jest.fn();
    verifyCronSecret({ headers: { authorization: 'Bearer wrong' } }, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('formatTime', () => {
  test('LG-364: seconds are cut', () => { expect(formatTime('10:00:00')).toBe('10:00'); });
  test('LG-365: missing time gives ""', () => { expect(formatTime(null)).toBe(''); });
  test('LG-366: short value stays as it is', () => { expect(formatTime('9:00')).toBe('9:00'); });
});

describe('formatSessionLabel', () => {
  test('LG-367: all parts joined with " | "', () => {
    expect(formatSessionLabel({ day: 'MON', start_time: '10:00:00', end_time: '12:00:00', session_type: 'Tutorial', location: 'GP-P512' }))
      .toBe('MON | 10:00-12:00 | Tutorial | GP-P512');
  });
  test('LG-368: missing parts are left out', () => {
    expect(formatSessionLabel({ day: 'MON', start_time: '10:00:00', end_time: '12:00:00' })).toBe('MON | 10:00-12:00');
  });
  test('LG-369: time only', () => {
    expect(formatSessionLabel({ start_time: '10:00:00', end_time: '12:00:00' })).toBe('10:00-12:00');
  });
});

describe('frontendUrl', () => {
  test('LG-370: default is localhost:3000', () => {
    delete process.env.FRONTEND_URL;
    expect(frontendUrl()).toBe('http://localhost:3000');
  });
  test('LG-371: a trailing "/" is removed', () => {
    process.env.FRONTEND_URL = 'https://sessioneer.vercel.app/';
    expect(frontendUrl()).toBe('https://sessioneer.vercel.app');
  });
  test('LG-372: the reminder-job version also removes a trailing "/" (LOGIC-B14)', () => {
    process.env.FRONTEND_URL = 'https://sessioneer.vercel.app/';
    expect(jobsFrontendUrl()).toBe('https://sessioneer.vercel.app');
  });
});
