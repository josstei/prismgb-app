# Plan 04 — Thin the Shell: move renderer domain into packages

> Status: ready for autonomous execution (Codex). Conservative scoping plan.
> Base branch: `refactor/codebase_reduction`. Execute on a dedicated branch, gate, squash-merge.
>
> **Headline, honest outcome (re-verify before acting):** of the **49** units under
> `src/renderer/infrastructure/services/`, **exactly one** is provably package-domain with an
> existing owning package and **zero** renderer/DOM/IPC coupling:
> `gpu/gpu-frame-buffer.ts` → `@prismgb/gpu`. Everything else is genuine renderer layer
> (browser-media / canvas / DOM / `trpcClient` IPC adapters / event-bus UI bridges) **or** has no
> owning domain package. This plan moves the one unit rigorously (source **and** its unit test, so the
> package is self-testable) and *documents* the rest as intentional renderer glue. A single justified
> move plus an exhaustive stays-table is the correct result, not a failure to find more.

---

## 0. Goal & End State

`src/` becomes one unit thinner and `@prismgb/gpu` owns — and standalone-tests — its frame-buffering
primitive.

Concretely, "done" means:

1. `GpuFrameBuffer` lives in `packages/prismgb-gpu/src/application/gpu-frame-buffer.ts`, is exported
   from `packages/prismgb-gpu/src/index.ts`, and is consumed by the app via the existing
   `@prismgb/gpu` alias (DI registration repointed).
2. The unit test is **relocated into the package** at
   `packages/prismgb-gpu/tests/unit/application/gpu-frame-buffer.test.ts` so `@prismgb/gpu` is
   self-testable (`npm run test:run --workspace=@prismgb/gpu` exercises it). The former renderer-suite
   test is deleted.
3. `src/renderer/infrastructure/services/gpu/gpu-frame-buffer.ts` is **deleted**.
4. `@prismgb/gpu` remains **dependency-free and standalone-buildable** — the moved file's only prior
   external import (`@prismgb/core` logger *types*) is replaced by package-local `FrameBufferLogger` /
   `FrameBufferLoggerFactory` interfaces (interface-segregation: declare the contract you consume). No
   new package dependency, no build-order tail, no turbo/typecheck rewiring.
5. The exhaustive **Classification Table** (§3.4) is committed as this document: every service
   directory is recorded as STAY (with the disqualifying coupling) or MOVE, so a reviewer can see the
   audit was complete and conservative.
6. All gates green: `typecheck`, `test:run`, `lint` (root **and** `--workspace=@prismgb/gpu`),
   `build --workspace=@prismgb/gpu`, `dev:smoke`, `test:e2e`, and the coverage ratchet
   (`test:coverage` + `coverage:ratchet` **+ the CI `--check-monotonic` guard**) with thresholds
   rebalanced — and a time-boxed waiver added — only if the file's reattribution measurably lowers a
   scope floor.

Net source change (approximate): `−99` lines from `src/renderer/infrastructure/services/gpu/`
(source deleted), `−183` lines from `tests/unit/renderer/.../gpu-frame-buffer.test.ts` (test deleted),
`+~115` lines in `packages/prismgb-gpu/src/application/` (file body verbatim + the local logger
interfaces in place of the `@prismgb/core` import), `+~180` lines in
`packages/prismgb-gpu/tests/unit/application/` (relocated test with an inline mock logger factory),
**one** production import repoint (DI), one index export, and (conditionally) a coverage-threshold +
coverage-waiver edit.

---

## 1. Preconditions

Verify ALL before starting; abort if any fails.

0. **Commit this plan as the audit record and make the tree clean.** `docs/plan-04-thin-the-shell.md`
   (and any sibling untracked planning docs such as `docs/plan-03-ui-base-reactive-migration.md`) are
   currently **untracked**; the clean-tree check in step 1 will otherwise abort an autonomous executor
   immediately, and §7 requires this plan committed as the audit record. On the base branch, commit
   this doc (stash or commit any other untracked artifacts) first:
   ```bash
   git -C /Users/josstei/Development/prismgb-workspace/prismgb-app switch refactor/codebase_reduction
   git add docs/plan-04-thin-the-shell.md
   git commit -m "docs(gpu): add Plan-04 thin-the-shell audit record"
   # Commit OR stash any other untracked docs so the tree is clean (e.g. plan-03):
   git status --porcelain   # resolve every entry before proceeding
   ```
1. On base branch, clean tree:
   ```bash
   git -C /Users/josstei/Development/prismgb-workspace/prismgb-app rev-parse --abbrev-ref HEAD   # refactor/codebase_reduction
   git -C /Users/josstei/Development/prismgb-workspace/prismgb-app status --porcelain            # MUST be empty (see step 0)
   ```
2. Baseline suite green (husky pre-commit runs the full suite on every commit, so a red baseline
   blocks every commit):
   ```bash
   npm run test:run         # expect pass; record file/test counts as the baseline
   npm run typecheck        # expect pass (runs typecheck:app + :tests + :gpu + :core)
   npm run lint             # eslint (src only) + scripts/check-layer-boundaries.js, expect pass
   ```
3. Create and switch to the working branch:
   ```bash
   git switch -c refactor/p04-thin-shell-gpu-frame-buffer
   ```
