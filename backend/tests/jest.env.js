const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env.test') });

process.env.JWT_SECRET = process.env.JWT_SECRET || 'sessioneer-test-secret';
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
process.env.EMAIL_FROM = process.env.EMAIL_FROM || 'Sessioneer Test <test@example.com>';
process.env.BREVO_API_KEY = process.env.BREVO_API_KEY || 'test-brevo-key';
process.env.CRON_SECRET = process.env.CRON_SECRET || 'test-cron-secret';
