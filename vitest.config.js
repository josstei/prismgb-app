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
  '@': path.resolve(__dirname, 'src'),
  '@main': path.resolve(__dirname, 'src/main'),
  '@renderer': path.resolve(__dirname, 'src/renderer'),
  '@preload': path.resolve(__dirname, 'src/preload'),
  ...platformAliasMap(__dirname, ['@platform', '@prismgb'])
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
    'build/**',
    '**/*.test.{js,ts}',
    '**/*.spec.{js,ts}',
    '**/index.{js,ts}',
    'scripts/**',
    'assets/**',
    // Auto-update feature requires Electron autoUpdater API
    'src/renderer/infrastructure/services/updates/**',
    // Web Worker files run in Worker context, not testable in vitest
    'src/**/workers/*.{js,ts}',
    // GPU/Canvas/WebGPU APIs not available in vitest
    'src/**/rendering/gpu/*.{js,ts}',
    'src/renderer/infrastructure/services/streaming/adapters/streaming-canvas2d-renderer.adapter.ts',
    'src/renderer/infrastructure/services/streaming/adapters/streaming-gpu-renderer.adapter.ts',
    'src/renderer/infrastructure/services/streaming/streaming-renderer.factory.ts',
    'src/**/gpu-render-loop.service.{js,ts}',
    // Audio warmup requires Web Audio API not available in vitest
    'src/**/audio/*.{js,ts}',
    // Canvas lifecycle requires complex DOM/Canvas API interactions
    'src/**/canvas-lifecycle.service.{js,ts}',
    // UI templates use Vite ?raw imports for SVGs not available in vitest
    'src/renderer/presentation/shell/*.{js,ts}',
    'src/renderer/presentation/icons/*.{js,ts}',
    'src/renderer/presentation/features/**/*.template.{js,ts}',
    // Interface and type-only files (abstract base classes, contracts, type definitions)
    'src/**/*.interface.{js,ts}',
    'src/**/*.type.ts',
    'src/**/*.types.ts',
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
          name: 'shared-node',
          globals: true,
          environment: 'node',
          include: [
            'tests/unit/config/**/*.{test,spec}.{js,ts}',
            'tests/unit/scripts/**/*.{test,spec}.{js,ts}',
            'tests/unit/shared/**/*.{test,spec}.{js,ts}',
            'tests/unit/utils/**/*.{test,spec}.{js,ts}',
            'tests/unit/factories/**/*.{test,spec}.{js,ts}'
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
          environment: 'happy-dom',
          include: [
            'tests/integration/**/*.{test,spec}.{js,ts}',
            'tests/workflows/**/*.{test,spec}.{js,ts}',
            'tests/unit/app/renderer/**/*.{test,spec}.{js,ts}',
            'tests/unit/features/**/*.{test,spec}.{js,ts}',
            'tests/unit/renderer/**/*.{test,spec}.{js,ts}',
            'tests/unit/ui/**/*.{test,spec}.{js,ts}'
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
          name: 'main-preload',
          globals: true,
          environment: 'node',
          include: [
            'tests/unit/app/main/**/*.{test,spec}.{js,ts}',
            'tests/unit/main/**/*.{test,spec}.{js,ts}',
            'tests/unit/preload/**/*.{test,spec}.{js,ts}'
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
          environment: 'node',
          include: [
            'tests/unit/platform/{config,core,devices,events,ipc,notes,transcode,updates}/**/*.{test,spec}.{js,ts}'
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
          environment: 'happy-dom',
          include: ['tests/unit/platform/{gpu,ui-base}/**/*.{test,spec}.{js,ts}']
        }
      }
    ]
  }
});
