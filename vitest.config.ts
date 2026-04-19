/**
 * Vitest Configuration
 * Testing configuration for PrismGB using Vitest 4 projects mode.
 *
 * Vitest 4 removed `defineWorkspace`; projects are configured via `test.projects`.
 */

import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';
import path from 'path';
import { fileURLToPath } from 'url';
import { swcConfig } from './scripts/swc.config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [swc.vite(swcConfig)],
  test: {
    projects: [
      'packages/*',
      {
        plugins: [swc.vite(swcConfig)],
        test: {
          name: 'app-shell',
          root: __dirname,
          environment: 'happy-dom',
          globals: true,
          include: [
            'src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts}',
            'tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts}'
          ],
          exclude: [
            'tests/e2e/**',
            'tests/workflows/index.js',
            'node_modules/**',
            'packages/**',
            '.worktrees/**'
          ],
          setupFiles: [
            path.resolve(__dirname, 'tests/setup.js'),
            path.resolve(__dirname, 'tests/testing-library.setup.js')
          ],
          testTimeout: 10000,
          pool: 'forks',
          fileParallelism: true,
          isolate: true,
          alias: {
            '@': path.resolve(__dirname, 'src'),
            '@main': path.resolve(__dirname, 'src/main'),
            '@renderer': path.resolve(__dirname, 'src/renderer'),
            '@preload': path.resolve(__dirname, 'src/preload'),
            '@shared': path.resolve(__dirname, 'src/shared'),
            '@prismgb/gpu': path.resolve(__dirname, 'packages/prismgb-gpu/src/index.ts')
          }
        }
      }
    ],
    maxWorkers: 2,
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
        '**/index.{js,ts}',
        'scripts/**',
        'assets/**',
        'src/main/**',
        'src/preload/**',
        'src/renderer/infrastructure/services/updates/**',
        'src/**/workers/*.{js,ts}',
        'src/**/rendering/gpu/*.{js,ts}',
        'src/renderer/infrastructure/rendering/capability-detector.utils.ts',
        'src/renderer/infrastructure/adapters/streaming/canvas2d-renderer.adapter.ts',
        'src/renderer/infrastructure/adapters/streaming/gpu-renderer.adapter.ts',
        'src/renderer/infrastructure/factories/streaming-renderer.factory.ts',
        'src/**/gpu-render-loop.service.{js,ts}',
        'src/**/audio/*.{js,ts}',
        'src/**/canvas-lifecycle.service.{js,ts}',
        'src/renderer/presentation/shell/*.{js,ts}',
        'src/renderer/presentation/icons/*.{js,ts}',
        'src/renderer/presentation/features/**/*.template.{js,ts}',
        'src/shared/interfaces/**',
        'src/shared/ipc/*.contract.ts',
        'src/**/*.interface.{js,ts}',
        'src/**/*.type.ts',
        'src/**/*.types.ts',
        'src/**/*.d.ts',
        '**/*.json'
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80
      }
    }
  }
});
