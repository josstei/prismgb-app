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
  '@main': path.resolve(__dirname, 'src/main'),
  '@renderer': path.resolve(__dirname, 'src/renderer'),
  ...platformAliasMap(__dirname)
};

const baseCoverageConfig = {
  provider: 'v8',
  reporter: ['text', 'json', 'json-summary', 'html'],
  reportsDirectory: './artifacts/coverage',
  all: true,
  include: ['src/**/*.{js,ts}'],
  exclude: [
    'node_modules/**',
    'dist/**',
    '**/*.test.{js,ts}',
    '**/*.spec.{js,ts}',
    '**/index.{js,ts}',
    // Auto-update feature requires Electron autoUpdater API
    'src/renderer/infrastructure/services/updates/**',
    // UI templates use Vite ?raw imports for SVGs not available in vitest
    'src/renderer/presentation/shell/*.{js,ts}',
    'src/renderer/presentation/icons/*.{js,ts}',
    'src/renderer/presentation/features/**/*.template.{js,ts}',
    // Type declaration files
    'src/**/*.d.ts',
    // JSON configuration files
    '**/*.json'
  ]
};

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
      {
        test: {
          alias: sharedAlias,
          name: 'scripts-node',
          globals: true,
          clearMocks: true,
          restoreMocks: true,
          environment: 'node',
          include: [
            'tests/unit/scripts/**/*.{test,spec}.{js,ts}',
            'tests/unit/support/**/*.{test,spec}.{js,ts}'
          ],
          setupFiles: [
            path.resolve(__dirname, 'tests/setup.js'),
            path.resolve(__dirname, 'tests/support/mocks/node-browser-mocks.setup.js')
          ]
        }
      },
      {
        test: {
          alias: sharedAlias,
          name: 'renderer-happy-dom',
          globals: true,
          clearMocks: true,
          restoreMocks: true,
          environment: 'happy-dom',
          include: [
            'tests/integration/**/*.{test,spec}.{js,ts}',
            'tests/workflows/**/*.{test,spec}.{js,ts}',
            'tests/unit/renderer/**/*.{test,spec}.{js,ts}'
          ],
          setupFiles: [
            path.resolve(__dirname, 'tests/setup.js'),
            path.resolve(__dirname, 'tests/support/mocks/renderer-browser-mocks.setup.js'),
            path.resolve(__dirname, 'tests/testing-library.setup.js')
          ]
        }
      },
      {
        test: {
          alias: sharedAlias,
          name: 'main-node',
          globals: true,
          clearMocks: true,
          restoreMocks: true,
          environment: 'node',
          include: [
            'tests/unit/main/**/*.{test,spec}.{js,ts}'
          ],
          setupFiles: [
            path.resolve(__dirname, 'tests/setup.js')
          ]
        }
      },
      {
        test: {
          alias: sharedAlias,
          name: 'platform-node',
          globals: true,
          clearMocks: true,
          restoreMocks: true,
          environment: 'node',
          include: [
            'tests/unit/platform/{config,core,devices,events,ipc,transcode,updates}/**/*.{test,spec}.{js,ts}'
          ],
          setupFiles: [
            path.resolve(__dirname, 'tests/setup.js'),
            path.resolve(__dirname, 'tests/support/mocks/node-browser-mocks.setup.js')
          ]
        }
      },
      {
        test: {
          alias: sharedAlias,
          name: 'platform-dom',
          globals: true,
          clearMocks: true,
          restoreMocks: true,
          environment: 'happy-dom',
          include: ['tests/unit/platform/{gpu,ui-base}/**/*.{test,spec}.{js,ts}']
        }
      }
    ]
  }
});
