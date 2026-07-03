import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { platformAliasEntries, platformAliasMap } from './scripts/lib/workspace-aliases.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const pkg = require('./package.json');

export default defineConfig({
  plugins: [
    // Copy assets and JSON files
    viteStaticCopy({
      targets: [
        {
          src: 'assets',
          dest: '.' // Copy to dist/
        }
      ],
      // Watch for changes in dev mode
      watch: {
        reloadPageOnChange: true
      }
    }),
    electron([
      {
        // Main process entry
        entry: 'src/main/index.ts',
        onstart(args) {
          // Start Electron after main and preload are built
          args.startup();
        },
        vite: {
          resolve: {
            alias: {
              '@main': path.resolve(__dirname, 'src/main'),
              '@renderer': path.resolve(__dirname, 'src/renderer'),
              '@preload': path.resolve(__dirname, 'src/preload'),
              ...platformAliasMap(__dirname)
            }
          },
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
                  'eventemitter3'
                ];
                return externals.some(ext => id === ext || id.startsWith(ext + '/') || id.includes('node_modules/' + ext));
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
          resolve: {
            alias: {
              '@main': path.resolve(__dirname, 'src/main'),
              '@renderer': path.resolve(__dirname, 'src/renderer'),
              '@preload': path.resolve(__dirname, 'src/preload'),
              ...platformAliasMap(__dirname)
            }
          },
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
    ]),
    renderer({
      // Enable Node integration in renderer if needed
      nodeIntegration: false
    })
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

  // Resolve options
  resolve: {
    // Platform module aliases are emitted from scripts/lib/workspace-aliases.mjs
    // (exact-match entries; deep imports intentionally do not resolve).
    alias: [
      ...platformAliasEntries(__dirname),
      { find: '@main', replacement: path.resolve(__dirname, 'src/main') },
      { find: '@renderer', replacement: path.resolve(__dirname, 'src/renderer') },
      { find: '@preload', replacement: path.resolve(__dirname, 'src/preload') }
    ]
  },

  // Define global constants
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  }
});