4. Re-derive the move's facts (do not trust this doc blindly):
   ```bash
   # The single move candidate exists and imports ONLY @prismgb/core types:
   cat src/renderer/infrastructure/services/gpu/gpu-frame-buffer.ts   # READ ALL 99 lines; Phase 1.1 copies this verbatim
   grep -nE "^import|@renderer|navigator|document|window|HTMLCanvas|HTMLVideo|MediaStream|trpcClient|requestAnimationFrame" \
     src/renderer/infrastructure/services/gpu/gpu-frame-buffer.ts   # expect: only the @prismgb/core type import
   # Real CLASS import sites only (import-specific so GpuFrameBufferLike / createGpuFrameBufferMock do NOT trip a false abort):
   grep -rnE "import.*\bGpuFrameBuffer\b" src/ tests/ packages/
   ```
   Expected real class-import statements (exactly two; one production, one test) plus the index export:
   - `src/renderer/application/di/service-registrations.ts`
     (`import { GpuFrameBuffer } from '../../infrastructure/services/gpu/gpu-frame-buffer';`,
     registration `gpuFrameBuffer: (cradle) => new GpuFrameBuffer(cradle)`).
   - `tests/unit/renderer/infrastructure/services/gpu-frame-buffer.test.ts`
     (`import { GpuFrameBuffer } from '@renderer/infrastructure/services/gpu/gpu-frame-buffer';`).
   - Structural-only references (DO NOT change): `gpu-renderer.service.ts` uses a **local**
     `GpuFrameBufferLike` type (not an import of the class); `tests/factories/streaming-pipeline.factory.js`
     exposes `createGpuFrameBufferMock` (duck-typed). Neither imports the class, and neither matches the
     `\bGpuFrameBuffer\b` word boundary used above.

---

## 2. Locked Decisions (relevant to this plan)

- **Base branch** `refactor/codebase_reduction`; this plan runs on its own branch, gated, then
  squash-merged.
- **`@prismgb/core` stays dependency-free / standalone-buildable.** Not touched here.
- **`@prismgb/gpu` stays dependency-free.** This plan preserves that by using a package-local logger
  interface instead of importing `@prismgb/core`. (See §4 Phase 1 and the flagged fork.)
- **Conservative scoping is mandatory.** Only move what is *provably* package-domain with no
  renderer/DOM/IPC coupling and an existing owning package. Leave everything else as documented
  renderer layer. Do not collapse the device manifest/registry seam, do not touch the event bus, do
  not introduce signals/UI changes — those belong to other plans. (Relocating the moved unit's own
  test alongside it is *completing* the move, not scope expansion, and touches none of the above.)
- **Single philosophy-fork (owner can flip):** the moved file's logger typing. Default = local
  `FrameBufferLogger` interface (zero dependency tail). Alternative = depend on `@prismgb/core` for
  `LoggerFactoryLike`/`LoggerLike` (one-line redirect, but adds a build-gate tail — see §4 Phase 1,
  "Fork").

---

## 3. Current-State Facts (re-verify before acting)

### 3.1 Service inventory
```bash
find src/renderer/infrastructure/services -type f | sort        # 49 files across 9 domains
find src/renderer/infrastructure/services -maxdepth 1 -type d   # capture devices gpu performance platform settings streaming transcode updates
```

### 3.2 Build / resolution model (governs the gates)
- **`npm run typecheck`** runs four steps in sequence: `typecheck:app && typecheck:tests &&
  typecheck:gpu && typecheck:core` (see root `package.json`). When a failure occurs, identify which of
  the four emitted it before diagnosing.
  - `typecheck:app` = `node scripts/typecheck-app.js` over `tsconfig.app.json` (which extends
    `tsconfig.base.json`): resolves `@prismgb/gpu` and `@prismgb/core` via **source** `paths`
    (`./packages/prismgb-*/src`). ⇒ the app typecheck reads the package **source**; no gpu/core `dist`
    rebuild is needed for it to see the moved file.
  - `typecheck:tests` = `tsc -p tsconfig.test.json` (includes `src/**` + `tests/unit/**` +
    `tests/factories/**`; **does not** include `packages/**`, so the relocated package test is not
    typechecked here — consistent with every existing package test).
  - `typecheck:gpu` = `npm run typecheck --workspace=@prismgb/gpu` = `tsc --noEmit` in
    `packages/prismgb-gpu/` using `packages/prismgb-gpu/tsconfig.json`, which has **no `@prismgb/*`
    path mapping**, `moduleResolution: bundler`, and **excludes `tests`**. ⇒ a `@prismgb/core` import
    here would resolve via `node_modules` to `@prismgb/core`'s `dist/index.d.ts` and would **fail if
    core `dist` is absent** (it is gitignored; the bare `typecheck:gpu` does not build it). **The
    default (local-interface) approach adds no external import, so `typecheck:gpu` is unaffected.**
    Only the flagged fork incurs this tail.
  - `typecheck:core` = `tsc --noEmit` in `packages/prismgb-core/`. Untouched by this plan.
- **Package build** `npm run build --workspace=@prismgb/gpu` = `vite build && tsc
  --emitDeclarationOnly` in `packages/prismgb-gpu/`. This is what CI runs **before** typecheck
  (`reusable-ci-tests.yml`: "Build GPU package types"), and it publishes `dist/index.d.ts` /
  `dist/application/gpu-frame-buffer.d.ts`. The default local-interface file has no `@prismgb/*`
  import, so this build needs no core `dist` and is clean. `packages/prismgb-gpu/dist/` is gitignored —
  the build is a gate, not a committed artifact.
