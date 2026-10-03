// Frontend link base. A trailing "/" is removed so links never end up with "//".
const frontendUrl = () => (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
// The reminder job uses the same link base as every other route.
const jobsFrontendUrl = frontendUrl;

module.exports = { frontendUrl, jobsFrontendUrl };