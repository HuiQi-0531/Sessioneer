// Jest config for the RBAC (role permission) test suite only.
// Run with: npm run test:rbac
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/rbac/**/*.test.js'],
  setupFiles: ['<rootDir>/tests/rbac/env.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/rbac/mocks.js'],
  testTimeout: 30000,
  verbose: true
};
