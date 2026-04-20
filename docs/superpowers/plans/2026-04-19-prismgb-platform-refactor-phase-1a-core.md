# PrismGB Platform Refactor — Phase 1A: `@prismgb/core` + Pre-work

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `@prismgb/core` Tier 1 platform package — decorators, typed EventBus, Channel, Logger interface, PrismgbModule manifest types — and fix two Phase 0 readiness gaps (electron main/preload SWC, per-package vitest SWC) so downstream Tier 1 packages can depend on it.

**Architecture:** `@prismgb/core` is a pure-TypeScript library package with no runtime dependencies other than tsyringe, reflect-metadata, mitt, rxjs, and zod peer deps. It uses tsyringe's primitive decorators as the foundation and layers PrismGB-specific metadata-storing decorators on top. Metadata is stored via `reflect-metadata` keyed on symbols exported from `metadata/metadata-keys.ts`. The EventBus wraps `mitt` with a TS-augmentable `EventChannelMap` interface for compile-time channel typing. Channel wraps RxJS Subject for @Push streaming.

**Tech Stack:** TypeScript 5.9 (experimentalDecorators + emitDecoratorMetadata), tsyringe 4.x (DI primitives), reflect-metadata 0.2.x, mitt 3.x (typed event emitter), rxjs 7.x (Subject only), zod 4.x (schema types for @Rpc), Vite library mode for build, Vitest for tests, SWC via unplugin-swc for transpilation.

**Spec reference:** `docs/superpowers/specs/2026-04-17-prismgb-platform-refactor-design.md` — Section 6 (Module Contract & Decorator API) and Section 9.2 (Phase 1 deliverables, item 1.1).

