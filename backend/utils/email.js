const getEmailSender = () => {
  if (!process.env.BREVO_API_KEY || !process.env.EMAIL_FROM) {
    throw new Error('Brevo email settings are not configured');
  }

  const senderEmailMatch = process.env.EMAIL_FROM.match(/<([^>]+)>/);
  const senderEmail = senderEmailMatch ? senderEmailMatch[1] : process.env.EMAIL_FROM;
  const senderName = process.env.EMAIL_FROM.replace(/<[^>]+>/, '').trim() || 'Sessioneer';

  return {
    name: senderName,
    email: senderEmail
  };
};

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const sendEmail = async ({ to, subject, htmlContent, textContent }) => {
  const sender = getEmailSender();

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      sender,
      to: Array.isArray(to) ? to : [{ email: to }],
      subject,
      htmlContent,
      textContent
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || data.error || 'Brevo failed to send email');
  }

  return data;
};

module.exports = { escapeHtml, sendEmail };
