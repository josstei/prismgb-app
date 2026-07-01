import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        runtime: resolve(__dirname, 'src/runtime.ts'),
        testkit: resolve(__dirname, 'src/testkit.ts')
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
        '@prismgb/core'
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
