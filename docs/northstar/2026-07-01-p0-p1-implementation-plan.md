# North Star P0+P1 — Baseline, Policy & Dead-Code Excision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute Phases P0 (baseline, pre-commit policy, decisions) and P1 (dead-code excision, ~−2,600 LOC) of `NORTH_STAR_DESIGN_PLAN.md`, ending with tags `northstar-p0` and `northstar-p1` and every gate green.

**Architecture:** P0 stabilizes the tree (land WIP, record baselines, move the full test suite from pre-commit to pre-push) and records the two open decisions (D1: **delete** the orphaned renderer GPU-policy path — owner-decided 2026-07-01; coverage stance: freeze during the program). P1 then deletes verified-dead code in three sequential batches: 1A tests & test-only subjects, 1B core & renderer, 1C main/types/GPU-surface/config. Every deletion in this plan was re-verified against the working tree on 2026-07-01 (not just taken from the audit).

**Tech Stack:** Electron 41 / TypeScript 5.9 strict / Vite 7 / vitest 4 (multi-project) / husky 9 + lint-staged (added in Task 3) / npm workspaces.

**Spec:** `NORTH_STAR_DESIGN_PLAN.md` §3 (P0, P1) + §4. **Evidence base:** `CODEBASE_NORMALIZATION_ANALYSIS.md` (finding IDs referenced per task).

## Global Constraints

- **Commits:** conventional format, subject ≤ 100 chars (commitlint enforces; CI re-validates every PR commit). One commit per task as specified. **No AI attribution** — never add "Generated with Claude Code" or "Co-Authored-By: Claude". **Never use `--no-verify`.**
- **Branch:** all work lands on `refactor/gpu_normalization` (current branch). Do not merge, push, or open PRs — the phase ends at its tag (STOP checkpoint).
- **Comments:** do NOT add inline comments to code. JSDoc only. Editing/removing existing comments is allowed where a step says so.
- **Gates:** the standard gate set is `npm run test:run` · `npm run typecheck` · `npm run lint` · `npm run dev:smoke`. `dev:smoke` is MANDATORY on any task touching DI registrations, base classes, or the tRPC router — boot breaks in those layers are invisible to typecheck and vitest.
- **Scope:** touch ONLY the files listed in each task. Do not explore, do not refactor adjacent code, do not relitigate the rejected options in `NORTH_STAR_DESIGN_PLAN.md` §1.5.
- **Verification over narration:** every task's final step greps for zero remaining references. A task is not done until its grep returns empty and its validation commands pass.

## Plan-time corrections (verified 2026-07-01, working tree at `32df3e68` + WIP)

These override the audit/spec text where they conflict:

1. **`npm run build:vite` PASSES today** (fixed by `4c5bf36d`). The north-star P0/P3 text saying it fails is stale — Task 2 corrects the spec. Baseline records it as green; it must STAY green.
2. **`tests/unit/utils/PerformanceCache.test.js` exists** (audit said no dedicated test) — deleted in Task 6.
3. **`formatErrorLabel` has one consumer:** `tests/unit/shared/lib/errors.test.js` (whole file tests only this function) — deleted with it in Task 9.
4. **`gpu-policy.ts` is LIVE in main** (`src/main/index.ts:8,98` applies its Chromium flags at boot). Under D1 it is trimmed (MAIN-9), never deleted.
5. **Six gpu package tests import `@prismgb/gpu/testkit`** (audit said package tests use `@/testkit/fixtures`) — Task 14 rewrites those imports before deleting the entrypoint.
6. **`updateListboxActiveState` has a live test consumer** (`tests/unit/renderer/presentation/primitives/listbox.test.ts`) — its barrel export is KEPT (deviation from UIB-7; revisit at P13 when that test relocates).
7. **D1 is DECIDED: Delete** (owner, 2026-07-01). Task 11 executes the deletion; there is no conditional branch.

---

# Phase P0 — Baseline, policy, and decisions

### Task 1: Land the streaming-render WIP

**Finding:** north-star P0 item 1. The working tree carries an uncommitted change introducing `_resolveGpuCapabilities()` (direct runtime GPU detection replacing event-payload capabilities).

**Files:**
- Commit (already modified in tree): `src/renderer/infrastructure/services/streaming/streaming-render.service.ts`
- Commit (already modified in tree): `tests/unit/renderer/infrastructure/services/streaming-render.service.test.ts`

- [ ] **Step 1: Confirm tree state**

Run: `git status --short`
Expected: exactly two ` M` entries (the two files above) plus `??` untracked entries (`CODEBASE_NORMALIZATION_ANALYSIS.md`, `NORTH_STAR_DESIGN_PLAN.md`, `docs/superpowers/`). If anything else is dirty, STOP and report.

- [ ] **Step 2: Run the subject's tests**

Run: `npx vitest run tests/unit/renderer/infrastructure/services/streaming-render.service.test.ts`
Expected: PASS (all tests).

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit** (note: pre-commit still runs the FULL suite at this point — expected one-time cost; Task 3 fixes the policy)

```bash
git add src/renderer/infrastructure/services/streaming/streaming-render.service.ts tests/unit/renderer/infrastructure/services/streaming-render.service.test.ts
git commit -m "refactor(streaming): resolve gpu capabilities via runtime detection"
```

### Task 2: Create the phase log — baselines, decisions, spec correction

**Finding:** north-star P0 items 2, 4, 5. Also lands the two untracked program docs.

**Files:**
- Create: `docs/northstar/PHASE_LOG.md`
- Modify: `NORTH_STAR_DESIGN_PLAN.md` (3 small premise corrections)
- Commit (untracked): `CODEBASE_NORMALIZATION_ANALYSIS.md`, `NORTH_STAR_DESIGN_PLAN.md`, `docs/superpowers/plans/2026-07-01-northstar-p0-p1-dead-code.md`

- [ ] **Step 1: Capture baselines** — run each and record the outputs:

