/**
 * Playwright Configuration for E2E Testing
 *
 * Configures Playwright for testing the Electron app.
 * Uses built app for realistic E2E scenarios.
 */

import { defineConfig } from '@playwright/test';

export default defineConfig({
  // Test directory
  testDir: './tests/e2e',

  // Test file pattern
  testMatch: '**/*.spec.js',

  // Timeout for each test
  timeout: 30000,

  // Timeout for expect assertions
  expect: {
    timeout: 5000,
  },

  // Fail fast - stop on first failure during local development
  fullyParallel: false,

  // Forbid test.only in CI
  forbidOnly: !!process.env.CI,

  // Retry failed tests (helpful for flaky Electron startup)
  retries: process.env.CI ? 2 : 0,

  // Single worker for Electron (can't run multiple app instances)
  workers: 1,

  // Reporter configuration
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'on-failure' }]],

  // Output directory for test artifacts
  outputDir: './tests/e2e/test-results',

  // Preserve test output for debugging
  preserveOutput: 'failures-only',

  // Global setup/teardown (if needed)
  // globalSetup: './tests/e2e/global-setup.js',
  // globalTeardown: './tests/e2e/global-teardown.js',

  // Use custom Electron test fixtures (no browser projects needed)
  use: {
    // Capture screenshot on failure
    screenshot: 'only-on-failure',

    // Record video on failure
    video: 'retain-on-failure',

    // Collect trace on failure for debugging
    trace: 'retain-on-failure',

    // Action timeout
    actionTimeout: 10000,

    // Navigation timeout
    navigationTimeout: 15000,
  },

  // No browser projects - Electron tests use custom fixtures
  projects: [
    {
      name: 'electron',
      testMatch: '**/*.spec.js',
    },
  ],
});
