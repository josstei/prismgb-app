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
      '@main': path.resolve(__dirname, 'src/main'),
      '@renderer': path.resolve(__dirname, 'src/renderer'),
      '@preload': path.resolve(__dirname, 'src/preload'),
      '@shared': path.resolve(__dirname, 'src/shared')
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
        'src/main/**',
        // Auto-update feature requires Electron autoUpdater API
        'src/renderer/features/updates/**',
        // Web Worker files run in Worker context, not testable in vitest
        'src/**/workers/*.js',
        // GPU rendering requires WebGPU/WebGL APIs not available in vitest
        'src/**/rendering/gpu/*.js',
        // Audio warmup requires Web Audio API not available in vitest
        'src/**/audio/*.js',
        // Canvas lifecycle requires complex DOM/Canvas API interactions
        'src/**/canvas-lifecycle.service.js',
        // UI templates use Vite ?raw imports for SVGs not available in vitest
        'src/renderer/ui/templates/*.js',
        'src/renderer/ui/icons/*.js',
        // Interface files are abstract base classes (throw stubs) not meant to be tested
        'src/shared/interfaces/*.interface.js',
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

    // Setup files
    setupFiles: ['./tests/setup.js'],

    // Test timeout
    testTimeout: 10000,

    // Parallel test execution with thread isolation
    pool: 'threads',
    minThreads: 4,
    maxThreads: 8,
    isolate: true
  }
});