```bash
npm run test:run        # record: test-file count + test count from the summary line
npm run typecheck       # record: PASS
npm run lint            # record: PASS
npm run dev:smoke       # record: PASS
npm run build:vite      # record: PASS (corrected premise — green since 4c5bf36d)
npm run test:e2e        # record: passed spec count (expected 86)
git ls-files 'src/**/*.ts' 'src/**/*.js' 'packages/*/src/**/*.ts' | xargs wc -l | tail -1   # prod LOC
git ls-files 'tests/**/*.ts' 'tests/**/*.js' 'packages/*/tests/**/*.ts' | xargs wc -l | tail -1  # test LOC
```

- [ ] **Step 2: Write `docs/northstar/PHASE_LOG.md`** with the recorded values substituted for each `(record)`:

```markdown
# North Star Phase Log

Execution log for `NORTH_STAR_DESIGN_PLAN.md`. One section per phase; baselines and
exit metrics are recorded here, decisions are recorded here permanently.

## P0 — Baseline (2026-07-01, branch `refactor/gpu_normalization`)

| Metric | Value |
|---|---|
| Test files / tests (`npm run test:run`) | (record) files / (record) tests |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run dev:smoke` | PASS |
| `npm run build:vite` | PASS (green since `4c5bf36d`; premise in the north-star corrected) |
| e2e specs passing | (record) |
| Prod LOC (src + packages/*/src) | (record) |
| Test LOC (tests + packages/*/tests) | (record) |

### Decisions

- **D1 (INF-1, ARM-Linux WebGPU-skip policy): DELETE — decided by owner 2026-07-01.**
  The renderer-side path (`capability-detector.utils.ts` → `gpu.getPolicy`) has been
  orphaned in committed code since `4011cb1b`. The policy remains enforced at the
  Chromium-flags layer: `src/main/index.ts` applies `disable-features=Vulkan` +
  `use-gl=desktop` on Linux-ARM at boot, so renderer WebGPU adapter requests fail
  naturally there. P1 Task 11 deletes the detector, the `gpu.getPolicy` route, and
  `gpu.schemas.ts`; `gpu-policy.ts` stays (trimmed per MAIN-9).
- **Coverage stance: FREEZE during the program.** Coverage is not a commit/CI gate
  today (CI runs tests without coverage; only `release:preflight` runs
  `test:coverage`). Keep it that way until P13, then re-ratchet. The stale
  `capability-detector.utils.ts` coverage-exclude entry is removed in P1 Task 11.

## P1 — Exit metrics

(filled by P1 Task 16)
```

- [ ] **Step 3: Correct the stale `build:vite` premise in `NORTH_STAR_DESIGN_PLAN.md`** — three exact replacements:

Replace (P0 item 2):
```
`build:vite` **fail** (worker double-bundling — expected)
```
with:
```
`build:vite` **pass** (worker double-bundling fixed at `4c5bf36d`)
```

Replace (P3 exit criteria):
```
**and `npm run build:vite` passes for the first time on this branch** (worker double-bundling structurally eliminated)
```
with:
```
**and `npm run build:vite` stays green through the collapse** (the stale-dist/double-bundling bug class becomes structurally impossible)
```

Replace (§6 success metric 2):
```
**`build:vite` green** (flips at P3) and stays green
```
with:
```
**`build:vite` green** (green from P0) and stays green
```

- [ ] **Step 4: Commit**

```bash
git add docs/northstar/ NORTH_STAR_DESIGN_PLAN.md CODEBASE_NORMALIZATION_ANALYSIS.md .agy-phase.conf
git commit -m "docs(northstar): land program docs, P0 baselines and decisions"
```

### Task 3: Pre-commit policy — full suite moves to pre-push (R2-7)

**Finding:** R2-7. `.husky/pre-commit` currently runs the full `npm run test:run` on every commit. Every later phase commits dozens of times; this task pays for the whole program.

**Files:**
- Modify: `.husky/pre-commit` (currently exactly `npm run test:run`)
- Create: `.husky/pre-push` (does not exist)
- Modify: `package.json` (add `lint-staged` devDependency + config block)

**Interfaces:**
- Produces: pre-commit = lint-staged (eslint + `vitest related`) + app typecheck; pre-push = full typecheck + lint + full test suite. `.husky/commit-msg` (commitlint) is NOT touched.

- [ ] **Step 1: Install lint-staged**

Run: `npm install --save-dev lint-staged`
Expected: added to `devDependencies`, lockfile updated.

- [ ] **Step 2: Add the lint-staged config** to `package.json` (top-level key, after `"devDependencies"`). The eslint entry is scoped to the same roots as `npm run lint` (`src` + `packages/*/src`) — eslint on unconfigured paths (tests, root configs) would error; `vitest related` runs for every staged js/ts file:

```json
"lint-staged": {
  "{src,packages}/**/*.{js,ts}": [
    "eslint"
  ],
  "*.{js,ts}": [
    "vitest related --run --passWithNoTests"
  ]
}
```

- [ ] **Step 3: Replace `.husky/pre-commit`** content with:

```
npx lint-staged
npm run typecheck:app
```

- [ ] **Step 4: Create `.husky/pre-push`** with content:

```
npm run typecheck && npm run lint && npm run test:run
```

Run: `chmod +x .husky/pre-push`

- [ ] **Step 5: Measure the new pre-commit**

Run: `time npm run typecheck:app` and stage this task's files, then run `time npx lint-staged`.
Decision rule: if the two together exceed 30 s, remove the `npm run typecheck:app` line from `.husky/pre-commit` (pre-push already runs the full typecheck) and note the measured times in `docs/northstar/PHASE_LOG.md` under P0.

- [ ] **Step 6: Commit** (this commit itself exercises the new hook)

```bash
git add .husky/pre-commit .husky/pre-push package.json package-lock.json
git commit -m "build(hooks): move full test suite to pre-push, lint staged files on commit"
```

Expected: commit completes in < 30 s.

### Task 4: Tag `northstar-p0` — STOP checkpoint

- [ ] **Step 1: Verify P0 exit criteria**

Run: `git status --short` → clean tree. Confirm: PHASE_LOG exists with baselines + both decisions; pre-commit measured fast; WIP landed.

- [ ] **Step 2: Tag**

```bash
git tag -a northstar-p0 -m "North Star P0: baselines recorded, pre-commit policy fixed, D1 decided (delete)"
git tag -l 'northstar-*'
```

Expected: `northstar-p0` listed. **STOP — P0 review checkpoint. Do not start P1 without sign-off.**

---

# Phase P1 — Dead-code excision (batches 1A → 1B → 1C, sequential)

## Batch 1A — tests & test-only subjects (TEST-1)

### Task 5: Strip test-only subjects out of the streaming integration suite

**Finding:** TEST-1 (integration coupling). `tests/integration/streaming.test.js` imports the test-only `ResolutionCalculator`, the soon-dead `AnimationCache`, and the wall-clock `performanceUtils`. This must land BEFORE the files/classes are deleted (Tasks 6–7) so the suite stays green at every commit.

**Files:**
- Modify: `tests/integration/streaming.test.js`

- [ ] **Step 1: Trim the imports.** Replace:

```js
import {
  createUIController,
  performanceUtils,
} from '../factories/index.js';
```
with:
```js
import { createUIController } from '../factories/index.js';
```

and delete these two lines entirely:
```js
import { ResolutionCalculator } from '../utilities/ResolutionCalculator.js';
import { AnimationCache } from '@prismgb/core';
```

- [ ] **Step 2: Simplify the suite setup.** Replace:

```js
  let mediaEnvironment;
  let animationCache;

  beforeEach(() => {
    mediaEnvironment = createManifestMediaEnvironment({ connected: true }).install();

    // Create test animation cache
    animationCache = new AnimationCache();

    // Clear caches
    ResolutionCalculator.clearCache();
    animationCache.cancelAllAnimations();
  });
