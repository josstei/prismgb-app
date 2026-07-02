# North Star P3 — Workspace Collapse (R2-1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the ten `packages/prismgb-*` npm-workspace packages into `src/platform/<name>` source trees behind `@platform/<name>` aliases, producing one build unit and one tsconfig — the precondition for the decorator phases (P6+).

**Architecture:** Every package's `src/` moves byte-identically to `src/platform/<name>`; every alias surface (vite ×3 blocks, vitest, tsconfig) is emitted from one registry module `scripts/lib/workspace-aliases.mjs`. A two-stage cutover keeps every commit green: first the sources move behind *compat* `@prismgb/*` aliases retargeted at `src/platform`, then a repo-wide codemod rewrites imports to `@platform/*` and the compat aliases are deleted. Package dist/turbo/manifest plumbing is deleted, not migrated.

**Tech Stack:** npm (workspaces removal + lockfile regen), Vite 7 (three resolve blocks in `vite.config.js`), vitest 4 multi-project, TypeScript 5.9 project configs, husky/lint-staged, GitHub Actions.

## Global Constraints

- Branch: create `northstar/phase-3` from `refactor/gpu_normalization` (HEAD `0077c230`). The orchestrator ff-merges and tags `northstar-p3`; the executor never tags the exit, never merges, never pushes.
- Conventional commits; subject ≤ 100 chars; NO AI attribution of any kind (no "Generated with", no "Co-Authored-By"); never `--no-verify`.
- No inline code comments; JSDoc only. Code must match surrounding idiom.
- Heredocs are BLOCKED in this environment — write files with the Write/Edit tools, never `cat <<EOF`.
- `rm` may be blocked by sandbox policy — use `git rm`/`git mv` for tracked files.
- `.husky/pre-commit` runs lint-staged + `typecheck:app` on every commit — **every commit must typecheck standalone**. Task 2 and Task 4 stage hundreds of files, so `vitest related` in lint-staged may take a few minutes; let it run.
- Rollback for the whole phase: `git reset --hard pre-workspace-collapse` (tag created in Task 1).
- Baseline invariants to preserve: **154 test files / 1,950 tests** from Task 2 onward (P2 baseline 153/1,942 + Task 1's 6 registry guard tests + Task 2's 2 config-sync guard tests), 86/86 e2e, all gates green (`test:run`, `typecheck`, `lint`, `check:gpu-boundaries`, `build:vite`, `dev:smoke`).

## Verified premises (2026-07-01, live tree at `0077c230`)

These were verified against the live tree; do not re-derive them, and do not trust older docs where they conflict:

