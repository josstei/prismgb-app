# PrismGB Platform Refactor — Phase 0: Tooling Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install every new dependency, delete empty scaffolded packages, and create every tooling config file the rest of the refactor depends on, with zero app behavior change.

**Architecture:** Purely additive tooling changes. New deps are installed but no source code imports them yet. Configuration files (`turbo.json`, `vitest.config.ts`, `.changeset/config.json`, `.github/workflows/license-check.yml`, etc.) are created and validated but do not alter existing build/test/lint outputs. Existing app code, tests, and CI jobs continue to work exactly as before.

**Tech Stack:** Node 22, npm workspaces, Vite 7, Vitest 4, TypeScript 5.9, Electron 28, Turborepo, Changesets, license-checker, eslint-plugin-import.

**Spec reference:** `docs/superpowers/specs/2026-04-17-prismgb-platform-refactor-design.md` — Section 9.1 describes Phase 0 deliverables.

**Prerequisites:**
- Working tree is clean (`git status` reports nothing to commit).
- On branch `main` or a fresh feature branch off main.
- Node 22+ installed. `node --version` reports v22.x or higher.
- `npm ci` has been run recently; `node_modules/` exists.
- Spec approved and committed.

**Rollback strategy:** This phase makes no app code changes. Every task is a single commit; `git revert <commit>` restores the previous state. Phase 0 ends with a tagged commit `phase-0-complete` for clean rollback to the pre-refactor state.

**Failure policy:** If any validation step fails, stop and diagnose before continuing. Do not proceed past a failing task. Each task's validation command is authoritative — "tests pass locally" means running the exact command shown.

---

## File Structure Overview

Files created by this phase:

| Path | Responsibility |
|---|---|
| `turbo.json` | Turborepo task pipeline configuration (build/test/lint/typecheck). |
| `vitest.config.ts` | Vitest projects config (Vitest 4 API); replaces `vitest.config.js`, preserves behavior. |
| `.changeset/config.json` | Changesets versioning config (Tier 1 linked, others independent, all private). |
| `.changeset/README.md` | Standard Changesets readme. |
| `.github/workflows/license-check.yml` | CI workflow failing on GPL-family license ingress. |
| `scripts/check-layer-boundaries.js` | Extended with package-level rules (inert until packages exist). |
| `docs/superpowers/plans/2026-04-17-prismgb-platform-refactor-phase-0-tooling.md` | This plan. |

Files modified by this phase:

| Path | Change |
|---|---|
| `package.json` | `dependencies` gain 11 entries; `devDependencies` gain 5 entries; scripts unchanged for now. |
| `package-lock.json` | Auto-regenerated. |
| `tsconfig.base.json` | Add `experimentalDecorators` + `emitDecoratorMetadata` (additive, no existing code affected). |
| `eslint.config.js` | Add `eslint-plugin-import` with `import/no-restricted-paths` rule for package boundary enforcement (inert until packages exist). |
| `CLAUDE.md` (project) | Add Tooling Foundation section documenting new deps and configs. |

Files removed by this phase (empty scaffolding, never in workspaces, never imported):

```
packages/prismgb-chroma/
packages/prismgb-core/
packages/prismgb-devices/
packages/prismgb-di/
packages/prismgb-ipc/
packages/prismgb-shader-compiler/
packages/prismgb-shader-presets/
packages/prismgb-stream-source/
```

Kept untouched:
- `packages/prismgb-gpu/` (active package, unchanged in Phase 0).
- `src/` (no app code changes).
- `tests/` (test behavior preserved).
- All existing workflows, scripts except the extended boundary checker.

---

## Task 0: Baseline Snapshot

Capture the pre-refactor metrics so completion of Phase 0 can be verified against known-good state.

**Files:**
- Create: `artifacts/phase-0-baseline.json`

- [ ] **Step 1: Verify working tree is clean**

Run: `git status --porcelain`
Expected: empty output. If not empty, stop and commit or stash before continuing.

- [ ] **Step 2: Verify baseline test suite passes**

Run: `npm test -- --run`
Expected: all tests pass, exit code 0. Note the test count and duration for Step 6.

- [ ] **Step 3: Verify baseline lint passes**

Run: `npm run lint`
Expected: no errors, exit code 0.

- [ ] **Step 4: Verify baseline typecheck passes**

Run: `npm run typecheck`
Expected: no errors, exit code 0.

- [ ] **Step 5: Create artifacts directory if missing**

Run: `mkdir -p artifacts`
Expected: directory exists. `ls artifacts/` succeeds.

- [ ] **Step 6: Capture baseline metrics to JSON**

Run the following script exactly as shown to generate `artifacts/phase-0-baseline.json`:

```bash
SHA=$(git rev-parse HEAD)
BRANCH=$(git rev-parse --abbrev-ref HEAD)
CAPTURED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
SRC_TOTAL=$(find src -type f \( -name '*.ts' -o -name '*.js' \) -print0 | xargs -0 wc -l | tail -1 | awk '{print $1}')
SRC_TS=$(find src -name '*.ts' | wc -l | tr -d ' ')
SRC_JS=$(find src -name '*.js' | wc -l | tr -d ' ')

cat > artifacts/phase-0-baseline.json <<JSON
{
  "capturedAt": "${CAPTURED_AT}",
  "gitSha": "${SHA}",
  "branch": "${BRANCH}",
  "loc": {
    "srcTotal": ${SRC_TOTAL},
    "srcTypescriptFiles": ${SRC_TS},
    "srcJavascriptFiles": ${SRC_JS}
  },
  "packages": {
    "scaffoldedEmpty": [
      "prismgb-chroma",
      "prismgb-core",
      "prismgb-devices",
      "prismgb-di",
      "prismgb-ipc",
      "prismgb-shader-compiler",
      "prismgb-shader-presets",
      "prismgb-stream-source"
    ],
    "active": ["prismgb-gpu"]
  },
  "baselineValidation": {
    "testsPassedInStep2": true,
    "lintPassedInStep3": true,
    "typecheckPassedInStep4": true
  }
}
JSON

cat artifacts/phase-0-baseline.json
```

Expected: file created, contents printed. `srcTypescriptFiles` should be around 168 and `srcJavascriptFiles` around 71 based on the pre-refactor measurement.

