/**
 * Vitest Configuration
 * Testing configuration for PrismGB
 */

import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@app': path.resolve(__dirname, 'src/app'),
      '@features': path.resolve(__dirname, 'src/features'),
      '@ui': path.resolve(__dirname, 'src/ui'),
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@infrastructure': path.resolve(__dirname, 'src/infrastructure')
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
      include: ['src/**/*.js'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'build/**',
        '**/*.test.js',
        '**/*.spec.js',
        '**/index.js', // Entry points
        'scripts/**',
        'assets/**',
        // Main process files require Electron APIs that can't be tested with vitest/happy-dom
        'src/app/main/**',
        'src/features/devices/main/**',
        // Auto-update feature requires Electron autoUpdater API
        'src/features/updates/**',
        // Web Worker files run in Worker context, not testable in vitest
        'src/**/workers/*.js',
        // GPU rendering requires WebGPU/WebGL APIs not available in vitest
        'src/**/rendering/gpu/*.js'
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

    // Setup files
    setupFiles: ['./tests/setup.js'],

    // Test timeout
    testTimeout: 10000,

    // Parallel test execution with thread isolation
    pool: 'threads',
    poolOptions: {
      threads: {
        minThreads: 4,
        maxThreads: 8
      }
    },
    isolate: true
  }
});
