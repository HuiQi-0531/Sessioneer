// Reminder-job logic moved here unchanged from jobs.routes.js.

const verifyCronSecret = (req, res, next) => {
  const configuredSecret = process.env.CRON_SECRET;

  if (!configuredSecret) {
    return res.status(503).json({ error: 'CRON_SECRET is not configured' });
  }

  const authHeader = req.headers.authorization || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const headerSecret = req.headers['x-cron-secret'];

  if (bearerToken !== configuredSecret && headerSecret !== configuredSecret) {
    return res.status(401).json({ error: 'Unauthorised reminder job' });
  }

  next();
};

const formatTime = (value) => {
  if (!value) return '';
  return String(value).slice(0, 5);
};

const formatSessionLabel = (session) => {
  const parts = [
    session.day,
    `${formatTime(session.start_time)}-${formatTime(session.end_time)}`,
    session.session_type,
    session.location
  ].filter(Boolean);

  return parts.join(' | ');
};

module.exports = { verifyCronSecret, formatTime, formatSessionLabel };