```
with:
```js
  let mediaEnvironment;

  beforeEach(() => {
    mediaEnvironment = createManifestMediaEnvironment({ connected: true }).install();
  });
```

- [ ] **Step 3: Delete the whole `describe('Resolution Calculation Integration', ...)` block** (two `it` cases: 'should calculate correct canvas dimensions for Chromatic' and 'should maintain aspect ratio through scaling'). It starts:

```js
  describe('Resolution Calculation Integration', () => {
```
and ends at the `});` immediately before `describe('Event Flow Integration', ...)`.

- [ ] **Step 4: Inline the canvas dimensions** in `describe('Canvas Rendering Integration')` → `it('should setup canvas with correct dimensions')`. Replace:

```js
      // Simulate canvas setup for 4x scale
      const calc = new ResolutionCalculator(160, 144);
      const dimensions = calc.calculateScaled(4);

      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
```
with:
```js
      canvas.width = 640;
      canvas.height = 576;
```

- [ ] **Step 5: Delete the whole `describe('Performance Integration', ...)` block** (two `it` cases: 'should cache resolution calculations across stream restarts' and 'should complete 100 stream start/stop cycles under time limit'). It starts:

```js
  describe('Performance Integration', () => {
```
and ends at the `});` immediately before the outer suite's closing `});` (the next block after it is the top-level `describe('Manifest Media Environment Accuracy', ...)`).

- [ ] **Step 6: Validate**

Run: `npx vitest run tests/integration/streaming.test.js`
Expected: PASS, with the Resolution/Performance describes gone.

- [ ] **Step 7: Commit**

```bash
git add tests/integration/streaming.test.js
git commit -m "test(integration): remove test-only calculator and cache from streaming suite"
```

### Task 6: Delete the performance suites and test-only subjects

**Finding:** TEST-1 (−1,635 LOC core cluster) + the plan-time-discovered `PerformanceCache.test.js`, `performanceUtils`, and `createAnimationCacheMock`.

**Files:**
- Delete: `tests/performance/` (3 files: `benchmarks.test.js`, `baseline.test.js`, `baseline.config.js`)
- Delete: `tests/utilities/ResolutionCalculator.js`, `tests/unit/utils/ResolutionCalculator.test.js`, `tests/unit/utils/PerformanceCache.test.js`
- Modify: `vitest.config.js`, `tests/factories/performance.factory.js`, `tests/factories/ui.factory.js`, `tests/factories/index.js`

- [ ] **Step 1: Delete the files**

```bash
git rm -r tests/performance
git rm tests/utilities/ResolutionCalculator.js tests/unit/utils/ResolutionCalculator.test.js tests/unit/utils/PerformanceCache.test.js
```

- [ ] **Step 2: Remove the vitest include** — in `vitest.config.js`, the `renderer-happy-dom` project's `include` array, delete the line:

```js
            'tests/performance/**/*.{test,spec}.{js,ts}',
