# Architecture Closure Plan (Design + Implementation)

**Date:** 2026-02-07
**Status:** In Progress
**Owner:** Architecture Maintainers

## Phase Tracking
1. Phase 0: Completed
2. Phase 1: Pending
3. Phase 2: Pending
4. Phase 3: Pending
5. Phase 4: Pending
6. Phase 5: Pending
7. Phase 6: Pending
8. Phase 7: Pending

## Why This Plan Exists
The architecture has strong boundary enforcement and healthy test volume, but the hardening program is not complete. This plan closes remaining gaps:

1. Type-system hardening is incomplete (`strict=false`, broad `any` usage).
2. Layer checker has blind spots (unclassified runtime entry/bootstrap files).
3. Presentation still depends on infrastructure for shared event constants.
4. Hotspot modules remain large and high-risk.
5. `src/core` status is still ambiguous in code governance.
6. Scorecard is observable in CI but not policy-gated.

## Target End State
By completion, the runtime architecture is enforceable by code, tests, and CI policy (not team memory):

1. App typecheck runs in strict mode (`strict=true`) with a controlled `any` allowlist of `0` in runtime code.
2. Layer boundary checker classifies all runtime files and fails on regressions.
3. Presentation does not import renderer infrastructure.
4. Top runtime hotspots are decomposed below agreed LOC and responsibility thresholds.
5. `src/core` is explicitly retired or reintegrated, with no ambiguous middle state.
6. Architecture scorecard has thresholds that fail PRs when breached.

## Baseline Snapshot (2026-02-07)
From local verification:

1. Boundary violations: `0`.
2. `renderer/infrastructure -> renderer/presentation` imports: `0`.
3. Cross-process imports: `0`.
4. App TS strictness: `strict=false`, `noImplicitAny=false`, `strictNullChecks=false`.
5. `any` occurrences: `152` across `40` TS files.
6. Top runtime files:
   - `src/renderer/infrastructure/rendering/workers/render.worker.ts` (1271 LOC)
   - `src/renderer/infrastructure/services/streaming/gpu-renderer.service.ts` (838 LOC)
   - `src/preload/index.js` (698 LOC)
   - `src/main/infrastructure/devices/device.service.ts` (533 LOC)
7. Unclassified by boundary checker: `41` files (includes runtime entry/bootstrap files).
8. Presentation -> infrastructure imports: `9` (mostly `event-channels.config.js`).

## Design Principles
1. Enforce architecture with deterministic tooling before broad refactors.
2. Preserve runtime behavior while improving structure (compatibility wrappers first, deletions second).
3. Convert one risk axis at a time: policy, then typing, then decomposition.
4. Prefer extracting pure logic before moving lifecycle wiring.
5. Every phase must leave measurable, reviewable deltas.

## Architecture Decisions

### AD-1: Expand Layer Model to Include Runtime Entrypoints
Current checker excludes key runtime files from enforcement. Introduce explicit logical layers:

1. `main/entry` for `src/main/index.ts`.
2. `renderer/entry` for `src/renderer/index.ts`.
3. `renderer/bootstrap` for `src/renderer/renderer-app.orchestrator.ts`.
4. `types` remains excluded from runtime boundary checks.
5. `core` receives explicit policy (see AD-6).

Rules:
1. `main/entry` may import only `main/application`, `main/infrastructure`, `shared`.
2. `renderer/entry` may import only `renderer/bootstrap`, `renderer/presentation`, `shared`.
3. `renderer/bootstrap` may import `renderer/application`, `renderer/presentation`, `renderer/infrastructure`, `shared`.

### AD-2: Move Event Channel Ownership to Shared
Event channels are cross-layer contracts, not infrastructure implementation details.

1. Introduce `src/shared/events/event-channels.ts` as canonical source.
2. Keep compatibility re-export at `src/renderer/infrastructure/events/event-channels.config.js` for one phase.
3. Migrate imports in presentation and application to `@shared/events/event-channels`.
4. Remove compatibility file once all imports are migrated.

### AD-3: Strict-Mode Migration by Module Cluster
Enable strict TS in controlled stages:

1. Stage A: `noImplicitAny=true`.
2. Stage B: `strictNullChecks=true`.
3. Stage C: `strict=true` and remaining strict flags.

