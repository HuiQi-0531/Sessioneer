// Reminder / schedule-change delivery (utils/reminders.js) with the database,
// email and notifications replaced by fakes.
jest.mock('../../db', () => ({ query: jest.fn() }));
jest.mock('../../utils/email', () => ({
  escapeHtml: (value) => String(value ?? ''),
  sendEmail: jest.fn()
}));
jest.mock('../../utils/notify', () => ({ createNotification: jest.fn() }));

const pool = require('../../db');
const { sendEmail } = require('../../utils/email');
const { createNotification } = require('../../utils/notify');
const {
  sendAvailabilityReminder,
  sendSessionReminder,
  notifyScheduleChange,
  loadActiveSessionTutors,
  loadNoticeUser,
  noticeSessionUpdated,
  noticeTutorRemoved
} = require('../../utils/reminders');

const tutor = { id: 't1', email: 't1@x.test', name: 'Tia Tutor', notify_session_updates: true };
const unit = { id: 'u1', unit_code: 'CAB201', unit_name: 'Programming', availability_deadline: new Date('2026-10-09T07:00:00Z') };
const session = {
  id: 's1', unit_id: 'u1', unit_code: 'CAB201', unit_name: 'Programming', session_code: 'TUT02',
  session_type: 'Tutorial', day: 'MON', start_time: '10:00:00', end_time: '12:00:00', location: 'GP-Z-410'
};
const SUN_1015 = new Date('2026-10-11T00:15:00Z'); // Sun 10:15 Brisbane, Mon 10:00 is < 48h away
const MON_1030 = new Date('2026-10-12T00:30:00Z'); // just after Mon 10:00: next class is a week away

let errorSpy;
beforeEach(() => {
  pool.query.mockReset();
  sendEmail.mockReset().mockResolvedValue({});
  createNotification.mockReset().mockResolvedValue(undefined);
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => errorSpy.mockRestore());

describe('availability reminder delivery', () => {
  test('LG-656: email and in-app notice name the unit, deadline and link', async () => {
    await sendAvailabilityReminder({ tutor, unit });
    const mail = sendEmail.mock.calls[0][0];
    expect(mail.subject).toBe('Reminder: submit your availability for CAB201');
    expect(mail.to).toEqual([{ email: 't1@x.test', name: 'Tia Tutor' }]);
    expect(mail.textContent).toContain('CAB201 - Programming');
    expect(mail.textContent).toContain('Fri 9 Oct 2026, 5:00 pm (Brisbane time)');
    expect(mail.textContent).toContain('/availability?unitId=u1');
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: 't1', type: 'availability_reminder', actionUrl: '/availability?unitId=u1'
    }));
  });
  test('LG-657: with no deadline the text asks to submit as soon as possible', async () => {
    await sendAvailabilityReminder({ tutor: { ...tutor, name: '' }, unit: { ...unit, unit_name: null, availability_deadline: null } });
    expect(sendEmail.mock.calls[0][0].textContent).toContain('No deadline set');
    expect(sendEmail.mock.calls[0][0].textContent).toContain('Hi there');
    expect(createNotification.mock.calls[0][0].content).toMatch(/as soon as possible/);
  });
  test('LG-658: a failed email throws and no notice is created', async () => {
    sendEmail.mockRejectedValueOnce(new Error('Brevo down'));
    await expect(sendAvailabilityReminder({ tutor, unit })).rejects.toThrow('Brevo down');
    expect(createNotification).not.toHaveBeenCalled();
  });
});

describe('24-hour session reminder delivery', () => {
  test('LG-659: email lists unit, session, date, time and location', async () => {
    await sendSessionReminder({ tutor, session, occurrence: { dateKey: '2026-10-12' }, via: 'assignment' });
    const mail = sendEmail.mock.calls[0][0];
    expect(mail.subject).toBe('Reminder: CAB201 Tutorial tomorrow at 10:00 am');
    expect(mail.textContent).toContain('Mon 12 Oct 2026');
    expect(mail.textContent).toContain('10:00 am - 12:00 pm');
    expect(mail.textContent).toContain('GP-Z-410');
    expect(mail.textContent).toContain('teaching this class');
    expect(createNotification.mock.calls[0][0]).toMatchObject({ type: 'session_reminder', sessionId: 's1' });
  });
  test('LG-660: a cover tutor is told they are covering; missing location shows TBA', async () => {
    await sendSessionReminder({
      tutor, session: { ...session, location: null, session_type: null, session_code: null },
      occurrence: { dateKey: '2026-10-12' }, via: 'cover'
    });
    const mail = sendEmail.mock.calls[0][0];
    expect(mail.subject).toBe('Reminder: CAB201 session tomorrow at 10:00 am');
    expect(mail.textContent).toContain('covering this class');
    expect(mail.textContent).toContain('Location: TBA');
  });
});