```

- [ ] **Step 3: Delete `performanceUtils`** — in `tests/factories/performance.factory.js`, delete the entire const starting at:

```js
export const performanceUtils = {
```
through its closing `};` (the block immediately preceding `export function createPerformanceMetricsAdapterMock(overrides = {}) {`). All other exports in the file are live — keep them.

- [ ] **Step 4: Delete `createAnimationCacheMock`** — in `tests/factories/ui.factory.js`, delete:

```js
export function createAnimationCacheMock(overrides = {}) {
  return {
    cancelAnimation: vi.fn(),
    cancelAllAnimations: vi.fn(),
    ...overrides
  };
}
```
and delete the `  createAnimationCacheMock,` line from the aggregate export object near the bottom of the same file.

- [ ] **Step 5: Trim the factories barrel** — in `tests/factories/index.js`, delete these two lines (one in the `./ui.factory.js` re-export list, one in the `./performance.factory.js` list):

```js
  createAnimationCacheMock,
```
```js
  performanceUtils,
```

- [ ] **Step 6: Validate**

Run: `npm run test:run`
Expected: PASS; test-file count drops by 5 vs the P0 baseline.

Run: `grep -rn "ResolutionCalculator\|performanceUtils\|createAnimationCacheMock" src tests packages/*/src`
Expected: no matches.

- [ ] **Step 7: Commit**

```bash
git add -A tests vitest.config.js
git commit -m "test: delete wall-clock performance suites and test-only subjects"
```

## Batch 1B — core & renderer (CORE-1, APP-5, CORE-2, formatErrorLabel, INF-4, INF-1, UIB-7)

### Task 7: Delete `PerformanceCache`/`AnimationCache` and the dead DI token

**Finding:** CORE-1 + APP-5. `PerformanceCache` has 0 consumers; `AnimationCache` is registered at one DI token nobody injects.

**Files:**
- Delete: `packages/prismgb-core/src/primitives/performance-cache.utils.ts`
- Modify: `packages/prismgb-core/src/index.ts`, `src/renderer/application/di/service-registrations.ts`, `tests/unit/renderer/application/container.test.ts`, `tests/unit/renderer/application/di/manual-providers.test.ts`

- [ ] **Step 1: Delete the primitive**

```bash
git rm packages/prismgb-core/src/primitives/performance-cache.utils.ts
```

- [ ] **Step 2: Remove the barrel export** — in `packages/prismgb-core/src/index.ts`, delete the line:

```ts
export { PerformanceCache, AnimationCache } from './primitives/performance-cache.utils.js';
```

- [ ] **Step 3: Remove the DI registration** — in `src/renderer/application/di/service-registrations.ts`:

Replace line 1:
```ts
import { AnimationCache, ConsoleLoggerFactory } from '@prismgb/core';
```
with:
```ts
import { ConsoleLoggerFactory } from '@prismgb/core';
```

Replace (end of the registrations map):
```ts
  uiEffects: (cradle) => new UIEffects(cradle),
  animationCache: () => new AnimationCache()
};
```
with:
```ts
  uiEffects: (cradle) => new UIEffects(cradle)
};
```

- [ ] **Step 4: Drop the dead-token test assertions** — in `tests/unit/renderer/application/container.test.ts`:
  - delete the `  'animationCache',` line from the expected-token array;
  - replace the comment line `    // Manual providers, including platform ports and canvasRenderLoopService -> animationCache.` with `    // Manual providers, including platform ports.`;
  - delete the line `    expect(container.resolve('animationCache')).toBeDefined();`.

In `tests/unit/renderer/application/di/manual-providers.test.ts`, delete the whole block:

```ts
  it('does NOT contain promoted standard-construction tokens', () => {
    expect(manualProviders.animationCache).toBeUndefined();
  });
```

- [ ] **Step 5: Validate**

Run: `npm run typecheck && npx vitest run tests/unit/renderer/application/container.test.ts tests/unit/renderer/application/di/manual-providers.test.ts`
Expected: PASS.

Run: `grep -rni "animationcache\|performancecache" src tests packages/*/src`
Expected: no matches.

Run: `npm run dev:smoke` (mandatory — DI registration change)
Expected: "Renderer application started successfully".

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(core): delete dead PerformanceCache and AnimationCache"
```

### Task 8: Delete `TypedRegistryFactory`

**Finding:** CORE-2. Zero production consumers; test-only.

**Files:**
- Delete: `packages/prismgb-core/src/primitives/typed-registry.ts`, `tests/unit/packages/core/typed-registry.test.ts`
- Modify: `packages/prismgb-core/src/index.ts`

- [ ] **Step 1: Delete files**

```bash
git rm packages/prismgb-core/src/primitives/typed-registry.ts tests/unit/packages/core/typed-registry.test.ts
```

- [ ] **Step 2: Remove the barrel exports** — in `packages/prismgb-core/src/index.ts`, delete both lines:

```ts
export { TypedRegistryFactory } from './primitives/typed-registry.js';
export type { RegistryFactory, RegistryEntry } from './primitives/typed-registry.js';
```

- [ ] **Step 3: Validate**

Run: `npm run typecheck`
Expected: PASS.

Run: `grep -rn "TypedRegistryFactory\|RegistryFactory\|RegistryEntry" src tests packages/*/src packages/*/tests`
Expected: no matches.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(core): delete unconsumed TypedRegistryFactory"
```

### Task 9: Delete `formatErrorLabel` and its test file

**Finding:** CORE-5 (delete half only — relocation of the live helpers is P2). Zero production consumers; `tests/unit/shared/lib/errors.test.js` tests nothing else.

**Files:**
- Modify: `packages/prismgb-core/src/index.ts`
- Delete: `tests/unit/shared/lib/errors.test.js`

- [ ] **Step 1: Delete the helper block** — in `packages/prismgb-core/src/index.ts`, delete exactly:

```ts
type ErrorLabelSource = { name?: unknown; message?: unknown };

function hasErrorLabelFields(value: unknown): value is ErrorLabelSource {
  return (typeof value === 'object' && value !== null) || typeof value === 'function';
}

export function formatErrorLabel(error: unknown): string {
  const errorLike = hasErrorLabelFields(error) ? error : {};
  const name = errorLike.name || 'Error';
  const message = errorLike.message || error;
  return `${name}: ${message}`;
}
```

Keep `ErrorLike`, `isErrorLike`, and `getErrorMessage` untouched.

- [ ] **Step 2: Delete the test file**

```bash
git rm tests/unit/shared/lib/errors.test.js
```

- [ ] **Step 3: Validate**

Run: `npm run typecheck`
Expected: PASS.

Run: `grep -rn "formatErrorLabel" src tests packages scripts`
Expected: no matches.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(core): delete dead formatErrorLabel helper"
```

### Task 10: Delete `native-resolution.utils.ts`

**Finding:** INF-4. Zero importers, zero tests; its scale math duplicates `viewport.service.ts`.

**Files:**
- Delete: `src/renderer/infrastructure/services/streaming/native-resolution.utils.ts`

- [ ] **Step 1: Delete**

```bash
git rm src/renderer/infrastructure/services/streaming/native-resolution.utils.ts
```

- [ ] **Step 2: Validate**

Run: `npm run typecheck`
Expected: PASS.

Run: `grep -rn "native-resolution\|normalizeNativeResolution\|createNativeBitmapOptions\|calculateNativeScaleFactor" src tests packages`
Expected: no matches.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor(streaming): delete dead native-resolution utils"
```

### Task 11: Delete the orphaned GPU-policy renderer path (INF-1, per D1 = DELETE)

**Finding:** INF-1 + D1 (decided: delete). The detector is unimported; `gpu.getPolicy` has no remaining caller once it goes. `gpu-policy.ts` itself STAYS (live at `src/main/index.ts:98`) — it is trimmed later in Task 13 (MAIN-9).

**Files:**
- Delete: `src/renderer/infrastructure/rendering/capability-detector.utils.ts`, `src/main/ipc/schemas/gpu.schemas.ts`
- Modify: `src/main/ipc/router.ts`, `src/main/ipc/schemas/index.ts`, `vitest.config.js`, `tests/unit/renderer/infrastructure/ipc/trpc-client.test.ts`, `tests/support/mocks/trpc-client.mock.ts`, `tests/unit/main/ipc/schemas.test.ts`, `tests/unit/main/ipc/router.test.ts`

- [ ] **Step 1: Delete the two dead files**

```bash
git rm src/renderer/infrastructure/rendering/capability-detector.utils.ts src/main/ipc/schemas/gpu.schemas.ts
```

- [ ] **Step 2: Remove the route** — in `src/main/ipc/router.ts`:
  - delete the import line: `import { getGpuPolicy } from '@main/infrastructure/gpu-policy.js';`
  - delete `  gpuPolicyResponseSchema,` from the `from './schemas/index.js'` import list;
  - delete the whole router block:

```ts
const gpuRouter = router({
  getPolicy: publicProcedure.output(gpuPolicyResponseSchema).query(({ ctx }) => {
    const policy = getGpuPolicy();
    ctx.logger.debug('Resolved GPU policy');
    return { success: true as const, skipWebGPU: policy.skipWebGPU, reason: policy.reason };
  })
});
```

  - delete `  gpu: gpuRouter,` from the `appRouter` composition.

- [ ] **Step 3: Trim the schema barrel** — in `src/main/ipc/schemas/index.ts`, delete the line:

```ts
export { gpuPolicyResponseSchema } from './gpu.schemas.js';
```

- [ ] **Step 4: Trim the tests and the mock**
  - `tests/unit/renderer/infrastructure/ipc/trpc-client.test.ts`: delete the line `    expect(typeof trpcClient.gpu.getPolicy.query).toBe('function');`
  - `tests/support/mocks/trpc-client.mock.ts`: delete the block:

```ts
    gpu: {
      getPolicy: query()
    },
```

  - `tests/unit/main/ipc/schemas.test.ts`: delete `  gpuPolicyResponseSchema,` from the import list and delete the whole block:

```ts
  it('gpuPolicyResponseSchema accepts the success shape and rejects failure envelopes', () => {
    expect(accepts(gpuPolicyResponseSchema, { success: true, skipWebGPU: false, reason: null })).toBe(true);
    expect(accepts(gpuPolicyResponseSchema, { success: true, skipWebGPU: true, reason: 'blocklist' })).toBe(true);
    expect(accepts(gpuPolicyResponseSchema, { success: false, error: 'failed' })).toBe(false);
    expect(accepts(gpuPolicyResponseSchema, { success: true, skipWebGPU: 'no', reason: null })).toBe(false);
  });
```

  - `tests/unit/main/ipc/router.test.ts`: delete the whole block:

```ts
  it('gpu.getPolicy returns an output-valid policy envelope', async () => {
    const context = createContext();
    const result = await caller(context).gpu.getPolicy();
    expect(result.success).toBe(true);
    expect(typeof result.skipWebGPU).toBe('boolean');
  });
```

- [ ] **Step 5: Remove the stale coverage exclude** — in `vitest.config.js`, delete the line:

```js
    'src/renderer/infrastructure/rendering/capability-detector.utils.ts',
```

- [ ] **Step 6: Validate**

Run: `npm run typecheck && npx vitest run tests/unit/main tests/unit/renderer/infrastructure/ipc`
Expected: PASS.

Run: `grep -rn "CapabilityDetector\|getPolicy\|gpuPolicyResponseSchema\|capability-detector" src tests packages`
Expected: no matches.

Run: `npm run dev:smoke` (mandatory — router change)
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(ipc): delete orphaned gpu policy route and renderer detector"
```

### Task 12: Prune UIB-7 dead exports and the dead `replaceManagedAsync` methods

**Finding:** UIB-7 + the plan-time-discovered twin in `orchestrator.base.ts`. **Deviation from the audit:** `updateListboxActiveState` keeps its barrel export (live consumer: `tests/unit/renderer/presentation/primitives/listbox.test.ts`); revisit at P13.

**Files:**
- Modify: `packages/prismgb-ui-base/src/template/template-ref.helpers.ts`, `packages/prismgb-ui-base/src/index.ts`, `packages/prismgb-ui-base/src/lifecycle/presentation-component.base.ts`, `packages/prismgb-core/src/primitives/orchestrator.base.ts`, `src/renderer/presentation/primitives/template-ref.utils.ts`

- [ ] **Step 1: Delete `createTemplateActionSelector` and un-export the attribute consts** — in `packages/prismgb-ui-base/src/template/template-ref.helpers.ts`:

Replace:
```ts
export const TEMPLATE_REF_ATTRIBUTE = 'data-ref';
export const TEMPLATE_ACTION_ATTRIBUTE = 'data-action';
```
with:
```ts
const TEMPLATE_REF_ATTRIBUTE = 'data-ref';
const TEMPLATE_ACTION_ATTRIBUTE = 'data-action';
```

Delete:
```ts
export function createTemplateActionSelector(action: string): string {
  return `[${TEMPLATE_ACTION_ATTRIBUTE}="${escapeAttributeSelectorValue(action)}"]`;
}
```

- [ ] **Step 2: Trim the ui-base barrel** — in `packages/prismgb-ui-base/src/index.ts`, replace:

```ts
export {
  TEMPLATE_REF_ATTRIBUTE,
  TEMPLATE_ACTION_ATTRIBUTE,
  createTemplateRefSelector,
  createTemplateActionSelector,
  getTemplateAction,
  getTemplateActionTarget,
  bindTemplateRefs
} from './template/template-ref.helpers.js';
```
with:
```ts
export {
  createTemplateRefSelector,
  getTemplateAction,
  getTemplateActionTarget,
  bindTemplateRefs
} from './template/template-ref.helpers.js';
```

(The `renderListboxOptions, updateListboxActiveState` export line above it stays as-is — see deviation note.)

- [ ] **Step 3: Trim the renderer shim** — in `src/renderer/presentation/primitives/template-ref.utils.ts`, replace the import + re-export blocks:

```ts
import {
  TEMPLATE_REF_ATTRIBUTE,
  TEMPLATE_ACTION_ATTRIBUTE,
  createTemplateRefSelector,
  createTemplateActionSelector,
  getTemplateAction,
  getTemplateActionTarget,
  bindTemplateRefs
} from '@prismgb/ui-base';
import type {
  TemplateRefList,
  TemplateRefLegacyIdMap,
  TemplateRefBindingOptions
} from '@prismgb/ui-base';

export {
  TEMPLATE_REF_ATTRIBUTE,
  TEMPLATE_ACTION_ATTRIBUTE,
  createTemplateRefSelector,
  createTemplateActionSelector,
  getTemplateAction,
  getTemplateActionTarget,
  bindTemplateRefs
};
```
with:
```ts
import {
  createTemplateRefSelector,
  getTemplateAction,
  getTemplateActionTarget,
  bindTemplateRefs
} from '@prismgb/ui-base';
import type {
  TemplateRefList,
  TemplateRefLegacyIdMap,
  TemplateRefBindingOptions
} from '@prismgb/ui-base';

export {
  createTemplateRefSelector,
  getTemplateAction,
  getTemplateActionTarget,
  bindTemplateRefs
};
```

(The `export type { ... }` block and everything below `UIActionIds` in that file stays untouched.)

- [ ] **Step 4: Delete both dead `replaceManagedAsync` methods** (zero call sites in src, tests, and packages):

In `packages/prismgb-ui-base/src/lifecycle/presentation-component.base.ts`, delete:
```ts
  protected replaceManagedAsync(key: DisposableKey, disposable: Disposable): Promise<DisposableFunction> {
    return this._disposables.replaceAsync(key, disposable);
  }
```

In `packages/prismgb-core/src/primitives/orchestrator.base.ts`, delete:
```ts
  protected async replaceManagedAsync(key: DisposableKey, disposable: Disposable): Promise<DisposableFunction> {
    return this._disposables.replaceAsync(key, disposable);
  }
```

- [ ] **Step 5: Validate**

Run: `npm run typecheck && npm run test:run`
Expected: PASS.

Run: `grep -rn "createTemplateActionSelector\|replaceManagedAsync\|TEMPLATE_REF_ATTRIBUTE\|TEMPLATE_ACTION_ATTRIBUTE" src tests packages/*/src packages/*/tests | grep -v "template-ref.helpers.ts"`
Expected: no matches.

Run: `npm run dev:smoke` (mandatory — base-class change)
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(ui-base): prune dead template exports and lifecycle methods"
```

## Batch 1C — main, types, GPU surface, config (MAIN-8/9/10, TYP-1, GPU-3, CFG-3)

### Task 13: Delete the dead override envelope, platform fields, and cast

**Finding:** MAIN-8 (both containers), MAIN-9 (trim only — `gpu-policy.ts` is live in `src/main/index.ts`), MAIN-10, TYP-1.

**Files:**
- Modify: `src/main/application/container.ts`, `src/renderer/application/container.ts`, `src/main/infrastructure/gpu-policy.ts`, `src/main/infrastructure/window/window.service.ts`
- Delete: `src/types/webgpu-worker.d.ts`

- [ ] **Step 1: Delete `unwrapOverride` in BOTH containers.** In each of `src/main/application/container.ts` and `src/renderer/application/container.ts`, delete the function and its JSDoc:

```ts
/**
 * Unwraps the legacy `{ value }` override envelope while passing plain instances through.
 */
function unwrapOverride(value: unknown): unknown {
  return value && typeof value === 'object' && 'value' in value
    ? (value as { value: unknown }).value
    : value;
}
```

and in each file change the override loop line:
```ts
    container.registerValue(token, unwrapOverride(value));
```
to:
```ts
    container.registerValue(token, value);
```

- [ ] **Step 2: MAIN-9 trim** — in `src/main/infrastructure/gpu-policy.ts`, replace:

```ts
export interface PlatformInfo {
  isLinux: boolean;
  isMac: boolean;
  isWindows: boolean;
  isArm64: boolean;
  isArm: boolean;
  isLinuxArm: boolean;
}
```
and
```ts
export function detectPlatform(): PlatformInfo {
  return {
    isLinux: process.platform === 'linux',
    isMac: process.platform === 'darwin',
    isWindows: process.platform === 'win32',
    isArm64: process.arch === 'arm64',
    isArm: process.arch === 'arm' || process.arch === 'arm64',
    isLinuxArm: process.platform === 'linux' &&
      (process.arch === 'arm' || process.arch === 'arm64')
  };
}
```
with the single private predicate:
```ts
function isLinuxArmPlatform(): boolean {
  return process.platform === 'linux' && (process.arch === 'arm' || process.arch === 'arm64');
}
```

and inside `getGpuPolicy()`:
- delete the line `  const platform = detectPlatform();`
- change `  if (forceWebGL || platform.isLinuxArm) {` to `  if (forceWebGL || isLinuxArmPlatform()) {`

`GpuPolicy`, `GPU_ENV_VARS`, and `applyChromiumFlags` stay untouched (consumed by `src/main/index.ts`).

- [ ] **Step 3: MAIN-10** — in `src/main/infrastructure/window/window.service.ts`, delete:

```ts
type AppWithQuitFlag = typeof app & {
  isQuitting?: boolean;
};
```

and change:
```ts
      if (!(app as AppWithQuitFlag).isQuitting) {
```
to:
```ts
      if (!app.isQuitting) {
```

(`src/types/electron-extensions.d.ts` already augments `Electron.App` with `isQuitting` — this compiles.)

- [ ] **Step 4: TYP-1**

```bash
git rm src/types/webgpu-worker.d.ts
```

- [ ] **Step 5: Validate**

Run: `npm run typecheck && npx vitest run tests/unit/main tests/unit/renderer/application`
Expected: PASS (the container shutdown/override tests pass plain instances, unaffected).

Run: `grep -rn "unwrapOverride\|AppWithQuitFlag\|detectPlatform\|PlatformInfo\|webgpu-worker" src tests packages`
Expected: no matches.

Run: `npm run dev:smoke` (mandatory — container change)
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(main): delete dead override envelope, platform fields, casts"
```

### Task 14: Contract the GPU public surface and retire the testkit entrypoint (GPU-3, one coordinated commit)

**Finding:** GPU-3 (D3 accepted via the north-star). App-consumed surface, verified 2026-07-01: from `@prismgb/gpu` — `PRESET_POLICY`, `getUiPresets`, `resolvePreset`, `type RenderCapabilities`; from `@prismgb/gpu/runtime` — `createGpuVideoRendererSession`, `detectBrowserGpuCapabilities`, `type GpuVideoRendererSession`, `type GpuVideoRendererStats`. Everything else on the two entrypoints has zero app consumers. `./testkit` has zero app consumers, but SIX gpu package tests import it — rewrite those first. All changes below land as ONE commit (the boundary script, aliases, package exports, and surface tests lock each other).

**Files:**
- Modify: 6 package tests (imports only): `packages/prismgb-gpu/tests/unit/testkit/fixtures.test.ts`, `.../application/video-session.test.ts`, `.../application/renderer.service.import-safety.test.ts`, `.../application/renderer.service.test.ts`, `.../worker/client.test.ts`, `.../infrastructure/canvas.driver.test.ts`
- Delete: `packages/prismgb-gpu/src/testkit.ts`
- Modify: `packages/prismgb-gpu/package.json`, `scripts/check-gpu-package-boundaries.js`, `vite.config.js`, `vitest.config.js`, `tsconfig.app.json`, `tsconfig.base.json`, `packages/prismgb-gpu/vitest.config.ts`
- Modify: `packages/prismgb-gpu/src/index.ts`, `packages/prismgb-gpu/src/runtime.ts`, `packages/prismgb-gpu/src/application/catalog.ts`
- Modify: `packages/prismgb-gpu/tests/unit/index.root-safety.test.ts`, `packages/prismgb-gpu/tests/unit/application/catalog.test.ts`

**Interfaces:**
- Produces: `@prismgb/gpu` exports exactly `{ PRESET_POLICY, getUiPresets, resolvePreset, type RenderCapabilities }`; `@prismgb/gpu/runtime` exports exactly `{ createGpuVideoRendererSession, detectBrowserGpuCapabilities, type GpuVideoRendererSession, type GpuVideoRendererStats }`. Package exports map = `['.', './runtime']`.

- [ ] **Step 1: Rewrite the 6 package-test imports.** In each listed test file, change the module specifier `'@prismgb/gpu/testkit'` to `'@/testkit/fixtures'` (imported names unchanged). Example (`worker/client.test.ts`):

```ts
import { createMockCanvas } from '@/testkit/fixtures';
```

(`src/testkit/fixtures.ts` — the directory module — STAYS; only the public barrel and entrypoint go.)

- [ ] **Step 2: Delete the barrel + public export**

```bash
git rm packages/prismgb-gpu/src/testkit.ts
```

In `packages/prismgb-gpu/package.json`, delete the exports entry:
```json
    "./testkit": {
      "import": "./dist/testkit.js",
      "types": "./dist/testkit.d.ts"
    }
```
(and the trailing comma on the preceding `./runtime` block).

- [ ] **Step 3: Update the boundary gate** — in `scripts/check-gpu-package-boundaries.js`:

Change:
```js
const EXPECTED_GPU_EXPORTS = ['.', './runtime', './testkit'];
```
to:
```js
const EXPECTED_GPU_EXPORTS = ['.', './runtime'];
```

and delete the alias entry line:
```js
  '@prismgb/gpu/testkit': './packages/prismgb-gpu/src/testkit'
```
(and the trailing comma on the preceding `@prismgb/gpu/runtime` line).

- [ ] **Step 4: Remove the seven testkit alias sites**
  - `vite.config.js`: delete the line `      { find: /^@prismgb\/gpu\/testkit$/, replacement: path.resolve(__dirname, 'packages/prismgb-gpu/src/testkit.ts') },`
  - `vitest.config.js`: delete the top-level sharedAlias line `  '@prismgb/gpu/testkit': path.resolve(__dirname, 'packages/prismgb-gpu/src/testkit.ts'),` AND the two identical lines inside the `gpu-package` project (one under `test.alias`, one under `resolve.alias`).
  - `tsconfig.app.json` and `tsconfig.base.json`: in each, delete the paths entry:
```json
      "@prismgb/gpu/testkit": [
        "./packages/prismgb-gpu/src/testkit"
      ],
```
  - `packages/prismgb-gpu/vitest.config.ts`: delete the line `      '@prismgb/gpu/testkit': resolve(__dirname, 'src/testkit.ts'),`

- [ ] **Step 5: Contract `packages/prismgb-gpu/src/index.ts`.** Keep the banner comment; replace the entire export body with:

```ts
export type { RenderCapabilities } from './domain/types';

export { PRESET_POLICY } from './domain/presets';

export { getUiPresets, resolvePreset } from './application/catalog';
```

- [ ] **Step 6: Contract `packages/prismgb-gpu/src/runtime.ts`** to:

```ts
import type { RenderCapabilities } from './domain/types';

export {
  createGpuVideoRendererSession,
  type GpuVideoRendererSession
} from './application/video-session';

export async function detectBrowserGpuCapabilities(): Promise<RenderCapabilities> {
  const { detectBrowserGpuCapabilities: detect } = await import('./infrastructure/capabilities.browser');
  return detect();
}

export type { GpuVideoRendererStats } from './domain/types';
```

- [ ] **Step 7: Delete the dead catalog builders** — in `packages/prismgb-gpu/src/application/catalog.ts`, delete the three functions `freezePreset`, `createShaderPresetCatalog`, and `getAllPresets` in full (from `function freezePreset(preset: RenderPreset): RenderPreset {` through the closing `}` of `getAllPresets`). Keep `getPreset`, `getPackageDefaultPreset`, `getRendererDefaultPreset`, `resolvePreset`, `getUiPresets`, and the `catalog` parameter threading (the extensibility seam survives — only the producerless builders go). Remove `ShaderPresetCatalog`'s import only if now unused (it is still used by the remaining function signatures — keep it).

- [ ] **Step 8: Update the surface-lock tests**

In `packages/prismgb-gpu/tests/unit/index.root-safety.test.ts`:
- change `    expect(gpu.getRendererDefaultPreset().id).toBe('vibrant');` to `    expect(gpu.resolvePreset(null).id).toBe('vibrant');`
- add to the internal-details assertions block:
```ts
    expect(gpu.getRendererDefaultPreset).toBeUndefined();
```

In `packages/prismgb-gpu/tests/unit/application/catalog.test.ts`:
- replace the import block with:
```ts
import { describe, expect, it } from 'vitest';
import { PRESET_POLICY, getUiPresets, resolvePreset } from '@/index';
import { BUILT_IN_PRESET_CATALOG, BUILT_IN_PRESETS } from '@/domain/presets';
import {
  getPackageDefaultPreset,
  getPreset,
  getRendererDefaultPreset
} from '@/application/catalog';
```
- delete these five `it` blocks in full: `'returns all built-in presets with descriptions'`, `'validates custom catalog default and UI references'`, `'deep-freezes custom catalog presets'`, `'rejects malformed custom catalogs'`, `'rejects duplicate preset ids'`.
- keep: `'exports built-in catalog and policy...'`, `'resolves presets by id...'`, `'keeps package and renderer defaults distinct'`, `'returns UI summaries in built-in catalog order'`, `'resolves unknown renderer selections to the renderer default'`.

(`packages/prismgb-gpu/tests/unit/runtime/export-surface.test.ts` needs no change — it asserts only the two kept runtime functions.)

- [ ] **Step 9: Validate (full ladder — this task touches the worker/build seam)**

```bash
npm run typecheck
npx vitest run --project gpu-package
npm run test:run
npm run check:gpu-boundaries
npm run build:vite
npm run dev:smoke
```
Expected: ALL pass. `build:vite` must remain green (worker bundling untouched but surface-adjacent).

Run: `grep -rn "gpu/testkit\|createShaderPresetCatalog\|getAllPresets\|freezePreset" src tests packages scripts vite.config.js vitest.config.js tsconfig.app.json tsconfig.base.json`
Expected: no matches.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor(gpu): contract public surface and retire testkit entrypoint"
```

### Task 15: Config hygiene — dead scripts, turbo task, stale knip ignores (CFG-3)

**Files:**
- Modify: `package.json`, `DEVELOPMENT.md`, `turbo.json`, `knip.json`

- [ ] **Step 1: `package.json`** — delete these two script lines:

```json
    "test:all": "vitest run",
```
```json
    "lint:ui-base": "npm run lint --workspace=@prismgb/ui-base",
```

- [ ] **Step 2: `DEVELOPMENT.md`** — delete the table row:

```markdown
| `npm run test:all` | Run all tests once (alias) |
```

- [ ] **Step 3: `turbo.json`** — delete the dead task block (no `turbo run lint` exists anywhere):

```json
    "lint": {
      "outputs": []
    }
```
(and the trailing comma on the preceding `typecheck` block).

- [ ] **Step 4: `knip.json`** — remove `"joi"` from the `ignoreDependencies` array (joi is not a dependency; zod migration residue) and delete the ignore line:

```json
    "**/*.generated.ts",
```
(no such files exist post-DI-codegen removal).

- [ ] **Step 5: Validate**

Run: `npm run lint && npm run test:run`
Expected: PASS (nothing referenced the removed entries; verified — `.github/` has zero references).

- [ ] **Step 6: Commit**

```bash
git add package.json DEVELOPMENT.md turbo.json knip.json
git commit -m "chore(config): remove dead scripts, turbo task, stale knip ignores"
```

### Task 16: P1 exit — gates, grep-zero sweep, metrics, tag

- [ ] **Step 1: Full gate ladder**

```bash
npm run test:run && npm run typecheck && npm run lint && npm run dev:smoke && npm run build:vite && npm run check:gpu-boundaries
```
Expected: ALL pass.

- [ ] **Step 2: Grep-zero sweep across every deleted symbol** (must return nothing):

```bash
grep -rn "PerformanceCache\|AnimationCache\|TypedRegistryFactory\|formatErrorLabel\|native-resolution\|capability-detector\|CapabilityDetector\|gpuPolicyResponseSchema\|unwrapOverride\|AppWithQuitFlag\|detectPlatform\|createTemplateActionSelector\|replaceManagedAsync\|ResolutionCalculator\|performanceUtils\|createAnimationCacheMock\|gpu/testkit\|createShaderPresetCatalog\|getAllPresets" src tests packages scripts
```

- [ ] **Step 3: Record P1 exit metrics** in `docs/northstar/PHASE_LOG.md` under "P1 — Exit metrics": new test-file/test counts, new prod/test LOC (same commands as Task 2 Step 1), and the LOC delta vs the P0 baseline (expect roughly −2,300 to −2,700).

```bash
git add docs/northstar/PHASE_LOG.md
git commit -m "docs(northstar): record P1 exit metrics"
```

- [ ] **Step 4: Tag and STOP**

```bash
git tag -a northstar-p1 -m "North Star P1: dead-code excision complete, all gates green"
git tag -l 'northstar-*'
```

Expected: `northstar-p0` and `northstar-p1` listed. **STOP — P1 review checkpoint. P2 (contract normalization) is a separate plan.**
