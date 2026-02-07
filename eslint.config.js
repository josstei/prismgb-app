import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsEslintPlugin from '@typescript-eslint/eslint-plugin';

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2025,
      sourceType: 'module',
      globals: {
        // Node.js globals
        require: 'readonly',
        module: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        Buffer: 'readonly',
        global: 'readonly',
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        ResizeObserver: 'readonly',
        Element: 'readonly',
        HTMLVideoElement: 'readonly',
        HTMLCanvasElement: 'readonly',
        ImageBitmap: 'readonly',
        MediaRecorder: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        performance: 'readonly',
        localStorage: 'readonly',
        createImageBitmap: 'readonly',
        // Worker globals
        self: 'readonly',
        Worker: 'readonly',
        OffscreenCanvas: 'readonly',
        // WebGPU globals
        GPUTextureUsage: 'readonly',
        GPUBufferUsage: 'readonly',
        // Vite defines
        __APP_VERSION__: 'readonly',
        // Electron preload
        deviceAPI: 'readonly'
      }
    },
    rules: {
      'indent': ['error', 2, { SwitchCase: 1 }],
      'linebreak-style': ['error', 'unix'],
      'quotes': ['error', 'single', { avoidEscape: true }],
      'semi': ['error', 'always'],
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-debugger': 'warn'
    }
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2025,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: false }
      }
    },
    plugins: {
      '@typescript-eslint': tsEslintPlugin
    },
    rules: {
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-unused-vars': 'off'
    }
  },
  {
    files: ['src/main/application/**/*.{js,ts}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: ['@renderer/*']
      }]
    }
  },
  {
    files: ['src/renderer/infrastructure/**/*.{js,ts}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          '@renderer/presentation/*',
          '@main/*'
        ]
      }]
    }
  },
  {
    files: ['src/main/infrastructure/**/*.{js,ts}', 'src/main/ipc/**/*.{js,ts}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: ['@renderer/*']
      }]
    }
  },
  {
    files: ['src/renderer/application/**/*.{js,ts}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: ['@main/*']
      }]
    }
  },
  {
    files: ['src/renderer/presentation/**/*.{js,ts}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: ['@main/*', '@renderer/infrastructure/*']
      }]
    }
  },
  {
    // Temporary exceptions until shared event contract migration is complete.
    files: [
      'src/renderer/presentation/bridges/capture-ui.bridge.ts',
      'src/renderer/presentation/bridges/transcode-ui.bridge.ts',
      'src/renderer/presentation/bridges/ui-event.bridge.ts',
      'src/renderer/presentation/features/notes/notes-panel.component.js',
      'src/renderer/presentation/features/toolbar/components/cinematic-toggle.component.js',
      'src/renderer/presentation/features/toolbar/components/shader-preset-list.component.js',
      'src/renderer/presentation/features/toolbar/components/shader-slider-controls.component.js',
      'src/renderer/presentation/features/updates/update-section.component.js',
      'src/renderer/presentation/icons/icon.utils.js'
    ],
    rules: {
      'no-restricted-imports': 'off'
    }
  },
  {
    files: ['src/main/index.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: ['@renderer/*']
      }]
    }
  },
  {
    files: ['src/renderer/index.ts', 'src/renderer/renderer-app.orchestrator.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: ['@main/*']
      }]
    }
  },
  {
    files: ['src/shared/**/*.{js,ts}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: ['@main/*', '@renderer/*', '@preload/*']
      }]
    }
  },
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'out/**',
      'coverage/**',
      '**/*.test.js',
    ]
  }
];
