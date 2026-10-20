import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.js',
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // Electron startup is occasionally flaky on CI runners.
  retries: process.env.CI ? 2 : 0,
  // The app is single-instance, so specs cannot run in parallel workers.
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'on-failure' }]],
  outputDir: './tests/e2e/test-results',
  preserveOutput: 'failures-only',
  globalSetup: './tests/e2e/global-setup.js',
  use: {
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    actionTimeout: 10000,
    navigationTimeout: 15000,
  },
});