- **Runtime / vite**: `vite.config.js` aliases `@prismgb/*` → package `src` for the renderer, main,
  AND preload builds (three alias blocks). `@prismgb/gpu` consumers resolve to source at app
  build/runtime. `dist/` is gitignored and not built in the default dev flow. ⇒ `dev:smoke` is the
  only gate that proves DI resolves `gpuFrameBuffer` from `@prismgb/gpu` at runtime.
- **Layer-boundary checker** (`scripts/check-layer-boundaries.js`) walks **`src/` only**
  (`srcRoot = projectRoot/src`); specifiers resolving outside `src/` (i.e. `@prismgb/*` → `packages/`)
  classify as `null` and are exempt. ⇒ importing `@prismgb/gpu` from `renderer/application` is already
  legal and remains exempt after the move. Note: the checker (and root `npm run lint`'s eslint glob,
  `"src/**/*.{js,ts}"`) do **not** cover `packages/**` — the moved package file is linted only by the
  package's own `lint` script (`eslint src/`), invoked via `npm run lint --workspace=@prismgb/gpu`
  (§4 Phase 2 gate).

### 3.3 Test & coverage topology (governs the ratchet gate)
- `npm run test:run` runs 5 vitest projects from `vitest.config.js`: `shared-node`,
  `renderer-happy-dom` (includes `tests/unit/renderer/**`), `main-preload`, `gpu-package`
  (includes `packages/prismgb-gpu/tests/unit/**/*.test.ts`, alias `@`→package src,
  environment happy-dom, globals true), `core-package`. Husky `.husky/pre-commit` runs
  `npm run test:run` on **every commit** — each commit must be green.
- **Coverage is a single merged v8 report** (`baseCoverageConfig`, `all:true`,
  `include:['src/**/*.{js,ts}']`). Empirically the merged report
  (`artifacts/coverage/coverage-summary.json`) **also contains `packages/prismgb-gpu/src/...`
  entries** (executed package files are reported by absolute path), which is why
  `baseCoverageConfig.exclude` lists `packages/prismgb-gpu/src/infrastructure/{webgpu,webgl2,workers,canvas2d}/**`.
  The target subtree `packages/prismgb-gpu/src/application/**` is **not** excluded, so the moved file
  is counted. ⇒ **coverage is attributed by file path, regardless of which project ran the test.**
  (`**/index.{js,ts}` is excluded, so the new index export line does not affect coverage.)
- `scripts/coverage-thresholds.json` scopes (mode `enforce`):
  - `renderer-happy-dom` → `src/renderer`, minimums L85/S85/F85/B72, `expiresOn` 2026-12-31.
  - `gpu-package` → `packages/prismgb-gpu/src`, minimums L76/S76/F89/B63, `expiresOn` 2026-12-31.
  - (others: `shared-node` → `src/shared`; `main-preload` → `src/main`,`src/preload`.)
- **Monotonic CI guard (load-bearing).** CI (`reusable-ci-tests.yml`) runs, after the enforce ratchet,
  `node scripts/coverage-ratchet.js --check-monotonic --previous <base coverage-thresholds.json>`
  against `github.base_ref` (= the PR base, `refactor/codebase_reduction`). **Any reduction of a
  threshold is rejected unless an unexpired waiver in `scripts/coverage-waivers.json` covers it**
  (`waivers` is currently `[]`). So a Phase-3 threshold reduction that passes the local enforce ratchet
  will still **fail CI** without a matching waiver. See §4 Phase 3.
- ⇒ Moving `gpu-frame-buffer.ts` from `src/renderer/...` to `packages/prismgb-gpu/src/...`
  **removes its (well-covered) lines from the `renderer-happy-dom` scope** (the file leaves
  `src/renderer` entirely; this is independent of where its test now runs) and adds them, fully
  covered by the relocated package test, to the `gpu-package` scope. Removing a ~fully-covered file
  from `renderer-happy-dom` slightly lowers that scope's percentage (possibly a small dip below 85).
  This is the only coverage risk; §4 Phase 3 measures it and, only if a floor is breached, rebalances
  **and** waives.

### 3.4 Classification Table (the audit deliverable)

Re-verify each row's coupling with the §3.1 `find` + the per-directory coupling grep:
```bash
cd src/renderer/infrastructure/services && for d in */; do echo "### $d"; \
  grep -rhnE "navigator\.|document\.|window\.|HTMLElement|HTMLCanvas|HTMLVideo|MediaStream|OffscreenCanvas|Worker\(|requestAnimationFrame|localStorage|trpcClient|@renderer/" "$d" | sort -u | head; done
```

Directory file totals (disjoint partition; rows that split a directory sum to the directory total):
`capture` 2, `devices` 5, `gpu` 6, `performance` 3, `platform` 3, `settings` 4, `streaming` 23,
`transcode` 1, `updates` 2 — **49 total**.