- [ ] **Step 7: Commit baseline**

`artifacts/` is in `.gitignore` (generated build outputs are excluded). The baseline JSON is a permanent historical record — commit it with `-f` to force-stage despite the ignore rule.

```bash
git add -f artifacts/phase-0-baseline.json
git commit -m "chore(phase-0): capture baseline metrics before refactor"
```

---

## Task 1: Install New Production Dependencies

Add the 11 runtime dependencies the refactor requires. No source code imports them yet; this task verifies install resolves cleanly and doesn't conflict with existing deps.

**Files:**
- Modify: `package.json` (dependencies block)
- Modify: `package-lock.json` (auto-regenerated)

- [ ] **Step 1: Add production dependency entries to package.json**

Open `package.json`. Locate the `"dependencies"` block. Add the 11 new entries in alphabetical order alongside existing entries. The final `"dependencies"` block should be:

```json
  "dependencies": {
    "@prismgb/gpu": "*",
    "@trpc/client": "^11.0.0",
    "@trpc/server": "^11.0.0",
    "awilix": "^12.1.0",
    "comlink": "^4.4.0",
    "consola": "^3.3.0",
    "electron-trpc": "^0.7.0",
    "electron-updater": "^6.8.3",
    "eventemitter3": "^5.0.4",
    "ffmpeg-static": "^5.2.0",
    "ffprobe-static": "^3.1.0",
    "joi": "^18.1.2",
    "mitt": "^3.0.1",
    "pino": "^9.5.0",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1",
    "tsyringe": "^4.8.0",
    "usb-detection": "^4.14.2",
    "winston": "^3.19.0",
    "zod": "^4.0.0"
  },
```

Note: old deps (`awilix`, `eventemitter3`, `joi`, `winston`) stay during migration. They will be removed in Phase 6.

- [ ] **Step 2: Run npm install to resolve the new deps**

Run: `npm install`
Expected: exits 0. Output includes "added N packages" where N is ~50+ (transitive deps from tsyringe, tRPC, pino, etc.). No peer-dep warnings for the new packages.

If any new package reports a peer dep conflict, resolve by aligning versions (e.g., pin `@trpc/client` and `@trpc/server` to the exact same minor version). Do not proceed until install is clean.

- [ ] **Step 3: Verify package-lock.json was updated**

Run: `git diff package-lock.json | head -30`
Expected: diff shows additions for the new packages and their transitive deps.

- [ ] **Step 4: Run existing tests to confirm no regression**

Run: `npm test -- --run`
Expected: all tests pass. Installing unused deps cannot break tests; this validates the install was clean.

- [ ] **Step 5: Run existing lint to confirm no regression**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Verify new deps are reachable**

Run: `node -e "import('tsyringe').then(m => console.log('tsyringe:', typeof m.container))"`
Expected: prints `tsyringe: object`.

Run: `node -e "import('mitt').then(m => console.log('mitt:', typeof m.default))"`
Expected: prints `mitt: function`.

Run: `node -e "import('zod').then(m => console.log('zod:', typeof m.z))"`
Expected: prints `zod: object`.

If any of these fail, the install is incomplete; re-run `npm install` and investigate.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add platform foundation runtime dependencies"
```

---

## Task 2: Install New Dev Dependencies

Add the 5 dev dependencies the tooling layer requires.

**Files:**
- Modify: `package.json` (devDependencies block)
- Modify: `package-lock.json`

- [ ] **Step 1: Add dev dependency entries to package.json**

Open `package.json`. Locate the `"devDependencies"` block. Add the 5 new entries alphabetically alongside existing entries:

```json
    "@changesets/cli": "^2.28.0",
    "eslint-plugin-import": "^2.32.0",
    "license-checker": "^25.0.1",
    "pixelmatch": "^7.1.0",
    "turbo": "^2.3.0",
```

The final `"devDependencies"` block should include all existing entries plus these 5 new ones in alphabetical order.

- [ ] **Step 2: Run npm install**

Run: `npm install`
Expected: exits 0. Output includes "added N packages" for the new dev deps.

- [ ] **Step 3: Verify turbo CLI is reachable**

Run: `npx turbo --version`
Expected: prints a version like `2.3.x`. Exit code 0.

- [ ] **Step 4: Verify changeset CLI is reachable**

Run: `npx changeset --version`
Expected: prints a version like `2.28.x`. Exit code 0.

- [ ] **Step 5: Verify license-checker is reachable**

Run: `npx license-checker --help | head -5`
Expected: prints usage text. Exit code 0.

- [ ] **Step 6: Run existing tests + lint to confirm no regression**

Run: `npm test -- --run && npm run lint`
Expected: both exit 0. No existing behavior affected.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add tooling dependencies (turbo, changesets, license-checker, eslint-plugin-import, pixelmatch)"
```

---

## Task 3: Remove Empty Scaffolded Packages

Delete the 8 scaffolded-but-never-used package directories identified in the spec. None are in the `workspaces` glob's actual workspace set (they lack `package.json`), none are imported by any source code.

**Files:**
- Delete: `packages/prismgb-chroma/`, `packages/prismgb-core/`, `packages/prismgb-devices/`, `packages/prismgb-di/`, `packages/prismgb-ipc/`, `packages/prismgb-shader-compiler/`, `packages/prismgb-shader-presets/`, `packages/prismgb-stream-source/`

- [ ] **Step 1: Confirm none are imported**

Run: `grep -r "@prismgb/chroma\|@prismgb/core\|@prismgb/devices\|@prismgb/di\|@prismgb/ipc\|@prismgb/shader-compiler\|@prismgb/shader-presets\|@prismgb/stream-source" src tests packages/prismgb-gpu 2>/dev/null`
Expected: no output. If any match, stop and investigate — the package is actually in use and must not be deleted.

- [ ] **Step 2: Confirm none have a package.json**

Run: `ls packages/*/package.json 2>/dev/null`
Expected: only `packages/prismgb-gpu/package.json`. No others.

- [ ] **Step 3: Delete the 8 directories**

