import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
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
    ignores: [
      'node_modules/**',
      'dist/**',
      'out/**',
      'coverage/**',
      '**/*.test.js',
      // Main process files use import assertions which require special parser
      'src/main/**'
    ]
  }
];
