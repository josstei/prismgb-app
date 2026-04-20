import { defineConfig } from 'vite';
import { resolve } from 'path';
import swc from 'unplugin-swc';
import { swcConfig } from '../../scripts/swc.config.js';

export default defineConfig({
  plugins: [swc.vite(swcConfig)],
  build: {
    target: 'es2022',
    sourcemap: true,
    minify: false,
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: () => 'index.js'
    },
    rollupOptions: {
      external: [
        'mitt',
        'reflect-metadata',
        'rxjs',
        'rxjs/operators',
        'tsyringe',
        'zod',
        /^node:/
      ]
    }
  }
});