```bash
rm -rf packages/prismgb-chroma packages/prismgb-core packages/prismgb-devices packages/prismgb-di packages/prismgb-ipc packages/prismgb-shader-compiler packages/prismgb-shader-presets packages/prismgb-stream-source
```

- [ ] **Step 4: Verify only prismgb-gpu remains in packages/**

Run: `ls packages/`
Expected: only `prismgb-gpu` listed.

- [ ] **Step 5: Verify build and tests still work**

Run: `npm run build:vite && npm test -- --run`
Expected: both exit 0. The Vite build produces `dist/` as before; all tests pass.

- [ ] **Step 6: Verify lint still works**

Run: `npm run lint`
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add -A packages/
git commit -m "chore: remove empty scaffolded packages"
```

---

## Task 4: Add Decorator Support to tsconfig.base.json

Add `experimentalDecorators` and `emitDecoratorMetadata` to the base TypeScript config. These are additive: existing code has no decorators, so no behavior changes. Required for tsyringe and reflect-metadata in Phase 1.

**Files:**
- Modify: `tsconfig.base.json`

- [ ] **Step 1: Add the two decorator flags**

Open `tsconfig.base.json`. Inside `compilerOptions`, add:

```jsonc
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
```

Place them alphabetically (between `esModuleInterop` and `exactOptionalPropertyTypes`). The full updated file should be:

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "exactOptionalPropertyTypes": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@main/*": ["src/main/*"],
      "@renderer/*": ["src/renderer/*"],
      "@preload/*": ["src/preload/*"],
      "@shared/*": ["src/shared/*"],
      "@prismgb/gpu": ["packages/prismgb-gpu/src"],
      "@prismgb/gpu/*": ["packages/prismgb-gpu/src/*"]
    },
    "types": ["node", "vite/client"],
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  }
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: exits 0. Decorator flags are additive — no existing file uses decorators, so no new errors.

- [ ] **Step 3: Run build to confirm Vite picks up new tsconfig**

Run: `npm run build:vite`
Expected: exits 0. Bundle builds successfully.

- [ ] **Step 4: Run tests to confirm behavior**

Run: `npm test -- --run`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add tsconfig.base.json
git commit -m "build(tsconfig): add decorator support to base config"
```

---

## Task 4A: Configure SWC for Decorator Metadata

**Discovered during Task 4 code review.** Vite uses esbuild for TypeScript transpilation. esbuild does NOT support `emitDecoratorMetadata` — it strips the flag silently. This means tsyringe's implicit type-based injection (`constructor(private foo: Foo)`) will fail at runtime in Phase 1 with `undefined` parameter resolution. We need SWC (Rust-based, supports decorator metadata) to transpile both `.ts` and `.js` files in the Vite and Vitest pipelines.

**Files:**
- Modify: `package.json` (add `unplugin-swc`, `@swc/core` to devDependencies)
- Modify: `vite.config.js` (add SWC plugin)
- Modify: `vitest.config.js` (add SWC plugin)
- Create: `scripts/swc.config.js` (shared SWC configuration)
- Create: `tests/regression/decorator-metadata-smoke.test.ts` (verify metadata is emitted at runtime)

- [ ] **Step 1: Install SWC toolchain**

Add to `devDependencies` in `package.json` (alphabetically):

```json
    "@swc/core": "^1.9.0",
    "unplugin-swc": "^1.5.0",
```

Run: `npm install`
Expected: exit 0.

- [ ] **Step 2: Configure unplugin-swc in vite.config.js**

Open `vite.config.js`. Add to the top-level imports:

```javascript
import swc from 'unplugin-swc';
```

Find the `plugins: [...]` array in the renderer or top-level Vite config. Add the SWC plugin entry:

```javascript
  swc.vite({
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
  }),
```

unplugin-swc globally disables esbuild and transpiles both TypeScript and JavaScript. esbuild is not a fallback. This is required because esbuild does not emit decorator metadata.

- [ ] **Step 3: Write a decorator metadata smoke test**

Create `tests/regression/decorator-metadata-smoke.test.ts`:

```typescript
import 'reflect-metadata';
import { describe, it, expect } from 'vitest';

class FakeDep {}

function injectable(): ClassDecorator {
  return () => {};
}

@injectable()
class Consumer {
  constructor(public readonly dep: FakeDep) {}
}

describe('decorator metadata emission', () => {
  it('emits design:paramtypes metadata for decorated classes', () => {
    const paramTypes = Reflect.getMetadata('design:paramtypes', Consumer);
    expect(paramTypes).toBeDefined();
    expect(Array.isArray(paramTypes)).toBe(true);
    expect(paramTypes).toHaveLength(1);
    expect(paramTypes[0]).toBe(FakeDep);
  });
});
```

This test must PASS. If it fails, SWC isn't transforming `.ts` files correctly — investigate before committing.

- [ ] **Step 4: Run the smoke test in isolation**

Run: `npx vitest run tests/regression/decorator-metadata-smoke.test.ts`
Expected: 1 test passed. `Reflect.getMetadata('design:paramtypes', Consumer)` returns `[FakeDep]`.

If it fails (returns undefined), the SWC plugin isn't active or isn't configured correctly. Fix before committing.

- [ ] **Step 5: Run full test suite to verify no regression**

Run: `npm test -- --run 2>&1 | tail -5`
Expected: 2908 tests pass (2907 baseline + 1 new smoke test).

- [ ] **Step 6: Verify build still works**

Run: `npm run build:vite 2>&1 | tail -10`
Expected: exit 0. Renderer bundle builds successfully with SWC in the pipeline.

- [ ] **Step 7: Verify lint still works**

Run: `npm run lint 2>&1 | tail -3`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json scripts/swc.config.js vite.config.js vitest.config.js tests/regression/decorator-metadata-smoke.test.ts
git commit -m "build(swc): configure SWC transpilation for decorator metadata"
```

---

## Task 5: Create turbo.json

Define the Turborepo task pipeline. Phase 0 doesn't use Turbo yet for npm scripts, but the config must exist and be valid for Phase 1's platform packages to plug in.

**Files:**
- Create: `turbo.json`

- [ ] **Step 1: Create turbo.json**

Write the following to `turbo.json`:

```jsonc
{
  "$schema": "https://turbo.build/schema.json",
  "ui": "tui",
  "globalDependencies": [
    "tsconfig.base.json",
    "package.json",
    "turbo.json"
  ],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", "!dist/**/*.test.*", "!dist/**/*.tsbuildinfo"]
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "lint": {
      "outputs": []
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "test:integration": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

- [ ] **Step 2: Validate turbo.json schema**

Run: `npx turbo run build --dry-run --filter=@prismgb/gpu`
Expected: prints a task plan without errors. Output includes `@prismgb/gpu#build`. Exit code 0.

If the command errors with "turbo.json is invalid", fix the schema issue before continuing.

- [ ] **Step 3: Verify turbo recognizes the existing package**

Run: `npx turbo run test --dry-run`
Expected: prints "packages: 1" and shows a plan for `@prismgb/gpu#test`.

- [ ] **Step 4: Run actual turbo test to confirm it delegates**

Run: `npx turbo run test --filter=@prismgb/gpu`
Expected: exits 0. Turbo invokes `npm run test` in `packages/prismgb-gpu/` and reports success. Cached on second run.

- [ ] **Step 5: Verify cache works on second run**

Run: `npx turbo run test --filter=@prismgb/gpu`
Expected: Turbo reports "FULL TURBO" or ">>> CACHE HIT" — second run is instantaneous because the output is cached.

- [ ] **Step 6: Commit**

```bash
git add turbo.json
git commit -m "build(turbo): add turborepo task pipeline configuration"
```

---

## Task 6: Migrate to Vitest Projects Mode

> **Note:** Vitest 4 removed `defineWorkspace`; this task uses the `test.projects` approach via `defineConfig` instead. The file is named `vitest.config.ts` (not `vitest.workspace.ts`).

Replace `vitest.config.js` with `vitest.config.ts` that preserves all current behavior (aliases, setup files, coverage config, pool settings) while adding support for per-package test configs in future phases.

**Files:**
- Create: `vitest.config.ts`
- Delete: `vitest.config.js`

- [x] **Step 1: Create vitest.config.ts preserving all existing behavior**

Write the following to `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';
import path from 'path';
import { fileURLToPath } from 'url';
import { swcConfig } from './scripts/swc.config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [swc.vite(swcConfig)],
  test: {
    projects: [
      'packages/*',
      {
        plugins: [swc.vite(swcConfig)],
        test: {
          name: 'app-shell',
          root: __dirname,
          environment: 'happy-dom',
          globals: true,
          include: [
            'src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts}',
            'tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts}'
          ],
          exclude: [
            'tests/e2e/**',
            'tests/workflows/index.js',
            'node_modules/**',
            'packages/**',
            '.worktrees/**'
          ],
          setupFiles: [
            path.resolve(__dirname, 'tests/setup.js'),
            path.resolve(__dirname, 'tests/testing-library.setup.js')
          ],
          testTimeout: 10000,
          pool: 'forks',
          fileParallelism: true,
          isolate: true,
          alias: {
            '@': path.resolve(__dirname, 'src'),
            '@main': path.resolve(__dirname, 'src/main'),
            '@renderer': path.resolve(__dirname, 'src/renderer'),
            '@preload': path.resolve(__dirname, 'src/preload'),
            '@shared': path.resolve(__dirname, 'src/shared'),
            '@prismgb/gpu': path.resolve(__dirname, 'packages/prismgb-gpu/src/index.ts')
          }
        }
      }
    ],
    maxWorkers: 2,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './tests/coverage',
      all: true,
      include: ['src/**/*.{js,ts}'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'build/**',
        '**/*.test.{js,ts}',
        '**/*.spec.{js,ts}',
        '**/index.{js,ts}',
        'scripts/**',
        'assets/**',
        'src/main/**',
        'src/preload/**',
        'src/renderer/infrastructure/services/updates/**',
        'src/**/workers/*.{js,ts}',
        'src/**/rendering/gpu/*.{js,ts}',
        'src/renderer/infrastructure/rendering/capability-detector.utils.ts',
        'src/renderer/infrastructure/adapters/streaming/canvas2d-renderer.adapter.ts',
        'src/renderer/infrastructure/adapters/streaming/gpu-renderer.adapter.ts',
        'src/renderer/infrastructure/factories/streaming-renderer.factory.ts',
        'src/**/gpu-render-loop.service.{js,ts}',
        'src/**/audio/*.{js,ts}',
        'src/**/canvas-lifecycle.service.{js,ts}',
        'src/renderer/presentation/shell/*.{js,ts}',
        'src/renderer/presentation/icons/*.{js,ts}',
        'src/renderer/presentation/features/**/*.template.{js,ts}',
        'src/shared/interfaces/**',
        'src/shared/ipc/*.contract.ts',
        'src/**/*.interface.{js,ts}',
        'src/**/*.type.ts',
        'src/**/*.types.ts',
        'src/**/*.d.ts',
        '**/*.json'
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80
      }
    }
  }
});
```

Key differences from the original `defineWorkspace` proposal:
- Uses `defineConfig` (standard Vitest 4 API) not `defineWorkspace` (removed in Vitest 4)
- `test.projects: [...]` replaces top-level workspace array
- `maxWorkers: 2` stays at top-level `test` (not per-project `poolOptions.forks.maxForks` which is not a Vitest 4 user config option)
- Coverage moves to top-level `test.coverage` (applies across all projects)
- `'.worktrees/**'` exclusion prevents sibling-branch test discovery

- [x] **Step 2: Delete the old vitest.config.js**

```bash
rm vitest.config.js
```

- [x] **Step 3: Run full test suite to verify behavior is preserved**

Run: `npm test -- --run`
Expected: app-shell project runs 2908 tests (same as baseline). Total with `@prismgb/gpu` is 2927 (2908 + 19 gpu tests now discovered via `packages/*` glob — this is intended).

- [x] **Step 4: Verify path-filtered tests still work**

Run: `npm run test:unit`
Expected: only unit tests run, exits 0.

Run: `npm run test:integration`
Expected: only integration tests run, exits 0.

- [x] **Step 5: Verify coverage still works**

Run: `npm run test:coverage -- --run`
Expected: exits 0. Coverage summary printed. Thresholds (80% lines/functions/statements, 75% branches) still enforced.

- [x] **Step 6: Verify @prismgb/gpu's own tests still run via projects**

Run: `npx vitest run --project=@prismgb/gpu 2>&1 | tail -10`
Expected: 19 GPU package tests run and pass across 3 files.

- [x] **Step 7: Commit**

```bash
git add vitest.config.ts docs/superpowers/plans/2026-04-17-prismgb-platform-refactor-phase-0-tooling.md
git rm vitest.config.js
git commit -m "test(vitest): migrate to vitest 4 projects mode preserving app-shell behavior"
```

---

## Task 7: Initialize Changesets

Set up Changesets for the monorepo. Configure Tier 1 packages as linked (version together), leave others independent. All packages remain `private: true` initially.

**Files:**
- Create: `.changeset/config.json`
- Create: `.changeset/README.md`

- [ ] **Step 1: Create .changeset directory**

```bash
mkdir -p .changeset
```

- [ ] **Step 2: Write .changeset/config.json**

Write the following to `.changeset/config.json`:

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [],
  "linked": [
    ["@prismgb/core", "@prismgb/transport", "@prismgb/runtime"]
  ],
  "access": "restricted",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": []
}
```

Note: `@prismgb/core`, `@prismgb/transport`, `@prismgb/runtime` don't exist yet — they're created in Phase 1. Changesets tolerates unknown packages in `linked` entries and activates them once they exist.

- [ ] **Step 3: Write .changeset/README.md**

Write the following to `.changeset/README.md`:

```markdown
# Changesets

