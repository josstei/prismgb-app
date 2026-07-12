import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { loadBaselinePolicy } from './scripts/lib/performance-evidence.js';

const performanceOutput = process.env.PRISMGB_PERFORMANCE_OUTPUT
  ? path.resolve(process.env.PRISMGB_PERFORMANCE_OUTPUT, 'playwright')
  : './artifacts/codebase-baseline/performance/playwright';
const performanceRole = process.env.PRISMGB_PERFORMANCE_ROLE ?? 'ci-integrity';
if (!['ci-integrity', 'reference-comparison'].includes(performanceRole)) {
  throw new Error('performance Playwright configuration requires a supported performance role');
}
const performanceLimits = loadBaselinePolicy().policy.performanceLimits;
const experimentDeadlineSeconds = performanceRole === 'ci-integrity'
  ? performanceLimits.ciExperimentSeconds
  : performanceLimits.referenceExperimentSeconds;
if (process.env.PRISMGB_PERFORMANCE_EXPERIMENT_DEADLINE_SECONDS !== undefined
  && process.env.PRISMGB_PERFORMANCE_EXPERIMENT_DEADLINE_SECONDS !== String(experimentDeadlineSeconds)) {
  throw new Error('performance Playwright configuration deadline does not match the selected role policy');
}

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'gpu-performance-baseline.spec.js',
  timeout: experimentDeadlineSeconds * 1000,
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
