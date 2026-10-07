// Sends reminder / schedule-change messages: one email plus one in-app
// notification with the same content. Used by jobs.routes.js,
// availability.routes.js, sessions.routes.js and admin.routes.js.
const pool = require('../db');
const { escapeHtml, sendEmail } = require('./email');
const { frontendUrl } = require('./urls');
const { createNotification } = require('./notify');
const { formatBrisbaneDateTime, formatDateKey, formatClockTime } = require('./brisbaneTime');
const {
  buildAvailabilityReminderSubject,
  buildSessionReminderSubject,
  sessionDisplayName,
  describeSessionChange,
  shouldEmailScheduleChange,
  formatSessionSlot
} = require('./reminderRules');

const unitLabel = (unit) => `${unit.unit_code}${unit.unit_name ? ` - ${unit.unit_name}` : ''}`;

const detailRows = (rows) => rows
  .map(([label, value]) => `<tr><td style="padding: 6px 12px 6px 0; font-weight: bold;">${escapeHtml(label)}</td><td style="padding: 6px 0;">${escapeHtml(value)}</td></tr>`)
  .join('');

const emailHtml = ({ subject, greetingName, intro, rows, outro, link, linkText }) => `
  <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #1f2937;">
    <h2>${escapeHtml(subject)}</h2>
    <p>Hi ${escapeHtml(greetingName || 'there')},</p>
    <p>${escapeHtml(intro)}</p>
    ${rows && rows.length ? `<table style="border-collapse: collapse; margin: 16px 0;">${detailRows(rows)}</table>` : ''}
    ${outro ? `<p>${escapeHtml(outro)}</p>` : ''}
    ${link ? `<p><a href="${escapeHtml(link)}" style="display: inline-block; background: #5b4fc0; color: #ffffff; padding: 12px 18px; border-radius: 6px; text-decoration: none;">${escapeHtml(linkText)}</a></p>` : ''}
  </div>
`;

const emailText = ({ greetingName, intro, rows, outro, link, linkText }) => [
  `Hi ${greetingName || 'there'},`,
  '',
  intro,
  '',
  ...(rows || []).map(([label, value]) => `${label}: ${value}`),
  ...(outro ? ['', outro] : []),
  ...(link ? ['', `${linkText}: ${link}`] : [])
].join('\n');

// ---------------------------------------------------------------------------
// Availability deadline reminder
// ---------------------------------------------------------------------------

// tutor: { id, email, name }, unit: { id, unit_code, unit_name, availability_deadline }
// Throws if the email cannot be sent (the caller counts it as a failure).
const sendAvailabilityReminder = async ({ tutor, unit }) => {
  const subject = buildAvailabilityReminderSubject(unit.unit_code);
  const deadlineText = unit.availability_deadline
    ? formatBrisbaneDateTime(unit.availability_deadline)
    : 'No deadline set';
  const actionPath = `/availability?unitId=${unit.id}`;
  const link = `${frontendUrl()}${actionPath}`;
  const intro = `You have not submitted your availability for ${unitLabel(unit)} yet. Please submit it before the deadline so your coordinator can build the schedule.`;
  const rows = [
    ['Unit', unitLabel(unit)],
    ['Deadline', deadlineText]
  ];

  await sendEmail({
    to: [{ email: tutor.email, name: tutor.name || undefined }],
    subject,
    htmlContent: emailHtml({ subject, greetingName: tutor.name, intro, rows, link, linkText: 'Submit your availability' }),
    textContent: emailText({ greetingName: tutor.name, intro, rows, link, linkText: 'Submit your availability' })
  });

  await createNotification({
    userId: tutor.id,
    type: 'availability_reminder',
    title: subject,
    content: unit.availability_deadline
      ? `Please submit your availability for ${unitLabel(unit)} before ${deadlineText}.`
      : `Please submit your availability for ${unitLabel(unit)} as soon as possible.`,
    unitId: unit.id,
    actionUrl: actionPath
  });
};

// ---------------------------------------------------------------------------
// 24-hour session reminder
// ---------------------------------------------------------------------------

// tutor: { id, email, name }, session: sessions row + unit fields,
// occurrence: { dateKey }. via: 'assignment' | 'cover'.
const sendSessionReminder = async ({ tutor, session, occurrence, via }) => {
  const subject = buildSessionReminderSubject({
    unitCode: session.unit_code,
    sessionType: session.session_type,
    startTime: session.start_time
  });
  const actionPath = `/tutor-schedule/${session.unit_id}`;
  const link = `${frontendUrl()}${actionPath}`;
  const sessionName = [session.session_type, session.session_code].filter(Boolean).join(' ') || 'Session';
  const dateText = formatDateKey(occurrence.dateKey);
  const timeText = `${formatClockTime(session.start_time)} - ${formatClockTime(session.end_time)}`;
  const location = session.location || 'TBA';
  const intro = via === 'cover'
    ? `This is a reminder that you are covering this class tomorrow.`
    : `This is a reminder that you are teaching this class tomorrow.`;
  const rows = [
    ['Unit', unitLabel(session)],
    ['Session', sessionName],
    ['Date', dateText],
    ['Time', timeText],
    ['Location', location]
  ];

  await sendEmail({
    to: [{ email: tutor.email, name: tutor.name || undefined }],
    subject,
    htmlContent: emailHtml({ subject, greetingName: tutor.name, intro, rows, link, linkText: 'View your schedule' }),
    textContent: emailText({ greetingName: tutor.name, intro, rows, link, linkText: 'View your schedule' })
  });

  // session_ prefix: createNotification honours the user's session setting.
  await createNotification({
    userId: tutor.id,
    type: 'session_reminder',
    title: subject,
    content: `${session.unit_code} ${sessionName}, ${dateText}, ${timeText} at ${location}.`,
    unitId: session.unit_id,
    sessionId: session.id,
    actionUrl: actionPath
  });
};