| Unit | Files | Disposition | Owning pkg | Disqualifying coupling (why it is NOT a clean move) |
|---|---|---|---|---|
| `gpu/gpu-frame-buffer.ts` | 1 | **MOVE** | `@prismgb/gpu` | **None.** Imports only `@prismgb/core` logger *types*; uses universal `performance.now()`; `frame: unknown`. Pure bounded-queue + latency metrics. Owning package exists. |
| `gpu/ (other)` | 5 | STAY | — | `gpu-renderer.service.ts`, `gpu-recording.service.ts`, `gpu-render-loop.service.ts`, `gpu-renderer-setup.ts`, `gpu-worker-manager.ts`: `HTMLCanvasElement`/`HTMLVideoElement`, `document.createElement`, `requestAnimationFrame`/`requestVideoFrameCallback`, `OffscreenCanvas`, and `@renderer/*` imports (capability-detector, worker-protocol, streaming-contracts). Renderer rendering glue. (1 + 5 = 6 = `gpu/` total.) |
| `devices/` | 5 | STAY | (`@prismgb/devices` consumed, not duplicated) | `device.service.ts` et al. consume `@prismgb/devices` (`DeviceRegistry`, `DeviceDetectionHelper`, `chromaticConfig`) but add browser-media (`browserMediaService.getUserMedia`, `MediaStream`) + event-bus + IPC. The package is the host/profile domain; these are the renderer UI-state/IPC adapters. Legitimate layering. |
| `streaming/ (other)` | 21 | STAY | — | Heavy DOM/browser: `navigator.mediaDevices.getUserMedia`, `AudioContext`/`webkitAudioContext`, `window.getComputedStyle`/`devicePixelRatio`, `HTMLCanvasElement`/`HTMLVideoElement`, `createMediaStreamSource`. Renderer acquisition/canvas pipeline. (21 + the two utils rows below = 23 = `streaming/` total.) |
| `streaming/audio-gain.utils.ts` | 1 | STAY (noted) | — (none) | Pure math (`computeRms`, `createEaseInCurve`), zero imports — but **no owning domain package**. Promoting to `@prismgb/core` would pollute the dep-free generic base with audio-specific DSP; creating an audio package for two functions is over-reach. Deferred. |
| `streaming/native-resolution.utils.ts` | 1 | STAY | — | Imports renderer `Dimensions` (`@renderer/.../streaming-contracts`) and returns `ImageBitmapOptions` (browser type). Coupled to renderer contracts + DOM. |
| `capture/` | 2 | STAY | — | `document.createElement('canvas')`, `HTMLCanvasElement`/`HTMLVideoElement`/`ImageBitmap`, `Blob`, `@renderer/lib` (`downloadFile`, `FilenameGenerator`). Browser capture glue. |
| `transcode/transcode.service.ts` | 1 | STAY | (`@prismgb/transcode` is the main-side ffmpeg service) | Renderer IPC adapter: `trpcClient.transcode.*`, `Blob.arrayBuffer()`, event-bus publish, `createTrpcEventBridge`. The package runs ffmpeg in **main**; this is the renderer end of the IPC boundary — not a duplicate. (1 = `transcode/` total.) |
| `settings/` | 4 | STAY | — | `trpcClient.window.*`/`loginItem.*`, `document.addEventListener('fullscreenchange')`, `document.fullscreenElement`, `@renderer/lib` settings definitions. Renderer settings/IPC glue. |
| `performance/` | 3 | STAY (noted) | — (none) | `performance-metrics/state/animation.service.ts` are adapter-injected and avoid direct DOM, but depend on `@prismgb/ipc` contract types (`ProcessMetricsResponse`) and `@prismgb/events` types (all `import type`), and are renderer perf-orchestration. **No owning domain package**; a new `@prismgb/performance` package is out of scope. |
| `platform/` | 3 | STAY | — | `health.service.ts`, `viewport.service.ts`: `window.getComputedStyle`, `HTMLElement`/`HTMLCanvasElement`, `requestVideoFrameCallback`. `trpc-event-bridge.factory.ts`: wraps `trpcClient.*` subscriptions. Renderer/IPC glue. |
| `updates/` | 2 | STAY | (`@prismgb/updates` is the main-side updater) | Renderer IPC adapter + UI bridge: `trpcClient.update.*`, event-bus `UI.STATUS_MESSAGE`/`UPDATE.BADGE_*`. The package wraps electron-updater in **main**; not a duplicate. |
| `infrastructure/rendering/capability-detector.utils.ts` | 1 | STAY | (`@prismgb/gpu` consumed) | **Not a duplicate of `@prismgb/gpu`'s `detectCapabilities`.** It *consumes* `detectCapabilities` and wraps it with renderer concerns: `trpcClient.gpu.getPolicy` (IPC) + `navigator.userAgent` fallback + `RendererCapabilities` extension. Renderer policy wrapper. (Outside the `services/` tree; listed for completeness.) |

No **needs-split** rows: the only pure units without an owning package (`audio-gain.utils.ts`,
`performance/*`) are best left in place per the conservatism mandate; extracting them would create a
package for its own sake. They are recorded above with explicit rationale.

---

## 4. Phased Implementation

> Each step lists exact paths, the change, the shell commands, the GATE, and the commit message
> (clean conventional, ≤100-char subject, **no AI/tool attribution**, **never `--no-verify`**).
> The move (Phase 1+2) is one atomic commit so every committed state is green under husky.

### Phase 1 — Land the package file (create + export)

**1.1 Create** `packages/prismgb-gpu/src/application/gpu-frame-buffer.ts`.