Cluster order:
1. Shared base/contracts.
2. Renderer application + DI bootstrap.
3. Renderer infrastructure adapters/services.
4. Main infrastructure/services.
5. Preload bridge.

### AD-4: Typed Container Contract as Single Source of Truth
Renderer DI remains partially stringly-typed.

1. Introduce `RendererContainerMap` type that enumerates all keys and types.
2. `register-*` modules accept a generic `RegistrableContainer<RendererContainerMap>`.
3. `resolve` calls return typed values and reject unknown keys at compile time.
4. Remove `any` from bootstrap orchestrator fields.

### AD-5: Hotspot Decomposition via Facade Pattern
For very large modules, preserve public API while extracting internals:

1. Keep original class/file as facade.
2. Extract cohesive submodules with dedicated tests.
3. Cut over call-sites internally.
4. Remove dead code and collapse wrappers after stabilization.

### AD-6: Resolve `src/core` Explicitly
Choose one outcome and enforce it:

1. **Preferred:** retire to `docs/legacy/core/` (or remove) because runtime no longer depends on it.
2. Alternative: reintegrate intentionally with ownership and active typecheck inclusion.

This plan assumes retirement unless maintainers decide otherwise.

### AD-7: Convert Scorecard from Observation to Policy
Add thresholds and fail CI if breached:

1. `boundaryViolationCount === 0`
2. `infraToPresentationImportCount === 0`
3. `crossProcessImportCount === 0`
4. `tsStrictness.strict === true`
5. `any.occurrenceCount <= TARGET_ANY` (decreasing target schedule)
6. `topRuntimeFiles[0].loc <= HOTSPOT_MAX_LOC` (decreasing schedule)

## Implementation Plan

## Phase 0: Program Setup and Freeze
### Goal
Create a stable baseline and avoid moving-target metrics.

### Tasks
1. Record baseline JSON artifact under `artifacts/architecture-scorecard-baseline.json`.
2. Add this plan to docs index.
3. Define threshold config file: `scripts/architecture-thresholds.json`.

### Deliverables
1. Committed baseline snapshot.
2. Threshold config with staged gates.

### Validation
1. `npm run architecture:scorecard -- --output artifacts/architecture-scorecard-baseline.json`
2. `npm run lint`
3. `npm run test:unit -- tests/unit/scripts/check-layer-boundaries.test.js`

---

## Phase 1: Boundary Policy Completion (Checker + ESLint)
### Goal
Eliminate blind spots and enforce presentation independence from infrastructure.

### Tasks
1. Update `scripts/check-layer-boundaries.js`:
   - classify runtime entry/bootstrap files.
   - add `renderer/presentation -> renderer/infrastructure` ban.
   - keep explicit allowlist hooks for temporary compatibility.
2. Add fixtures for new rules in `tests/fixtures/layer-boundaries/*`.
3. Extend tests in `tests/unit/scripts/check-layer-boundaries.test.js`.
4. Update ESLint restrictions in `eslint.config.js` to match checker policy.

### Deliverables
1. Full layer matrix with no unclassified runtime files.
2. Failing tests for banned presentation->infrastructure imports.

### Exit Criteria
1. Unclassified runtime file count: `0`.
2. Checker and lint agree on rule surface.

### Validation
1. `node scripts/check-layer-boundaries.js`
2. `npm run lint`
3. `npm run test:unit -- tests/unit/scripts/check-layer-boundaries.test.js`

---

## Phase 2: Shared Event Contract Migration
### Goal
Remove presentation dependency on infrastructure event constants.

### Tasks
1. Create `src/shared/events/event-channels.ts`.
2. Migrate imports in:
   - `src/renderer/presentation/bridges/*.ts`
   - `src/renderer/presentation/features/**/*.js`
   - `src/renderer/application/orchestrators/*.ts` (if needed)
3. Add temporary compatibility re-export in old infrastructure path.
4. Remove compatibility file in final step.
5. Add contract tests under `tests/unit/shared/events/event-channels.contract.test.ts`.

### Deliverables
1. Single shared event contract file.
2. `renderer/presentation -> renderer/infrastructure` import count: `0`.

