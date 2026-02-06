import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'PrismGBGpu',
      fileName: 'index',
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
