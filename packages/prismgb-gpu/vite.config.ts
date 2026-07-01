import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        runtime: resolve(__dirname, 'src/runtime.ts'),
        'worker-entry': resolve(__dirname, 'src/worker-entry.ts'),
        testkit: resolve(__dirname, 'src/testkit.ts')
      },
      name: 'PrismGBGpu',
      formats: ['es']
    },
    rollupOptions: {
      external: [],
      output: {
        preserveModules: false
      }
    },
    sourcemap: true,
    minify: false
  },
  worker: {
    format: 'es'
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  }
});
