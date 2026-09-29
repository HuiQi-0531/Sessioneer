// Frontend link base, moved here unchanged.
// admin, cover and requests routes all used this version:
const frontendUrl = () => (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
// jobs.routes.js used this version (does not remove a trailing "/"):
const jobsFrontendUrl = () => process.env.FRONTEND_URL || 'http://localhost:3000';

module.exports = { frontendUrl, jobsFrontendUrl };
