/**
 * Vitest Configuration
 * Testing configuration for PrismGB
 */

import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';
import { platformAliasMap } from './scripts/lib/workspace-aliases.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sharedAlias = {
  // Vite serves these public-directory URLs; tests resolve the same real assets.
  '/Logo.png?url': `${path.resolve(__dirname, 'assets/Logo.png')}?url`,
  '/overlay-icons/default.svg?url': `${path.resolve(__dirname, 'assets/overlay-icons/default.svg')}?url`,
  '@main': path.resolve(__dirname, 'src/main'),
  '@renderer': path.resolve(__dirname, 'src/renderer'),
  ...platformAliasMap(__dirname)
};

const baseCoverageConfig = {
  provider: 'v8',
  reporter: ['text', 'json', 'json-summary', 'html'],
  reportsDirectory: './artifacts/coverage',
  include: ['src/**/*.{js,ts}'],
  exclude: [
    '**/index.{js,ts}',
    'src/**/*.d.ts'
  ]
};

const commonSetup = path.resolve(__dirname, 'tests/setup.js');

function project(name, environment, include, setupFiles = [commonSetup]) {
  return { test: {
    name, environment, include, setupFiles,
    alias: sharedAlias,
    globals: true,
    clearMocks: true,
    restoreMocks: true
  } };
}

export default defineConfig({
  root: __dirname,
  resolve: {
    alias: sharedAlias
  },
  test: {
    alias: sharedAlias,
    coverage: baseCoverageConfig,
    globals: true,
    testTimeout: 10000,
    pool: 'forks',
    maxWorkers: 2,
    fileParallelism: true,
    isolate: true,
    // E2E tests still run separately through Playwright.
    exclude: ['tests/e2e/**'],
    projects: [
      project('scripts-node', 'node', [
        'tests/unit/scripts/**/*.{test,spec}.{js,ts}',
        'tests/unit/support/**/*.{test,spec}.{js,ts}'
      ]),
      project('renderer-happy-dom', 'happy-dom', [
        'tests/integration/**/*.{test,spec}.{js,ts}',
        'tests/unit/renderer/**/*.{test,spec}.{js,ts}'
      ], [
        commonSetup,
        path.resolve(__dirname, 'tests/support/mocks/renderer-browser-mocks.setup.js'),
        path.resolve(__dirname, 'tests/testing-library.setup.js')
      ]),
      project('main-node', 'node', ['tests/unit/main/**/*.{test,spec}.{js,ts}']),
      project('platform-node', 'node', [
        'tests/unit/platform/{config,core,devices,events,ipc,notes,transcode,updates}/**/*.{test,spec}.{js,ts}'
      ]),
      project('platform-dom', 'happy-dom', ['tests/unit/platform/{gpu,ui-base}/**/*.{test,spec}.{js,ts}'], [])
    ]
  }
});