### Exit Criteria
1. No presentation imports from infrastructure.
2. Existing event behavior unchanged.

### Validation
1. `node scripts/check-layer-boundaries.js`
2. `npm run test:unit`
3. `npm run test:integration`

---

## Phase 3: Type System Hardening (Strict Mode)
### Goal
Enable strict app typechecking with no uncontrolled escape hatches.

### Tasks
1. Harden shared base declarations:
   - remove `Record<string, any>` extension from
     - `src/shared/base/service.base.d.ts`
     - `src/shared/base/orchestrator.base.d.ts`
2. Define explicit dependency maps and generic base types.
3. Stage A: set `noImplicitAny=true` in `tsconfig.app.json`, fix diagnostics by cluster.
4. Stage B: set `strictNullChecks=true`, fix nullability contracts.
5. Stage C: set `strict=true` and reconcile remaining strict diagnostics.
6. Add temporary `type-debt-allowlist.json` only if needed, with expiry dates.

### Deliverables
1. `tsconfig.app.json` strict mode enabled.
2. `any` occurrence count reduced to target trajectory.

### Target Trajectory
1. End of Phase 3A: `any <= 100`
2. End of Phase 3B: `any <= 40`
3. End of Phase 3C: `any <= 0` in runtime paths (`src/main`, `src/renderer`, `src/shared`, `src/preload`).

### Validation
1. `npm run typecheck:app`
2. `npm run lint`
3. `npm run test:unit`

---

## Phase 4: Renderer DI Hardening
### Goal
Make invalid DI key usage a compile-time failure.

### Tasks
1. Add `RendererContainerMap` (new file under `src/renderer/application/di`).
2. Upgrade `RegistrableContainer` to generic keyed API.
3. Update `service-container.factory.ts` resolve/register signatures to keyed generics.
4. Refactor all `register-*.ts` modules to typed dependency tuples.
5. Refactor `src/renderer/renderer-app.orchestrator.ts` fields from `any` to explicit types.
6. Add compile-time tests in `tests/unit/renderer/infrastructure/di/service-container.types.test.ts`.

### Deliverables
1. Typed container registrations and resolves.
2. Removal of bootstrap `any` fields.

### Validation
1. `npm run typecheck:app`
2. `npm run test:unit -- tests/unit/renderer/infrastructure/di/service-container.types.test.ts`

---

## Phase 5: Hotspot Decomposition
### Goal
Reduce blast radius and improve maintainability of largest runtime modules.

### 5A. `render.worker.ts`
#### Extract
1. `webgpu-renderer.engine.ts`
2. `webgl2-renderer.engine.ts`
3. `worker-state.store.ts`
4. `worker-message-router.ts`
5. `capture/capture-buffer.manager.ts`

#### Target
1. Original facade <= 250 LOC.

### 5B. `gpu-renderer.service.ts`
#### Extract
1. `gpu-renderer-lifecycle.service.ts`
2. `gpu-frame-submitter.service.ts`
3. `gpu-uniform-cache.service.ts`
4. `gpu-capture-coordinator.service.ts`
5. `gpu-backpressure-policy.ts`

#### Target
1. Original facade <= 300 LOC.

### 5C. `preload/index.js`
#### Extract and Convert
1. Split into API modules:
   - `device.preload-api.ts`
   - `window.preload-api.ts`
   - `update.preload-api.ts`
   - `transcode.preload-api.ts`
   - `validators/*.ts`
2. Introduce typed contract alignment with `src/shared/ipc/preload-api.contract.ts`.
3. Keep `index.ts` as composition root.

#### Target
1. `src/preload/index.ts` <= 200 LOC.

### 5D. `main/infrastructure/devices/device.service.ts`
#### Extract
1. `device-profile-loader.service.ts`
2. `device-match.service.ts`
3. `usb-monitor.service.ts`
4. `device-status.store.ts`

#### Target
1. Original facade <= 280 LOC.

### Validation
1. `npm run test:unit`
2. `npm run test:integration`
3. `npm run build:vite`
4. `npm run test:smoke`

---

## Phase 6: `src/core` Resolution
### Goal
Eliminate architecture ambiguity.

