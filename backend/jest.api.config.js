module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/*api-integration.test.js'],
  setupFiles: ['<rootDir>/tests/jest.env.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.js'],
  testTimeout: 120000,
  collectCoverageFrom: [
    'routes/**/*.js',
    'middleware/**/*.js',
    'utils/**/*.js'
  ],
  coverageDirectory: '<rootDir>/coverage/api'
};
