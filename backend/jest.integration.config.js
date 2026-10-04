module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/integration/**/*.test.js'],
  globalSetup: '<rootDir>/tests/API/globalSetup.js',
  setupFiles: ['<rootDir>/tests/rbac/env.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/rbac/mocks.js'],
  testTimeout: 30000,
  verbose: true
};