This directory contains Changesets — markdown files describing package version bumps.

## When to add a changeset

- Every PR that changes a `@prismgb/*` package in a user-visible way.
- Internal refactors without API changes can skip (mark `--empty` if required by CI).

## How to add a changeset

```bash
npx changeset
```

Follow the interactive prompts:
1. Select which packages changed.
2. Select bump type (major/minor/patch).
3. Write a short summary.

The resulting `.md` file goes into this directory. Commit it with the PR.

## Versioning

- Tier 1 packages (`@prismgb/core`, `@prismgb/transport`, `@prismgb/runtime`) are **linked** — they version together to preserve contract coherence.
- All other packages version independently.
- Every package starts at `1.0.0` once the refactor completes.
- All packages are `private: true` initially; lifted per-package when ready for external publishing.
```

- [ ] **Step 4: Validate changeset config**

Run: `npx changeset status 2>&1 | head -20`
Expected: exits 0 or reports "no changesets present" (normal for initial setup). No errors about invalid config.

- [ ] **Step 5: Test changeset creation workflow (dry run)**

Run: `echo "---\n\"@prismgb/gpu\": patch\n---\n\ntest changeset" > .changeset/test-changeset.md && npx changeset status && rm .changeset/test-changeset.md`
Expected: status lists `@prismgb/gpu` as pending patch bump. The file is then deleted.

- [ ] **Step 6: Commit**

```bash
git add .changeset/
git commit -m "chore(changesets): initialize changesets configuration"
```

---

## Task 8: Create License Compliance CI Workflow

Add a GitHub Actions workflow that runs `license-checker` on every PR and push, failing if any production dependency uses a copyleft license (GPL/AGPL/LGPL/CDDL/EPL/OSL/SSPL).

**Files:**
- Create: `.github/workflows/license-check.yml`

- [ ] **Step 1: Write the workflow**

Write the following to `.github/workflows/license-check.yml`:

```yaml
name: License Compliance

