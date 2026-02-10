# @prismgb/gpu Consolidation Plan (Corrected v2)

**Date:** 2026-02-10  
**Status:** Proposed  
**Supersedes:** `docs/plans/2026-02-09-gpu-package-consolidation-plan.md`

## Objective

Consolidate GPU rendering domain logic into `@prismgb/gpu` while preserving current app behavior:

- Worker protocol remains backward-compatible.
- `RELEASE` -> re-`INIT` flow continues to work with no canvas re-transfer.
- Capture semantics remain request-next-frame, then retrieve buffered frame.
- Every commit stays typecheck/lint/test green.

## Non-Negotiable Compatibility Rules

1. Keep worker message contract unchanged (`INIT`, `FRAME`, `RESIZE`, `SET_PRESET`, `REQUEST_CAPTURE`, `CAPTURE`, `RELEASE`, `DESTROY`).
2. Keep `GpuWorkerManager` re-init behavior: `INIT` may be sent without `canvas` after `RELEASE`.
3. Keep capture workflow:
   - `REQUEST_CAPTURE` arms capture.
   - next rendered frame is buffered.
   - `CAPTURE` returns that buffered frame (or on-demand fallback if none buffered).
4. Do not commit expected type errors at any phase.
5. Do not expose package optimization internals as public API unless required by app consumers.

## Current Baseline (Verified)

- Duplicate shaders exist and are byte-identical across app and package.
- App currently uses worker engines in `src/renderer/infrastructure/rendering/workers/*`.
- Package pipelines exist but are not currently used by app runtime.
- Package currently passes:
  - `npm run typecheck --workspace=@prismgb/gpu`
  - `npm run test:run --workspace=@prismgb/gpu`

## Phase Plan

## Phase 0: Safety Net First

### 0.1 Add characterization tests for worker behavior

Add/extend tests to lock down:
- re-init without canvas after `RELEASE`
- `REQUEST_CAPTURE` + next-frame-buffer + `CAPTURE` retrieval behavior
- `SET_PRESET` message handling path still accepted

Target:
- `tests/unit/features/streaming/rendering/managers/gpu-worker-manager.class.test.js`
- `tests/unit/features/streaming/rendering/gpu/gpu-renderer.service.test.js`
- new worker-focused test file if needed

### 0.2 Baseline validation gate

Run before any refactor:

```bash
npm run lint
npm run typecheck
npm run test:run
npm run test:run --workspace=@prismgb/gpu
```

No migration starts unless baseline is green.

## Phase 1: Package Internal Contracts (Non-Breaking)

Create new contracts needed for worker-grade pipelines, but do not break existing package public `IPipeline` yet.

Add internal types:
- `PipelineState`
- `PipelineErrorCode` / `IPipelineError`
- `IPipelineCallbacks`
- `IAdapterInfo`
- `IShaderLoader`
- `ICaptureProvider`
- `UniformContext` (application helper)

Rule:
- Introduce these as additive/internal first.
- Existing package exports remain compatible during this phase.

Validation gate:

```bash
npm run typecheck --workspace=@prismgb/gpu
npm run test:run --workspace=@prismgb/gpu
```

## Phase 2: Extract Worker Optimizations into Package (Internal Modules)

Move and test utilities under package internal infrastructure:
- `TypedArrayPool`
- `UniformTracker` (cached `Uint8Array` view path)
- `BindGroupCache` (keep/integrate stats support if useful for diagnostics)
- capture utility with buffered-frame semantics (equivalent to current `CaptureBufferManager`)

Important:
- Keep round-robin pool semantics.
- Ensure tests match implementation semantics (no contradictory assertions).

Validation gate:

```bash
npm run typecheck --workspace=@prismgb/gpu
npm run test:run --workspace=@prismgb/gpu
```

## Phase 3: Upgrade Package Pipelines to Production Parity

Port behavior from current worker engines into package pipelines with zero output regression.

### 3.1 WebGPU pipeline parity
- integrate extracted `TypedArrayPool` + upgraded `UniformTracker`
- keep bind-group caching behavior
- add `device.lost` and `device.onuncapturederror` handling with structured error callback support
- capture adapter info
- preserve 4-pass render chain behavior

