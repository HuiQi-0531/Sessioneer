require('../rbac/env');
const { resetTestDatabase } = require('../rbac/testDb');

module.exports = async () => {
  await resetTestDatabase();
};