on:
  pull_request:
  push:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  license-check:
    name: Check Production License Compliance
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Checkout
        uses: actions/checkout@v5

      - name: Setup Node
        uses: actions/setup-node@v5
        with:
          node-version: '22'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Check production licenses
        run: |
          npx license-checker \
            --production \
            --excludePackages "prismgb@$(node -p 'require(\"./package.json\").version')" \
            --failOn "GPL;AGPL;LGPL;CDDL;EPL;OSL;SSPL"

      - name: Generate license report
        if: always()
        run: npx license-checker --production --json > license-report.json

      - name: Upload license report
        if: always()
        uses: actions/upload-artifact@v5
        with:
          name: license-report
          path: license-report.json
          retention-days: 30
```

- [ ] **Step 2: Verify YAML syntax is valid**

Run: `node -e "const yaml = require('js-yaml'); yaml.load(require('fs').readFileSync('.github/workflows/license-check.yml','utf8')); console.log('OK');" 2>/dev/null || echo "js-yaml not installed; skipping syntax check"`
Expected: prints `OK`, or the skip message if `js-yaml` is not available.

- [ ] **Step 3: Dry-run license-checker locally**

Run: `npx license-checker --production --failOn "GPL;AGPL;LGPL;CDDL;EPL;OSL;SSPL" 2>&1 | tail -5`
Expected: exits 0. If any existing dep triggers the failOn pattern, investigate that dep before continuing. `ffmpeg-static` bundles an LGPL binary but its wrapper package is MIT-licensed — it should pass.

- [ ] **Step 4: Generate a sample report locally**

Run: `npx license-checker --production --json > /tmp/license-report.json && node -e "const r = require('/tmp/license-report.json'); console.log('Packages audited:', Object.keys(r).length);"`
Expected: prints a count (likely 50+). The report file exists at `/tmp/license-report.json`.

Run: `rm /tmp/license-report.json`

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/license-check.yml
git commit -m "ci(license): add production license compliance check workflow"
```

---

## Task 9: Add eslint-plugin-import with Layer Boundary Rules

Add `eslint-plugin-import` with `import/no-restricted-paths` to enforce package boundaries at lint time. Rules target package subpaths that don't exist yet; they become active in Phase 1 when packages are created.

**Files:**
- Modify: `eslint.config.js`

- [ ] **Step 1: Import the plugin at the top of eslint.config.js**

Open `eslint.config.js`. At the top, alongside existing imports, add:

```javascript
import importPlugin from 'eslint-plugin-import';
```

The imports block becomes:

```javascript
import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsEslintPlugin from '@typescript-eslint/eslint-plugin';
import importPlugin from 'eslint-plugin-import';
```

- [ ] **Step 2: Add a new flat config block registering the plugin and adding boundary rules**

