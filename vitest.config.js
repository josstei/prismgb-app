/**
 * Vitest Configuration
 * Testing configuration for PrismGB
 */

import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname,
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@main': path.resolve(__dirname, 'src/main'),
      '@renderer': path.resolve(__dirname, 'src/renderer'),
      '@preload': path.resolve(__dirname, 'src/preload'),
      '@prismgb/gpu': path.resolve(__dirname, 'packages/prismgb-gpu/src/index.ts'),
      '@prismgb/core': path.resolve(__dirname, 'packages/prismgb-core/src/index.ts'),
      '@prismgb/di': path.resolve(__dirname, 'packages/prismgb-di/src/index.ts'),
      '@prismgb/ipc': path.resolve(__dirname, 'packages/prismgb-ipc/src/index.ts'),
      '@prismgb/devices': path.resolve(__dirname, 'packages/prismgb-devices/src/index.ts'),
      '@prismgb/stream-source': path.resolve(__dirname, 'packages/prismgb-stream-source/src/index.ts')
    }
  },
  test: {
    // Test environment (use happy-dom for browser-like environment)
    environment: 'happy-dom',

    // Global test setup
    globals: true,

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './tests/coverage',
      all: true,
      include: ['src/**/*.{js,ts}'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'build/**',
        '**/*.test.{js,ts}',
        '**/*.spec.{js,ts}',
        '**/index.{js,ts}', // Entry points
        'scripts/**',
        'assets/**',
        // Main process files require Electron APIs that can't be tested with vitest/happy-dom
        'src/main/**',
        // Preload scripts require Electron contextBridge/ipcRenderer APIs
        'src/preload/**',
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
      ],
      // 80% coverage threshold for testable code
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80
      }
    },

    // Test file patterns
    include: [
      'src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts}',
      'tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts}'
    ],

    // Exclude E2E tests (run with Playwright instead)
    exclude: [
      'tests/e2e/**',
      'tests/workflows/index.js', // Index files not tests
      'node_modules/**'
    ],

    // Setup files
    setupFiles: [
      path.resolve(__dirname, 'tests/setup.js'),
      path.resolve(__dirname, 'tests/testing-library.setup.js')
    ],

    // Test timeout
    testTimeout: 10000,

    // Limit CPU usage: 2 workers max
    pool: 'forks',
    maxWorkers: 2,
    fileParallelism: true,
    isolate: true
  }
});
