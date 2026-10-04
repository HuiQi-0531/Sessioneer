// E2E acceptance tests. See README.md. Run from this folder:
//   npm install && npx playwright install chromium   (once)
//   npm test
// Playwright starts the backend (port 5001, test database) and the React
// dev server (port 3000) itself, then drives a real Chromium browser.
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1, // all stories share one seeded database
  timeout: 60000,
  expect: { timeout: 10000 },
  reporter: [['list'], ['json', { outputFile: 'results/e2e-results.json' }], ['html', { open: 'never', outputFolder: 'results/html' }]],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node start-backend.js',
      url: 'http://localhost:5001/health',
      // Each story resets the test database itself, so an already running
      // test backend can be reused while writing tests.
      reuseExistingServer: !process.env.CI,
      timeout: 120000
    },
    {
      command: 'npm start',
      cwd: '..',
      url: 'http://localhost:3000',
      env: { BROWSER: 'none', PORT: '3000' },
      reuseExistingServer: !process.env.CI,
      timeout: 180000
    }
  ]
});