In `eslint.config.js`, append a new config block after the last existing block and before the final `ignores` block. Insert the following (place it after the `src/shared/**/*.{js,ts}` block, before the `ignores` block):

```javascript
  {
    files: ['src/**/*.{js,ts}', 'packages/**/*.{js,ts}'],
    plugins: {
      import: importPlugin
    },
    rules: {
      'import/no-restricted-paths': ['error', {
        zones: [
          {
            target: './src/renderer',
            from: './src/main',
            message: 'Renderer process cannot import from main process.'
          },
          {
            target: './src/main',
            from: './src/renderer',
            message: 'Main process cannot import from renderer process.'
          },
          {
            target: './src/preload',
            from: './src/main',
            message: 'Preload cannot import from main process.'
          },
          {
            target: './src/preload',
            from: './src/renderer',
            message: 'Preload cannot import from renderer process.'
          }
        ]
      }]
    }
  },
```

Note: additional package-level rules (e.g., `@prismgb/devices/main` unreachable from `src/renderer/`) will be added in Phase 1 when the packages exist. This block establishes the plugin; Phase 1 extends the `zones` array.

- [ ] **Step 3: Run lint to verify the rules activate cleanly**

Run: `npm run lint`
Expected: exits 0. The new rules should not flag anything since PrismGB's existing code already respects these boundaries (enforced by the old `no-restricted-imports` rules already in place).

- [ ] **Step 4: Verify the rule catches intentional violations**

Create a temporary test file at `src/renderer/_test-boundary-violation.ts` containing:

```typescript
import 'src/main/infrastructure/window/window.service.ts';
export {};
```

Run: `npx eslint src/renderer/_test-boundary-violation.ts`
Expected: reports `import/no-restricted-paths` error. Exit code non-zero.

Delete the test file: `rm src/renderer/_test-boundary-violation.ts`.

- [ ] **Step 5: Run full lint again to confirm cleanup**

Run: `npm run lint`
Expected: exits 0.

- [ ] **Step 6: Run tests to confirm no regression**

