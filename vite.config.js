import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import path from 'path';
import fs from 'fs';
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
        entry: 'src/app/main/index.js',
        onstart(args) {
          // Start Electron after main and preload are built
          args.startup();
        },
        vite: {
          resolve: {
            alias: {
              '@': path.resolve(__dirname, 'src'),
              '@app': path.resolve(__dirname, 'src/app'),
              '@features': path.resolve(__dirname, 'src/features'),
              '@ui': path.resolve(__dirname, 'src/ui'),
              '@shared': path.resolve(__dirname, 'src/shared'),
              '@infrastructure': path.resolve(__dirname, 'src/infrastructure')
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
        entry: 'src/app/preload/index.js',
        onstart(args) {
          // Reload renderer when preload changes
          args.reload();
        },
        vite: {
          resolve: {
            alias: {
              '@': path.resolve(__dirname, 'src'),
              '@app': path.resolve(__dirname, 'src/app'),
              '@features': path.resolve(__dirname, 'src/features'),
              '@ui': path.resolve(__dirname, 'src/ui'),
              '@shared': path.resolve(__dirname, 'src/shared'),
              '@infrastructure': path.resolve(__dirname, 'src/infrastructure')
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
            },
            {
              // Copy IPC channels.json for preload access
              name: 'copy-ipc-channels',
              writeBundle() {
                const srcPath = path.resolve(__dirname, 'src/infrastructure/ipc/channels.json');
                const destDir = path.resolve(__dirname, 'dist/infrastructure/ipc');
                const destPath = path.join(destDir, 'channels.json');

                // Create directory if it doesn't exist
                if (!fs.existsSync(destDir)) {
                  fs.mkdirSync(destDir, { recursive: true });
                }

                // Copy the file
                fs.copyFileSync(srcPath, destPath);
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
        main: path.resolve(__dirname, 'src/app/renderer/index.html')
      }
    }
  },

  // Development server
  server: {
    port: 3000
  },

  // Resolve options
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@app': path.resolve(__dirname, 'src/app'),
      '@features': path.resolve(__dirname, 'src/features'),
      '@ui': path.resolve(__dirname, 'src/ui'),
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@infrastructure': path.resolve(__dirname, 'src/infrastructure'),
      // Provide a browser-friendly URL polyfill so PixiJS doesn't emit raw require('url')
      url: 'url/'
    }
  },

  // Define global constants
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  }
});