1. All 10 package manifests export from built `./dist/*`; turbo (`predev`/`prebuild:vite`/`build:packages`) builds them. Only `@prismgb/gpu` is source-aliased in `vite.config.js`; the main/preload electron blocks have **no** `@prismgb` aliases (they resolve via node_modules symlinks → dist).
2. `tsconfig.base.json` ALREADY has `experimentalDecorators` + `emitDecoratorMetadata`; the package copies (core, notes) are redundant deletions, not merges.
3. No types-array merge is needed: zero `from 'electron'` imports and zero ambient `Electron.` usage in any `packages/*/src`; root base `types: ["node","@webgpu/types","vite/client"]` is a superset of every per-package need.
4. Zero `@/` imports in package **sources**; 15 gpu package **test** files use `@/` (via the gpu-package vitest project's local alias).
5. Import inventory: 203 files import `@prismgb/*`; exactly 15 distinct specifiers — 10 bare + `gpu/runtime`, `devices/runtime`, `devices/testkit`, `transcode/service`, `ui-base/reactive`. No other deep imports exist anywhere.
6. `tests/unit/scripts/test-set-coverage.test.js` walks `packages/*/tests` on disk — it THROWS once `packages/` is gone and must be fixed in the same commit that removes the last package `tests/` dir (Task 3).
7. `scripts/check-gpu-package-boundaries.js` reads the gpu manifest, `tsconfig.base.json` AND `tsconfig.app.json` alias blocks, text-scans `vitest.config.js`, and has a dist-inspection half — it must be rewritten in Task 2 or it hard-fails.
8. `scripts/check-layer-boundaries.js` classifies `core` only from a legacy `@core/` prefix; `@prismgb`/`@platform` specifiers classify as null (exempt). No P3 change needed; the platform-layer rules arrive with dependency-cruiser in P4.
9. There is NO coverage-ratchet enforcement anywhere (no thresholds in `vitest.config.js`, no ratchet script, CI runs `test:run` without coverage). Coverage-scope changes are report-only.
10. `tests/unit/scripts/platform-manifest.test.js` is about OS build platforms (`scripts/manifests/platforms.manifest.json`) — unrelated to `src/platform`; do not touch it.
11. CI: only `.github/workflows/reusable-ci-tests.yml` calls the turbo/package scripts (`build:packages`, `check:exports`, `typecheck:packages`) — in its two Linux jobs.
12. `tests/unit/packages/devices/usb.monitor.test.ts` is the only file with a literal relative `packages/prismgb-…` import path.
13. Package-root files to delete per package: `package.json`, `tsconfig.json`, `vite.config.ts`, plus `vitest.config.ts` (core, gpu, ui-base), `tsconfig.build.json` (ui-base), `eslint.config.js` (ui-base).

## File structure (end state)

```
scripts/lib/workspace-aliases.mjs        # NEW — single source of truth for platform module aliases
src/platform/<name>/                     # 10 moved source trees (byte-identical internals)
tests/unit/platform/<name>/              # moved package tests + former tests/unit/packages/*
tests/unit/scripts/workspace-aliases.test.js  # NEW — registry shape + tsconfig/vitest sync guard
vite.config.js                           # 3 resolve blocks consume the registry
vitest.config.js                         # sharedAlias consumes registry; platform-node/platform-dom projects
tsconfig.base.json                       # @platform paths block (only); app config inherits paths
scripts/check-gpu-package-boundaries.js  # rewritten: registry-driven, no manifest/dist halves
packages/, turbo.json, scripts/check-package-exports.js   # DELETED
```

Platform module names: `config`, `core`, `devices`, `events`, `gpu`, `ipc`, `notes`, `transcode`, `ui-base`, `updates`.

---

### Task 1: Safety tag, phase branch, and the workspace-alias registry

**Files:**
- Create: `scripts/lib/workspace-aliases.mjs`
- Test: `tests/unit/scripts/workspace-aliases.test.js`

**Interfaces:**
- Produces: `PLATFORM_MODULES: Array<{name: string, entrypoints: Record<string, string>}>`; `platformAliasMap(rootDir: string, prefixes?: string[]): Record<string, string>` (object form — vitest `sharedAlias`, vite main/preload blocks); `platformAliasEntries(rootDir: string, prefixes?: string[]): Array<{find: RegExp, replacement: string}>` (array form — vite renderer block); `platformTsconfigPaths(prefixes?: string[]): Record<string, string[]>` (extensionless targets — tsconfig `paths`). Every later task consumes these exact names.

- [ ] **Step 1: Tag the rollback point and create the phase branch**

```bash
git tag pre-workspace-collapse
git checkout -b northstar/phase-3
```

Expected: tag exists (`git tag -l pre-workspace-collapse` prints it), branch `northstar/phase-3` checked out, clean tree.

- [ ] **Step 2: Write the failing test**

Create `tests/unit/scripts/workspace-aliases.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import {
  PLATFORM_MODULES,
  platformAliasMap,
  platformAliasEntries,
  platformTsconfigPaths
} from '../../../scripts/lib/workspace-aliases.mjs';

const MODULE_NAMES = [
  'config',
  'core',
  'devices',
  'events',
  'gpu',
  'ipc',
  'notes',
  'transcode',
  'ui-base',
  'updates'
];

describe('workspace-aliases registry', () => {
  it('declares exactly the ten platform modules', () => {
    expect(PLATFORM_MODULES.map((module) => module.name).sort()).toEqual(MODULE_NAMES);
  });

  it('declares exactly the public entrypoints per module', () => {
    const entrypointsByName = Object.fromEntries(
      PLATFORM_MODULES.map((module) => [module.name, Object.keys(module.entrypoints).sort()])
    );
    expect(entrypointsByName).toEqual({
      config: ['.'],
      core: ['.'],
      devices: ['.', './runtime', './testkit'],
      events: ['.'],
      gpu: ['.', './runtime'],
      ipc: ['.'],
      notes: ['.'],
      transcode: ['.', './service'],
      'ui-base': ['.', './reactive'],
      updates: ['.']
    });
  });

  it('emits object aliases with subpath keys before bare keys', () => {
    const aliasMap = platformAliasMap('/repo');
    const keys = Object.keys(aliasMap);
    expect(keys.indexOf('@platform/gpu/runtime')).toBeLessThan(keys.indexOf('@platform/gpu'));
    expect(aliasMap['@platform/gpu']).toBe(resolve('/repo', 'src/platform/gpu/index.ts'));
    expect(aliasMap['@platform/ui-base/reactive']).toBe(resolve('/repo', 'src/platform/ui-base/reactive/index.ts'));
  });

  it('emits exact-match regex entries for the vite array form', () => {
    const entries = platformAliasEntries('/repo');
    const gpuBare = entries.find((entry) => entry.find.test('@platform/gpu'));
    expect(gpuBare.replacement).toBe(resolve('/repo', 'src/platform/gpu/index.ts'));
    expect(entries.some((entry) => entry.find.test('@platform/gpu/infrastructure/shaders'))).toBe(false);
  });

  it('emits extensionless tsconfig path targets', () => {
    const paths = platformTsconfigPaths();
    expect(paths['@platform/core']).toEqual(['./src/platform/core/index']);
    expect(paths['@platform/devices/testkit']).toEqual(['./src/platform/devices/testkit']);
    expect(Object.keys(paths).some((key) => key.includes('*'))).toBe(false);
  });

  it('supports a compat prefix during migration', () => {
    const aliasMap = platformAliasMap('/repo', ['@platform', '@prismgb']);
    expect(aliasMap['@prismgb/core']).toBe(resolve('/repo', 'src/platform/core/index.ts'));
    expect(aliasMap['@platform/core']).toBe(resolve('/repo', 'src/platform/core/index.ts'));
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/unit/scripts/workspace-aliases.test.js`
Expected: FAIL — cannot resolve `scripts/lib/workspace-aliases.mjs`.

- [ ] **Step 4: Implement the registry**

Create `scripts/lib/workspace-aliases.mjs`:

```js
/**
 * Single source of truth for the src/platform module surface.
 *
 * Every alias consumer (vite renderer/main/preload blocks, vitest sharedAlias,
 * tsconfig paths, the GPU boundary gate) derives its entries from this
 * registry so an entrypoint can never drift between resolvers. Entrypoint
 * keys mirror the former package-exports subpaths; only these specifiers
 * resolve — deep imports fail at resolution.
 */
import { posix, resolve } from 'node:path';

export const PLATFORM_ROOT = 'src/platform';

export const PLATFORM_MODULES = [
  { name: 'config', entrypoints: { '.': 'index.ts' } },
  { name: 'core', entrypoints: { '.': 'index.ts' } },
  { name: 'devices', entrypoints: { '.': 'index.ts', './runtime': 'runtime.ts', './testkit': 'testkit.ts' } },
  { name: 'events', entrypoints: { '.': 'index.ts' } },
  { name: 'gpu', entrypoints: { '.': 'index.ts', './runtime': 'runtime.ts' } },
  { name: 'ipc', entrypoints: { '.': 'index.ts' } },
  { name: 'notes', entrypoints: { '.': 'index.ts' } },
  { name: 'transcode', entrypoints: { '.': 'index.ts', './service': 'service.ts' } },
  { name: 'ui-base', entrypoints: { '.': 'index.ts', './reactive': 'reactive/index.ts' } },
  { name: 'updates', entrypoints: { '.': 'index.ts' } }
];

const DEFAULT_PREFIXES = ['@platform'];

function moduleSpecifier(prefix, moduleName, subpath) {
  return subpath === '.' ? `${prefix}/${moduleName}` : `${prefix}/${moduleName}${subpath.slice(1)}`;
}

function orderedEntrypoints(module) {
  return Object.entries(module.entrypoints).sort(([a], [b]) => b.length - a.length);
}

export function platformAliasMap(rootDir, prefixes = DEFAULT_PREFIXES) {
  const aliasMap = {};
  for (const module of PLATFORM_MODULES) {
    for (const [subpath, entryFile] of orderedEntrypoints(module)) {
      const target = resolve(rootDir, PLATFORM_ROOT, module.name, entryFile);
      for (const prefix of prefixes) {
        aliasMap[moduleSpecifier(prefix, module.name, subpath)] = target;
      }
    }
  }
  return aliasMap;
}

export function platformAliasEntries(rootDir, prefixes = DEFAULT_PREFIXES) {
  return Object.entries(platformAliasMap(rootDir, prefixes)).map(([specifier, replacement]) => ({
    find: new RegExp(`^${specifier.replace(/\//g, '\\/')}$`),
    replacement
  }));
}

