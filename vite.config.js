import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { platformAliasEntries } from './scripts/lib/workspace-aliases.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const pkg = require('./package.json');

const alias = [
  ...platformAliasEntries(__dirname),
  { find: '@main', replacement: path.resolve(__dirname, 'src/main') },
  { find: '@renderer', replacement: path.resolve(__dirname, 'src/renderer') }
];

export default defineConfig({
  // Packaged renderer pages load through file://, including worker chunks.
  base: './',
  plugins: [
    electron([
      {
        // Main process entry
        entry: 'src/main/index.ts',
        onstart(args) {
          // Start Electron after main and preload are built
          args.startup();
        },
        vite: {
          resolve: { alias },
          build: {
            outDir: 'dist/main',
            rollupOptions: {
              output: {
                format: 'es' // Force ESM output
              },
              external: (id) => {
                const externals = [
                  'electron',
                  'usb',
                  'eventemitter3',
                  'electron-updater',
                  'electron-log',
                  'electron-trpc'
                ];
                // Match package boundaries before resolution; a prefix match on
                // "electron" otherwise emits absolute build-machine paths for
                // electron-updater, electron-log and electron-trpc.
                return externals.some(ext => id === ext || id.startsWith(ext + '/') || id.includes('node_modules/' + ext + '/'));
              }
            }
          }
        }
      },
      {
        // Preload script entry
        entry: 'src/preload/index.ts',
        onstart(args) {
          // Reload renderer when preload changes
          args.reload();
        },
        vite: {
          resolve: { alias },
          plugins: [
            {
              // Emit package.json to make preload directory CommonJS scope
              name: 'emit-preload-package-json',
              generateBundle() {
                this.emitFile({
                  type: 'asset',
                  fileName: 'package.json',
                  source: JSON.stringify({ type: 'commonjs' }, null, 2)
                });
              }
            }
          ],
          build: {
            outDir: 'dist/preload',
            rollupOptions: {
              external: ['electron'],
              output: {
                // IIFE format works correctly with vite-plugin-electron
                format: 'iife',
                entryFileNames: 'index.js',
                inlineDynamicImports: true
              }
            }
          }
        }
      }
    ])
  ],

  // Renderer build config
  build: {
    outDir: 'dist/renderer',
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'src/renderer/index.html')
      }
    }
  },

  worker: {
    format: 'es'
  },

  // Development server
  server: {
    host: '127.0.0.1',
    port: 3000
  },

  // Serve assets from the assets directory
  publicDir: 'assets',

  // Exact platform entrypoints are shared by all three process builds.
  resolve: { alias },

  // Define global constants
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  }
});
