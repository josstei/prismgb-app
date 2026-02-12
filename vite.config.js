import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

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
              '@': path.resolve(__dirname, 'src'),
              '@main': path.resolve(__dirname, 'src/main'),
              '@renderer': path.resolve(__dirname, 'src/renderer'),
              '@preload': path.resolve(__dirname, 'src/preload'),
              '@shared': path.resolve(__dirname, 'src/shared'),
              '@prismgb/core': path.resolve(__dirname, 'packages/prismgb-core/src/index.ts'),
              '@prismgb/di': path.resolve(__dirname, 'packages/prismgb-di/src/index.ts'),
              '@prismgb/ipc': path.resolve(__dirname, 'packages/prismgb-ipc/src/index.ts'),
              '@prismgb/devices': path.resolve(__dirname, 'packages/prismgb-devices/src/index.ts'),
              '@prismgb/stream-source': path.resolve(__dirname, 'packages/prismgb-stream-source/src/index.ts')
            }
          },
          build: {
            outDir: 'dist/main',
            rollupOptions: {
              output: {
                format: 'es' // Force ESM output
              },
              external: [
                'electron',
                'usb-detection',
                'winston',
                'awilix',
                'joi',
                'dotenv',
                'eventemitter3'
              ]
            }
          }
        }
      },
      {
        // Preload script entry
        entry: 'src/preload/index.js',
        onstart(args) {
          // Reload renderer when preload changes
          args.reload();
        },
        vite: {
          resolve: {
            alias: {
              '@': path.resolve(__dirname, 'src'),
              '@main': path.resolve(__dirname, 'src/main'),
              '@renderer': path.resolve(__dirname, 'src/renderer'),
              '@preload': path.resolve(__dirname, 'src/preload'),
              '@shared': path.resolve(__dirname, 'src/shared'),
              '@prismgb/core': path.resolve(__dirname, 'packages/prismgb-core/src/index.ts'),
              '@prismgb/di': path.resolve(__dirname, 'packages/prismgb-di/src/index.ts'),
              '@prismgb/ipc': path.resolve(__dirname, 'packages/prismgb-ipc/src/index.ts'),
              '@prismgb/devices': path.resolve(__dirname, 'packages/prismgb-devices/src/index.ts'),
              '@prismgb/stream-source': path.resolve(__dirname, 'packages/prismgb-stream-source/src/index.ts')
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

  // Development server
  server: {
    port: 3000
  },

  // Serve assets from the assets directory
  publicDir: 'assets',

  // Resolve options
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@main': path.resolve(__dirname, 'src/main'),
      '@renderer': path.resolve(__dirname, 'src/renderer'),
      '@preload': path.resolve(__dirname, 'src/preload'),
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@prismgb/gpu': path.resolve(__dirname, 'packages/prismgb-gpu/src/index.ts'),
      '@prismgb/core': path.resolve(__dirname, 'packages/prismgb-core/src/index.ts'),
      '@prismgb/di': path.resolve(__dirname, 'packages/prismgb-di/src/index.ts'),
      '@prismgb/ipc': path.resolve(__dirname, 'packages/prismgb-ipc/src/index.ts'),
      '@prismgb/devices': path.resolve(__dirname, 'packages/prismgb-devices/src/index.ts'),
      '@prismgb/stream-source': path.resolve(__dirname, 'packages/prismgb-stream-source/src/index.ts'),
      // Provide a browser-friendly URL polyfill so PixiJS doesn't emit raw require('url')
      url: 'url/'
    }
  },

  // Define global constants
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  }
});