### 3.2 WebGL2 pipeline parity
- retain cached uniform-location strategy (existing `ShaderProgram` already does this)
- maintain multipass behavior and CRT bypass path
- add context loss/restoration handling mapped to structured errors

### 3.3 Lifecycle model
- implement explicit lifecycle state internally (`uninitialized/ready/suspended/error/disposed`)
- map `suspend` to resource release needed for idle memory savings
- ensure resumed/reinitialized path works with existing worker manager flow

Validation gate:

```bash
npm run typecheck --workspace=@prismgb/gpu
npm run test:run --workspace=@prismgb/gpu
```

## Phase 4: Worker Migration (Protocol-Compatible Router)

Rewrite `src/renderer/infrastructure/rendering/workers/render.worker.ts` to delegate to package pipelines.

Required behavior in new worker:
- `INIT` accepts optional `payload.canvas`; if missing, reuse retained canvas reference.
- keep `SET_PRESET` handling path (even if no-op for pipeline internals).
- preserve stats and error message shapes expected by app consumers.
- preserve release behavior: free GPU resources, keep worker alive, allow re-init.
- preserve destroy behavior: dispose and close worker.

Capture behavior requirements:
- `REQUEST_CAPTURE`: arm.
- on next successful frame: buffer capture.
- `CAPTURE`: return buffered frame first; fallback to immediate capture if needed.

Validation gate:

```bash
npm run lint
npm run test:run tests/unit/features/streaming/rendering/managers/gpu-worker-manager.class.test.js
npm run test:run tests/unit/features/streaming/rendering/gpu/gpu-renderer.service.test.js
```

## Phase 5: App Simplification (Safe)

### 5.1 Replace manual uniform cache with `UniformContext`

Refactor:
- `src/renderer/infrastructure/services/streaming/gpu-renderer.service.ts`

Keep external behavior unchanged:
- existing preset selection flow
- existing worker command flow

### 5.2 Update any app tests impacted by simplification

Validation gate:

```bash
npm run test:run tests/unit/features/streaming/rendering/gpu/gpu-renderer.service.test.js
npm run lint
```

## Phase 6: Remove Duplicates Only After Migration Is Proven

Delete only after zero runtime references remain:
- `src/renderer/infrastructure/rendering/workers/webgpu-renderer.engine.ts`
- `src/renderer/infrastructure/rendering/workers/webgl2-renderer.engine.ts`
- `src/renderer/infrastructure/rendering/workers/optimization.utils.ts`
- `src/renderer/infrastructure/rendering/workers/engine.types.ts`
- `src/renderer/infrastructure/rendering/shaders/**` duplicate app shader tree

Also update/move benchmark depending on removed internals:
- `tests/performance/gpu-optimization.benchmark.test.js`

Validation gate:

```bash
rg -n "webgpu-renderer\\.engine|webgl2-renderer\\.engine|optimization\\.utils|engine\\.types|rendering/shaders" src tests
npm run test:run
npm run lint
```

## Phase 7: Final Validation

Run full project verification:

```bash
npm run lint
npm run typecheck
npm run test:run
npm run build
```

Package-specific verification:

```bash
npm run typecheck --workspace=@prismgb/gpu
npm run test:run --workspace=@prismgb/gpu
```

Manual smoke checklist:
- stream starts and renders
- preset switching works
- brightness updates work
- resize/fullscreen works
- screenshot capture returns shader-applied frame
- `RELEASE` then re-`INIT` works without canvas transfer
- tab hide/show recovery works

## Git Strategy

- Work on `codex/gpu-package-consolidation-v2`
- Commit only at green gates
- Suggested rollback tags:
  - `gpu-consolidation-v2-pre-worker-migration`
  - `gpu-consolidation-v2-pre-cleanup`

## Deliverables

1. Worker rendering engines removed from app and replaced with package-backed worker router.
2. Duplicate shader tree removed from app.
3. Package pipelines carry production-grade optimizations and diagnostics.
4. No protocol regressions in worker-manager or capture flows.
5. CI remains green throughout migration.

