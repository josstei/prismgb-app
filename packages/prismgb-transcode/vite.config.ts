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
        'ffmpeg-static',
        'ffprobe-static',
        'node:path',
        'node:fs',
        'node:fs/promises',
        'node:crypto',
        'node:module',
        'node:child_process',
        'node:events',
        '@prismgb/core',
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