Placement rationale: `application/` already holds the package's testable, non-backend runtime helpers
(`capability-detector.ts`, `uniform-builder.ts`) and is outside every coverage-excluded
`infrastructure/*` subtree, so the file is counted in the `gpu-package` scope. Keep the filename and
the exported class name `GpuFrameBuffer` (renaming would ripple into the app's structural
`GpuFrameBufferLike` type, the `createGpuFrameBufferMock` factory, and the `gpuFrameBuffer` DI token —
out of scope; note as optional follow-up).

**Do not retype the class body from memory.** `cat` the real source (you already did so in §1 step 4),
copy all **99 lines verbatim**, then apply **exactly two deltas** (JSDoc only, no inline comments,
strict types, no `any`):

- **Delta A:** delete the source import block (lines 1–4,
  `import type { LoggerFactoryLike, LoggerLike } from '@prismgb/core';`) and add the two local
  interfaces shown below.
- **Delta B:** in `type GpuFrameBufferDependencies`, change `loggerFactory?: LoggerFactoryLike` →
  `loggerFactory?: FrameBufferLoggerFactory`; in the class field declarations, change
  `_logger: LoggerLike | undefined` → `_logger: FrameBufferLogger | undefined`.

Everything else — `type BufferedFrame`, the constructor body, and all eight methods
(`getCapacity`, `getSize`, `enqueue`, `dequeue`, `isFull`, `flush`, `getMetrics`, `resetMetrics`,
including the 60-sample sliding window in `dequeue` and the running-average in `getMetrics`) — is
**byte-for-byte the cat'd source**. Keep `GpuFrameBufferDependencies` as a `type` alias (not an
`interface`), matching the source. The resulting top of the file:

```ts
type BufferedFrame = {
  frame: unknown;
  enqueueTime: number;
};

/** Minimal logging surface consumed by {@link GpuFrameBuffer}. */
interface FrameBufferLogger {
  debug(message: string): void;
}

/** Factory yielding a named {@link FrameBufferLogger}. */
interface FrameBufferLoggerFactory {
  create(name: string): FrameBufferLogger;
}

type GpuFrameBufferDependencies = {
  loggerFactory?: FrameBufferLoggerFactory;
  bufferSize?: number;
};

export class GpuFrameBuffer {
  _logger: FrameBufferLogger | undefined;
  _capacity: number;
  _queue: BufferedFrame[];
  _totalEnqueued: number;
  _totalDropped: number;
  _enqueueTimes: number[];

  constructor({ loggerFactory, bufferSize = 3 }: GpuFrameBufferDependencies = {}) {
    this._logger = loggerFactory?.create('GpuFrameBuffer');
    this._capacity = bufferSize;
    this._queue = [];
    this._totalEnqueued = 0;
    this._totalDropped = 0;
    this._enqueueTimes = [];
  }

  // getCapacity / getSize / enqueue / dequeue / isFull / flush / getMetrics / resetMetrics:
  // copied VERBATIM from lines 34-98 of the cat'd source. Do not retype or paraphrase.
}
```
The real `ConsoleLoggerFactory.create()` structurally satisfies `FrameBufferLoggerFactory`
(`.create(name) → { debug(message) }`), so DI registration (`new GpuFrameBuffer(cradle)`, `cradle:any`)
type-checks unchanged.

> **Fork (only if the owner flips it):** to instead reuse the canonical contract, replace the local
> interfaces with `import type { LoggerFactoryLike, LoggerLike } from '@prismgb/core';`
> (`loggerFactory?: LoggerFactoryLike`, `_logger: LoggerLike | undefined`), add `"@prismgb/core": "*"`
> to `packages/prismgb-gpu/package.json` `dependencies`, AND make BOTH the standalone gpu build and
> typecheck gates build core first (`npm run build --workspace=@prismgb/core` before
> `npm run build --workspace=@prismgb/gpu` and `npm run typecheck`, or switch to
> `turbo run build typecheck --filter=@prismgb/gpu` which runs `^build`). The default avoids all of
> this.

**1.2 Export** from `packages/prismgb-gpu/src/index.ts` — append after the existing exports:
```ts
export { GpuFrameBuffer } from './application/gpu-frame-buffer';
```

**GATE (Phase 1 — additive/unused file; do not commit yet):**
```bash
npm run build --workspace=@prismgb/gpu   # CI parity: vite build + tsc --emitDeclarationOnly; proves the new public export compiles & emits d.ts (no core dist needed under the default)
npm run typecheck                         # app + tests + gpu + core; app reads package source via tsconfig paths
```
(The standalone `typecheck:gpu` is intentionally **not** run separately — `npm run typecheck` already
includes it.) Do **not** commit yet — commit atomically with Phase 2 so no committed state has a
duplicate definition or a stale test.

### Phase 2 — Repoint consumer, relocate the test, delete the source (atomic with Phase 1)

**2.1** `src/renderer/application/di/service-registrations.ts`: change the import only
(registration line `gpuFrameBuffer: (cradle) => new GpuFrameBuffer(cradle)` is unchanged):
```diff
- import { GpuFrameBuffer } from '../../infrastructure/services/gpu/gpu-frame-buffer';
+ import { GpuFrameBuffer } from '@prismgb/gpu';
```

**2.2 Relocate the unit test into the package** so `@prismgb/gpu` is self-testable.
Create `packages/prismgb-gpu/tests/unit/application/gpu-frame-buffer.test.ts`. `cat` the existing
renderer test (`tests/unit/renderer/infrastructure/services/gpu-frame-buffer.test.ts`) and copy its
**`describe` body (lines 5–182) verbatim** into the new file. Apply **only** these two header changes
(the gpu-package vitest project resolves `@`→`packages/prismgb-gpu/src` and has `globals:true`,
environment `happy-dom`, exactly like the existing `application/capability-detector.test.ts`):
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GpuFrameBuffer } from '@/application/gpu-frame-buffer';