Run: `npm test -- --run`
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add eslint.config.js
git commit -m "build(eslint): add import plugin with process boundary enforcement"
```

---

## Task 10: Extend scripts/check-layer-boundaries.js with Package-Level Rules

Extend the existing layer boundary checker with package-level rules. Rules target `@prismgb/*/main`, `@prismgb/*/renderer`, `@prismgb/*/worker` subpaths — these don't exist yet, so the rules are inert. They activate automatically as packages are created in Phase 1+.

**Files:**
- Modify: `scripts/check-layer-boundaries.js`

- [ ] **Step 1: Read the current structure of the script**

Run: `grep -n "RULES\|rules\|exports\|module.exports" scripts/check-layer-boundaries.js | head -20`
Expected: output showing the rules array or module structure. Examine the file to understand where rules are declared.

- [ ] **Step 2: Add package-level rules**

Open `scripts/check-layer-boundaries.js`. Locate the existing rules declaration (likely an array of `{from, cannotImport}` or similar objects). Append the following package-level rules:

```javascript
  // ========================================================================
  // Package-level rules (activate as packages are added in Phase 1+)
  // ========================================================================

  // Tier 2 capability packages cannot import from each other (only Tier 1 is allowed)
  {
    from: /^packages\/prismgb-(?!core|transport|runtime|contracts|testing|gpu)/,
    cannotImport: /^@prismgb\/(?!core|transport|runtime|contracts|testing)/,
    message: 'Tier 2 capability packages must not import from each other; share contracts via @prismgb/contracts or communicate via events.'
  },

  // src/ may not import from package internal paths (only public subpath exports allowed)
  {
    from: /^src\//,
    cannotImport: /^@prismgb\/.*?\/src\//,
    message: 'src/ must only import from package public subpath exports (./shared, ./main, ./renderer, ./worker), not internal src/ paths.'
  },

  // Renderer process cannot import a package's main-side or worker-side code
  {
    from: /^src\/renderer\//,
    cannotImport: /^@prismgb\/[^/]+\/(main|worker)/,
    message: 'Renderer process cannot import main-side or worker-side package code.'
  },

  // Main process cannot import a package's renderer-side or worker-side code
  {
    from: /^src\/main\//,
    cannotImport: /^@prismgb\/[^/]+\/(renderer|worker)/,
    message: 'Main process cannot import renderer-side or worker-side package code.'
  },

  // Worker entries cannot import main-side or renderer-side code
  {
    from: /^packages\/[^/]+\/src\/worker\//,
    cannotImport: /^@prismgb\/[^/]+\/(main|renderer)/,
    message: 'Worker code cannot import main-side or renderer-side package code.'
  },

  // Presentation layer stays UI-only — no direct transport main access
  {
    from: /^src\/renderer\/presentation\//,
    cannotImport: /^@prismgb\/transport\/main/,
    message: 'Presentation layer cannot directly use transport/main. Go through a service.'
  }
```

Integrate these into the existing rules structure (the exact integration depends on the file's current shape — append to the rules array, merge into a rules object, etc.). Preserve all existing rules.

If the file uses a different structure for rules, adapt the pattern — the intent is: add these 6 new rule definitions in whatever form the script expects.

- [ ] **Step 3: Run the layer boundary check**

Run: `node scripts/check-layer-boundaries.js`
Expected: exits 0. No existing code matches the new `from` patterns (packages don't exist yet beyond `@prismgb/gpu`, which is excluded from the Tier 2 rule).

- [ ] **Step 4: Verify existing rules still fire correctly**

If the script has unit tests, run them: `npx vitest run tests/unit/scripts/check-layer-boundaries.test.js 2>&1 | tail -5`
Expected: tests pass if they exist. If no tests, skip this step.

- [ ] **Step 5: Run full lint including boundary check**

Run: `npm run lint`
Expected: exits 0. The `npm run lint` script chains `eslint` with `node scripts/check-layer-boundaries.js` — both must pass.

- [ ] **Step 6: Run full tests**

Run: `npm test -- --run`
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add scripts/check-layer-boundaries.js
git commit -m "build(scripts): extend layer boundary rules for package subpath enforcement"
```

---

## Task 11: Add Pre-Phase-1 Validation Script

Create a single npm script that runs every tooling validation in sequence, so Phase 1 (and subsequent phases) can start from a known-good state with one command.

**Files:**
- Modify: `package.json` (scripts block)

- [ ] **Step 1: Add the validation script**

Open `package.json`. Inside `"scripts"`, add the following entry (place it alphabetically between `test:unit` and `test:workflows` or whichever position maintains alphabetical order):

```json
    "validate:phase-0": "npm run lint && npm run typecheck && npm run test -- --run && npx license-checker --production --failOn 'GPL;AGPL;LGPL;CDDL;EPL;OSL;SSPL' && npx turbo run test --filter=@prismgb/gpu --dry-run && npx changeset status",
```

- [ ] **Step 2: Run the validation script**

Run: `npm run validate:phase-0`
Expected: all steps pass in sequence. Exit code 0. Output shows lint, typecheck, tests, license check, turbo dry-run plan, changeset status.

If any step fails, investigate and fix before continuing.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore(scripts): add phase-0 validation script"
```

---

## Task 12: Update Project CLAUDE.md

Document the tooling foundation for future contributors. Add a new section to `CLAUDE.md` (project-level, not user-level) describing the new tools, commands, and conventions. Do not alter unrelated sections.

**Files:**
- Modify: `CLAUDE.md` (project root)

- [ ] **Step 1: Append a new section to CLAUDE.md**

Open `CLAUDE.md` at the project root. After the existing "Architecture Validation" section, append the following new section:

```markdown
## Platform Refactor — Phase 0 Tooling Foundation

Phase 0 of the platform refactor (spec: `docs/superpowers/specs/2026-04-17-prismgb-platform-refactor-design.md`) has landed. The following tooling is active:

### Monorepo orchestration
- **Turborepo** (`turbo.json`) orchestrates build/test/lint/typecheck tasks across packages with caching.
- Commands: `npx turbo run build`, `npx turbo run test --filter=@prismgb/gpu`, etc.

### Versioning
- **Changesets** (`.changeset/config.json`) manages package versions.
- Tier 1 packages (`@prismgb/core`, `@prismgb/transport`, `@prismgb/runtime`) are linked (version together).
- Other packages version independently. All packages are `private: true`.
- Add changesets for PRs changing packages: `npx changeset`.

### Dependencies added
- Runtime: `tsyringe`, `reflect-metadata`, `@trpc/server@11`, `@trpc/client@11`, `electron-trpc`, `comlink`, `zod@4`, `mitt`, `pino`, `consola`, `rxjs`.
- Dev: `turbo`, `@changesets/cli`, `license-checker`, `eslint-plugin-import`, `pixelmatch`.

Old deps (`awilix`, `eventemitter3`, `joi`, `winston`) remain during migration; removed in Phase 6.

### Testing
- Vitest runs in **projects mode** (`vitest.config.ts` replaces `vitest.config.js`, using `test.projects` in Vitest 4 API). Existing test commands (`npm test`, `npm run test:unit`, etc.) behave identically.

### License compliance
- CI workflow `.github/workflows/license-check.yml` fails PRs that introduce GPL/AGPL/LGPL/CDDL/EPL/OSL/SSPL licenses in production deps.
- Local check: `npx license-checker --production --failOn "GPL;AGPL;LGPL;CDDL;EPL;OSL;SSPL"`.

### TypeScript
- `tsconfig.base.json` now enables `experimentalDecorators` and `emitDecoratorMetadata` (required for Phase 1's `tsyringe` + `reflect-metadata`).

### Layer boundaries
- `scripts/check-layer-boundaries.js` extended with package-level rules (inert until packages exist in Phase 1).
- `eslint-plugin-import` with `import/no-restricted-paths` adds lint-time process boundary enforcement.

### Validation
- `npm run validate:phase-0` runs the full tooling validation chain.

### Empty scaffolding removed
- Eight unused scaffolded package directories (`prismgb-chroma`, `prismgb-core`, `prismgb-devices`, `prismgb-di`, `prismgb-ipc`, `prismgb-shader-compiler`, `prismgb-shader-presets`, `prismgb-stream-source`) have been deleted. Only `prismgb-gpu` remains in `packages/`.
```

- [ ] **Step 2: Verify the file is well-formed markdown**

Run: `head -5 CLAUDE.md && echo "..." && tail -30 CLAUDE.md`
Expected: file starts with the existing header. Ends with the new "Platform Refactor — Phase 0 Tooling Foundation" section.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): document phase 0 tooling foundation"
```

---

## Task 13: Tag Phase 0 Completion

Mark the end of Phase 0 with a git tag so Phase 1 (and any later rollback) can reference this exact state.

**Files:**
- None (git metadata only)

- [ ] **Step 1: Run full validation one final time**

Run: `npm run validate:phase-0`
Expected: all checks pass, exit code 0.

- [ ] **Step 2: Verify working tree is clean**

Run: `git status --porcelain`
Expected: empty output.

- [ ] **Step 3: Verify all tasks produced a commit**

Run: `git log --oneline origin/main..HEAD 2>/dev/null || git log --oneline -15`
Expected: output shows ~13 commits for Phase 0, in order:
- `chore(phase-0): capture baseline metrics before refactor`
- `chore(deps): add platform foundation runtime dependencies`
- `chore(deps): add tooling dependencies (turbo, changesets, license-checker, eslint-plugin-import, pixelmatch)`
- `chore: remove empty scaffolded packages`
- `build(tsconfig): add decorator support to base config`
- `build(turbo): add turborepo task pipeline configuration`
- `test(vitest): migrate to workspace mode preserving app-shell behavior`
- `chore(changesets): initialize changesets configuration`
- `ci(license): add production license compliance check workflow`
- `build(eslint): add import plugin with process boundary enforcement`
- `build(scripts): extend layer boundary rules for package subpath enforcement`
- `chore(scripts): add phase-0 validation script`
- `docs(claude): document phase 0 tooling foundation`

- [ ] **Step 4: Create the tag**

```bash
git tag -a phase-0-complete -m "Phase 0 complete: tooling foundation established"
```

- [ ] **Step 5: Verify tag was created**

Run: `git tag -l phase-0-complete`
Expected: prints `phase-0-complete`.

Run: `git show phase-0-complete --stat | head -20`
Expected: shows the tag metadata and the commit it points to.

- [ ] **Step 6: Do NOT push tag without explicit instruction**

Per project commit policy, pushes require explicit authorization. If the user asks to push the tag, they will say so explicitly. Otherwise, leave it local.

---

## Task 14: Final Smoke Test (App Still Runs)

Verify the app boots end-to-end. Phase 0 should cause zero user-visible changes.

**Files:**
- None

- [ ] **Step 1: Build the app**

Run: `npm run build:vite`
Expected: exits 0. `dist/main/`, `dist/preload/`, `dist/renderer/` produced.

- [ ] **Step 2: Run smoke test**

Run: `npm run test:smoke`
Expected: exits 0. Smoke test validates bundle structure and key files.

- [ ] **Step 3: Optional — launch the app briefly (if on a dev machine)**

If on a local development environment (not CI):

Run: `npm run dev` (in one terminal)
Wait for Electron window to appear. Verify:
- Main window opens without console errors in DevTools.
- Device panel shows "No device" state (unless Chromatic connected).
- Settings, Notes, and toolbar all render.
- No red errors in the terminal.

Press Ctrl-C to stop. **This step is optional and skipped in headless CI**.

- [ ] **Step 4: No commit needed for smoke test**

If smoke test passed without file changes, no commit is needed. If any log files or artifacts were created, ensure they're `.gitignore`'d or removed.

Run: `git status --porcelain`
Expected: empty output. If not, investigate (likely a `.cache/` or `dist/` entry — confirm it's gitignored).

---

## Phase 0 Completion Criteria

Phase 0 is **complete** when ALL of the following hold:

| # | Criterion | Verification |
|---|---|---|
| P0-1 | All 11 new runtime deps resolvable | `node -e "import('tsyringe').then(() => console.log('ok'))"` prints `ok` |
| P0-2 | All 5 new dev deps usable | `npx turbo --version && npx changeset --version && npx license-checker --help | head -1` all succeed |
| P0-3 | 8 empty scaffolded packages removed | `ls packages/` lists only `prismgb-gpu` |
| P0-4 | `tsconfig.base.json` has decorator support | `grep "experimentalDecorators" tsconfig.base.json` matches |
| P0-5 | `turbo.json` valid and invocable | `npx turbo run test --dry-run` succeeds |
| P0-6 | `vitest.config.ts` preserves behavior | `npm test -- --run` produces same passing count as baseline (2908 app-shell + 19 @prismgb/gpu = 2927 total) |
| P0-7 | `.changeset/config.json` valid | `npx changeset status` succeeds |
| P0-8 | License check workflow present | `.github/workflows/license-check.yml` exists, YAML valid |
| P0-9 | `eslint-plugin-import` active | `npm run lint` passes; `import/no-restricted-paths` rule catches planted violations |
| P0-10 | `check-layer-boundaries.js` extended | Package-level rules present, inert under current layout |
| P0-11 | `validate:phase-0` script works | `npm run validate:phase-0` exits 0 |
| P0-12 | `CLAUDE.md` (project) documents phase 0 | `grep "Platform Refactor — Phase 0" CLAUDE.md` matches |
| P0-13 | Tag `phase-0-complete` created | `git tag -l phase-0-complete` prints it |
| P0-14 | Baseline tests still pass | `npm test -- --run` exit 0, same count as Task 0 baseline |
| P0-15 | Baseline lint still passes | `npm run lint` exit 0 |
| P0-16 | Baseline typecheck still passes | `npm run typecheck` exit 0 |
| P0-17 | Baseline build still works | `npm run build:vite` exit 0 |
| P0-18 | Smoke test passes | `npm run test:smoke` exit 0 |

Only when every row is ✅ does Phase 0 count as complete. At that point, the next plan to author is **Phase 1: Platform Packages**, which creates `@prismgb/core`, `@prismgb/contracts`, `@prismgb/transport`, `@prismgb/runtime`, `@prismgb/testing`.

---

## Out of Scope for Phase 0

Explicitly deferred (do NOT do these in Phase 0):

| Item | Deferred to |
|---|---|
| Creating `@prismgb/core` or any platform package | Phase 1 |
| Removing `awilix`, `eventemitter3`, `joi`, `winston` | Phase 6 |
| Changing any `src/` app code | Phase 2 onwards |
| Capturing GPU frame-equivalence baseline | Phase 4f |
| Migrating npm scripts to invoke Turbo by default | Phase 1 (once packages exist) |
| Writing per-package `vitest.config.ts` | Phase 1 (per package) |
| Enabling stricter TS flags (`noUncheckedIndexedAccess` etc.) in app config | Phase 5/6 |

If the executor is tempted to do any of these, stop — they belong in a later plan.

---

## Estimated Effort

| Task | Effort |
|---|---|
| Task 0: Baseline snapshot | 10 min |
| Task 1: Install runtime deps | 15 min |
| Task 2: Install dev deps | 10 min |
| Task 3: Remove empty scaffolding | 5 min |
| Task 4: tsconfig decorator flags | 10 min |
| Task 5: turbo.json | 20 min |
| Task 6: vitest projects migration | 30–45 min (most brittle — preserve exact behavior) |
| Task 7: Changesets init | 15 min |
| Task 8: License CI workflow | 20 min |
| Task 9: eslint-plugin-import | 20 min |
| Task 10: Extend boundary script | 30 min |
| Task 11: validate:phase-0 script | 10 min |
| Task 12: CLAUDE.md update | 15 min |
| Task 13: Tag completion | 5 min |
| Task 14: Smoke test | 10 min |
| **Total** | **~4–5 hours focused work** |

Total wall-clock time for Phase 0 depending on how much cross-validation (rerunning full tests between tasks) the executor does: **1–3 days**.

---

**End of Phase 0 plan.** When all tasks complete, create the Phase 1 plan (`docs/superpowers/plans/YYYY-MM-DD-prismgb-platform-refactor-phase-1-platform-packages.md`) to author `@prismgb/core`, `@prismgb/contracts`, `@prismgb/transport`, `@prismgb/runtime`, `@prismgb/testing`.
