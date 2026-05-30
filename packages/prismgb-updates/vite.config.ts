import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'PrismGBUpdates',
      fileName: 'index',
      formats: ['es']
    },
    rollupOptions: {
      external: [
        'electron',
        'electron-updater',
        'module',
        'node:module',
        'node:path',
        'node:fs',
        '@prismgb/core',
        '@prismgb/config',
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
