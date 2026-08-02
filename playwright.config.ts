import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  globalTeardown: './tools/playwright-global-teardown.ts',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  // The wizard acceptance installs and verifies many real add-on archives.
  // Serial browser workers avoid filesystem/CPU contention with overlay tests
  // and make the same release gate deterministic on creator Windows systems.
  workers: 1,
  retries: process.env['CI'] ? 1 : 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:8799',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node tools/run-browser-test-server.mjs',
    url: 'http://127.0.0.1:8799/health',
    timeout: 30_000,
    reuseExistingServer: !process.env['CI'],
    gracefulShutdown: {
      signal: 'SIGTERM',
      timeout: 10_000,
    },
  },
});
