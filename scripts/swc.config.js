/**
 * Shared SWC configuration for Vite and Vitest transpilation.
 *
 * Used by vite.config.js (including worker.plugins) and vitest.config.ts. Centralized to prevent drift across
 * build contexts.
 *
 * Note: unplugin-swc globally disables esbuild and processes BOTH TypeScript
 * and JavaScript files. esbuild is not a fallback for JS; SWC is the sole
 * transpiler.
 */
export const swcConfig = {
  jsc: {
    target: 'es2022',
    parser: {
      syntax: 'typescript',
      decorators: true,
    },
    transform: {
      legacyDecorator: true,
      decoratorMetadata: true,
    },
  },
};
