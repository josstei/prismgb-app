import { defineConfig } from '@playwright/test';
import path from 'node:path';

const performanceOutput = process.env.PRISMGB_PERFORMANCE_OUTPUT
  ? path.resolve(process.env.PRISMGB_PERFORMANCE_OUTPUT, 'playwright')
  : './artifacts/codebase-baseline/performance/playwright';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'gpu-performance-baseline.spec.js',
  timeout: 10_800_000,
  expect: {
    timeout: 15000
  },
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  outputDir: performanceOutput,
  preserveOutput: 'failures-only',
  globalSetup: './tests/e2e/global-setup.js',
  use: {
    screenshot: 'off',
    trace: 'off',
    video: 'off'
  },
  projects: [
    {
      name: 'performance',
      testMatch: 'gpu-performance-baseline.spec.js'
    }
  ]
});