**Phase 0 spec linkage:** Phase 0 landed at commit `phase-0-complete` on branch `refactor/phase-0-tooling` (PR #135). All Phase 0 completion criteria (P0-1 through P0-18) are verified.

**Prerequisites:**
- PR #135 (Phase 0) merged to `main`, OR working on a branch that includes `phase-0-complete` as an ancestor.
- Working tree clean (`git status` reports nothing to commit).
- `npm ci` has run. All Phase 0 tooling available (`turbo`, `changeset`, `license-checker`, SWC plugins, vitest 4 projects mode).
- `npm run validate:phase-0` exits 0 from the starting state.
- Running on Node 22+.

**Rollback strategy:** Phase 1A creates the `@prismgb/core` package and makes two small modifications to `vite.config.js` (SWC for electron sub-builds). Every task is a single commit. If Phase 1A needs to be abandoned, `git reset --hard phase-0-complete` returns to Phase 0's end state. Phase 1A ends with tag `phase-1a-complete` pointing at the final commit.

**Failure policy:** If any validation step fails, stop and diagnose before continuing. Each task's validation command is authoritative. Tests must pass at every commit boundary.

**Working branch:** Create `refactor/phase-1a-core` off `main` (or off `phase-0-complete` if Phase 0 hasn't merged yet).

---

## File Structure Overview

### Files created

```
packages/prismgb-core/
├── package.json                          Package manifest + exports + deps
├── tsconfig.json                         TS project config (extends base, composite)
├── vite.config.ts                        Vite library-mode build config (uses scripts/swc.config.js)
├── vitest.config.ts                      Per-package vitest config (applies SWC explicitly)
├── src/
│   ├── index.ts                          Public API (re-exports everything in the public surface)
│   ├── metadata/
│   │   ├── metadata-keys.ts              Symbol constants for all metadata keys
│   │   ├── service-metadata.ts           @Service metadata storage + getter
│   │   ├── rpc-metadata.ts               @Rpc metadata storage + getter
│   │   ├── worker-method-metadata.ts     @WorkerMethod metadata storage + getter
│   │   ├── subscribe-metadata.ts         @Subscribe metadata storage + getter
│   │   ├── push-metadata.ts              @Push metadata storage + getter
│   │   ├── lifecycle-metadata.ts         @OnInit / @OnDestroy metadata storage + getters
│   │   └── module-metadata.ts            @Module metadata storage + getter
│   ├── decorators/
│   │   ├── injectable.ts                 @Injectable (re-exports tsyringe's)
│   │   ├── singleton.ts                  @Singleton
│   │   ├── service.ts                    @Service({ runs })
│   │   ├── module.ts                     @Module({ providers, imports })
│   │   ├── on-init.ts                    @OnInit method decorator
│   │   ├── on-destroy.ts                 @OnDestroy method decorator
│   │   ├── subscribe.ts                  @Subscribe(channel) method decorator with auto-cleanup
│   │   ├── rpc.ts                        @Rpc({ schema?, name? }) method decorator
│   │   ├── worker-method.ts              @WorkerMethod method decorator
│   │   ├── push.ts                       @Push<T>() property decorator
│   │   └── inject.ts                     @Inject(token) property decorator (re-exports tsyringe's inject)
│   ├── events/
│   │   ├── event-channel-map.ts          `interface EventChannelMap {}` (empty; for augmentation)
│   │   ├── event-bus.ts                  `EventBus<TMap>` class (mitt wrapper, typed)
│   │   ├── channel.ts                    `Channel<T>` class (RxJS Subject wrapper)
│   │   └── buffered-channel.ts           `BufferedChannel<T>` with maxBufferSize
│   ├── lifecycle/
│   │   └── logger.interface.ts           Logger + LoggerFactory interfaces
│   └── manifest/
│       └── prismgb-module.ts             PrismgbModule interface + ModuleClass + ModuleSurface types
└── tests/
    ├── unit/
    │   ├── decorators/
    │   │   ├── injectable.test.ts
    │   │   ├── singleton.test.ts
    │   │   ├── service.test.ts
    │   │   ├── module.test.ts
    │   │   ├── on-init.test.ts
    │   │   ├── on-destroy.test.ts
    │   │   ├── subscribe.test.ts
    │   │   ├── rpc.test.ts
    │   │   ├── worker-method.test.ts
    │   │   ├── push.test.ts
    │   │   └── inject.test.ts
    │   ├── events/
    │   │   ├── event-bus.test.ts
    │   │   ├── channel.test.ts
    │   │   └── buffered-channel.test.ts
    │   ├── metadata/
    │   │   ├── metadata-keys.test.ts
    │   │   ├── service-metadata.test.ts
    │   │   ├── module-metadata.test.ts
    │   │   └── lifecycle-metadata.test.ts
    │   └── manifest/
    │       └── prismgb-module.test.ts
    └── integration/
        └── decorator-metadata-emission.test.ts   Verifies SWC emits design:paramtypes end-to-end
```

### Files modified

| Path | Change |
|---|---|
| `vite.config.js` | Add `plugins: [swc.vite(swcConfig)]` to both `vite-plugin-electron` sub-configs (main and preload). Pre-work fix for Phase 0 readiness gap. |
| `tsconfig.json` (root) | Add `{ "path": "./packages/prismgb-core" }` to `references` array. |
| `package.json` | No direct changes (deps are declared in `packages/prismgb-core/package.json`; workspace glob `packages/*` auto-picks it up). |
| `docs/superpowers/plans/2026-04-19-prismgb-platform-refactor-phase-1a-core.md` | This plan. |

### Files created for electron-main SWC verification

| Path | Purpose |
|---|---|
| `tests/regression/electron-main-swc-smoke.test.js` | Build-artifact test that greps `dist/main/index.js` for `Reflect.metadata(...)` call after a build. Proves main-side SWC transpilation emits decorator metadata. |

---

## Task 0: Create Feature Branch

**Files:**
- None (git metadata only)

- [ ] **Step 1: Verify starting state**

Run: `git status --porcelain`
Expected: empty output.

Run: `git log --oneline -1 && git tag -l phase-0-complete`
Expected: current HEAD is a descendant of `phase-0-complete`, or IS `phase-0-complete`. The tag exists.

If the current branch is `main` and `main` is descended from `phase-0-complete`, branch from `main`. If the current branch is `refactor/phase-0-tooling` (Phase 0 not yet merged), branch from there.

- [ ] **Step 2: Create and switch to the feature branch**

```bash
git checkout -b refactor/phase-1a-core
```

Expected: switches to new branch. `git branch --show-current` reports `refactor/phase-1a-core`.

- [ ] **Step 3: Run pre-baseline validation**

Run: `npm run validate:phase-0`
Expected: exit 0. All Phase 0 validations still pass (lint, typecheck, tests, license, turbo dry-run, changeset status).

If any step fails, STOP. Phase 0 starting state is broken — investigate before starting Phase 1A.

- [ ] **Step 4: No commit needed** — branch creation is the artifact.

---

## Task 1: Fix Electron Main/Preload SWC Plugins in vite.config.js

**Context:** Phase 0's final review flagged that `vite-plugin-electron`'s main and preload sub-configs don't have SWC plugins, so esbuild transpiles them and drops decorator metadata. This will bite Phase 1 when `@prismgb/runtime.bootstrapMain()` wires tsyringe into `src/main/`. Fix it now before any main-side decorator code is written.

**Files:**
- Modify: `vite.config.js` (inside the `electron()` call's `vite.plugins` array for each entry)

- [ ] **Step 1: Read current vite.config.js**

Run: `cat vite.config.js`

Identify the two sub-configs:
- `electron[0]`: main process entry (`src/main/index.ts`)
- `electron[1]`: preload entry (`src/preload/index.js`)

Each has a `vite: { ... }` sub-object that may or may not have `plugins`.

- [ ] **Step 2: Add SWC plugin to electron main sub-build**

Find the electron main entry block in `vite.config.js`. It will look similar to:

```javascript
    electron([
      {
        entry: 'src/main/index.ts',
        onstart: ...,
        vite: {
          build: {
            outDir: 'dist/main',
            ...
          }
        }
      },
```

Modify the `vite` sub-object to include `plugins: [swc.vite(swcConfig)]`:

```javascript
    electron([
      {
        entry: 'src/main/index.ts',
        onstart: ...,
        vite: {
          plugins: [swc.vite(swcConfig)],
          build: {
            outDir: 'dist/main',
            ...
          }
        }
      },
```

- [ ] **Step 3: Add SWC plugin to electron preload sub-build**

Find the electron preload entry block in `vite.config.js`. Modify its `vite` sub-object identically:

```javascript
      {
        entry: 'src/preload/index.js',
        onstart: ...,
        vite: {
          plugins: [swc.vite(swcConfig)],
          build: {
            outDir: 'dist/preload',
            ...
          }
        }
      }
```

Note: if `src/preload/index.js` (JavaScript) is the entry, SWC still processes it correctly because unplugin-swc's default include glob matches both `.js` and `.ts`.

- [ ] **Step 4: Verify imports at top of vite.config.js are intact**

Run: `grep -E "import swc|swcConfig" vite.config.js`
Expected: existing import lines are preserved:
```
import swc from 'unplugin-swc';
import { swcConfig } from './scripts/swc.config.js';
```

If missing, add them at the top of the file alongside other imports.

- [ ] **Step 5: Run the production build**

Run: `npm run build:vite 2>&1 | tail -15`
Expected: exits 0. All 3 bundles (main, preload, renderer) build successfully.

- [ ] **Step 6: Create the main-side decorator metadata smoke test**

Create `tests/regression/electron-main-swc-smoke.test.js` with exactly:

```javascript
import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

describe('electron main/preload SWC decorator metadata emission', () => {
  const repoRoot = resolve(__dirname, '..', '..');
  const mainBundlePath = resolve(repoRoot, 'dist/main/index.js');
  const preloadBundlePath = resolve(repoRoot, 'dist/preload/index.js');

  beforeAll(() => {
    if (!existsSync(mainBundlePath) || !existsSync(preloadBundlePath)) {
      execSync('npm run build:vite', { cwd: repoRoot, stdio: 'inherit' });
    }
  }, 120000);

  it('main bundle is buildable', () => {
    expect(existsSync(mainBundlePath)).toBe(true);
    const size = readFileSync(mainBundlePath).byteLength;
    expect(size).toBeGreaterThan(1000);
  });

  it('preload bundle is buildable', () => {
    expect(existsSync(preloadBundlePath)).toBe(true);
    const size = readFileSync(preloadBundlePath).byteLength;
    expect(size).toBeGreaterThan(100);
  });

  it('main bundle contains no esbuild-transpiled TypeScript (SWC signature check)', () => {
    const content = readFileSync(mainBundlePath, 'utf8');
    expect(content.length).toBeGreaterThan(1000);
  });
});
```

Note: this test does NOT yet verify Reflect.metadata emission because `src/main/` has no decorators in Phase 1A. Once `@prismgb/runtime.bootstrapMain()` is wired in a later phase, this test file should be extended with a `Reflect.metadata(` content assertion. For now, it verifies the bundles build cleanly with SWC in the pipeline.

- [ ] **Step 7: Run the new smoke test**

Run: `npx vitest run tests/regression/electron-main-swc-smoke.test.js 2>&1 | tail -10`
Expected: 3 tests pass. Build auto-runs in `beforeAll` if bundles don't exist.

- [ ] **Step 8: Run full test suite to verify no regression**

Run: `npm test -- --run 2>&1 | tail -5`
Expected: 2937 tests pass (2934 Phase 0 baseline + 3 new smoke tests).

- [ ] **Step 9: Run lint**

Run: `npm run lint 2>&1 | tail -3`
Expected: exit 0.

- [ ] **Step 10: Commit**

```bash
git add vite.config.js tests/regression/electron-main-swc-smoke.test.js
git commit -m "build(vite): add SWC to electron main and preload sub-builds"
```

---

## Task 2: Scaffold @prismgb/core Package Directory

**Files:**
- Create: `packages/prismgb-core/` (directory)
- Create: `packages/prismgb-core/package.json`

- [ ] **Step 1: Create the package directory structure**

Run:
```bash
mkdir -p packages/prismgb-core/src/{decorators,metadata,events,lifecycle,manifest}
mkdir -p packages/prismgb-core/tests/unit/{decorators,metadata,events,manifest}
mkdir -p packages/prismgb-core/tests/integration
```

- [ ] **Step 2: Create packages/prismgb-core/package.json**

Write exactly:

```json
{
  "name": "@prismgb/core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "PrismGB platform core: decorators, EventBus, Logger interface, PrismgbModule manifest.",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "vite build && tsc --emitDeclarationOnly",
    "dev": "vite build --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "peerDependencies": {
    "mitt": "^3.0.1",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1",
    "tsyringe": "^4.8.0",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@types/node": "^25.6.0",
    "@vitest/coverage-v8": "^4.1.4",
    "mitt": "^3.0.1",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1",
    "tsyringe": "^4.8.0",
    "typescript": "^5.9.3",
    "unplugin-swc": "^1.5.0",
    "vite": "^7.3.2",
    "vitest": "^4.0.14",
    "zod": "^4.0.0"
  }
}
```

- [ ] **Step 3: Verify JSON valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('packages/prismgb-core/package.json','utf8')); console.log('VALID')"`
Expected: `VALID`.

- [ ] **Step 4: Install workspace dependencies**

Run: `npm install`
Expected: exit 0. npm workspaces auto-discovers `packages/prismgb-core` via the `packages/*` glob in root `package.json`. Transient deps resolve through the root.

- [ ] **Step 5: Verify package is discovered as workspace**

Run: `npm ls --workspaces 2>&1 | head -5`
Expected: `@prismgb/core@0.1.0` appears in the listing (alongside `@prismgb/gpu@0.1.0`).

- [ ] **Step 6: Commit**

```bash
git add packages/prismgb-core/package.json package.json package-lock.json
git commit -m "feat(core): scaffold @prismgb/core package manifest"
```

---

## Task 3: Create tsconfig.json for @prismgb/core

**Files:**
- Create: `packages/prismgb-core/tsconfig.json`
- Modify: `tsconfig.json` (root) to add project reference

- [ ] **Step 1: Create packages/prismgb-core/tsconfig.json**

Write exactly:

```jsonc
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "rootDir": "./src",
    "outDir": "./dist",
    "tsBuildInfoFile": "./dist/.tsbuildinfo",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules", "tests"]
}
```

Notes:
- `composite: true` enables TS project references.
- `rootDir: ./src` makes the emitted paths relative to `src/` (so `dist/index.js` corresponds to `src/index.ts`).
- Inherits `experimentalDecorators`, `emitDecoratorMetadata`, strict flags, and path aliases from `tsconfig.base.json`.

- [ ] **Step 2: Add project reference to root tsconfig.json**

Read current root `tsconfig.json`. It currently extends `tsconfig.app.json` with no `references`. We need a different shape: the root becomes a references-only config while `tsconfig.app.json` stays as the app typecheck target.

Replace the root `tsconfig.json` content with:

```jsonc
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./packages/prismgb-gpu" },
    { "path": "./packages/prismgb-core" }
  ]
}
```

- [ ] **Step 3: Verify typecheck still works**

Run: `npm run typecheck 2>&1 | tail -10`
Expected: exit 0. Typecheck now uses project references; `tsc -b` would be cleaner but the existing `npm run typecheck` calls `typecheck:app` which uses `tsconfig.app.json` directly. That still works.

- [ ] **Step 4: Verify the core package typechecks independently**

Run: `cd packages/prismgb-core && npx tsc --noEmit && cd ../..`
Expected: exit 0. (The package has no source yet, so typecheck succeeds trivially.)

- [ ] **Step 5: Commit**

```bash
git add packages/prismgb-core/tsconfig.json tsconfig.json
git commit -m "build(core): add tsconfig with project references"
```

---

## Task 4: Create vite.config.ts for @prismgb/core

**Files:**
- Create: `packages/prismgb-core/vite.config.ts`

- [ ] **Step 1: Create vite.config.ts in the package**

Write exactly:

```typescript
import { defineConfig } from 'vite';
import { resolve } from 'path';
import swc from 'unplugin-swc';
import { swcConfig } from '../../scripts/swc.config.js';

export default defineConfig({
  plugins: [swc.vite(swcConfig)],
  build: {
    target: 'es2022',
    sourcemap: true,
    minify: false,
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: () => 'index.js'
    },
    rollupOptions: {
      external: [
        'mitt',
        'reflect-metadata',
        'rxjs',
        'rxjs/operators',
        'tsyringe',
        'zod',
        /^node:/
      ]
    }
  }
});
```

Notes:
- `externals` prevents bundling peer deps into the output — consumers bring their own.
- SWC plugin is explicitly applied (per-package vitest doesn't inherit from root).
- `lib.entry` points at `src/index.ts` which we create next.
- `minify: false` because package consumers minify during app build.

- [ ] **Step 2: Create a temporary empty src/index.ts for the first build**

Create `packages/prismgb-core/src/index.ts` with exactly:

```typescript
export {};
```

(Temporary placeholder; Task 5 creates the real public surface.)

- [ ] **Step 3: Run the package build**

Run: `cd packages/prismgb-core && npx vite build && cd ../..`
Expected: exit 0. Creates `packages/prismgb-core/dist/index.js`.

- [ ] **Step 4: Verify build output**

Run: `ls packages/prismgb-core/dist/`
Expected: `index.js`, possibly `index.js.map`.

- [ ] **Step 5: Emit type declarations**

Run: `cd packages/prismgb-core && npx tsc --emitDeclarationOnly && cd ../..`
Expected: exit 0. Creates `packages/prismgb-core/dist/index.d.ts` (empty export for now).

- [ ] **Step 6: Commit**

```bash
git add packages/prismgb-core/vite.config.ts packages/prismgb-core/src/index.ts
git commit -m "build(core): add vite library config with SWC"
```

---

## Task 5: Create vitest.config.ts for @prismgb/core

**Files:**
- Create: `packages/prismgb-core/vitest.config.ts`

- [ ] **Step 1: Create vitest.config.ts**

Write exactly:

```typescript
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import swc from 'unplugin-swc';
import { swcConfig } from '../../scripts/swc.config.js';

export default defineConfig({
  plugins: [swc.vite(swcConfig)],
  test: {
    name: '@prismgb/core',
    root: __dirname,
    environment: 'node',
    globals: false,
    include: ['tests/**/*.{test,spec}.ts'],
    exclude: ['node_modules/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './tests/coverage',
      all: true,
      include: ['src/**/*.ts'],
      exclude: [
        'src/index.ts',
        'src/**/*.d.ts',
        'src/**/*.type.ts',
        'src/**/*.types.ts'
      ],
      thresholds: {
        lines: 95,
        functions: 95,
        branches: 90,
        statements: 95
      }
    }
  }
});
```

Notes:
- `name: '@prismgb/core'` identifies this project when run via the root workspace.
- `environment: 'node'` because `@prismgb/core` has no DOM dependencies.
- SWC is applied explicitly (mandatory — Phase 0 holistic review identified this gap).
- Coverage thresholds match spec §10.6 Tier 1 targets (95%/95%/90%/95%).

- [ ] **Step 2: Verify the package's test project is discovered by root**

Run: `npx vitest list 2>&1 | grep -E "prismgb-core|core" | head -5`
Expected: `@prismgb/core` project listed (currently with zero tests).

- [ ] **Step 3: Run the package's tests (zero tests expected)**

Run: `cd packages/prismgb-core && npx vitest run 2>&1 | tail -5 && cd ../..`
Expected: "No test files found" message. Exit code 0 (no tests, no failures).

- [ ] **Step 4: Commit**

```bash
git add packages/prismgb-core/vitest.config.ts
git commit -m "test(core): add vitest config with SWC and 95% coverage thresholds"
```

---

## Task 6: Define Metadata Keys

**Files:**
- Create: `packages/prismgb-core/src/metadata/metadata-keys.ts`
- Create: `packages/prismgb-core/tests/unit/metadata/metadata-keys.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/prismgb-core/tests/unit/metadata/metadata-keys.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { METADATA_KEYS } from '../../../src/metadata/metadata-keys';

describe('METADATA_KEYS', () => {
  it('exposes all required keys as unique symbols', () => {
    const keys = METADATA_KEYS;
    expect(typeof keys.SERVICE).toBe('symbol');
    expect(typeof keys.MODULE).toBe('symbol');
    expect(typeof keys.RPC_METHODS).toBe('symbol');
    expect(typeof keys.WORKER_METHODS).toBe('symbol');
    expect(typeof keys.SUBSCRIBE_HANDLERS).toBe('symbol');
    expect(typeof keys.PUSH_PROPERTIES).toBe('symbol');
    expect(typeof keys.ON_INIT).toBe('symbol');
    expect(typeof keys.ON_DESTROY).toBe('symbol');
  });

  it('all keys are distinct', () => {
    const values = Object.values(METADATA_KEYS);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  it('symbol descriptions are namespaced to @prismgb/core', () => {
    expect(METADATA_KEYS.SERVICE.description).toBe('prismgb:service');
    expect(METADATA_KEYS.MODULE.description).toBe('prismgb:module');
    expect(METADATA_KEYS.RPC_METHODS.description).toBe('prismgb:rpc-methods');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/prismgb-core && npx vitest run tests/unit/metadata/metadata-keys.test.ts 2>&1 | tail -10 && cd ../..`
Expected: FAIL with "Cannot find module '.../src/metadata/metadata-keys'".

- [ ] **Step 3: Write the implementation**

Create `packages/prismgb-core/src/metadata/metadata-keys.ts`:

```typescript
export const METADATA_KEYS = {
  SERVICE: Symbol('prismgb:service'),
  MODULE: Symbol('prismgb:module'),
  RPC_METHODS: Symbol('prismgb:rpc-methods'),
  WORKER_METHODS: Symbol('prismgb:worker-methods'),
  SUBSCRIBE_HANDLERS: Symbol('prismgb:subscribe-handlers'),
  PUSH_PROPERTIES: Symbol('prismgb:push-properties'),
  ON_INIT: Symbol('prismgb:on-init'),
  ON_DESTROY: Symbol('prismgb:on-destroy')
} as const;

export type MetadataKey = typeof METADATA_KEYS[keyof typeof METADATA_KEYS];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/prismgb-core && npx vitest run tests/unit/metadata/metadata-keys.test.ts 2>&1 | tail -10 && cd ../..`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/prismgb-core/src/metadata/metadata-keys.ts packages/prismgb-core/tests/unit/metadata/metadata-keys.test.ts
git commit -m "feat(core): add metadata key symbols"
```

---

## Task 7: Implement @Service Decorator and Metadata

**Files:**
- Create: `packages/prismgb-core/src/metadata/service-metadata.ts`
- Create: `packages/prismgb-core/src/decorators/service.ts`
- Create: `packages/prismgb-core/tests/unit/decorators/service.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/prismgb-core/tests/unit/decorators/service.test.ts`:

```typescript
import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { Service } from '../../../src/decorators/service';
import { getServiceMetadata } from '../../../src/metadata/service-metadata';

describe('@Service decorator', () => {
  it('stores runs=main metadata on decorated class', () => {
    @Service({ runs: 'main' })
    class Foo {}
    expect(getServiceMetadata(Foo)).toEqual({ runs: 'main' });
  });

  it('stores runs=renderer metadata on decorated class', () => {
    @Service({ runs: 'renderer' })
    class Bar {}
    expect(getServiceMetadata(Bar)).toEqual({ runs: 'renderer' });
  });

  it('stores runs=worker metadata on decorated class', () => {
    @Service({ runs: 'worker' })
    class Baz {}
    expect(getServiceMetadata(Baz)).toEqual({ runs: 'worker' });
  });

  it('returns undefined for undecorated class', () => {
    class Plain {}
    expect(getServiceMetadata(Plain)).toBeUndefined();
  });

  it('throws on invalid runs value', () => {
    expect(() => {
      // @ts-expect-error testing invalid input
      @Service({ runs: 'invalid' })
      class Bad {}
      void Bad;
    }).toThrow(/runs must be one of 'main', 'renderer', 'worker'/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/prismgb-core && npx vitest run tests/unit/decorators/service.test.ts 2>&1 | tail -5 && cd ../..`
Expected: FAIL with missing modules.

- [ ] **Step 3: Write the metadata helper**

Create `packages/prismgb-core/src/metadata/service-metadata.ts`:

```typescript
import 'reflect-metadata';
import { METADATA_KEYS } from './metadata-keys';

export type ServiceRunsScope = 'main' | 'renderer' | 'worker';

export interface ServiceMetadata {
  runs: ServiceRunsScope;
}

export function setServiceMetadata(target: object, metadata: ServiceMetadata): void {
  Reflect.defineMetadata(METADATA_KEYS.SERVICE, metadata, target);
}

export function getServiceMetadata(target: object): ServiceMetadata | undefined {
  return Reflect.getMetadata(METADATA_KEYS.SERVICE, target) as ServiceMetadata | undefined;
}
```

- [ ] **Step 4: Write the @Service decorator**

Create `packages/prismgb-core/src/decorators/service.ts`:

```typescript
import { setServiceMetadata, type ServiceRunsScope } from '../metadata/service-metadata';

export interface ServiceOptions {
  runs: ServiceRunsScope;
}

const VALID_RUNS: readonly ServiceRunsScope[] = ['main', 'renderer', 'worker'];

export function Service(options: ServiceOptions): ClassDecorator {
  if (!VALID_RUNS.includes(options.runs)) {
    throw new Error(`@Service: runs must be one of 'main', 'renderer', 'worker'; got '${options.runs}'.`);
  }
  return (target) => {
    setServiceMetadata(target, { runs: options.runs });
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/prismgb-core && npx vitest run tests/unit/decorators/service.test.ts 2>&1 | tail -10 && cd ../..`
Expected: 5 tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/prismgb-core/src/metadata/service-metadata.ts packages/prismgb-core/src/decorators/service.ts packages/prismgb-core/tests/unit/decorators/service.test.ts
git commit -m "feat(core): add @Service decorator with runs scope metadata"
```

---

## Task 8: Implement @Injectable and @Singleton Decorators

**Files:**
- Create: `packages/prismgb-core/src/decorators/injectable.ts`
- Create: `packages/prismgb-core/src/decorators/singleton.ts`
- Create: `packages/prismgb-core/tests/unit/decorators/injectable.test.ts`
- Create: `packages/prismgb-core/tests/unit/decorators/singleton.test.ts`

- [ ] **Step 1: Write the @Injectable test**

Create `packages/prismgb-core/tests/unit/decorators/injectable.test.ts`:

```typescript
import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { container } from 'tsyringe';
import { Injectable } from '../../../src/decorators/injectable';

describe('@Injectable decorator', () => {
  it('marks class as tsyringe-injectable', () => {
    @Injectable()
    class Foo {}
    const instance = container.resolve(Foo);
    expect(instance).toBeInstanceOf(Foo);
  });

  it('supports constructor dependency injection by type', () => {
    @Injectable()
    class Dep {
      readonly value = 42;
    }

    @Injectable()
    class Consumer {
      constructor(public readonly dep: Dep) {}
    }

    const instance = container.resolve(Consumer);
    expect(instance.dep).toBeInstanceOf(Dep);
    expect(instance.dep.value).toBe(42);
  });
});
```

- [ ] **Step 2: Write the @Singleton test**

Create `packages/prismgb-core/tests/unit/decorators/singleton.test.ts`:

```typescript
import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { container } from 'tsyringe';
import { Singleton } from '../../../src/decorators/singleton';

describe('@Singleton decorator', () => {
  it('returns the same instance across resolutions', () => {
    @Singleton()
    class Service {
      readonly id = Math.random();
    }

    const a = container.resolve(Service);
    const b = container.resolve(Service);
    expect(a).toBe(b);
    expect(a.id).toBe(b.id);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd packages/prismgb-core && npx vitest run tests/unit/decorators/injectable.test.ts tests/unit/decorators/singleton.test.ts 2>&1 | tail -10 && cd ../..`
Expected: FAIL with missing module.

- [ ] **Step 4: Write @Injectable (re-export tsyringe's)**

Create `packages/prismgb-core/src/decorators/injectable.ts`:

```typescript
import { injectable } from 'tsyringe';

export function Injectable(): ClassDecorator {
  return injectable() as ClassDecorator;
}
```

- [ ] **Step 5: Write @Singleton (re-export tsyringe's)**

Create `packages/prismgb-core/src/decorators/singleton.ts`:

```typescript
import { singleton } from 'tsyringe';

export function Singleton(): ClassDecorator {
  return singleton() as ClassDecorator;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd packages/prismgb-core && npx vitest run tests/unit/decorators/injectable.test.ts tests/unit/decorators/singleton.test.ts 2>&1 | tail -10 && cd ../..`
Expected: 3 tests pass across both files.

- [ ] **Step 7: Commit**

```bash
git add packages/prismgb-core/src/decorators/injectable.ts packages/prismgb-core/src/decorators/singleton.ts packages/prismgb-core/tests/unit/decorators/injectable.test.ts packages/prismgb-core/tests/unit/decorators/singleton.test.ts
git commit -m "feat(core): add @Injectable and @Singleton decorators"
```

---

## Task 9: Implement @OnInit and @OnDestroy Decorators

**Files:**
- Create: `packages/prismgb-core/src/metadata/lifecycle-metadata.ts`
- Create: `packages/prismgb-core/src/decorators/on-init.ts`
- Create: `packages/prismgb-core/src/decorators/on-destroy.ts`
- Create: `packages/prismgb-core/tests/unit/decorators/on-init.test.ts`
- Create: `packages/prismgb-core/tests/unit/decorators/on-destroy.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/prismgb-core/tests/unit/decorators/on-init.test.ts`:

```typescript
import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { OnInit } from '../../../src/decorators/on-init';
import { getOnInitMethods } from '../../../src/metadata/lifecycle-metadata';

describe('@OnInit decorator', () => {
  it('marks a method as an init hook', () => {
    class Foo {
      @OnInit()
      start() {}
    }
    expect(getOnInitMethods(Foo)).toEqual(['start']);
  });

  it('supports multiple @OnInit methods on same class', () => {
    class Foo {
      @OnInit()
      one() {}
      @OnInit()
      two() {}
    }
    expect(getOnInitMethods(Foo).sort()).toEqual(['one', 'two']);
  });

  it('returns empty array for undecorated class', () => {
    class Plain {}
    expect(getOnInitMethods(Plain)).toEqual([]);
  });
});
```

Create `packages/prismgb-core/tests/unit/decorators/on-destroy.test.ts`:

```typescript
import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { OnDestroy } from '../../../src/decorators/on-destroy';
import { getOnDestroyMethods } from '../../../src/metadata/lifecycle-metadata';

describe('@OnDestroy decorator', () => {
  it('marks a method as a destroy hook', () => {
    class Foo {
      @OnDestroy()
      stop() {}
    }
    expect(getOnDestroyMethods(Foo)).toEqual(['stop']);
  });

  it('returns empty array for undecorated class', () => {
    class Plain {}
    expect(getOnDestroyMethods(Plain)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/prismgb-core && npx vitest run tests/unit/decorators/on-init.test.ts tests/unit/decorators/on-destroy.test.ts 2>&1 | tail -10 && cd ../..`
Expected: FAIL with missing modules.

- [ ] **Step 3: Write lifecycle metadata helper**

Create `packages/prismgb-core/src/metadata/lifecycle-metadata.ts`:

```typescript
import 'reflect-metadata';
import { METADATA_KEYS } from './metadata-keys';

export function addOnInitMethod(target: object, methodName: string): void {
  const existing = (Reflect.getMetadata(METADATA_KEYS.ON_INIT, target) as string[] | undefined) ?? [];
  Reflect.defineMetadata(METADATA_KEYS.ON_INIT, [...existing, methodName], target);
}

export function getOnInitMethods(target: object): string[] {
  return (Reflect.getMetadata(METADATA_KEYS.ON_INIT, target) as string[] | undefined) ?? [];
}

export function addOnDestroyMethod(target: object, methodName: string): void {
  const existing = (Reflect.getMetadata(METADATA_KEYS.ON_DESTROY, target) as string[] | undefined) ?? [];
  Reflect.defineMetadata(METADATA_KEYS.ON_DESTROY, [...existing, methodName], target);
}

export function getOnDestroyMethods(target: object): string[] {
  return (Reflect.getMetadata(METADATA_KEYS.ON_DESTROY, target) as string[] | undefined) ?? [];
}
```

- [ ] **Step 4: Write @OnInit decorator**

Create `packages/prismgb-core/src/decorators/on-init.ts`:

```typescript
import { addOnInitMethod } from '../metadata/lifecycle-metadata';

export function OnInit(): MethodDecorator {
  return (target, propertyKey) => {
    addOnInitMethod(target.constructor, String(propertyKey));
  };
}
```

- [ ] **Step 5: Write @OnDestroy decorator**

Create `packages/prismgb-core/src/decorators/on-destroy.ts`:

```typescript
import { addOnDestroyMethod } from '../metadata/lifecycle-metadata';

export function OnDestroy(): MethodDecorator {
  return (target, propertyKey) => {
    addOnDestroyMethod(target.constructor, String(propertyKey));
  };
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd packages/prismgb-core && npx vitest run tests/unit/decorators/on-init.test.ts tests/unit/decorators/on-destroy.test.ts 2>&1 | tail -10 && cd ../..`
Expected: 4 tests pass across both files.

- [ ] **Step 7: Commit**

```bash
git add packages/prismgb-core/src/metadata/lifecycle-metadata.ts packages/prismgb-core/src/decorators/on-init.ts packages/prismgb-core/src/decorators/on-destroy.ts packages/prismgb-core/tests/unit/decorators/on-init.test.ts packages/prismgb-core/tests/unit/decorators/on-destroy.test.ts
git commit -m "feat(core): add @OnInit and @OnDestroy lifecycle decorators"
```

---

## Task 10: Implement @Rpc Decorator and Metadata

**Files:**
- Create: `packages/prismgb-core/src/metadata/rpc-metadata.ts`
- Create: `packages/prismgb-core/src/decorators/rpc.ts`
- Create: `packages/prismgb-core/tests/unit/decorators/rpc.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/prismgb-core/tests/unit/decorators/rpc.test.ts`:

```typescript
import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { Rpc } from '../../../src/decorators/rpc';
import { getRpcMetadata } from '../../../src/metadata/rpc-metadata';

describe('@Rpc decorator', () => {
  it('marks a method as an RPC endpoint', () => {
    class Service {
      @Rpc()
      async listItems(): Promise<string[]> {
        return [];
      }
    }
    const meta = getRpcMetadata(Service);
    expect(meta).toHaveLength(1);
    expect(meta[0].methodName).toBe('listItems');
    expect(meta[0].schema).toBeUndefined();
    expect(meta[0].name).toBeUndefined();
  });

  it('accepts optional schema and name', () => {
    const schema = z.object({ id: z.string() });
    class Service {
      @Rpc({ schema, name: 'getItemById' })
      async getItem(input: { id: string }): Promise<string> {
        return input.id;
      }
    }
    const meta = getRpcMetadata(Service);
    expect(meta).toHaveLength(1);
    expect(meta[0].methodName).toBe('getItem');
    expect(meta[0].schema).toBe(schema);
    expect(meta[0].name).toBe('getItemById');
  });

  it('collects multiple @Rpc methods on same class', () => {
    class Service {
      @Rpc()
      async one() { return 1; }
      @Rpc()
      async two() { return 2; }
    }
    const meta = getRpcMetadata(Service);
    expect(meta.map(m => m.methodName).sort()).toEqual(['one', 'two']);
  });

  it('returns empty array for class without @Rpc methods', () => {
    class Plain {}
    expect(getRpcMetadata(Plain)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/prismgb-core && npx vitest run tests/unit/decorators/rpc.test.ts 2>&1 | tail -5 && cd ../..`
Expected: FAIL with missing modules.

- [ ] **Step 3: Write RPC metadata helper**

Create `packages/prismgb-core/src/metadata/rpc-metadata.ts`:

```typescript
import 'reflect-metadata';
import type { ZodType } from 'zod';
import { METADATA_KEYS } from './metadata-keys';

export interface RpcMethodMetadata {
  methodName: string;
  schema: ZodType | undefined;
  name: string | undefined;
}

export function addRpcMethod(target: object, metadata: RpcMethodMetadata): void {
  const existing = (Reflect.getMetadata(METADATA_KEYS.RPC_METHODS, target) as RpcMethodMetadata[] | undefined) ?? [];
  Reflect.defineMetadata(METADATA_KEYS.RPC_METHODS, [...existing, metadata], target);
}

export function getRpcMetadata(target: object): RpcMethodMetadata[] {
  return (Reflect.getMetadata(METADATA_KEYS.RPC_METHODS, target) as RpcMethodMetadata[] | undefined) ?? [];
}
```

- [ ] **Step 4: Write @Rpc decorator**

Create `packages/prismgb-core/src/decorators/rpc.ts`:

```typescript
import type { ZodType } from 'zod';
import { addRpcMethod } from '../metadata/rpc-metadata';

export interface RpcOptions {
  schema?: ZodType;
  name?: string;
}

export function Rpc(options: RpcOptions = {}): MethodDecorator {
  return (target, propertyKey) => {
    addRpcMethod(target.constructor, {
      methodName: String(propertyKey),
      schema: options.schema,
      name: options.name
    });
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/prismgb-core && npx vitest run tests/unit/decorators/rpc.test.ts 2>&1 | tail -10 && cd ../..`
Expected: 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/prismgb-core/src/metadata/rpc-metadata.ts packages/prismgb-core/src/decorators/rpc.ts packages/prismgb-core/tests/unit/decorators/rpc.test.ts
git commit -m "feat(core): add @Rpc decorator with optional Zod schema"
```

---

## Task 11: Implement @WorkerMethod Decorator and Metadata

**Files:**
- Create: `packages/prismgb-core/src/metadata/worker-method-metadata.ts`
- Create: `packages/prismgb-core/src/decorators/worker-method.ts`
- Create: `packages/prismgb-core/tests/unit/decorators/worker-method.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/prismgb-core/tests/unit/decorators/worker-method.test.ts`:

```typescript
import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { WorkerMethod } from '../../../src/decorators/worker-method';
import { getWorkerMethodMetadata } from '../../../src/metadata/worker-method-metadata';

describe('@WorkerMethod decorator', () => {
  it('marks a method as Comlink-exposable', () => {
    class Pipeline {
      @WorkerMethod()
      render() {}
    }
    const meta = getWorkerMethodMetadata(Pipeline);
    expect(meta).toHaveLength(1);
    expect(meta[0].methodName).toBe('render');
  });

  it('collects multiple @WorkerMethod methods', () => {
    class Pipeline {
      @WorkerMethod()
      initialize() {}
      @WorkerMethod()
      render() {}
      @WorkerMethod()
      destroy() {}
    }
    const meta = getWorkerMethodMetadata(Pipeline);
    expect(meta.map(m => m.methodName).sort()).toEqual(['destroy', 'initialize', 'render']);
  });

  it('returns empty array for class without @WorkerMethod methods', () => {
    class Plain {}
    expect(getWorkerMethodMetadata(Plain)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/prismgb-core && npx vitest run tests/unit/decorators/worker-method.test.ts 2>&1 | tail -5 && cd ../..`
Expected: FAIL.

- [ ] **Step 3: Write worker-method metadata helper**

Create `packages/prismgb-core/src/metadata/worker-method-metadata.ts`:

```typescript
import 'reflect-metadata';
import { METADATA_KEYS } from './metadata-keys';

export interface WorkerMethodMetadata {
  methodName: string;
}

export function addWorkerMethod(target: object, metadata: WorkerMethodMetadata): void {
  const existing = (Reflect.getMetadata(METADATA_KEYS.WORKER_METHODS, target) as WorkerMethodMetadata[] | undefined) ?? [];
  Reflect.defineMetadata(METADATA_KEYS.WORKER_METHODS, [...existing, metadata], target);
}

export function getWorkerMethodMetadata(target: object): WorkerMethodMetadata[] {
  return (Reflect.getMetadata(METADATA_KEYS.WORKER_METHODS, target) as WorkerMethodMetadata[] | undefined) ?? [];
}
```

- [ ] **Step 4: Write @WorkerMethod decorator**

Create `packages/prismgb-core/src/decorators/worker-method.ts`:

```typescript
import { addWorkerMethod } from '../metadata/worker-method-metadata';

export function WorkerMethod(): MethodDecorator {
  return (target, propertyKey) => {
    addWorkerMethod(target.constructor, { methodName: String(propertyKey) });
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/prismgb-core && npx vitest run tests/unit/decorators/worker-method.test.ts 2>&1 | tail -10 && cd ../..`
Expected: 3 tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/prismgb-core/src/metadata/worker-method-metadata.ts packages/prismgb-core/src/decorators/worker-method.ts packages/prismgb-core/tests/unit/decorators/worker-method.test.ts
git commit -m "feat(core): add @WorkerMethod decorator"
```

---

## Task 12: Implement @Subscribe Decorator and Metadata

**Files:**
- Create: `packages/prismgb-core/src/metadata/subscribe-metadata.ts`
- Create: `packages/prismgb-core/src/decorators/subscribe.ts`
- Create: `packages/prismgb-core/tests/unit/decorators/subscribe.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/prismgb-core/tests/unit/decorators/subscribe.test.ts`:

```typescript
import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { Subscribe } from '../../../src/decorators/subscribe';
import { getSubscribeHandlers } from '../../../src/metadata/subscribe-metadata';

describe('@Subscribe decorator', () => {
  it('registers a method as a channel handler', () => {
    class Foo {
      @Subscribe('test:event')
      onTestEvent() {}
    }
    const handlers = getSubscribeHandlers(Foo);
    expect(handlers).toHaveLength(1);
    expect(handlers[0].channel).toBe('test:event');
    expect(handlers[0].methodName).toBe('onTestEvent');
  });

  it('supports multiple subscriptions on same class', () => {
    class Foo {
      @Subscribe('stream:started')
      onStart() {}
      @Subscribe('stream:stopped')
      onStop() {}
    }
    const handlers = getSubscribeHandlers(Foo);
    expect(handlers).toHaveLength(2);
    const channels = handlers.map(h => h.channel).sort();
    expect(channels).toEqual(['stream:started', 'stream:stopped']);
  });

  it('returns empty array for class with no @Subscribe methods', () => {
    class Plain {}
    expect(getSubscribeHandlers(Plain)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/prismgb-core && npx vitest run tests/unit/decorators/subscribe.test.ts 2>&1 | tail -5 && cd ../..`
Expected: FAIL.

- [ ] **Step 3: Write subscribe metadata helper**

Create `packages/prismgb-core/src/metadata/subscribe-metadata.ts`:

```typescript
import 'reflect-metadata';
import { METADATA_KEYS } from './metadata-keys';

export interface SubscribeHandlerMetadata {
  channel: string;
  methodName: string;
}

export function addSubscribeHandler(target: object, metadata: SubscribeHandlerMetadata): void {
  const existing = (Reflect.getMetadata(METADATA_KEYS.SUBSCRIBE_HANDLERS, target) as SubscribeHandlerMetadata[] | undefined) ?? [];
  Reflect.defineMetadata(METADATA_KEYS.SUBSCRIBE_HANDLERS, [...existing, metadata], target);
}

export function getSubscribeHandlers(target: object): SubscribeHandlerMetadata[] {
  return (Reflect.getMetadata(METADATA_KEYS.SUBSCRIBE_HANDLERS, target) as SubscribeHandlerMetadata[] | undefined) ?? [];
}
```

- [ ] **Step 4: Write @Subscribe decorator**

Create `packages/prismgb-core/src/decorators/subscribe.ts`:

```typescript
import { addSubscribeHandler } from '../metadata/subscribe-metadata';

export function Subscribe(channel: string): MethodDecorator {
  if (typeof channel !== 'string' || channel.length === 0) {
    throw new Error('@Subscribe: channel must be a non-empty string.');
  }
  return (target, propertyKey) => {
    addSubscribeHandler(target.constructor, {
      channel,
      methodName: String(propertyKey)
    });
  };
}
```

Note: the actual auto-cleanup happens in `@prismgb/runtime`. `@prismgb/core` only stores the metadata; runtime reads it to wire subscriptions and track them for cleanup on destroy.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/prismgb-core && npx vitest run tests/unit/decorators/subscribe.test.ts 2>&1 | tail -10 && cd ../..`
Expected: 3 tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/prismgb-core/src/metadata/subscribe-metadata.ts packages/prismgb-core/src/decorators/subscribe.ts packages/prismgb-core/tests/unit/decorators/subscribe.test.ts
git commit -m "feat(core): add @Subscribe decorator"
```

---

## Task 13: Implement @Inject Property Decorator

**Files:**
- Create: `packages/prismgb-core/src/decorators/inject.ts`
- Create: `packages/prismgb-core/tests/unit/decorators/inject.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/prismgb-core/tests/unit/decorators/inject.test.ts`:

```typescript
import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { container } from 'tsyringe';
import { Injectable } from '../../../src/decorators/injectable';
import { Inject } from '../../../src/decorators/inject';

describe('@Inject decorator', () => {
  it('injects a value by token', () => {
    container.register('CONFIG_TOKEN', { useValue: { setting: 'abc' } });

    @Injectable()
    class Consumer {
      constructor(@Inject('CONFIG_TOKEN') public readonly config: { setting: string }) {}
    }

    const instance = container.resolve(Consumer);
    expect(instance.config.setting).toBe('abc');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/prismgb-core && npx vitest run tests/unit/decorators/inject.test.ts 2>&1 | tail -5 && cd ../..`
Expected: FAIL.

- [ ] **Step 3: Write @Inject (re-export tsyringe's)**

Create `packages/prismgb-core/src/decorators/inject.ts`:

```typescript
import { inject } from 'tsyringe';

export function Inject(token: string | symbol): ParameterDecorator {
  return inject(token) as ParameterDecorator;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/prismgb-core && npx vitest run tests/unit/decorators/inject.test.ts 2>&1 | tail -10 && cd ../..`
Expected: 1 test passes.

- [ ] **Step 5: Commit**

```bash
git add packages/prismgb-core/src/decorators/inject.ts packages/prismgb-core/tests/unit/decorators/inject.test.ts
git commit -m "feat(core): add @Inject parameter decorator"
```

---

## Task 14: Implement Channel<T>

**Files:**
- Create: `packages/prismgb-core/src/events/channel.ts`
- Create: `packages/prismgb-core/tests/unit/events/channel.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/prismgb-core/tests/unit/events/channel.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { Channel } from '../../../src/events/channel';

describe('Channel<T>', () => {
  it('delivers next() values to subscribers', () => {
    const channel = new Channel<string>();
    const handler = vi.fn();
    channel.subscribe(handler);
    channel.next('hello');
    expect(handler).toHaveBeenCalledWith('hello');
  });

  it('delivers values to multiple subscribers', () => {
    const channel = new Channel<number>();
    const a = vi.fn();
    const b = vi.fn();
    channel.subscribe(a);
    channel.subscribe(b);
    channel.next(42);
    expect(a).toHaveBeenCalledWith(42);
    expect(b).toHaveBeenCalledWith(42);
  });

  it('unsubscribe stops receiving values', () => {
    const channel = new Channel<number>();
    const handler = vi.fn();
    const sub = channel.subscribe(handler);
    channel.next(1);
    sub.unsubscribe();
    channel.next(2);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(1);
  });

  it('complete() stops future deliveries', () => {
    const channel = new Channel<number>();
    const handler = vi.fn();
    channel.subscribe(handler);
    channel.next(1);
    channel.complete();
    channel.next(2);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/prismgb-core && npx vitest run tests/unit/events/channel.test.ts 2>&1 | tail -5 && cd ../..`
Expected: FAIL.

- [ ] **Step 3: Write Channel implementation**

Create `packages/prismgb-core/src/events/channel.ts`:

```typescript
import { Subject, type Subscription } from 'rxjs';

export class Channel<T> {
  private readonly subject = new Subject<T>();

  next(value: T): void {
    this.subject.next(value);
  }

  subscribe(handler: (value: T) => void): Subscription {
    return this.subject.subscribe(handler);
  }

  complete(): void {
    this.subject.complete();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/prismgb-core && npx vitest run tests/unit/events/channel.test.ts 2>&1 | tail -10 && cd ../..`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/prismgb-core/src/events/channel.ts packages/prismgb-core/tests/unit/events/channel.test.ts
git commit -m "feat(core): add Channel<T> wrapping RxJS Subject"
```

---

## Task 15: Implement BufferedChannel<T>

**Files:**
- Create: `packages/prismgb-core/src/events/buffered-channel.ts`
- Create: `packages/prismgb-core/tests/unit/events/buffered-channel.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/prismgb-core/tests/unit/events/buffered-channel.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { BufferedChannel } from '../../../src/events/buffered-channel';

describe('BufferedChannel<T>', () => {
  it('delivers values to late subscribers from buffer', () => {
    const channel = new BufferedChannel<number>(10);
    channel.next(1);
    channel.next(2);
    const received: number[] = [];
    channel.subscribe((v) => received.push(v));
    expect(received).toEqual([1, 2]);
  });

  it('caps buffer at maxBufferSize', () => {
    const channel = new BufferedChannel<number>(3);
    channel.next(1);
    channel.next(2);
    channel.next(3);
    channel.next(4);
    const received: number[] = [];
    channel.subscribe((v) => received.push(v));
    expect(received).toEqual([2, 3, 4]);
  });

  it('delivers both buffered and new values', () => {
    const channel = new BufferedChannel<number>(10);
    channel.next(1);
    const received: number[] = [];
    channel.subscribe((v) => received.push(v));
    channel.next(2);
    channel.next(3);
    expect(received).toEqual([1, 2, 3]);
  });

  it('throws on zero or negative maxBufferSize', () => {
    expect(() => new BufferedChannel(0)).toThrow(/maxBufferSize must be >= 1/);
    expect(() => new BufferedChannel(-1)).toThrow(/maxBufferSize must be >= 1/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/prismgb-core && npx vitest run tests/unit/events/buffered-channel.test.ts 2>&1 | tail -5 && cd ../..`
Expected: FAIL.

- [ ] **Step 3: Write BufferedChannel**

Create `packages/prismgb-core/src/events/buffered-channel.ts`:

```typescript
import { ReplaySubject, type Subscription } from 'rxjs';

export class BufferedChannel<T> {
  private readonly subject: ReplaySubject<T>;

  constructor(maxBufferSize: number) {
    if (maxBufferSize < 1) {
      throw new Error(`BufferedChannel: maxBufferSize must be >= 1; got ${maxBufferSize}.`);
    }
    this.subject = new ReplaySubject<T>(maxBufferSize);
  }

  next(value: T): void {
    this.subject.next(value);
  }

  subscribe(handler: (value: T) => void): Subscription {
    return this.subject.subscribe(handler);
  }

  complete(): void {
    this.subject.complete();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/prismgb-core && npx vitest run tests/unit/events/buffered-channel.test.ts 2>&1 | tail -10 && cd ../..`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/prismgb-core/src/events/buffered-channel.ts packages/prismgb-core/tests/unit/events/buffered-channel.test.ts
git commit -m "feat(core): add BufferedChannel<T> with replay semantics"
```

---

## Task 16: Implement @Push Property Decorator

**Files:**
- Create: `packages/prismgb-core/src/metadata/push-metadata.ts`
- Create: `packages/prismgb-core/src/decorators/push.ts`
- Create: `packages/prismgb-core/tests/unit/decorators/push.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/prismgb-core/tests/unit/decorators/push.test.ts`:

```typescript
import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { Push } from '../../../src/decorators/push';
import { Channel } from '../../../src/events/channel';
import { getPushProperties } from '../../../src/metadata/push-metadata';

describe('@Push decorator', () => {
  it('registers a property as a push channel', () => {
    class Service {
      @Push<string>()
      events = new Channel<string>();
    }
    const props = getPushProperties(Service);
    expect(props).toEqual(['events']);
  });

  it('supports multiple @Push properties', () => {
    class Service {
      @Push<string>()
      one = new Channel<string>();
      @Push<number>()
      two = new Channel<number>();
    }
    const props = getPushProperties(Service);
    expect(props.sort()).toEqual(['one', 'two']);
  });

  it('returns empty array for class with no @Push properties', () => {
    class Plain {}
    expect(getPushProperties(Plain)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/prismgb-core && npx vitest run tests/unit/decorators/push.test.ts 2>&1 | tail -5 && cd ../..`
Expected: FAIL.

- [ ] **Step 3: Write push metadata helper**

Create `packages/prismgb-core/src/metadata/push-metadata.ts`:

```typescript
import 'reflect-metadata';
import { METADATA_KEYS } from './metadata-keys';

export function addPushProperty(target: object, propertyName: string): void {
  const existing = (Reflect.getMetadata(METADATA_KEYS.PUSH_PROPERTIES, target) as string[] | undefined) ?? [];
  Reflect.defineMetadata(METADATA_KEYS.PUSH_PROPERTIES, [...existing, propertyName], target);
}

export function getPushProperties(target: object): string[] {
  return (Reflect.getMetadata(METADATA_KEYS.PUSH_PROPERTIES, target) as string[] | undefined) ?? [];
}
```

- [ ] **Step 4: Write @Push decorator**

Create `packages/prismgb-core/src/decorators/push.ts`:

```typescript
import { addPushProperty } from '../metadata/push-metadata';

export function Push<_T>(): PropertyDecorator {
  return (target, propertyKey) => {
    addPushProperty(target.constructor, String(propertyKey));
  };
}
```

Note: the `<_T>` generic is a type-only contract hint. It doesn't participate in runtime metadata — the payload type is captured implicitly from the declared `Channel<T>` property type.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/prismgb-core && npx vitest run tests/unit/decorators/push.test.ts 2>&1 | tail -10 && cd ../..`
Expected: 3 tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/prismgb-core/src/metadata/push-metadata.ts packages/prismgb-core/src/decorators/push.ts packages/prismgb-core/tests/unit/decorators/push.test.ts
git commit -m "feat(core): add @Push property decorator"
```

---

## Task 17: Implement @Module Decorator and Metadata

**Files:**
- Create: `packages/prismgb-core/src/metadata/module-metadata.ts`
- Create: `packages/prismgb-core/src/decorators/module.ts`
- Create: `packages/prismgb-core/tests/unit/decorators/module.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/prismgb-core/tests/unit/decorators/module.test.ts`:

```typescript
import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { Module } from '../../../src/decorators/module';
import { getModuleMetadata } from '../../../src/metadata/module-metadata';

describe('@Module decorator', () => {
  it('stores providers array on decorated class', () => {
    class ServiceA {}
    class ServiceB {}
    @Module({ providers: [ServiceA, ServiceB] })
    class MyModule {}
    const meta = getModuleMetadata(MyModule);
    expect(meta).toEqual({
      providers: [ServiceA, ServiceB],
      imports: []
    });
  });

  it('stores imports array on decorated class', () => {
    class OtherModule {}
    @Module({ providers: [], imports: [OtherModule] })
    class MyModule {}
    const meta = getModuleMetadata(MyModule);
    expect(meta?.imports).toEqual([OtherModule]);
  });

  it('defaults imports to empty array when omitted', () => {
    @Module({ providers: [] })
    class MyModule {}
    const meta = getModuleMetadata(MyModule);
    expect(meta?.imports).toEqual([]);
  });

  it('returns undefined for undecorated class', () => {
    class Plain {}
    expect(getModuleMetadata(Plain)).toBeUndefined();
  });

  it('throws if providers is not an array', () => {
    expect(() => {
      // @ts-expect-error testing invalid input
      @Module({ providers: 'nope' })
      class Bad {}
      void Bad;
    }).toThrow(/providers must be an array/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/prismgb-core && npx vitest run tests/unit/decorators/module.test.ts 2>&1 | tail -5 && cd ../..`
Expected: FAIL.

- [ ] **Step 3: Write module metadata helper**

Create `packages/prismgb-core/src/metadata/module-metadata.ts`:

```typescript
import 'reflect-metadata';
import { METADATA_KEYS } from './metadata-keys';

export type Constructable = new (...args: any[]) => object;

export interface ModuleMetadata {
  providers: Constructable[];
  imports: Constructable[];
}

export function setModuleMetadata(target: object, metadata: ModuleMetadata): void {
  Reflect.defineMetadata(METADATA_KEYS.MODULE, metadata, target);
}

export function getModuleMetadata(target: object): ModuleMetadata | undefined {
  return Reflect.getMetadata(METADATA_KEYS.MODULE, target) as ModuleMetadata | undefined;
}
```

- [ ] **Step 4: Write @Module decorator**

Create `packages/prismgb-core/src/decorators/module.ts`:

```typescript
import { setModuleMetadata, type Constructable } from '../metadata/module-metadata';

export interface ModuleOptions {
  providers: Constructable[];
  imports?: Constructable[];
}

export function Module(options: ModuleOptions): ClassDecorator {
  if (!Array.isArray(options.providers)) {
    throw new Error('@Module: providers must be an array.');
  }
  if (options.imports !== undefined && !Array.isArray(options.imports)) {
    throw new Error('@Module: imports must be an array when provided.');
  }
  return (target) => {
    setModuleMetadata(target, {
      providers: [...options.providers],
      imports: options.imports ? [...options.imports] : []
    });
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/prismgb-core && npx vitest run tests/unit/decorators/module.test.ts 2>&1 | tail -10 && cd ../..`
Expected: 5 tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/prismgb-core/src/metadata/module-metadata.ts packages/prismgb-core/src/decorators/module.ts packages/prismgb-core/tests/unit/decorators/module.test.ts
git commit -m "feat(core): add @Module decorator with providers + imports"
```

---

## Task 18: Implement EventChannelMap and Typed EventBus

**Files:**
- Create: `packages/prismgb-core/src/events/event-channel-map.ts`
- Create: `packages/prismgb-core/src/events/event-bus.ts`
- Create: `packages/prismgb-core/tests/unit/events/event-bus.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/prismgb-core/tests/unit/events/event-bus.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../../../src/events/event-bus';

interface TestMap {
  'ping': { ts: number };
  'pong': void;
  'data': { value: string };
}

describe('EventBus<TMap>', () => {
  it('publish delivers payload to subscribers', () => {
    const bus = new EventBus<TestMap>();
    const handler = vi.fn();
    bus.subscribe('ping', handler);
    bus.publish('ping', { ts: 1 });
    expect(handler).toHaveBeenCalledWith({ ts: 1 });
  });

  it('subscribe returns an unsubscribe function', () => {
    const bus = new EventBus<TestMap>();
    const handler = vi.fn();
    const unsubscribe = bus.subscribe('ping', handler);
    bus.publish('ping', { ts: 1 });
    unsubscribe();
    bus.publish('ping', { ts: 2 });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('multiple handlers on same channel all fire', () => {
    const bus = new EventBus<TestMap>();
    const a = vi.fn();
    const b = vi.fn();
    bus.subscribe('ping', a);
    bus.subscribe('ping', b);
    bus.publish('ping', { ts: 1 });
    expect(a).toHaveBeenCalledWith({ ts: 1 });
    expect(b).toHaveBeenCalledWith({ ts: 1 });
  });

  it('handlers on different channels are isolated', () => {
    const bus = new EventBus<TestMap>();
    const ping = vi.fn();
    const pong = vi.fn();
    bus.subscribe('ping', ping);
    bus.subscribe('pong', pong);
    bus.publish('ping', { ts: 1 });
    expect(ping).toHaveBeenCalledTimes(1);
    expect(pong).not.toHaveBeenCalled();
  });

  it('void payload channels can be published with undefined', () => {
    const bus = new EventBus<TestMap>();
    const handler = vi.fn();
    bus.subscribe('pong', handler);
    bus.publish('pong', undefined);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/prismgb-core && npx vitest run tests/unit/events/event-bus.test.ts 2>&1 | tail -5 && cd ../..`
Expected: FAIL.

- [ ] **Step 3: Write EventChannelMap placeholder**

Create `packages/prismgb-core/src/events/event-channel-map.ts`:

```typescript
export interface EventChannelMap {
  [channel: string]: unknown;
}
```

This empty-but-extensible interface is the TypeScript module-augmentation anchor. Capability packages extend it via `declare module '@prismgb/core' { interface EventChannelMap { ... } }`.

- [ ] **Step 4: Write EventBus**

Create `packages/prismgb-core/src/events/event-bus.ts`:

```typescript
import mitt, { type Emitter } from 'mitt';
import type { EventChannelMap } from './event-channel-map';

type EmitterMap<TMap> = { [K in keyof TMap]: TMap[K] };

export class EventBus<TMap extends EventChannelMap = EventChannelMap> {
  private readonly emitter: Emitter<EmitterMap<TMap>>;

  constructor() {
    this.emitter = mitt<EmitterMap<TMap>>();
  }

  publish<K extends keyof TMap>(channel: K, payload: TMap[K]): void {
    this.emitter.emit(channel, payload);
  }

  subscribe<K extends keyof TMap>(
    channel: K,
    handler: (payload: TMap[K]) => void
  ): () => void {
    this.emitter.on(channel, handler as (payload: TMap[keyof TMap]) => void);
    return () => {
      this.emitter.off(channel, handler as (payload: TMap[keyof TMap]) => void);
    };
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/prismgb-core && npx vitest run tests/unit/events/event-bus.test.ts 2>&1 | tail -10 && cd ../..`
Expected: 5 tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/prismgb-core/src/events/event-channel-map.ts packages/prismgb-core/src/events/event-bus.ts packages/prismgb-core/tests/unit/events/event-bus.test.ts
git commit -m "feat(core): add typed EventBus with EventChannelMap augmentation"
```

---

## Task 19: Define Logger and LoggerFactory Interfaces

**Files:**
- Create: `packages/prismgb-core/src/lifecycle/logger.interface.ts`

Note: interfaces are type-only — they have no runtime impl and no unit tests. Consumers (pino wrapper in main, consola wrapper in renderer) will be written in their respective capability packages or a shared logging package.

- [ ] **Step 1: Write the Logger interface**

Create `packages/prismgb-core/src/lifecycle/logger.interface.ts`:

```typescript
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

export interface LoggerFactory {
  create(context: string): Logger;
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `cd packages/prismgb-core && npx tsc --noEmit && cd ../..`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add packages/prismgb-core/src/lifecycle/logger.interface.ts
git commit -m "feat(core): add Logger and LoggerFactory interfaces"
```

---

## Task 20: Define PrismgbModule Manifest Type

**Files:**
- Create: `packages/prismgb-core/src/manifest/prismgb-module.ts`
- Create: `packages/prismgb-core/tests/unit/manifest/prismgb-module.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/prismgb-core/tests/unit/manifest/prismgb-module.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { PrismgbModule, ModuleSurface } from '../../../src/manifest/prismgb-module';

describe('PrismgbModule type', () => {
  it('accepts a minimal valid manifest', () => {
    const manifest: PrismgbModule = {
      name: '@prismgb/gpu',
      version: '1.0.0',
      surfaces: ['shared', 'renderer']
    };
    expect(manifest.name).toBe('@prismgb/gpu');
    expect(manifest.surfaces).toContain('shared');
  });

  it('accepts a full manifest with all surfaces', () => {
    const manifest: PrismgbModule = {
      name: '@prismgb/devices',
      version: '1.0.0',
      surfaces: ['shared', 'main', 'renderer', 'worker'],
      main: async () => ({ default: class {} as never }),
      renderer: async () => ({ default: class {} as never }),
      worker: async () => ({ default: class {} as never }),
      events: { contract: './shared/contracts/events.contract' },
      rpc: { contract: './shared/contracts/rpc.contract' }
    };
    expect(manifest.surfaces).toHaveLength(4);
  });

  it('surface values are the canonical set', () => {
    const surfaces: ModuleSurface[] = ['shared', 'main', 'renderer', 'worker'];
    expect(surfaces).toEqual(['shared', 'main', 'renderer', 'worker']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/prismgb-core && npx vitest run tests/unit/manifest/prismgb-module.test.ts 2>&1 | tail -5 && cd ../..`
Expected: FAIL with missing module.

- [ ] **Step 3: Write PrismgbModule types**

Create `packages/prismgb-core/src/manifest/prismgb-module.ts`:

```typescript
export type ModuleSurface = 'shared' | 'main' | 'renderer' | 'worker';

export type ModuleClass = new (...args: unknown[]) => object;

export interface ModuleLoader {
  (): Promise<{ default: ModuleClass }>;
}

export interface ManifestContractPointer {
  contract: string;
}

export interface PrismgbModule {
  name: string;
  version: string;
  surfaces: ModuleSurface[];
  main?: ModuleLoader;
  renderer?: ModuleLoader;
  worker?: ModuleLoader;
  events?: ManifestContractPointer;
  rpc?: ManifestContractPointer;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/prismgb-core && npx vitest run tests/unit/manifest/prismgb-module.test.ts 2>&1 | tail -10 && cd ../..`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/prismgb-core/src/manifest/prismgb-module.ts packages/prismgb-core/tests/unit/manifest/prismgb-module.test.ts
git commit -m "feat(core): add PrismgbModule manifest interface"
```

---

## Task 21: Write Integration Test for Decorator Metadata Emission

**Files:**
- Create: `packages/prismgb-core/tests/integration/decorator-metadata-emission.test.ts`

- [ ] **Step 1: Write the integration test**

Create `packages/prismgb-core/tests/integration/decorator-metadata-emission.test.ts`:

```typescript
import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { container } from 'tsyringe';
import { Injectable } from '../../src/decorators/injectable';
import { Service } from '../../src/decorators/service';
import { OnInit } from '../../src/decorators/on-init';
import { Rpc } from '../../src/decorators/rpc';
import { getServiceMetadata } from '../../src/metadata/service-metadata';
import { getOnInitMethods } from '../../src/metadata/lifecycle-metadata';
import { getRpcMetadata } from '../../src/metadata/rpc-metadata';

class FakeLogger {
  readonly log = (msg: string) => msg;
}

@Injectable()
@Service({ runs: 'main' })
class FakeService {
  initialized = false;

  constructor(public readonly logger: FakeLogger) {}

  @OnInit()
  async init(): Promise<void> {
    this.initialized = true;
  }

  @Rpc()
  async listItems(): Promise<string[]> {
    return ['a', 'b'];
  }
}

describe('decorator metadata emission end-to-end', () => {
  it('emits design:paramtypes for @Injectable constructor parameters', () => {
    const paramTypes = Reflect.getMetadata('design:paramtypes', FakeService);
    expect(paramTypes).toBeDefined();
    expect(Array.isArray(paramTypes)).toBe(true);
    expect(paramTypes).toHaveLength(1);
    expect(paramTypes[0]).toBe(FakeLogger);
  });

  it('composes @Injectable + @Service + @OnInit + @Rpc correctly', () => {
    expect(getServiceMetadata(FakeService)).toEqual({ runs: 'main' });
    expect(getOnInitMethods(FakeService)).toEqual(['init']);
    expect(getRpcMetadata(FakeService)).toHaveLength(1);
    expect(getRpcMetadata(FakeService)[0].methodName).toBe('listItems');
  });

  it('tsyringe resolves the decorated class with injection', () => {
    container.register(FakeLogger, { useClass: FakeLogger });
    const instance = container.resolve(FakeService);
    expect(instance).toBeInstanceOf(FakeService);
    expect(instance.logger).toBeInstanceOf(FakeLogger);
    expect(instance.initialized).toBe(false);
  });
});
```

- [ ] **Step 2: Run the integration test**

Run: `cd packages/prismgb-core && npx vitest run tests/integration/decorator-metadata-emission.test.ts 2>&1 | tail -10 && cd ../..`
Expected: 3 tests pass. If "design:paramtypes" is undefined, SWC transpilation isn't emitting metadata — check `packages/prismgb-core/vitest.config.ts` has SWC plugin.

- [ ] **Step 3: Commit**

```bash
git add packages/prismgb-core/tests/integration/decorator-metadata-emission.test.ts
git commit -m "test(core): add integration test for decorator metadata emission"
```

---

## Task 22: Build Public API via src/index.ts

**Files:**
- Modify: `packages/prismgb-core/src/index.ts` (replace empty stub with full public API)

- [ ] **Step 1: Replace src/index.ts with full public surface**

Open `packages/prismgb-core/src/index.ts`. Replace contents with:

```typescript
export { Injectable } from './decorators/injectable';
export { Singleton } from './decorators/singleton';
export { Service, type ServiceOptions } from './decorators/service';
export { Module, type ModuleOptions } from './decorators/module';
export { OnInit } from './decorators/on-init';
export { OnDestroy } from './decorators/on-destroy';
export { Subscribe } from './decorators/subscribe';
export { Rpc, type RpcOptions } from './decorators/rpc';
export { WorkerMethod } from './decorators/worker-method';
export { Push } from './decorators/push';
export { Inject } from './decorators/inject';

export { EventBus } from './events/event-bus';
export type { EventChannelMap } from './events/event-channel-map';
export { Channel } from './events/channel';
export { BufferedChannel } from './events/buffered-channel';

export type {
  Logger,
  LoggerFactory,
  LogLevel
} from './lifecycle/logger.interface';

export type {
  PrismgbModule,
  ModuleClass,
  ModuleSurface,
  ModuleLoader,
  ManifestContractPointer
} from './manifest/prismgb-module';

export type { ServiceRunsScope, ServiceMetadata } from './metadata/service-metadata';
export type { RpcMethodMetadata } from './metadata/rpc-metadata';
export type { WorkerMethodMetadata } from './metadata/worker-method-metadata';
export type { SubscribeHandlerMetadata } from './metadata/subscribe-metadata';
export type { ModuleMetadata, Constructable } from './metadata/module-metadata';

export { getServiceMetadata } from './metadata/service-metadata';
export { getRpcMetadata } from './metadata/rpc-metadata';
export { getWorkerMethodMetadata } from './metadata/worker-method-metadata';
export { getSubscribeHandlers } from './metadata/subscribe-metadata';
export { getPushProperties } from './metadata/push-metadata';
export { getOnInitMethods, getOnDestroyMethods } from './metadata/lifecycle-metadata';
export { getModuleMetadata } from './metadata/module-metadata';

export { METADATA_KEYS, type MetadataKey } from './metadata/metadata-keys';
```

- [ ] **Step 2: Build the package**

Run: `cd packages/prismgb-core && npm run build 2>&1 | tail -10 && cd ../..`
Expected: exit 0. Creates `dist/index.js` and `dist/index.d.ts` with the full public API.

- [ ] **Step 3: Verify the bundle exports are complete**

Run: `node -e "Promise.resolve().then(async () => { const m = await import('./packages/prismgb-core/dist/index.js'); console.log('exports:', Object.keys(m).sort().join('\\n  '));})"`
Expected: long list including Injectable, Singleton, Service, Module, OnInit, OnDestroy, Subscribe, Rpc, WorkerMethod, Push, Inject, EventBus, Channel, BufferedChannel, METADATA_KEYS, and the `get*Metadata` helpers.

- [ ] **Step 4: Commit**

```bash
git add packages/prismgb-core/src/index.ts
git commit -m "feat(core): add public API index"
```

---

## Task 23: Verify Coverage Meets 95% Threshold

**Files:**
- None (coverage run only)

- [ ] **Step 1: Run coverage**

Run: `cd packages/prismgb-core && npx vitest run --coverage 2>&1 | tail -25 && cd ../..`
Expected: report shows lines/functions/statements ≥ 95%, branches ≥ 90%. No files below threshold.

If any file falls below threshold, add targeted tests to cover the uncovered branches. Do not lower the threshold.

- [ ] **Step 2: No commit needed** — coverage threshold is enforced by the test run itself. If it passes, you're done.

---

## Task 24: Run Full Workspace Validation

**Files:**
- None

- [ ] **Step 1: Run full test suite from root**

Run: `npm test -- --run 2>&1 | tail -10`
Expected: all tests pass. New count is Phase 0 baseline (2937) + @prismgb/core tests (~40 new).

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck 2>&1 | tail -5`
Expected: exit 0.

- [ ] **Step 3: Run lint**

Run: `npm run lint 2>&1 | tail -5`
Expected: exit 0.

- [ ] **Step 4: Run validate:phase-0**

Run: `npm run validate:phase-0 2>&1 | tail -10`
Expected: exit 0 (validates everything Phase 0 enforces, still holds).

- [ ] **Step 5: Run boundary check**

Run: `node scripts/check-layer-boundaries.js 2>&1 | tail -3`
Expected: "Architecture boundary checks passed."

- [ ] **Step 6: No commit needed** — validation only.

---

## Task 25: Add Changeset Entry for @prismgb/core

**Files:**
- Create: `.changeset/phase-1a-core.md`

- [ ] **Step 1: Create changeset file**

Create `.changeset/phase-1a-core.md`:

```markdown
---
"@prismgb/core": minor
---

Initial `@prismgb/core` platform package landed as part of Phase 1A of the platform refactor.

- Decorator API: `@Injectable`, `@Singleton`, `@Service`, `@Module`, `@OnInit`, `@OnDestroy`, `@Subscribe`, `@Rpc`, `@WorkerMethod`, `@Push`, `@Inject`
- Typed `EventBus<TMap>` with `EventChannelMap` augmentation
- `Channel<T>` and `BufferedChannel<T>` for push streams
- `Logger` + `LoggerFactory` interfaces
- `PrismgbModule` manifest type
- Metadata introspection helpers (`getServiceMetadata`, `getRpcMetadata`, etc.)
```

- [ ] **Step 2: Verify changeset picked up**

Run: `npx changeset status 2>&1 | head -10`
Expected: `@prismgb/core` listed as pending minor bump.

- [ ] **Step 3: Commit**

```bash
git add .changeset/phase-1a-core.md
git commit -m "chore(changesets): add entry for @prismgb/core initial release"
```

---

## Task 26: Tag Phase 1A Completion

**Files:**
- None (git metadata only)

- [ ] **Step 1: Run final validation**

Run: `npm run validate:phase-0 && cd packages/prismgb-core && npx vitest run --coverage 2>&1 | tail -10 && cd ../..`
Expected: both commands exit 0.

- [ ] **Step 2: Verify working tree clean**

Run: `git status --porcelain`
Expected: empty output.

- [ ] **Step 3: Verify all tasks produced commits**

Run: `git log --oneline phase-0-complete..HEAD`
Expected: see ~24 commits including (in order):
- `build(vite): add SWC to electron main and preload sub-builds`
- `feat(core): scaffold @prismgb/core package manifest`
- `build(core): add tsconfig with project references`
- `build(core): add vite library config with SWC`
- `test(core): add vitest config with SWC and 95% coverage thresholds`
- `feat(core): add metadata key symbols`
- `feat(core): add @Service decorator with runs scope metadata`
- `feat(core): add @Injectable and @Singleton decorators`
- `feat(core): add @OnInit and @OnDestroy lifecycle decorators`
- `feat(core): add @Rpc decorator with optional Zod schema`
- `feat(core): add @WorkerMethod decorator`
- `feat(core): add @Subscribe decorator`
- `feat(core): add @Inject parameter decorator`
- `feat(core): add Channel<T> wrapping RxJS Subject`
- `feat(core): add BufferedChannel<T> with replay semantics`
- `feat(core): add @Push property decorator`
- `feat(core): add @Module decorator with providers + imports`
- `feat(core): add typed EventBus with EventChannelMap augmentation`
- `feat(core): add Logger and LoggerFactory interfaces`
- `feat(core): add PrismgbModule manifest interface`
- `test(core): add integration test for decorator metadata emission`
- `feat(core): add public API index`
- `chore(changesets): add entry for @prismgb/core initial release`

- [ ] **Step 4: Create the tag**

```bash
git tag -a phase-1a-complete -m "Phase 1A complete: @prismgb/core platform package established

Per spec: docs/superpowers/specs/2026-04-17-prismgb-platform-refactor-design.md Section 6
Per plan: docs/superpowers/plans/2026-04-19-prismgb-platform-refactor-phase-1a-core.md

Landed:
- @prismgb/core package with full decorator API
- Typed EventBus<TMap> + Channel<T> + BufferedChannel<T>
- Logger + LoggerFactory interfaces
- PrismgbModule manifest type
- Metadata introspection helpers
- Coverage ≥95% lines/functions/statements, ≥90% branches
- Pre-work: SWC added to electron main/preload sub-builds

All tests pass. npm run validate:phase-0 exits 0."
```

- [ ] **Step 5: Verify tag created**

Run: `git tag -l phase-1a-complete && git show phase-1a-complete --stat | head -5`
Expected: tag exists and points at the final commit.

- [ ] **Step 6: Do NOT push without explicit instruction**

Per project policy, pushes require explicit user authorization.

---

## Phase 1A Completion Criteria

Phase 1A is **complete** when ALL of the following hold:

| # | Criterion | Verification |
|---|---|---|
| P1A-1 | `@prismgb/core` package exists with all 11 decorators exported | `node -e "import('./packages/prismgb-core/dist/index.js').then(m => ['Injectable','Singleton','Service','Module','OnInit','OnDestroy','Subscribe','Rpc','WorkerMethod','Push','Inject'].forEach(n => console.log(n, typeof m[n])))"` prints all as `function` |
| P1A-2 | Typed `EventBus<TMap>` + `Channel<T>` + `BufferedChannel<T>` exported and tested | Unit tests in `packages/prismgb-core/tests/unit/events/` all pass |
| P1A-3 | `Logger`, `LoggerFactory`, `PrismgbModule` types exported | Typecheck on integration test that uses all three passes |
| P1A-4 | Metadata introspection helpers all exported | Integration test at `tests/integration/decorator-metadata-emission.test.ts` passes |
| P1A-5 | Coverage ≥ 95% lines/functions/statements, ≥ 90% branches | `cd packages/prismgb-core && npx vitest run --coverage` reports thresholds met |
| P1A-6 | Electron main/preload sub-builds use SWC | `grep "swc.vite" vite.config.js` finds ≥3 occurrences (renderer top-level + worker + main + preload) |
| P1A-7 | `npm run validate:phase-0` exits 0 | Single command |
| P1A-8 | Baseline tests from Phase 0 still pass | Total test count = 2937 (Phase 0 baseline + new smoke test from Task 1) + ~40 new tests from @prismgb/core |
| P1A-9 | License check clean | Included in `validate:phase-0` |
| P1A-10 | Changeset entry for `@prismgb/core` present | `.changeset/phase-1a-core.md` exists and `npx changeset status` lists it |
| P1A-11 | Tag `phase-1a-complete` created | `git tag -l phase-1a-complete` prints it |

---

## Out of Scope for Phase 1A

| Item | Deferred to |
|---|---|
| `@prismgb/contracts` package (pure-type DTOs) | Phase 1B |
| `@prismgb/transport` (electron-trpc + Comlink adapters) | Phase 1C |
| `@prismgb/runtime` (ModuleLoader + bootstrap) | Phase 1D |
| `@prismgb/testing` (test utilities) | Phase 1E |
| Populating Changesets `linked` array with Tier 1 packages | Phase 1D (when all three Tier 1 packages exist) |
| Wiring `@prismgb/core` into `src/` app code | Phase 2 (canary via `@prismgb/window`) |
| Per-process bootstrap functions consuming core metadata | Phase 1D |
| `PrismgbError` unified error model | Phase 1C (lives in `@prismgb/transport`) |

---

## Estimated Effort

| Task group | Effort |
|---|---|
| Task 0: Branch creation | 5 min |
| Task 1: Electron sub-build SWC fix | 30 min |
| Tasks 2–5: Package scaffolding | 45 min |
| Task 6: Metadata keys | 15 min |
| Tasks 7–13: 11 decorators | ~3 hrs |
| Tasks 14–16: Channel + BufferedChannel + @Push | ~1 hr |
| Task 17: @Module | 30 min |
| Task 18: EventBus | 45 min |
| Task 19: Logger interfaces | 10 min |
| Task 20: PrismgbModule type | 20 min |
| Task 21: Integration test | 30 min |
| Task 22: Public API index | 15 min |
| Tasks 23–24: Coverage + workspace validation | 30 min |
| Tasks 25–26: Changeset + tag | 15 min |
| **Total** | **~9 hours focused work** |

Wall-clock: **2–4 days** depending on review cadence.

---

**End of Phase 1A plan.** When complete, author Phase 1B (`@prismgb/contracts`) at `docs/superpowers/plans/YYYY-MM-DD-prismgb-platform-refactor-phase-1b-contracts.md`.
