import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsEslintPlugin from '@typescript-eslint/eslint-plugin';

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser
    },
    plugins: {
      '@typescript-eslint': tsEslintPlugin
    },
    rules: {
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-unused-vars': 'off',
      'no-redeclare': 'off',
      '@typescript-eslint/no-redeclare': 'error'
    }
  }
];
