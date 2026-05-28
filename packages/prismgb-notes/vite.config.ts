import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'PrismGBNotes',
      fileName: 'index',
      formats: ['es']
    },
    rollupOptions: {
      external: [
        'electron',
        '@prismgb/core',
        '@prismgb/events',
        '@prismgb/ipc',
        '@prismgb/config'
      ],
      output: {
        preserveModules: false
      }
    },
    sourcemap: true,
    minify: false
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src")
    }
  }
});
