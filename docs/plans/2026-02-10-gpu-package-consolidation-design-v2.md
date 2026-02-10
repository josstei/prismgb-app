# @prismgb/gpu Consolidation Design (Corrected v2)

**Date:** 2026-02-10  
**Status:** Proposed  
**Supersedes:** `docs/plans/2026-02-09-gpu-package-consolidation-design.md`  
**Implementation Plan:** `docs/plans/2026-02-10-gpu-package-consolidation-plan-v2.md`

## Problem Statement

GPU rendering logic is duplicated between:

- app worker runtime (`src/renderer/infrastructure/rendering/workers/*`)
- package runtime (`packages/prismgb-gpu/src/infrastructure/*`)

This creates drift risk, duplicate maintenance, and unclear ownership.

### Verified Current State

- App worker engines are the production path:
  - `webgpu-renderer.engine.ts` (664 lines)
  - `webgl2-renderer.engine.ts` (274 lines)
  - `optimization.utils.ts` (525 lines)
  - `engine.types.ts` (38 lines)
  - total: 1501 lines (excluding `render.worker.ts`)
- App and package shader files are byte-identical (5 GLSL + 4 WGSL duplicates).
- Package pipelines exist but are not consumed by app runtime.
- App already consumes package for presets/uniform builder/capability detection.

## Design Goals

1. Single ownership: GPU domain logic lives in `@prismgb/gpu`.
2. Behavior parity: no regressions in rendering, capture, release/re-init, or stats/error paths.
3. Protocol stability: app worker message contract remains unchanged.
4. Migration safety: every phase must remain lint/typecheck/test green.
5. Clear boundaries: package owns GPU domain; app owns orchestration and worker lifecycle.

## Architectural Boundary

### Package owns

- WebGPU/WebGL2/Canvas2D pipeline implementations
- shader sources
- GPU-side optimizations (array pool, uniform tracking, bind-group cache)
- pipeline diagnostics (adapter info, typed error classification, callbacks)
- reusable uniform context helper

### App owns

- worker lifecycle and OffscreenCanvas transfer choreography
- worker protocol constants and routing
- frame scheduling (`requestVideoFrameCallback`)
- orchestration (`GpuWorkerManager`, `StreamingGpuRendererService`)

## Hard Compatibility Invariants

1. Worker protocol message names and high-level payload expectations stay stable.
2. `INIT` must support both:
   - first init with `payload.canvas`
   - re-init after `RELEASE` with config-only payload
3. Capture semantics remain:
   - `REQUEST_CAPTURE` arms capture
   - next rendered frame is buffered
   - `CAPTURE` returns buffered frame first
4. `SET_PRESET` message path remains accepted by worker.
5. Existing app-level error/stats events remain consumable without orchestration rewrites.

## Runtime Semantics (Target)

### Lifecycle state model (inside package pipelines)

`uninitialized -> ready -> suspended -> ready`

`ready -> error`

`ready|suspended|error -> disposed`

Design intent:
- `suspend`: release memory-heavy resources for idle periods.
- `resume`/re-init path: restore resources without requiring new canvas transfer.

### Capture flow

1. app sends `REQUEST_CAPTURE`
2. worker marks pending capture
3. after next successful frame render, worker stores captured bitmap
4. app sends `CAPTURE`
5. worker returns buffered bitmap; if absent, falls back to immediate capture

This preserves current "shader-applied next frame" semantics and avoids redundant capture operations.

## API Strategy

Migration uses a compatibility-first strategy:

### Stage A (additive)

- introduce internal contracts needed for state/error/callback model
- avoid immediate public API break in `@prismgb/gpu`
- keep current external exports working during pipeline migration

### Stage B (converge)

- once worker migration is complete and green, align package public contracts with new lifecycle model
- document any external API migration in release notes/changelog

## Package Design Changes

### Infrastructure enhancements

- WebGPU pipeline gains:
  - typed error mapping for `device.lost` and `device.onuncapturederror`
  - adapter diagnostics
  - worker-grade optimization parity
- WebGL2 pipeline gains:
  - context loss/restoration error mapping
  - parity with production multipass behavior
  - retain existing uniform-location caching strategy

### Optimization modules

Move worker-proven utilities into package internals:
- typed array pool (round-robin reuse)
- upgraded uniform tracker with cached byte-view path
- bind group cache integration
- buffered capture utility compatible with worker capture invariants

### Application helper

`UniformContext` replaces manual cache-key logic in app renderer service while preserving behavior.

## Worker Migration Design

`render.worker.ts` becomes a protocol-compatible message router backed by package pipelines.

Required worker behavior:
- retain local canvas reference across release cycles
- instantiate selected package pipeline on init
- forward callbacks/errors/stats into existing response types
- preserve release/destroy semantics expected by `GpuWorkerManager`

## Deletion Strategy (After Proven Migration)

Only remove app duplicates after runtime + tests confirm parity:

- worker engine files and worker optimization utilities
- duplicate app shader directory
- tests/benchmarks that import deleted app internals must be moved or rewritten

## Risk Register

### High

- protocol regression during worker rewrite (`INIT` without canvas, `SET_PRESET`, `RELEASE` semantics)
- capture timing/ownership regressions
- subtle shader output drift between old and new pipeline paths

### Medium

- staged API evolution in package surface
- benchmark/test relocation after deleting app-only internals

### Low

- shader file cleanup once references are eliminated
- `UniformContext` app integration

## Validation Strategy

### Per-phase gates

- package: `typecheck + test:run`
- app: targeted unit suites for worker manager and GPU renderer service
- full repo: `lint + typecheck + test:run + build`

### Manual smoke checks

- stream start/render
- preset switch
- brightness update
- resize/fullscreen
- capture path correctness
- release + re-init without canvas transfer
- tab hide/show recovery

## Out of Scope

- protocol redesign
- pass-graph/plugin architecture
- compute shader redesign
- npm publishing model changes

## Success Criteria

1. App runtime uses package-backed pipelines in worker path.
2. App duplicate worker engines and shader copies are removed.
3. Worker lifecycle and capture behavior remain backward-compatible.
4. Project remains green through all migration phases.

