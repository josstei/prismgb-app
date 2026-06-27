/**
 * Vitest Configuration
 * Testing configuration for PrismGB
 */

import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sharedAlias = {
  '@': path.resolve(__dirname, 'src'),
  '@main': path.resolve(__dirname, 'src/main'),
  '@renderer': path.resolve(__dirname, 'src/renderer'),
  '@preload': path.resolve(__dirname, 'src/preload'),
  '@shared': path.resolve(__dirname, 'src/shared'),
  '@prismgb/gpu': path.resolve(__dirname, 'packages/prismgb-gpu/src/index.ts'),
  '@prismgb/gpu/': path.resolve(__dirname, 'packages/prismgb-gpu/src/'),
  '@prismgb/core': path.resolve(__dirname, 'packages/prismgb-core/src/index.ts'),
  '@prismgb/core/': path.resolve(__dirname, 'packages/prismgb-core/src/'),
  '@prismgb/events': path.resolve(__dirname, 'packages/prismgb-events/src/index.ts'),
  '@prismgb/events/': path.resolve(__dirname, 'packages/prismgb-events/src/'),
  '@prismgb/config': path.resolve(__dirname, 'packages/prismgb-config/src/index.ts'),
  '@prismgb/config/': path.resolve(__dirname, 'packages/prismgb-config/src/'),
  '@prismgb/ipc': path.resolve(__dirname, 'packages/prismgb-ipc/src/index.ts'),
  '@prismgb/ipc/': path.resolve(__dirname, 'packages/prismgb-ipc/src/'),
  '@prismgb/devices': path.resolve(__dirname, 'packages/prismgb-devices/src/index.ts'),
  '@prismgb/devices/': path.resolve(__dirname, 'packages/prismgb-devices/src/'),
  '@prismgb/transcode': path.resolve(__dirname, 'packages/prismgb-transcode/src/index.ts'),
  '@prismgb/transcode/': path.resolve(__dirname, 'packages/prismgb-transcode/src/'),
  '@prismgb/updates': path.resolve(__dirname, 'packages/prismgb-updates/src/index.ts'),
  '@prismgb/updates/': path.resolve(__dirname, 'packages/prismgb-updates/src/'),
  '@prismgb/notes': path.resolve(__dirname, 'packages/prismgb-notes/src/index.ts'),
  '@prismgb/notes/': path.resolve(__dirname, 'packages/prismgb-notes/src/')
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
    'src/renderer/infrastructure/rendering/capability-detector.utils.ts',
    'src/renderer/infrastructure/adapters/streaming/canvas2d-renderer.adapter.ts',
    'src/renderer/infrastructure/adapters/streaming/gpu-renderer.adapter.ts',
    'src/renderer/infrastructure/factories/streaming-renderer.factory.ts',
    'src/**/gpu-render-loop.service.{js,ts}',
    // Keep root CI coverage aligned with @prismgb/gpu package coverage policy.
    // Hardware-specific GPU backends are covered by focused package tests and build/type gates.
    'packages/prismgb-gpu/src/infrastructure/webgpu/**',
    'packages/prismgb-gpu/src/infrastructure/webgl2/**',
    'packages/prismgb-gpu/src/infrastructure/workers/**',
    'packages/prismgb-gpu/src/infrastructure/canvas2d/**',
    // Audio warmup requires Web Audio API not available in vitest
    'src/**/audio/*.{js,ts}',
    // Canvas lifecycle requires complex DOM/Canvas API interactions
    'src/**/canvas-lifecycle.service.{js,ts}',
    // UI templates use Vite ?raw imports for SVGs not available in vitest
    'src/renderer/presentation/shell/*.{js,ts}',
    'src/renderer/presentation/icons/*.{js,ts}',
    'src/renderer/presentation/features/**/*.template.{js,ts}',
    // Interface and type-only files (abstract base classes, contracts, type definitions)
    'src/shared/interfaces/**',
    'src/shared/ipc/*.contract.ts',
    'src/**/*.interface.{js,ts}',
    'src/**/*.type.ts',
    'src/**/*.types.ts',
    // Type declaration files
    'src/**/*.d.ts',
    // JSON configuration files
    '**/*.json'
  ],
  thresholds: {
    lines: 0,
    functions: 0,
    branches: 0,
    statements: 0
  }
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
            'tests/unit/packages/**/*.{test,spec}.{js,ts}',
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
            'tests/performance/**/*.{test,spec}.{js,ts}',
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
          alias: {
            '@': path.resolve(__dirname, 'packages/prismgb-gpu/src')
          },
          name: 'gpu-package',
          globals: true,
          environment: 'happy-dom',
          include: ['packages/prismgb-gpu/tests/unit/**/*.test.ts'],
        },
        resolve: {
          alias: {
            '@': path.resolve(__dirname, 'packages/prismgb-gpu/src')
          }
        }
      },
      {
        test: {
          alias: sharedAlias,
          name: 'core-package',
          globals: true,
          environment: 'node',
          include: ['packages/prismgb-core/tests/unit/**/*.{test,spec}.ts']
        }
      }
    ]
  }
});
