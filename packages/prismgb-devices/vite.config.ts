import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'PrismGBDevices',
      fileName: 'index',
      formats: ['es']
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