### Tasks (retirement path)
1. Move legacy core docs/code to `docs/legacy/core/` or remove.
2. Remove stale tests under `tests/unit/core/*` if code removed.
3. Add a guard rule to boundary checker preventing runtime imports from `src/core`.
4. Update docs:
   - `docs/architecture-diagrams.md`
   - `docs/feature-map.md`
   - `docs/naming-conventions.md`

### Deliverables
1. Single explicit `src/core` status (retired).
2. Zero runtime and test ambiguity.

### Validation
1. `rg -n "src/core|@core" src tests docs`
2. `npm run lint`
3. `npm run test:unit`

---

## Phase 7: CI Policy Lock
### Goal
Make architecture regressions unmergeable.

### Tasks
1. Extend `scripts/architecture-scorecard.js` with threshold checks (`--enforce-thresholds`).
2. Add test file `tests/unit/scripts/architecture-scorecard.test.js`.
3. Update `.github/workflows/reusable-ci-tests.yml`:
   - run scorecard with enforcement flags.
   - fail job on threshold regression.
4. Add artifact + summary markdown output for PR diagnostics.

### Deliverables
1. Scorecard thresholds enforced in CI.
2. Contracted failure messages for reviewers.

### Validation
1. Simulate failing threshold locally.
2. Verify CI fails on regression and passes on compliant branch.

---

## Work Breakdown Structure (PR Slices)
1. PR-1: Boundary checker classification + tests.
2. PR-2: Shared event contract migration (with compatibility re-export).
3. PR-3: Remove compatibility re-export + enforce presentation->infra ban.
4. PR-4: Type hardening Stage A (`noImplicitAny`) by shared/base cluster.
5. PR-5: Type hardening Stage B (`strictNullChecks`) by renderer application cluster.
6. PR-6: Type hardening Stage C (`strict=true`) by infra/main/preload clusters.
7. PR-7: Renderer DI typed map completion.
8. PR-8: Hotspot decomposition 5A/5B.
9. PR-9: Hotspot decomposition 5C/5D.
10. PR-10: `src/core` retirement and docs cleanup.
11. PR-11: CI scorecard threshold enforcement + scorecard tests.

## Regression Controls
1. No behavior changes in same PR as broad type-only refactors.
2. Feature flags or compatibility wrappers required for one PR before deletion.
3. Mandatory before/after metrics in each PR description:
   - strictness flags
   - `any` count
   - top hotspot LOC
   - boundary counts

## Risk Register
1. **Strict-mode churn risk**
   - Mitigation: cluster-based toggles and allowlist burn-down with deadlines.
2. **Hotspot decomposition behavior drift**
   - Mitigation: facade-first extraction + characterization tests before edits.
3. **Policy false positives**
   - Mitigation: fixture-based checker tests for every rule.
4. **CI friction from immediate hard thresholds**
   - Mitigation: one-week warning mode, then enforce.

## Definition of Done
1. `npm run lint` passes.
2. `npm run typecheck:app` passes with `strict=true`.
3. `node scripts/check-layer-boundaries.js` reports no violations and no unclassified runtime files.
4. `npm run architecture:scorecard -- --enforce-thresholds` passes.
5. `npm run test:unit` and `npm run test:integration` pass.
6. Hotspot size targets are met.
7. `src/core` status is explicit and enforced.

## Immediate Next 72-Hour Execution Plan
1. Day 1:
   - Implement Phase 1 checker expansion + tests.
   - Create Phase 2 shared event contract file and migrate first import batch.
2. Day 2:
   - Complete event contract migration.
   - Start Phase 3 Stage A with shared/base declarations.
3. Day 3:
   - Complete Stage A for renderer application/bootstrap cluster.
   - Land CI warning-mode scorecard thresholds.

## Execution Log
### Phase 0
1. Status: Completed
2. Date: 2026-02-07
3. Deliverables:
   - Added baseline artifact: `artifacts/architecture-scorecard-baseline.json`.
   - Added threshold config scaffold: `scripts/architecture-thresholds.json`.
   - Added docs index link in `README.md`.
4. Validation:
   - `npm run architecture:scorecard -- --output artifacts/architecture-scorecard-baseline.json` ✅