export function platformTsconfigPaths(prefixes = DEFAULT_PREFIXES) {
  const paths = {};
  for (const module of PLATFORM_MODULES) {
    for (const [subpath, entryFile] of orderedEntrypoints(module)) {
      const target = `./${posix.join(PLATFORM_ROOT, module.name, entryFile.replace(/\.ts$/, ''))}`;
      for (const prefix of prefixes) {
        paths[moduleSpecifier(prefix, module.name, subpath)] = [target];
      }
    }
  }
  return paths;
}
```

Note the split: alias targets use platform-native `resolve` (matching how `vite.config.js`/`vitest.config.js` already build alias paths with `path.resolve` — the Windows CI matrix runs `test:run`), while `platformTsconfigPaths` uses `posix.join` because tsconfig `paths` targets are always forward-slash relative strings.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/unit/scripts/workspace-aliases.test.js`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/workspace-aliases.mjs tests/unit/scripts/workspace-aliases.test.js
git commit -m "chore(platform): add workspace alias registry ahead of collapse"
```

---

### Task 2: Source collapse — move the ten trees, delete the workspace plumbing, wire compat aliases

This task is one atomic commit by necessity: manifests, aliases, and scripts reference each other all-or-nothing. Every sub-step below is mechanical and individually greppable.

**Files:**
- Move: `packages/prismgb-<name>/src` → `src/platform/<name>` (×10)
- Delete: all package-root config files (premise 13), `turbo.json`, `scripts/check-package-exports.js`
- Modify: `vite.config.js`, `vitest.config.js`, `tsconfig.base.json`, `tsconfig.app.json`, `tsconfig.test.json`, `package.json`, `package-lock.json` (regen), `eslint.config.js`, `scripts/check-gpu-package-boundaries.js` (rewrite), `.github/workflows/reusable-ci-tests.yml`, `tests/unit/scripts/workspace-aliases.test.js` (extend)

**Interfaces:**
- Consumes: Task 1's registry exports.
- Produces: `src/platform/<name>/**` trees resolvable via BOTH `@prismgb/<name>` (compat) and `@platform/<name>`; root scripts reduced to the post-workspace set. Package `tests/` dirs remain at `packages/prismgb-{core,gpu,ui-base}/tests` until Task 3.

- [ ] **Step 1: Move the ten source trees**

```bash
mkdir -p src/platform
for name in config core devices events gpu ipc notes transcode ui-base updates; do
  git mv "packages/prismgb-${name}/src" "src/platform/${name}"
done
```

Expected: `git status` shows renames only for these paths; `ls src/platform` lists the ten directories.

- [ ] **Step 2: Delete the package config files, turbo, and the exports checker**

```bash
git rm packages/prismgb-*/package.json packages/prismgb-*/tsconfig.json packages/prismgb-*/vite.config.ts
git rm packages/prismgb-core/vitest.config.ts packages/prismgb-gpu/vitest.config.ts packages/prismgb-ui-base/vitest.config.ts
git rm packages/prismgb-ui-base/tsconfig.build.json packages/prismgb-ui-base/eslint.config.js
git rm turbo.json scripts/check-package-exports.js
```

Expected: `find packages -type f | grep -v /tests/` prints nothing — only the three `tests/` trees remain under `packages/`.

- [ ] **Step 3: Root `package.json` surgery**

Remove the `"workspaces"` field entirely. Remove the ten `"@prismgb/*": "*"` entries from `dependencies`. Remove `"turbo": "^2.9.16"` from `devDependencies`. Replace the lint-staged eslint glob:

```json
  "lint-staged": {
    "src/**/*.{js,ts}": [
      "eslint"
    ],
    "*.{js,ts}": [
      "vitest related --run --passWithNoTests"
    ]
  },
```

In `"scripts"`, delete these keys: `predev`, `prebuild:vite`, `build:packages`, `check:exports`, `typecheck:gpu`, `typecheck:core`, `typecheck:ui-base`, `typecheck:packages`. Rewrite these two:

```json
    "lint": "eslint \"src/**/*.{js,ts}\" && node scripts/check-layer-boundaries.js",
    "lint:fix": "eslint \"src/**/*.{js,ts}\" --fix && node scripts/check-layer-boundaries.js",
    "typecheck": "npm run typecheck:app && npm run typecheck:tests",
```

All other scripts stay byte-identical (`dev`, `build:vite`, `check:gpu-boundaries`, `dev:smoke`, `test:*`, etc.).

- [ ] **Step 4: Regenerate the lockfile**

```bash
npm install
```

Expected: `package-lock.json` drops the `packages/prismgb-*` workspace entries; `node_modules/@prismgb` no longer exists; postinstall prints patch-package applying `electron-trpc+0.7.1.patch` without error.

- [ ] **Step 5: Wire the registry into `vite.config.js` (all three resolve blocks)**

Add to the imports at the top:

```js
import { platformAliasEntries, platformAliasMap } from './scripts/lib/workspace-aliases.mjs';
```

In the **main-process** electron block, change the alias object to:

```js
          resolve: {
            alias: {
              '@': path.resolve(__dirname, 'src'),
              '@main': path.resolve(__dirname, 'src/main'),
              '@renderer': path.resolve(__dirname, 'src/renderer'),
              '@preload': path.resolve(__dirname, 'src/preload'),
              ...platformAliasMap(__dirname, ['@platform', '@prismgb'])
            }
          },