const createLoggerFactory = () => ({ create: () => ({ debug: vi.fn() }) });

describe('GpuFrameBuffer', () => {
  // body (lines 5-182 of the cat'd renderer test) copied VERBATIM; only the two imports
  // above changed (the @renderer import → @/, and the renderer factory import → the inline
  // mock). GpuFrameBuffer only calls loggerFactory.create(name).debug(message), so this
  // mock fully satisfies it.
});
```
Then delete the former renderer-suite test:
```bash
git rm tests/unit/renderer/infrastructure/services/gpu-frame-buffer.test.ts
```
Rationale: the relocated test is collected by the root `gpu-package` vitest project AND by
`npm run test:run --workspace=@prismgb/gpu`, making the package self-testable for its new public
export. Coverage attributes by path (§3.3), so the file lands in the `gpu-package` scope fully covered.

**2.3** Delete the old source file:
```bash
git rm src/renderer/infrastructure/services/gpu/gpu-frame-buffer.ts
```

**2.4** Confirm no dangling references (path **and** class-import forms):
```bash
grep -rn "infrastructure/services/gpu/gpu-frame-buffer" src/ tests/   # expect: no matches
grep -rnE "import.*\bGpuFrameBuffer\b" src/ tests/                    # expect: ONLY service-registrations.ts importing from '@prismgb/gpu'
```

**GATE (Phase 2 — must pass before the commit; husky re-runs `test:run`):**
```bash
npm run typecheck                       # app + tests + gpu + core, all green
npm run lint                            # eslint (src only) + check-layer-boundaries.js; @prismgb/gpu import exempt
npm run lint --workspace=@prismgb/gpu   # lints the moved package file (root lint does NOT cover packages/**)
npm run test:run                        # full 5-project suite; same test count as baseline (test relocated, not removed)
npm run dev:smoke                       # boots dev; proves DI resolves `gpuFrameBuffer` from @prismgb/gpu at runtime
```
Commit (explicit paths — do **not** use `git add -A`; the `git rm`s in 2.2/2.3 are already staged, and
`packages/prismgb-gpu/dist/` from the Phase-1 build is gitignored and must not be staged):
```bash
git add packages/prismgb-gpu/src/application/gpu-frame-buffer.ts \
        packages/prismgb-gpu/src/index.ts \
        packages/prismgb-gpu/tests/unit/application/gpu-frame-buffer.test.ts \
        src/renderer/application/di/service-registrations.ts
