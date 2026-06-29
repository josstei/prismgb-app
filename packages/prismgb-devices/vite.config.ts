import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        service: resolve(__dirname, 'src/service.ts')
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`
    },
    rollupOptions: {
      external: [
        'electron',
        'module',
        'node:module',
        'usb',
        'node:path',
        'node:fs',
        '@prismgb/core',
        '@prismgb/config',
        '@prismgb/events',
        '@prismgb/ipc'
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