describe('schedule-change notices', () => {
  test('LG-661: in-app notice for each tutor; email only when asked', async () => {
    const result = await notifyScheduleChange({
      tutors: [tutor, { ...tutor, id: 't2', email: null }],
      unit, session, type: 'session_updated', title: 'T', content: 'C', email: true
    });
    expect(createNotification).toHaveBeenCalledTimes(2);
    expect(sendEmail).toHaveBeenCalledTimes(1); // t2 has no email address
    expect(result).toEqual({ notified: 2, emailed: 1, failed: 0 });
  });
  test('LG-662: a tutor with session notices off gets nothing; empty rows are skipped', async () => {
    const result = await notifyScheduleChange({
      tutors: [{ ...tutor, notify_session_updates: false }, null], unit, session,
      type: 'session_updated', title: 'T', content: 'C', email: true
    });
    expect(result).toEqual({ notified: 0, emailed: 0, failed: 0 });
    expect(sendEmail).not.toHaveBeenCalled();
  });
  test('LG-663: a failed change email is counted, not thrown', async () => {
    sendEmail.mockRejectedValueOnce(new Error('Brevo down'));
    const result = await notifyScheduleChange({ tutors: [tutor], unit, session, type: 'session_removed', title: 'T', content: 'C', email: true });
    expect(result).toEqual({ notified: 1, emailed: 0, failed: 1 });
  });
  test('LG-664: no tutors list is fine', async () => {
    expect(await notifyScheduleChange({ unit, session: null, type: 'session_deleted', title: 'T', content: 'C' }))
      .toEqual({ notified: 0, emailed: 0, failed: 0 });
  });

  test('LG-665: edit that moves the class tells its tutors, with email inside 48h', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [unit] })     // loadUnit
      .mockResolvedValueOnce({ rows: [tutor] });   // loadActiveSessionTutors
    const result = await noticeSessionUpdated({ before: session, after: { ...session, location: 'GP-P-101' }, now: SUN_1015 });
    expect(createNotification.mock.calls[0][0].content).toBe('Location changed from GP-Z-410 to GP-P-101.');
    expect(createNotification.mock.calls[0][0].title).toBe('CAB201 TUT02 has changed');
    expect(result.emailed).toBe(1);
  });
  test('LG-666: an edit of hidden fields sends nothing and reads nothing', async () => {
    expect(await noticeSessionUpdated({ before: session, after: { ...session, capacity: 99 } })).toBeNull();
    expect(pool.query).not.toHaveBeenCalled();
  });
  test('LG-667: an edit with no tutors on the session sends nothing', async () => {
    pool.query.mockResolvedValueOnce({ rows: [unit] }).mockResolvedValueOnce({ rows: [] });
    expect(await noticeSessionUpdated({ before: session, after: { ...session, day: 'TUE' } })).toBeNull();
  });
  test('LG-668: a database error while sending a change notice is swallowed', async () => {
    pool.query.mockRejectedValue(new Error('db down'));
    expect(await noticeSessionUpdated({ before: session, after: { ...session, day: 'TUE' } })).toBeNull();
  });

  test('LG-669: removing a tutor tells them which session; no email a week out', async () => {
    pool.query.mockResolvedValueOnce({ rows: [unit] });
    const result = await noticeTutorRemoved({ session, tutor, now: MON_1030 });
    expect(createNotification.mock.calls[0][0]).toMatchObject({
      type: 'session_removed',
      title: 'Removed from CAB201 TUT02',
      content: 'You have been removed from CAB201 TUT02 (Mon 10:00–12:00).'
    });
    expect(result.emailed).toBe(0);
  });
  test('LG-670: removal notice with no tutor or unknown unit does nothing', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    expect(await noticeTutorRemoved({ session, tutor })).toBeNull();
    pool.query.mockResolvedValueOnce({ rows: [unit] });
    expect(await noticeTutorRemoved({ session, tutor: null })).toBeNull();
  });
  test('LG-671: a database error while sending a removal notice is swallowed', async () => {
    pool.query.mockRejectedValueOnce(new Error('db down'));
    expect(await noticeTutorRemoved({ session, tutor })).toBeNull();
  });

  test('LG-672: loading tutors and users reads only active assignments / the right user', async () => {
    pool.query.mockResolvedValueOnce({ rows: [tutor] });
    expect(await loadActiveSessionTutors('s1')).toEqual([tutor]);
    expect(pool.query.mock.calls[0][0]).toMatch(/IS DISTINCT FROM FALSE/);
    pool.query.mockResolvedValueOnce({ rows: [] });
    expect(await loadNoticeUser('nobody')).toBeNull();
  });
});