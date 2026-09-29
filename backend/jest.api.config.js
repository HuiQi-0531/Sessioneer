module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/API/**/*.test.js'],
  globalSetup: '<rootDir>/tests/api/globalSetup.js',
  setupFiles: ['<rootDir>/tests/rbac/env.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/rbac/mocks.js'],
  testTimeout: 30000,
  verbose: true
};