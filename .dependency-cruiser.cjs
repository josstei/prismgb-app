/**
 * Dependency boundary gate (north-star P4 — boundaries as configuration).
 *
 * Single owner of every import-boundary rule that previously lived in
 * scripts/check-layer-boundaries.js, the import half of
 * scripts/check-gpu-package-boundaries.js, and the no-restricted-imports
 * blocks in eslint.config.js. Platform-module public surfaces derive from
 * scripts/lib/workspace-aliases.mjs so the alias registry stays the single
 * source of truth. Loading the registry uses require() of an ESM module,
 * which needs Node >= 22.12.
 */
const { PLATFORM_MODULES, PLATFORM_ROOT } = require('./scripts/lib/workspace-aliases.mjs');

const APP_ROOTS = '^src/(main|preload|renderer)/';

const platformEntrypointPatterns = PLATFORM_MODULES.flatMap((platformModule) =>
  Object.values(platformModule.entrypoints).map(
    (entryFile) => `^${PLATFORM_ROOT}/${platformModule.name}/${entryFile.replace(/\./g, '\\.')}$`
  )
);

const platformCrossModuleRules = PLATFORM_MODULES.map((platformModule) => ({
  name: `platform-${platformModule.name}-not-to-foreign-internals`,
  severity: 'error',
  comment: `src/platform/${platformModule.name} may reach other platform modules only through their registry entrypoints.`,
  from: { path: `^${PLATFORM_ROOT}/${platformModule.name}/` },
  to: {
    path: `^${PLATFORM_ROOT}/`,
    pathNot: [`^${PLATFORM_ROOT}/${platformModule.name}/`, ...platformEntrypointPatterns]
  }
}));

const orphanExemptPatterns = [
  ...platformEntrypointPatterns,
  `^${PLATFORM_ROOT}/[^/]+/testkit(/|\\.ts$)`,
  `^${PLATFORM_ROOT}/gpu/worker-entry\\.ts$`,
  '^src/main/index\\.ts$',
  '^src/preload/index\\.ts$',
  '^src/renderer/index\\.ts$',
  '\\.d\\.ts$'
];

module.exports = {
  forbidden: [
    {
      name: 'no-unresolvable',
      severity: 'error',
      comment: 'Every import must resolve; deep @platform aliases and typos fail here.',
      from: {},
      to: { couldNotResolve: true, pathNot: ['\\?url$'] }
    },
    {
      name: 'no-orphans',
      severity: 'error',
      comment: 'Modules nothing imports are dead or misplaced; declared entrypoints and test-support surfaces are exempt.',
      from: { orphan: true, pathNot: orphanExemptPatterns },
      to: {}
    },
    {
      name: 'main-not-to-renderer',
      severity: 'error',
      comment: 'Main-process code never imports renderer code.',
      from: { path: '^src/main/' },
      to: { path: '^src/renderer/' }
    },
    {
      name: 'preload-isolated',
      severity: 'error',
      comment: 'Preload bridges the processes and imports neither of them.',
      from: { path: '^src/preload/' },
      to: { path: '^src/(main|renderer)/' }
    },
    {
      name: 'renderer-not-to-main',
      severity: 'error',
      comment: 'Renderer code never imports main-process code outside the typed IPC router edge.',
      from: { path: '^src/renderer/' },
      to: { path: '^src/main/', pathNot: ['^src/main/ipc/'] }
    },
    {
      name: 'renderer-not-to-main-ipc',
      severity: 'error',
      comment: 'Only renderer/infrastructure may reference main/ipc, and only as types.',
      from: { path: '^src/renderer/', pathNot: ['^src/renderer/infrastructure/'] },
      to: { path: '^src/main/ipc/' }
    },
    {
      name: 'renderer-infra-to-main-ipc-value',
      severity: 'error',
      comment: 'The tRPC AppRouter edge is type-only; value imports of main/ipc are forbidden.',
      from: { path: '^src/renderer/infrastructure/' },
      to: { path: '^src/main/ipc/', dependencyTypesNot: ['type-only'] }
    },
    {
      name: 'renderer-infrastructure-not-to-presentation',
      severity: 'error',
      comment: 'Infrastructure stays UI-agnostic.',
      from: { path: '^src/renderer/infrastructure/' },
      to: { path: '^src/renderer/presentation/' }
    },
    {
      name: 'renderer-presentation-not-to-infrastructure',
      severity: 'error',
      comment: 'Presentation consumes application orchestrators, never infrastructure directly.',
      from: { path: '^src/renderer/presentation/' },
      to: { path: '^src/renderer/infrastructure/' }
    },
    {
      name: 'renderer-lib-not-to-app',
      severity: 'error',
      comment: 'renderer/lib is a shared kernel; it imports platform modules and externals only.',
      from: { path: '^src/renderer/lib/' },
      to: { path: '^src/(main|preload)/|^src/renderer/(application|infrastructure|presentation)/|^src/renderer/(index|app-bootstrap)\\.ts$' }
    },
    {
      name: 'renderer-entry-not-imported',
      severity: 'error',
      comment: 'The renderer entry is loaded by the host page, never imported.',
      from: { path: '^src/' },
      to: { path: '^src/renderer/index\\.ts$' }
    },
    {
      name: 'renderer-bootstrap-only-from-entry',
      severity: 'error',
      comment: 'Only the renderer entry wires the bootstrap.',
      from: { path: '^src/', pathNot: ['^src/renderer/index\\.ts$'] },
      to: { path: '^src/renderer/app-bootstrap\\.ts$' }
    },
    {
      name: 'main-entry-not-imported',
      severity: 'error',
      comment: 'The main entry is the electron main target, never imported.',
      from: { path: '^src/' },
      to: { path: '^src/main/index\\.ts$' }
    },
    {
      name: 'main-bootstrap-only-from-entry',
      severity: 'error',
      comment: 'Only the main entry wires the bootstrap.',
      from: { path: '^src/', pathNot: ['^src/main/index\\.ts$'] },
      to: { path: '^src/main/app-bootstrap\\.ts$' }
    },
    {
      name: 'platform-not-to-app',
      severity: 'error',
      comment: 'Platform modules are the foundation; they never import app code.',
      from: { path: `^${PLATFORM_ROOT}/` },
      to: { path: APP_ROOTS }
    },
    {
      name: 'app-to-platform-internals',
      severity: 'error',
      comment: 'App code reaches platform modules only through their registry entrypoints.',
      from: { path: APP_ROOTS },
      to: { path: `^${PLATFORM_ROOT}/`, pathNot: platformEntrypointPatterns }
    },
    {
      name: 'gpu-root-not-to-internals',
      severity: 'error',
      comment: 'The gpu module root exposes the app-facing surface only.',
      from: { path: `^${PLATFORM_ROOT}/gpu/index\\.ts$` },
      to: { path: `^${PLATFORM_ROOT}/gpu/(infrastructure/|worker/|worker-entry|application/renderer\\.service)` }
    },
    ...platformCrossModuleRules
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.app.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: { extensions: ['.ts', '.js', '.d.ts', '.json'] }
  }
};