// ---------------------------------------------------------------------------
// Schedule-change notices
// ---------------------------------------------------------------------------

// Notifies each tutor (rows with id, email, name, notify_session_updates)
// about a change to a session. The in-app notice always goes out (subject to
// the user's session setting); an email is added when `email` is true.
// Never throws: a failed notice must not undo the change that caused it.
const notifyScheduleChange = async ({ tutors, unit, session, type, title, content, email = false }) => {
  const actionPath = `/tutor-schedule/${unit.id}`;
  const results = { notified: 0, emailed: 0, failed: 0 };

  for (const tutor of tutors || []) {
    if (!tutor || !tutor.id) continue;
    // Same rule as reminders: a tutor who turned session notices off gets
    // neither the in-app notice nor the email.
    if (tutor.notify_session_updates === false) continue;

    await createNotification({
      userId: tutor.id,
      type,
      title,
      content,
      unitId: unit.id,
      sessionId: session && type !== 'session_deleted' ? session.id : null,
      actionUrl: actionPath
    });
    results.notified += 1;

    if (email && tutor.email) {
      try {
        await sendEmail({
          to: [{ email: tutor.email, name: tutor.name || undefined }],
          subject: title,
          htmlContent: emailHtml({
            subject: title,
            greetingName: tutor.name,
            intro: content,
            rows: [['Unit', unitLabel(unit)], ['Session', session ? sessionDisplayName(session) : '']],
            outro: 'This class is within the next 48 hours, so we are letting you know by email as well.',
            link: `${frontendUrl()}${actionPath}`,
            linkText: 'View your schedule'
          }),
          textContent: emailText({
            greetingName: tutor.name,
            intro: content,
            rows: [['Unit', unitLabel(unit)], ['Session', session ? sessionDisplayName(session) : '']],
            outro: 'This class is within the next 48 hours, so we are letting you know by email as well.',
            link: `${frontendUrl()}${actionPath}`,
            linkText: 'View your schedule'
          })
        });
        results.emailed += 1;
      } catch (error) {
        results.failed += 1;
        console.error('Error sending schedule change email:', error);
      }
    }
  }

  return results;
};

// Tutors who currently hold a session (Pending or Confirmed, not Declined).
const loadActiveSessionTutors = async (sessionId, db = pool) => {
  const result = await db.query(
    `
    SELECT u.id, u.email, u.notify_session_updates,
           TRIM(CONCAT(u.name, ' ', COALESCE(u.last_name, ''))) AS name
    FROM session_tutors st
    JOIN users u ON u.id = st.tutor_id
    WHERE st.session_id = $1 AND st.tutor_confirmed IS DISTINCT FROM FALSE
    `,
    [sessionId]
  );
  return result.rows;
};

const loadUnit = async (unitId, db = pool) => {
  const result = await db.query('SELECT id, unit_code, unit_name FROM units WHERE id = $1', [unitId]);
  return result.rows[0] || null;
};

// After a session was edited: tell its tutors what changed (day, time,
// location). Nothing is sent when only hidden fields changed.
// before/after are sessions rows. Never throws.
const noticeSessionUpdated = async ({ before, after, now = new Date() }) => {
  try {
    const changes = describeSessionChange(before, after);
    if (changes.length === 0) return null;
    const [unit, tutors] = await Promise.all([loadUnit(after.unit_id), loadActiveSessionTutors(after.id)]);
    if (!unit || tutors.length === 0) return null;
    return notifyScheduleChange({
      tutors,
      unit,
      session: after,
      type: 'session_updated',
      title: `${unit.unit_code} ${sessionDisplayName(after)} has changed`,
      content: `${changes.join('. ')}.`,
      email: shouldEmailScheduleChange([before, after], now)
    });
  } catch (error) {
    console.error('Error sending session change notice:', error);
    return null;
  }
};

// After a tutor was taken off a session. tutor: { id, email, name,
// notify_session_updates }. Never throws.
const noticeTutorRemoved = async ({ session, tutor, now = new Date() }) => {
  try {
    const unit = await loadUnit(session.unit_id);
    if (!unit || !tutor) return null;
    const name = sessionDisplayName(session);
    return notifyScheduleChange({
      tutors: [tutor],
      unit,
      session,
      type: 'session_removed',
      title: `Removed from ${unit.unit_code} ${name}`,
      content: `You have been removed from ${unit.unit_code} ${name} (${formatSessionSlot(session)}).`,
      email: shouldEmailScheduleChange([session], now)
    });
  } catch (error) {
    console.error('Error sending removal notice:', error);
    return null;
  }
};

// Loads a user in the shape notifyScheduleChange expects.
const loadNoticeUser = async (userId, db = pool) => {
  const result = await db.query(
    `
    SELECT id, email, notify_session_updates,
           TRIM(CONCAT(name, ' ', COALESCE(last_name, ''))) AS name
    FROM users WHERE id = $1
    `,
    [userId]
  );
  return result.rows[0] || null;
};

module.exports = {
  sendAvailabilityReminder,
  sendSessionReminder,
  notifyScheduleChange,
  loadActiveSessionTutors,
  loadNoticeUser,
  noticeSessionUpdated,
  noticeTutorRemoved
};