# packages/prismgb-gpu/dist/ (from the Phase-1 build) is gitignored (.gitignore: `dist/`), so it will not appear:
git status --porcelain   # verify ONLY the 4 added files + the 2 staged deletions are staged
git commit -m "refactor(gpu): move GpuFrameBuffer into @prismgb/gpu with a package-local logger contract"
```

### Phase 3 — Coverage reattribution & ratchet rebalance (conditional)

Measure the merged coverage and the affected scopes:
```bash
npm run test:coverage
node -e "const s=require('./artifacts/coverage/coverage-summary.json');\
const tot=(scope)=>{let c=0,t=0;for(const[k,v]of Object.entries(s)){if(k==='total')continue;\
if(k.replace(process.cwd()+'/','').startsWith(scope)){c+=v.lines.covered;t+=v.lines.total;}}\
return t?((c/t*100).toFixed(2)+'% ('+c+'/'+t+')'):'n/a';};\
console.log('renderer-happy-dom src/renderer:',tot('src/renderer'));\
console.log('gpu-package packages/prismgb-gpu/src:',tot('packages/prismgb-gpu/src'));"
npm run coverage:ratchet   # ENFORCE mode; passes iff measured coverage >= each scope minimum
```

The **authoritative** measured percentage for each scope/metric is the value `coverage:ratchet`
itself prints (`<target> <metric>=NN.NN` on failure, and `- <metric>: NN.NN%` per target on the
report) — it applies the `baseCoverageConfig` excludes. The `node -e` helper above is **informational
only** and may differ because it does not apply those excludes; do **not** set a new floor from the
helper's number.

Interpretation & action:
- If `coverage:ratchet` **passes**, do nothing further in this phase — **no threshold or waiver edit**,
  so the monotonic guard is a no-op and CI is satisfied. Skip to Phase 4.
- If it **fails on `renderer-happy-dom`** (expected if removing the ~fully-covered file lowers the
  scope below a floor), perform **both** of the following in a single commit:
  1. Edit `scripts/coverage-thresholds.json` → the `renderer-happy-dom` target `minimums` down to the
     **measured** floor (round each breached metric **down** to the integer at or just below the value
     the **ratchet reports** as `actual` for that scope/metric; leave unbreached metrics untouched).
     Keep `expiresOn` unchanged. Set its `notes` to the complete string below (this *replaces* the
     field value — do not hand-concatenate):
     ```
     Renderer coverage restored to 85 after the 2026-05-29 relocations were re-balanced (workflow/performance suites re-collected; untestable streaming adapters/factory re-excluded). ADR-0001 waivers discharged. Rebalanced after gpu-frame-buffer.ts moved to @prismgb/gpu (Plan 04).
     ```
  2. Add a time-boxed waiver to `scripts/coverage-waivers.json` `waivers` for **each** lowered
     `(target, metric)` pair, or the monotonic CI guard rejects the reduction. Schema (the ratchet
     validates `target`/`metric`/`to`/`expiresOn`; `from`/`owner`/`reason` are documentary):
     ```json
     {
       "target": "renderer-happy-dom",
       "metric": "lines",
       "from": 85,
       "to": <new minimum you wrote in coverage-thresholds.json>,
       "expiresOn": "2026-09-30",
       "owner": "platform:ui",
       "reason": "Structural reattribution: gpu-frame-buffer.ts (well-covered) moved to @prismgb/gpu under Plan 04; src/renderer denominator shrank. Not a quality regression. Restore on the next renderer coverage paydown."
     }
     ```
     `to` MUST be `<=` the new minimum, and `expiresOn` MUST be in the future (today is 2026-06-29; use
     a near-term, time-boxed date such as `2026-09-30`).
- If it **fails on `gpu-package`** (only if the moved file dips that scope below L76/S76/F89/B63 —
  unlikely given the relocated test exercises it fully), rebalance that target's `minimums` to the
  measured floor and add an analogous waiver/note the same way.

Re-run BOTH the enforce ratchet and the monotonic guard locally (the latter is what CI runs against the
base branch) before committing:
```bash
npm run coverage:ratchet   # enforce: measured >= (lowered) minimums
git show refactor/codebase_reduction:scripts/coverage-thresholds.json > /tmp/base-coverage-thresholds.json
node scripts/coverage-ratchet.js --check-monotonic --previous /tmp/base-coverage-thresholds.json   # waiver must cover every reduction
```
Both must pass, then commit (husky `test:run` still green — `test:run` thresholds are 0, so the
ratchet/waiver edits do not affect it):
```bash
git add scripts/coverage-thresholds.json scripts/coverage-waivers.json
git commit -m "test(coverage): rebalance+waive renderer scope after GpuFrameBuffer move to @prismgb/gpu"
```

### Phase 4 — End-to-end verification (no commit unless a fix is needed)

`GpuFrameBuffer` feeds the GPU render loop (`gpu-renderer.service` consumes the `gpuFrameBuffer`
token), so the streaming/capture e2e paths exercise it:
```bash
npm run test:e2e          # builds vite then runs the 86 Playwright tests; expect all pass
```
If a failure traces to the move (DI/boot/render path), fix forward and re-run Phases 2–4; otherwise
the branch is ready to squash-merge into `refactor/codebase_reduction`.

---

## 5. Gates & Verification

Gate matrix (run in this order at the noted phases):

| Gate | Command | Catches | Phases |
|---|---|---|---|
| Package build | `npm run build --workspace=@prismgb/gpu` | CI-parity build of the new public export; `d.ts` emit; would catch a malformed export | 1 |
| Typecheck (full) | `npm run typecheck` | type breaks across `typecheck:app` + `:tests` + `:gpu` + `:core` | 1, 2 |
| Lint (root) | `npm run lint` | eslint (`src/**` only) + `check-layer-boundaries.js` (src-only) violations | 2 |
| Lint (package) | `npm run lint --workspace=@prismgb/gpu` | eslint violations in the moved package file (root lint does not cover `packages/**`) | 2 |
| Unit/integration suite | `npm run test:run` | regressions across all 5 projects (incl. the relocated `gpu-package` test); husky runs it per commit | 2 (+ every commit) |
| Runtime boot / DI | `npm run dev:smoke` | **only** gate that catches DI token / package-resolution / boot regressions (typecheck + test:run use `@prismgb/*`→src aliasing) | 2 |
| Coverage enforce | `npm run test:coverage && npm run coverage:ratchet` | measured scope coverage below a floor after reattribution | 3 |
| Coverage monotonicity | `node scripts/coverage-ratchet.js --check-monotonic --previous <base thresholds>` | a threshold reduction lacking an unexpired waiver (mirrors the CI gate) | 3 (only if a threshold was lowered) |
| E2E | `npm run test:e2e` | device/stream/capture/render path regressions (86 tests) | 4 |

Failure interpretation:
- `npm run build --workspace=@prismgb/gpu` or `typecheck:gpu` failing to resolve an import ⇒ you took
  the **fork** (added `@prismgb/core`) without building core `dist`; either revert to the local
  interface or build core first (see Phase 1 Fork).
- `npm run lint --workspace=@prismgb/gpu` failing ⇒ eslint violation in the new package file; fix in
  place (root `npm run lint` would not have surfaced it).
- `dev:smoke` "DI container token resolution failure" for `gpuFrameBuffer` ⇒ the `@prismgb/gpu` index
  export (1.2) or the DI import repoint (2.1) is missing/typo'd.
- `test:run` failure in the `gpu-package` project ⇒ a delta beyond the two allowed import changes crept
  into the relocated test, or the `@`→package-src alias path is wrong; the body must be the verbatim
  copy.
- `coverage:ratchet` (enforce) failure ⇒ §4 Phase 3 (rebalance the regressed scope to the measured
  floor).
- `--check-monotonic` failure ⇒ a lowered threshold lacks a covering, unexpired waiver in
  `scripts/coverage-waivers.json` (§4 Phase 3, step 2).

---

## 6. Risks, Mitigations & Rollback

| Risk | Likelihood | Blast radius | Mitigation | Rollback |
|---|---|---|---|---|
| Coverage enforce regresses `renderer-happy-dom` | Medium | CI ratchet gate only | Expected; rebalance to measured floor in Phase 3 with a justifying note | Revert the thresholds+waivers commit |
| Monotonic CI guard rejects the lowered threshold | High (if any threshold lowered) | CI monotonic gate | Add a time-boxed waiver in the same commit; verify locally with `--check-monotonic` | Revert the thresholds+waivers commit |
| `gpu-package` scope dips below its minimums | Low (relocated test covers the file) | CI ratchet gate | Re-measure; rebalance+waive that scope too | Revert the thresholds+waivers commit |
| DI fails to resolve `gpuFrameBuffer` at runtime | Low | App boot | `dev:smoke` catches before merge; index export + import repoint verified in Phase 2 | `git revert` the move commit (single, atomic) |
| Relocated package test drifts from the verbatim body | Low | One test file | Copy lines 5–182 verbatim; only the two imports change; `test:run` catches behavioral drift | Revert; re-copy verbatim |
| Package file has an eslint violation root lint missed | Low | CI lint gate | `npm run lint --workspace=@prismgb/gpu` in the Phase 2 gate | Fix in place |
| Mis-scope: a "stays" unit was actually packageable (or vice versa) | Low | Review churn | §3.4 cites the disqualifying coupling per directory; executor re-runs the coupling grep before acting | No code moved for stays — nothing to roll back |
| Fork chosen, breaks bare `build`/`typecheck:gpu` in CI | Low (default avoids) | CI build/typecheck | Default = local interface (no dep). If forking, build core `dist` first per Phase 1 Fork | Revert to local interface |

Rollback is cheap throughout: the move is one atomic commit; the threshold+waiver rebalance is a
second, independent commit. `git revert` either (or `git switch -` off the branch) restores the base
with no residue, since `@prismgb/gpu` gains no dependency and no shared config is rewired under the
default path.

---

## 7. Done Criteria

- [ ] `packages/prismgb-gpu/src/application/gpu-frame-buffer.ts` exists; class body byte-for-byte
      identical to the former source (constructor + all eight methods); logger typed via the
      package-local `FrameBufferLogger`/`FrameBufferLoggerFactory`; `GpuFrameBufferDependencies` kept as
      a `type` alias; **no `@prismgb/core` (or any) import** added to `@prismgb/gpu`.
- [ ] `packages/prismgb-gpu/src/index.ts` exports `GpuFrameBuffer`.
- [ ] `packages/prismgb-gpu/tests/unit/application/gpu-frame-buffer.test.ts` exists (verbatim body,
      `@/application/gpu-frame-buffer` import, inline mock logger factory) and is exercised by
      `npm run test:run --workspace=@prismgb/gpu`.
- [ ] `src/renderer/infrastructure/services/gpu/gpu-frame-buffer.ts` and
      `tests/unit/renderer/infrastructure/services/gpu-frame-buffer.test.ts` deleted; both grep checks
      in §4 step 2.4 return nothing (or only the legitimate `@prismgb/gpu` import).
- [ ] Exactly one production import repointed to `@prismgb/gpu` (DI registration); the unit test
      relocated into the package; structural references (`GpuFrameBufferLike`, `createGpuFrameBufferMock`)
      untouched.
- [ ] `npm run build --workspace=@prismgb/gpu`, `npm run typecheck`, `npm run lint`,
      `npm run lint --workspace=@prismgb/gpu`, `npm run test:run`, `npm run dev:smoke` all green.
- [ ] `npm run test:coverage && npm run coverage:ratchet` green; if any threshold was lowered, a
      covering unexpired waiver exists in `scripts/coverage-waivers.json` and
      `node scripts/coverage-ratchet.js --check-monotonic --previous <base thresholds>` passes locally.
- [ ] `npm run test:e2e` green (86 tests).
- [ ] Commits: clean conventional subjects ≤100 chars, no AI/tool attribution, no `--no-verify`.
- [ ] `@prismgb/gpu` `package.json` still has no `dependencies` field (zero-dep property preserved) —
      unless the owner explicitly chose the fork.
- [ ] This document committed to the base branch as the audit record (Classification Table §3.4) —
      done in §1 step 0.

---

## 8. Out of Scope

- Moving any `devices/`, `streaming/`, `capture/`, `settings/`, `platform/`, `transcode/`,
  `updates/`, `performance/`, or remaining `gpu/` unit — all are documented STAY in §3.4.
- Creating any new package (e.g. `@prismgb/performance`, an audio/DSP package) for the pure-but-
  unowned units (`audio-gain.utils.ts`, `performance/*`).
- Promoting pure utilities into `@prismgb/core` (would add domain-specific code to the dep-free base).
- Renaming `GpuFrameBuffer` → `FrameBuffer`, the `gpuFrameBuffer` DI token, or `GpuFrameBufferLike`
  (ripple beyond this plan; optional future follow-up).
- Retiring the `@prismgb/*`→src vite aliasing / wiring turbo `dist` builds into CI (the build-model
  plan).
- Touching the event bus, AppState, signals/UI direction, the device manifest/registry seam, or any
  IPC contract.
- Collapsing the renderer ↔ package IPC-adapter pairs (`transcode`, `updates`, `devices`) — they are
  the two ends of a process boundary, not duplicates.