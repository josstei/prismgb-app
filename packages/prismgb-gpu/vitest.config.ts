import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.interface.ts',
        'src/infrastructure/webgpu.driver.ts',
        'src/infrastructure/workers/**'
      ]
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@prismgb/gpu/runtime': resolve(__dirname, 'src/runtime.ts'),
      '@prismgb/gpu/testkit': resolve(__dirname, 'src/testkit.ts'),
      '@prismgb/gpu': resolve(__dirname, 'src/index.ts')
    }
  }
});