```

Apply the identical change to the **preload** block's alias object.

In the **root renderer** `resolve.alias` array, replace the two `@prismgb/gpu` entries:

```js
    alias: [
      ...platformAliasEntries(__dirname, ['@platform', '@prismgb']),
      { find: '@main', replacement: path.resolve(__dirname, 'src/main') },
      { find: '@renderer', replacement: path.resolve(__dirname, 'src/renderer') },
      { find: '@preload', replacement: path.resolve(__dirname, 'src/preload') },
      { find: /^@$/, replacement: path.resolve(__dirname, 'src') },
      { find: /^@\//, replacement: path.resolve(__dirname, 'src') + '/' },
      { find: /^url$/, replacement: 'url/' }
    ]
```

Also delete the now-stale 3-line comment above the array about bundling `@prismgb/gpu` from source, and replace it with:

```js
  // Platform module aliases are emitted from scripts/lib/workspace-aliases.mjs
  // (exact-match entries; deep imports intentionally do not resolve).
```

- [ ] **Step 6: Wire the registry into `vitest.config.js`**

Add the import:

```js
import { platformAliasMap } from './scripts/lib/workspace-aliases.mjs';
```

Replace the 13 hand-written `@prismgb/*` entries inside `sharedAlias` with a spread, keeping the four app aliases:

```js
const sharedAlias = {
  '@': path.resolve(__dirname, 'src'),
  '@main': path.resolve(__dirname, 'src/main'),
  '@renderer': path.resolve(__dirname, 'src/renderer'),
  '@preload': path.resolve(__dirname, 'src/preload'),
  ...platformAliasMap(__dirname, ['@platform', '@prismgb'])
};
```

In the `gpu-package` project block, retarget the three package-local alias paths (both the `test.alias` and `resolve.alias` objects) from `packages/prismgb-gpu/src…` to:

```js
            '@': path.resolve(__dirname, 'src/platform/gpu'),
            '@prismgb/gpu/runtime': path.resolve(__dirname, 'src/platform/gpu/runtime.ts'),
            '@prismgb/gpu': path.resolve(__dirname, 'src/platform/gpu/index.ts')
```

(The `gpu-package`, `core-package`, `ui-base-package` projects keep their `packages/*/tests` include globs — the test trees move in Task 3.)

In `baseCoverageConfig.exclude`, delete the stale block (the files were renamed by the gpu refactor and no longer exist anywhere):

```js
    // Keep root CI coverage aligned with @prismgb/gpu package coverage policy.
    // Hardware-specific GPU backends are covered by focused package tests and build/type gates.
    'packages/prismgb-gpu/src/infrastructure/webgpu.renderer.ts',
    'packages/prismgb-gpu/src/infrastructure/webgl.renderer.ts',
    'packages/prismgb-gpu/src/infrastructure/workers/**',
    'packages/prismgb-gpu/src/infrastructure/canvas.renderer.ts',
```

(No replacement excludes: every current gpu infrastructure file has focused tests. Coverage is report-only — premise 9.)

- [ ] **Step 7: tsconfig surgery**

In `tsconfig.base.json`, replace the entire `@prismgb/*` portion of `"paths"` (keep `@/*`, `@main/*`, `@renderer/*`, `@preload/*`) with the 30 emitted entries — the `@platform` block plus the temporary `@prismgb` compat block, both targeting `src/platform`. Generate the JSON rather than hand-typing it:

```bash
node -e "import('./scripts/lib/workspace-aliases.mjs').then(m => console.log(JSON.stringify(m.platformTsconfigPaths(['@platform','@prismgb']), null, 2)))"
```

Paste the output into `"paths"` after the four app aliases. The result contains NO wildcard (`/*`) platform entries — the former `@prismgb/<name>/*` wildcards die here (verified: nothing deep-imports).

In `tsconfig.app.json`: delete the entire `"paths"` object (it now inherits base — CFG-1), and add `"src/platform/**/*.ts"` to `"include"`:

```json
  "include": [
    "src/main/**/*.ts",
    "src/platform/**/*.ts",
    "src/preload/**/*.ts",
    "src/renderer/**/*.ts",
    "src/shared/**/*.ts",
    "src/types/**/*.d.ts"
  ],
```

In `tsconfig.test.json`, add the same `"src/platform/**/*.ts"` line to its `"include"` (after `"src/main/**/*.ts"`).

- [ ] **Step 8: eslint scope**

In `eslint.config.js` line 8, change `files: ['src/**/*.js', 'packages/*/src/**/*.js'],` → `files: ['src/**/*.js'],` and line 67 `files: ['src/**/*.ts', 'packages/*/src/**/*.ts'],` → `files: ['src/**/*.ts'],`.

- [ ] **Step 9: Rewrite `scripts/check-gpu-package-boundaries.js`**

Replace the whole file with the registry-driven form. Deleted: `assertExactGpuExports` (no manifest) and `assertBuiltDistMatchesExports` (no dist — the retired dist-boundary half). Retargeted: source-safety and webgl scans to `src/platform/gpu` + `tests/unit/platform/gpu`. Alias assertions now compare `tsconfig.base.json` against the registry (single source of truth) — `tsconfig.app.json` no longer has paths. The legacy `@prismgb/gpu` deep/worker tokens stay permanently as reintroduction tripwires.

```js
/**
 * GPU platform-module boundary gate.
 *
 * Verifies the GPU module's public entrypoint surface against the workspace
 * alias registry, root-safe source exports, and the absence of deep or
 * worker imports from app and test code. Deep specifiers also fail at
 * resolution because the registry emits exact-match aliases only; this gate
 * is the explicit, named tripwire until dependency-cruiser absorbs it in P4.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLATFORM_MODULES, platformTsconfigPaths } from './lib/workspace-aliases.mjs';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GPU_MODULE_DIR = resolve(PROJECT_ROOT, 'src/platform/gpu');
const GPU_TESTS_DIR = resolve(PROJECT_ROOT, 'tests/unit/platform/gpu');

const EXPECTED_GPU_ENTRYPOINTS = ['.', './runtime'];

const FORBIDDEN_IMPORT_TOKENS = [
  'packages/prismgb-gpu/src',
  '@prismgb/gpu/src',
  '@platform/gpu/src',
  '@prismgb/gpu/worker',
  '@platform/gpu/worker',
  '@prismgb/gpu/worker-entry',
  '@platform/gpu/worker-entry'
];

const TEXT_FILE_EXTENSIONS = new Set(['.cjs', '.css', '.js', '.json', '.jsx', '.md', '.mjs', '.ts', '.tsx']);

function readJson(relativePath) {
  return JSON.parse(readFileSync(resolve(PROJECT_ROOT, relativePath), 'utf8'));
}

function normalizeSlash(pathName) {
  return pathName.split('\\').join('/');
}

function fail(message, details = []) {
  console.error(`GPU boundary check FAILED: ${message}`);
  for (const detail of details) {
    console.error(`  ${detail}`);
  }
  process.exit(1);
}

function assertRegistryGpuEntrypoints() {
  const gpuModule = PLATFORM_MODULES.find((module) => module.name === 'gpu');
  if (!gpuModule) {
    fail('workspace alias registry does not declare a gpu module');
  }
  const actual = Object.keys(gpuModule.entrypoints).sort();
  const expected = [...EXPECTED_GPU_ENTRYPOINTS].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail('unexpected gpu entrypoints in the workspace alias registry', [
      `expected: ${expected.join(', ')}`,
      `actual: ${actual.join(', ')}`
    ]);
  }
}

function assertTsconfigMatchesRegistry() {
  const config = readJson('tsconfig.base.json');
  const paths = config.compilerOptions?.paths ?? {};
  const expectedGpuPaths = Object.fromEntries(
    Object.entries(platformTsconfigPaths()).filter(([alias]) => alias.startsWith('@platform/gpu'))
  );
  const actualGpuPaths = Object.fromEntries(
    Object.entries(paths).filter(([alias]) => alias.startsWith('@platform/gpu'))
  );
  if (JSON.stringify(actualGpuPaths) !== JSON.stringify(expectedGpuPaths)) {
    fail('tsconfig.base.json gpu aliases drifted from the workspace alias registry', [
      `expected: ${JSON.stringify(expectedGpuPaths)}`,
      `actual: ${JSON.stringify(actualGpuPaths)}`
    ]);
  }
  const wildcardGpuAliases = Object.keys(paths).filter(
    (alias) => alias.includes('gpu') && alias.includes('*')
  );
  if (wildcardGpuAliases.length > 0) {
    fail('tsconfig.base.json must not declare wildcard gpu aliases', wildcardGpuAliases);
  }
}

function assertResolverConfigsConsumeRegistry() {
  for (const configFile of ['vite.config.js', 'vitest.config.js']) {
    const configText = readFileSync(resolve(PROJECT_ROOT, configFile), 'utf8');
    if (!configText.includes('workspace-aliases.mjs')) {
      fail(`${configFile} does not consume scripts/lib/workspace-aliases.mjs`);
    }
  }
}

function walkFiles(root, files = []) {
  if (!existsSync(root)) {
    return files;
  }
  for (const entry of readdirSync(root)) {
    if (entry === 'node_modules' || entry === 'dist') {
      continue;
    }
    const absolutePath = join(root, entry);
    const stats = statSync(absolutePath);
    if (stats.isDirectory()) {
      walkFiles(absolutePath, files);
    } else if (TEXT_FILE_EXTENSIONS.has(extname(entry))) {
      files.push(absolutePath);
    }
  }
  return files;
}

function assertRootSourceSafe() {
  const rootSource = readFileSync(resolve(GPU_MODULE_DIR, 'index.ts'), 'utf8');
  const forbidden = [
    './infrastructure',
    './application/renderer.service',
    './worker',
    './worker-entry'
  ].filter((pathName) => rootSource.includes(pathName));
  if (forbidden.length > 0) {
    fail('gpu module root exports or imports forbidden internal modules', forbidden);
  }
}

function assertNoForbiddenGpuImports() {
  const scanRoots = [resolve(PROJECT_ROOT, 'src'), resolve(PROJECT_ROOT, 'tests')];
  const failures = [];
  for (const filePath of scanRoots.flatMap((root) => walkFiles(root))) {
    if (filePath.startsWith(GPU_MODULE_DIR) || filePath.startsWith(GPU_TESTS_DIR)) {
      continue;
    }
    const text = readFileSync(filePath, 'utf8');
    const relativePath = normalizeSlash(relative(PROJECT_ROOT, filePath));
    for (const token of FORBIDDEN_IMPORT_TOKENS) {
      if (text.includes(token)) {
        failures.push(`${relativePath}: references ${token}`);
      }
    }
  }
  if (failures.length > 0) {
    fail('app/test files have invalid GPU module imports', failures);
  }
}

function assertNoWebGL2FilesIfWebGL2Removed() {
  const hasWebGL2Renderer = existsSync(resolve(GPU_MODULE_DIR, 'infrastructure/webgl.renderer.ts'));
  if (hasWebGL2Renderer) {
    return;
  }
  const files = [...walkFiles(GPU_MODULE_DIR), ...walkFiles(GPU_TESTS_DIR)];
  const webglFiles = files
    .map((filePath) => normalizeSlash(relative(PROJECT_ROOT, filePath)))
    .filter((pathName) => pathName.includes('webgl') || pathName.includes('WebGL'));
  if (webglFiles.length > 0) {
    fail('WebGL2 files remain after removal phase', webglFiles);
  }
}

assertRegistryGpuEntrypoints();
assertTsconfigMatchesRegistry();
assertResolverConfigsConsumeRegistry();
assertRootSourceSafe();
assertNoForbiddenGpuImports();
assertNoWebGL2FilesIfWebGL2Removed();

console.log('GPU boundary check OK.');
```

Note: `assertNoForbiddenGpuImports` excludes the gpu module and gpu tests themselves — this file (and the checker, which lives in `scripts/`, outside the scan roots) may name the tokens; nothing else may.

- [ ] **Step 10: Extend the registry guard test with config-sync assertions**

Append to `tests/unit/scripts/workspace-aliases.test.js` inside the describe block:

```js
  it('tsconfig.base.json @platform paths match the registry emission', () => {
    const tsconfig = JSON.parse(readFileSync(join(process.cwd(), 'tsconfig.base.json'), 'utf8'));
    const actualPlatformPaths = Object.fromEntries(
      Object.entries(tsconfig.compilerOptions.paths).filter(([alias]) => alias.startsWith('@platform/'))
    );
    expect(actualPlatformPaths).toEqual(platformTsconfigPaths());
  });

  it('vite and vitest configs consume the registry module', () => {
    for (const configFile of ['vite.config.js', 'vitest.config.js']) {
      const configText = readFileSync(join(process.cwd(), configFile), 'utf8');
      expect(configText).toContain('workspace-aliases.mjs');
    }
  });
```

And add the imports at the top of the file:

```js
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
```

- [ ] **Step 11: Update `.github/workflows/reusable-ci-tests.yml`**

Delete these three step blocks from BOTH the `validate-linux` and `validate-linux-arm64` jobs (six blocks total):

```yaml
      - name: Build all workspace packages (turbo, topological)
        run: npm run build:packages

      - name: Validate package export artifacts
        run: npm run check:exports
```
```yaml
      - name: Typecheck all workspace packages (turbo)
        run: npm run typecheck:packages
```

Keep the "Run GPU package boundary check" steps unchanged.

- [ ] **Step 12: Run the gates**

```bash
npm run typecheck
npm run lint
npm run check:gpu-boundaries
npm run test:run
npm run build:vite
npm run dev:smoke
```

Expected: all green; `test:run` reports **153 test files / 1,942 tests**. Known likely fallout, fix before committing:
- `typecheck:app` may raise `isolatedModules`/TS1205 errors in `src/platform/**` (package tsconfigs did not set `isolatedModules`; the root base does). Fix pattern: change offending re-exports to `export type { … }`. No other source edits are in scope.
- If `dev:smoke` fails on a decorated file with "Invalid or unexpected token": esbuild reads the per-file tsconfig — confirm the moved core/notes sources now fall under root `tsconfig.json` → `tsconfig.app.json` → `tsconfig.base.json` (which carries `experimentalDecorators`). This is expected to just work; investigate before patching anything.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "refactor(platform): collapse workspace package sources into src/platform"
```

Pre-commit note: lint-staged will run eslint over the moved `src/platform/**` files and `vitest related` over the staged set — expect a few minutes.

---

### Task 3: Test collapse — move package tests and the `tests/unit/packages` tree into `tests/unit/platform`

**Files:**
- Move: `packages/prismgb-gpu/tests/unit/**` → `tests/unit/platform/gpu/`; `packages/prismgb-core/tests/unit/**` → `tests/unit/platform/core/`; `packages/prismgb-ui-base/tests/unit/**` → `tests/unit/platform/ui-base/`; `tests/unit/packages/{core,devices,ipc}/*` → `tests/unit/platform/{core,devices,ipc}/`
- Modify: `vitest.config.js` (projects), `tests/unit/scripts/test-set-coverage.test.js`, `tests/unit/platform/gpu/**` (`@/` rewrite), `tests/unit/platform/devices/usb.monitor.test.ts` (relative path)

**Interfaces:**
- Consumes: `sharedAlias` (now registry-backed) from Task 2.
- Produces: vitest projects `platform-node` and `platform-dom` replacing `gpu-package`/`core-package`/`ui-base-package`; `packages/` directory fully gone.

- [ ] **Step 1: Move the test trees**

```bash
mkdir -p tests/unit/platform
git mv packages/prismgb-gpu/tests/unit tests/unit/platform/gpu
git mv packages/prismgb-core/tests/unit tests/unit/platform/core
git mv packages/prismgb-ui-base/tests/unit tests/unit/platform/ui-base
git mv tests/unit/packages/devices tests/unit/platform/devices
git mv tests/unit/packages/ipc tests/unit/platform/ipc
for f in tests/unit/packages/core/*; do git mv "$f" tests/unit/platform/core/; done
```

Then confirm nothing remains and remove the empty dirs from the index view:

```bash
find packages tests/unit/packages -type f 2>/dev/null
```

Expected: no output; `git status` shows only renames. (Empty directories vanish from git automatically.)

- [ ] **Step 2: Rewrite the gpu tests' `@/` alias imports to relative paths**

The 15 gpu test files import gpu internals via the package-local `@/` alias, which now collides with the root `@` → `src` alias. Rewrite every such specifier (import/require/vi.mock/dynamic-import forms) to the depth-correct RELATIVE path into `src/platform/gpu/…`, preserving subpath and extension exactly — e.g. at `tests/unit/platform/gpu/application/catalog.test.ts` (depth 5): `'@/application/catalog.js'` → `'../../../../../src/platform/gpu/application/catalog.js'`; at `tests/unit/platform/gpu/index.root-safety.test.ts` (depth 4): `'@/index'` → `'../../../../src/platform/gpu/index'`. Leave pre-existing `@prismgb/gpu` / `@prismgb/gpu/runtime` public-entrypoint specifiers untouched.

```bash
grep -rn "'@/" tests/unit/platform/gpu
```

Expected: prints nothing after the rewrite.

Rationale (execution decision, supersedes the original `@platform/gpu/<internal>` rewrite): deep alias specifiers resolve in vitest only via a project-scoped prefix alias, but can never typecheck — the registry's tsconfig paths are deliberately exact-match (the gpu boundary gate forbids wildcards) and tsconfig `extends` replaces `paths` wholesale, so a scoped wildcard would mean hand-duplicating the registry. Relative subject imports are the repo's established pattern for every other moved test (usb.monitor, core, ui-base) and let Step 4 omit any deep-alias escape hatch entirely.

- [ ] **Step 3: Verify the relative subject-import paths (already fixed during Task 2 recovery)**

Task 2's fix pass already retargeted every relative subject import in the moving test files to `src/platform/...` with depth-preserving paths (usb.monitor.test.ts ×2, core index.test.ts ×1, ui-base signal/presentation-component/dom-bindings tests ×4) — source and destination directories have identical depth, so the moves in Step 1 keep them valid. Verify only:

```bash
grep -rn "packages/prismgb\|\.\./\.\./src/" tests/unit/platform | grep -v "src/platform"
```

Expected: no output. If anything appears, retarget it to the same-depth `src/platform/<name>/…` path instead of proceeding.

- [ ] **Step 4: Replace the three package vitest projects with two platform projects**

In `vitest.config.js`, delete the `gpu-package`, `core-package`, and `ui-base-package` project blocks entirely. Remove `'tests/unit/packages/**/*.{test,spec}.{js,ts}'` from the `shared-node` include list. Add these two projects:

```js
      {
        test: {
          alias: sharedAlias,
          name: 'platform-node',
          globals: true,
          environment: 'node',
          include: [
            'tests/unit/platform/{config,core,devices,events,ipc,notes,transcode,updates}/**/*.{test,spec}.{js,ts}'
          ],
          setupFiles: [
            path.resolve(__dirname, 'tests/setup.js'),
            path.resolve(__dirname, 'tests/support/mocks/node-browser-mocks.setup.js')
          ]
        }
      },
      {
        test: {
          alias: sharedAlias,
          name: 'platform-dom',
          globals: true,
          environment: 'happy-dom',
          include: ['tests/unit/platform/{gpu,ui-base}/**/*.{test,spec}.{js,ts}']
        }
      }
```

Rationale pinned by the current tree: former `tests/unit/packages/*` files ran under `shared-node` WITH its two setup files → `platform-node` keeps them; former gpu/ui-base package projects ran under happy-dom WITHOUT setup files → `platform-dom` has none. No project-scoped gpu alias exists — the gpu tests' internal imports are relative after Step 2, so `sharedAlias` alone suffices and no deep-alias resolution hole is opened. The core package's single test file moves from a no-setup project into `platform-node` (with setup files) — if it fails from mock leakage, fix the test's assumptions, not the project split.

- [ ] **Step 5: Fix the executed-test-set guard**

In `tests/unit/scripts/test-set-coverage.test.js`, replace `collectTestFilesOnDisk` (the `packages/` walk throws now that the directory is gone):

```js
function collectTestFilesOnDisk() {
  return walk(join(ROOT, 'tests'), []);
}
```

Remove the now-unused `readdirSync` package-walk lines only; keep everything else byte-identical.

- [ ] **Step 6: Run the test gates**

```bash
npm run test:run
npm run typecheck:tests
```

Expected: **154 files / 1,950 tests**, all passing — the executed-test-set guard proves no suite was dropped by the include-glob swap. `typecheck:tests` newly covers the moved `.ts` package tests (they were excluded by the package tsconfigs before); fix any small errors it surfaces in those test files (type-only import syntax, unused locals are already off).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "test(platform): move package test suites into the root tree"
```

---

### Task 4: Codemod — `@prismgb/*` → `@platform/*`, delete the compat aliases

**Files:**
- Modify: ~203 files under `src/` and `tests/` (mechanical specifier rewrite), `vite.config.js`, `vitest.config.js`, `tsconfig.base.json`, `scripts/check-gpu-package-boundaries.js` (add legacy tripwire)

**Interfaces:**
- Consumes: compat aliases from Task 2 (this task removes them).
- Produces: zero `@prismgb` references outside the boundary checker's tripwire tokens.

- [ ] **Step 1: Pre-codemod audit**

```bash
grep -rn "@prismgb" src tests | grep -vE "from |import |vi\.mock|require\(" | head -20
```

Expected: nothing load-bearing (JSDoc `@typedef {import('@prismgb/…')}` lines in `tests/factories/settings.factory.js` are fine — the codemod covers them). If anything unexpected appears (string literals compared at runtime, log channel names), STOP and resolve it explicitly before the sed.

- [ ] **Step 2: Run the codemod**

```bash
grep -rl "@prismgb/" src tests | xargs sed -i '' "s|@prismgb/|@platform/|g"
grep -rn "@prismgb" src tests
```

Expected: second grep prints ZERO lines. Scope is deliberately `src` + `tests` only — `scripts/check-gpu-package-boundaries.js` keeps its `@prismgb` tripwire tokens, and `scripts/lib/workspace-aliases.mjs` never contained the literal.

- [ ] **Step 3: Drop the compat prefix from every emitter call site**

- `vite.config.js`: `platformAliasMap(__dirname, ['@platform', '@prismgb'])` → `platformAliasMap(__dirname)` (main + preload blocks); `platformAliasEntries(__dirname, ['@platform', '@prismgb'])` → `platformAliasEntries(__dirname)`.
- `vitest.config.js`: same single-argument change in `sharedAlias`. (The `platform-dom` project carries no gpu alias keys — it is plain `alias: sharedAlias` per the Task 3 relative-import decision — so nothing else changes there.)
- `tsconfig.base.json`: delete the 15 `@prismgb/*` compat path entries (keep the 15 `@platform/*` entries). Regenerate to be exact:

```bash
node -e "import('./scripts/lib/workspace-aliases.mjs').then(m => console.log(JSON.stringify(m.platformTsconfigPaths(), null, 2)))"
```

- [ ] **Step 4: Arm the legacy tripwire in the gpu boundary gate**

In `scripts/check-gpu-package-boundaries.js`, add one token to `FORBIDDEN_IMPORT_TOKENS` so the retired specifier can never come back through muscle memory:

```js
  '@prismgb/gpu',
```

(The broader `@prismgb/` ban for the other nine modules is intentionally NOT added — the specifiers no longer resolve anywhere, so any reintroduction fails typecheck and vitest resolution outright.)

- [ ] **Step 5: Run all gates**

```bash
npm run typecheck
npm run lint
npm run check:gpu-boundaries
npm run test:run
npm run build:vite
npm run dev:smoke
```

Expected: all green; 154 files / 1,950 tests.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(platform): rewrite @prismgb imports to @platform and drop compat aliases"
```

---

### Task 5: Residue sweep — clean-generated inventory, knip, and stale references

**Files:**
- Modify: `scripts/clean-generated.js`, `knip.json`

**Interfaces:**
- Consumes: nothing new. `tests/unit/scripts/clean-generated.test.js` tests behavior generically (verified: zero references to package paths or turbo) — pruning the inventory needs no test edits.

- [ ] **Step 1: Prune the generated-artifact inventory**

In `scripts/clean-generated.js` `GENERATED_ARTIFACT_PATHS`, delete all 20 `packages/prismgb-*/dist` and `packages/prismgb-*/.turbo` entries and the root `'.turbo'` entry (turbo is gone). Keep everything else byte-identical.

- [ ] **Step 2: Collapse `knip.json` to a single workspace**

Replace the `"workspaces"` object with root-only, folding in the former gpu entry files at their new paths, and retarget the gpu ignore globs:

```json
  "workspaces": {
    ".": {
      "entry": [
        "src/main/index.ts",
        "src/preload/index.ts",
        "src/renderer/index.ts",
        "src/platform/*/index.ts",
        "src/platform/gpu/runtime.ts",
        "src/platform/devices/runtime.ts",
        "src/platform/devices/testkit.ts",
        "src/platform/transcode/service.ts",
        "src/platform/ui-base/reactive/index.ts",
        "scripts/*.js",
        "scripts/lib/*.mjs",
        "tests/support/**/*.{js,ts}",
        "tests/**/*.{test,spec}.{js,ts}"
      ],
      "project": ["src/**/*.{ts,js}"],
      "ignoreDependencies": ["eventemitter3", "@electron/notarize", "ffmpeg-static", "ffprobe-static"],
      "ignoreUnresolved": ["/overlay-icons/default.svg?url", "/Logo.png?url"]
    }
  },
  "ignore": [
    "src/platform/gpu/application/index.ts",
    "src/platform/gpu/domain/index.ts",
    "src/platform/gpu/infrastructure/index.ts",
    "**/*.d.ts",
    "dist/**",
    "release/**",
    "tests/fixtures/**"
  ]
```

(The former `canvas2d`/`webgl2`/`webgpu` index ignores reference directories deleted by the gpu refactor — drop them; keep `infrastructure/index.ts` only if it still exists, otherwise drop that line too. `lint:dead-code` is not a phase gate: run it, record the result in the commit body if it flags pre-existing items, and do not chase new findings.)

- [ ] **Step 3: Sweep for stragglers**

```bash
grep -rn "packages/prismgb\|prebuild:vite\|build:packages\|check:exports\|typecheck:packages\|turbo" \
  src tests scripts .github package.json vite.config.js vitest.config.js tsconfig.base.json tsconfig.app.json tsconfig.test.json knip.json eslint.config.js 2>/dev/null
```

Expected: zero hits (docs/ and memory files are out of scope; `scripts/check-gpu-package-boundaries.js`'s `packages/prismgb-gpu/src` tripwire token is the single allowed hit — leave it).

- [ ] **Step 4: Run the gates and commit**

```bash
npm run test:run && npm run lint && npm run typecheck
git add -A
git commit -m "chore(platform): retire workspace residue from scripts and configs"
```

---

### Task 6: Exit verification and phase log

**Files:**
- Modify: `docs/northstar/PHASE_LOG.md`

- [ ] **Step 1: Full gate ladder plus e2e**

```bash
npm run test:run
npm run typecheck
npm run lint
npm run check:gpu-boundaries
npm run build:vite
npm run dev:smoke
npm run test:e2e
```

Expected: everything green; 154 files / 1,950 tests; **86/86 e2e**. `build:vite` staying green is THE exit criterion — the stale-dist/double-bundling bug class is now structurally impossible (no package dist exists to go stale).

- [ ] **Step 2: Record the LOC delta and exit metrics**

```bash
git diff --shortstat pre-workspace-collapse..HEAD
```

Append a P3 section to `docs/northstar/PHASE_LOG.md` following the P1/P2 format: commit list, gates run, test counts, prod/test LOC, the net delta (estimate: ≈ −1,300; deletions are 10× manifest/tsconfig/vite/vitest configs + turbo + exports checker + tsconfig.app paths block + clean-generated inventory ≈ −1,450, additions are the registry + guard test + platform vitest projects ≈ +250), and execution notes for any deviations.

- [ ] **Step 3: Commit and STOP**

```bash
git add docs/northstar/PHASE_LOG.md
git commit -m "docs(northstar): record P3 exit metrics"
```

**STOP.** Do not tag, do not merge, do not push, do not start P4. The orchestrator independently verifies every claim against git, ff-merges to `refactor/gpu_normalization`, and tags `northstar-p3`.

---

## Self-review record

- **Spec coverage vs north-star §3 P3:** step 1 (tag) → Task 1; step 2 (git mv ×10) → Task 2/1; step 3 (codemod + single-emitter aliases) → Tasks 1, 2, 4; step 4 (delete manifests/turbo/exports-checker/dist plumbing/gpu-checker dist half) → Tasks 2, 5; step 5 (tsconfig merge + app-paths deletion) → Task 2/7 (verified: flags already in base, types arrays need no merge); step 6 (package tests → root-tree projects) → Task 3; step 7 (workflows) → Task 2/11 (moved earlier than the sketch because the scripts those steps call die in Task 2's commit).
- **Deviations from the north-star sketch (all verified against the live tree):** (a) no tsconfig `types`/decorator-flag merge is needed — base already carries both; (b) `tests/unit/packages/**` is folded into the platform test tree (naming normalization, same commit as the other test moves); (c) coverage excludes are pruned, not retargeted — the four listed gpu files no longer exist under any path; (d) the gpu checker keeps permanent `@prismgb` tripwire tokens instead of deleting the legacy names.
- **Type consistency:** registry export names (`PLATFORM_MODULES`, `platformAliasMap`, `platformAliasEntries`, `platformTsconfigPaths`) are identical across Tasks 1, 2, 4 and the checker rewrite; vitest project names `platform-node`/`platform-dom` consistent between Task 3 and the guard test's collection sweep.
- **Placeholder scan:** none — every step carries exact commands, code, or per-line edits.
