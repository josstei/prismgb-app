# Architecture Hardening Implementation (Phase-by-Phase)

**Date:** 2026-02-06  
**Status:** In Progress (Phases 0-2 and 5 Completed; Phase 4 In Progress)  
**Owner:** Codex

## Purpose
Track architecture hardening execution and validation phase-by-phase.

## Current Baseline (Validated 2026-02-06)
1. Static checks:
   - `npm run lint` passes (includes `node scripts/check-layer-boundaries.js`).
   - `npm run typecheck:app` passes.
2. Layer signals:
   - `main` imports from `renderer`: `0`
   - `renderer` imports from `main`: `0`
   - `renderer/infrastructure` imports from `renderer/presentation`: `5`
3. Type signals:
   - `src` TypeScript files: `187`
   - `src` JavaScript files: `66`
   - `any` occurrences in `src/**/*.ts`: `154` across `47` files.
   - App typecheck config uses relaxed strictness (`strict: false`, `noImplicitAny: false`, `strictNullChecks: false`).
4. Complexity hotspots (LOC):
   - `src/renderer/infrastructure/rendering/workers/render.worker.ts`: `1270`
   - `src/renderer/infrastructure/services/streaming/gpu-renderer.service.ts`: `837`
   - `src/preload/index.js`: `697`
   - `src/main/infrastructure/devices/device.service.ts`: `532`
5. Test profile:
   - Unit test files: `126`
   - Integration test files: `1`
   - E2E spec files: `5`

## Plan Status (Executed 2026-02-06)
1. Completed phases:
   - Phase 0: Program setup and scorecard.
   - Phase 1: Boundary enforcement expansion.
   - Phase 2: Existing layer-coupling cleanup.
   - Phase 5: Event and IPC contract hardening.
2. In-progress phases:
   - Phase 4: Renderer DI hardening.
3. Metric deltas (baseline -> current):
   - `renderer/infrastructure` imports from `renderer/presentation`: `5` -> `0` (delta `-5`)
   - `main` imports from `renderer`: `0` -> `0` (delta `0`)
   - `renderer` imports from `main`: `0` -> `0` (delta `0`)
   - TypeScript strictness flags: unchanged (`strict: false`, `noImplicitAny: false`, `strictNullChecks: false`)
   - `any` occurrences in `src/**/*.ts`: `154` (baseline snapshot) -> `152` (scorecard output)
4. Tooling status:
   - `scripts/architecture-scorecard.js`: added.
   - `npm run architecture:scorecard`: added.
   - CI scorecard execution + artifact upload: enabled in reusable test workflow.
5. Validation summary (2026-02-06):
   - `npm run lint` ✅
   - `npm run typecheck:app` ✅
   - `node scripts/check-layer-boundaries.js` ✅
   - `npm run test:unit` ✅ (129 files, 2763 tests)
   - `npm run test:integration` ✅ (1 file, 21 tests)
   - `npm run build:vite` ✅
   - `npm run architecture:scorecard` ✅

## Target End State ("Fully Hardened")
1. Layer boundaries are comprehensively enforced by tooling and CI.
2. `renderer/infrastructure` has zero dependencies on `renderer/presentation`.
3. `tsconfig.app.json` strictness is fully enabled (`strict: true`) with controlled/zero `any`.
4. Event and IPC contracts are aligned, typed, and continuously verified.
5. High-risk hotspot modules are decomposed into smaller, testable components.
6. `src/core` role is explicitly resolved (retired, archived, or reactivated intentionally).
7. CI prevents architectural regressions by policy.

## Scope
### In Scope
1. Boundary enforcement expansion (script + lint + CI).
2. Layer-coupling removal (`infrastructure` -> `presentation`).
3. Type hardening and `any` reduction in runtime paths.
4. Renderer DI hardening and stronger compile-time safety.
5. Event/IPC contract hardening.
6. Hotspot decomposition of the largest runtime modules.
7. Documentation and governance updates.

### Out of Scope
1. New product features.
2. UX redesign.
3. Performance optimization work not directly tied to architecture hardening.
4. Major dependency upgrades unrelated to this plan.

## Program Governance
1. All work runs in small, phase-labeled PRs.
2. No phase is considered complete until all phase gates pass.
3. Every PR must include metric deltas (before/after).
4. No broad refactors outside declared phase scope.
5. No behavior changes unless the PR explicitly states and tests them.

## Execution Order
1. Phase 0: Program setup and scorecard.
2. Phase 1: Boundary enforcement expansion.
3. Phase 2: Existing layer-coupling cleanup.
4. Phase 3: Type-system hardening.
5. Phase 4: Renderer DI hardening.
6. Phase 5: Event and IPC contract hardening.
7. Phase 6: Hotspot decomposition.
8. Phase 7: `src/core` resolution.
9. Phase 8: CI policy lock and release hardening.

## Phase 0: Program Setup And Scorecard
### Goal
Create objective measurement and regression visibility before changing architecture.

### Deliverables
1. `scripts/architecture-scorecard.js` to report:
   - infra->presentation import count
   - cross-process import count
   - TS strictness flags
   - `any` occurrence count and files
   - top N largest runtime files
2. New plan status section in this document with tracked deltas.
3. CI job to run scorecard and publish artifacts/log summary.

### Tasks
1. Implement scorecard script.
2. Add npm script: `architecture:scorecard`.
3. Add CI call in PR workflow.
4. Capture initial baseline snapshot in this document.

### Validation
1. `npm run architecture:scorecard`
2. `npm run lint`
3. `npm run typecheck:app`

### Exit Criteria
1. Scorecard runs locally and in CI.
2. Baseline metrics are captured and versioned.

### Risks
1. Metric noise due to formatting-only changes.
2. Mitigation: use stable glob patterns and deterministic sorting.

## Phase 1: Boundary Enforcement Expansion
### Goal
Replace narrow import checks with full architecture boundary policy.

### Deliverables
1. Extended `scripts/check-layer-boundaries.js` with full matrix enforcement.
2. Rule tests (fixtures + expected pass/fail) for the checker.
3. ESLint alignment for overlap in high-risk paths.
4. CI failure on boundary violations.

### Policy Matrix (Target)
1. `src/main/application`: may import `src/main/infrastructure`, `src/shared`.
2. `src/main/infrastructure`: may import `src/shared`; must not import `src/renderer`.
3. `src/renderer/application`: may import `src/renderer/infrastructure`, `src/renderer/presentation`, `src/shared`.
4. `src/renderer/infrastructure`: may import `src/shared`; must not import `src/renderer/presentation`.
5. `src/renderer/presentation`: may import `src/shared`; must not import `src/main`.
6. `src/shared`: may not import process-specific layers.

### Tasks
1. Define allowed/forbidden alias and relative path rules.
2. Add detection for dynamic imports and re-exports.
3. Add rule-test fixtures for each violation type.
4. Mirror critical restrictions in ESLint `no-restricted-imports`.

### Validation
1. `node scripts/check-layer-boundaries.js`
2. `npm run lint`
3. Rule fixture test suite passes.

### Exit Criteria
1. Checker rejects all disallowed imports in matrix.
2. CI blocks merges on violations.

### Risks
1. False positives from path resolution.
2. Mitigation: include fixture coverage for alias and relative import paths.

## Phase 2: Existing Layer-Coupling Cleanup
### Goal
Eliminate current `renderer/infrastructure` dependencies on `renderer/presentation`.

### Deliverables
1. Shared config relocation:
   - `src/shared/config/storage-keys.config.ts`
   - `src/shared/config/update-state.config.ts`
2. Utility ownership fixes:
   - move non-UI helpers out of presentation paths when used by infrastructure.
3. Updated imports and docs.

### Primary Target Files
1. `src/renderer/infrastructure/services/settings/settings.service.ts`
2. `src/renderer/infrastructure/services/notes/notes.service.ts`
3. `src/renderer/infrastructure/services/updates/update.service.ts`
4. `src/renderer/infrastructure/services/capture/capture.service.ts`
5. `src/renderer/infrastructure/services/capture/capture-save.service.ts`

### Tasks
1. Move or duplicate shared constants to `src/shared/config`.
2. Introduce `src/shared/lib` or `src/renderer/infrastructure/browser` utilities for non-UI download/filename logic.
3. Update all consumers and tests.
4. Remove stale exports and path references.

### Validation
1. `node scripts/check-layer-boundaries.js`
2. `npm run lint`
3. `npm run typecheck:app`
4. `npm run test:unit`

### Exit Criteria
1. infra->presentation import count is `0`.
2. No behavior regressions in settings/notes/update/capture flows.

### Risks
1. Subtle runtime behavior changes from utility relocation.
2. Mitigation: targeted unit tests for moved utilities and feature smoke checks.

## Phase 3: Type-System Hardening
### Goal
Move app runtime back to strict TypeScript guarantees.

### Deliverables
1. `tsconfig.app.json` strict flags enabled in stages, ending at `strict: true`.
2. Broad `Record<string, any>` escape hatches removed or tightly scoped.
3. `any` count reduced to an approved allowlist (or zero).

### Tasks
1. Stage A: enable `noImplicitAny`.
2. Stage B: enable `strictNullChecks`.
3. Stage C: enable `strict` and reconcile resulting issues.
4. Replace high-impact `any` in:
   - `src/renderer/renderer-app.orchestrator.ts`
   - `src/renderer/application/state/app-state.ts`
   - streaming/device/adapter hotspots
5. Tighten declaration files:
   - `src/shared/base/service.base.d.ts`
   - `src/shared/base/orchestrator.base.d.ts`

### Validation
1. `npm run typecheck:app`
2. `npm run lint`
3. `npm run test:unit`
4. `npm run test:integration`

### Exit Criteria
1. `strict: true` in app config.
2. `any` threshold meets agreed target.

### Risks
1. Large churn across runtime modules.
2. Mitigation: staged strictness toggles with tight PR scope per module cluster.

## Phase 4: Renderer DI Hardening
### Goal
Reduce runtime-only DI failures by increasing renderer DI type safety.

### Deliverables
1. Typed renderer container contract (token/dependency typing).
2. `ServiceContainer` moved to TS with typed registration/resolve APIs.
3. Fewer stringly-typed runtime resolution points in bootstrap.

### Tasks
1. Convert `src/renderer/infrastructure/di/service-container.factory.js` to TS.
2. Define container key type map for major runtime services.
3. Refactor container registration modules to typed signatures.
4. Add compile-time tests (or TS-only assertions) for key registrations.

### Validation
1. `npm run typecheck:app`
2. `npm run lint`
3. `npm run test:unit -- tests/unit/renderer/infrastructure/di/service-container.test.js`

### Exit Criteria
1. Missing/invalid key usage is caught at compile time in core paths.
2. Existing runtime behavior preserved.

### Risks
1. DI initialization order regressions.
2. Mitigation: preserve registration order and add bootstrap integration tests.

## Phase 5: Event And IPC Contract Hardening
### Goal
Ensure event and IPC contracts are consistent, explicit, and enforced.

### Deliverables
1. Event channel and payload contract alignment.
2. Contract tests expanded for all externally consumed events.
3. Preload and main/renderer IPC parity checks strengthened.

### Tasks
1. Reconcile documented vs emitted event names (example: notes update event mismatch).
2. Expand tests around:
   - `src/shared/ipc/channels.json`
   - `src/shared/ipc/preload-api.contract.ts`
   - renderer event channels
3. Add lightweight contract validation wrappers in targeted tests.

### Validation
1. `npm run test:unit`
2. contract-specific suites pass with no stale channels/payloads.

### Exit Criteria
1. No phantom or undocumented events in runtime paths.
2. IPC contract parity is continuously tested.

### Risks
1. False confidence if contracts exist but are not consumed by tests.
2. Mitigation: require contract coverage report in PR notes.

## Phase 6: Hotspot Decomposition
### Goal
Reduce high-blast-radius modules into smaller, isolated components.

### Priority Modules
1. `src/renderer/infrastructure/rendering/workers/render.worker.ts`
2. `src/renderer/infrastructure/services/streaming/gpu-renderer.service.ts`
3. `src/main/infrastructure/devices/device.service.ts`
4. `src/preload/index.js` (secondary priority)

### Deliverables
1. Extracted modules by responsibility (protocol, resource lifecycle, state, policy).
2. New focused tests per extracted module.
3. Reduced top-file LOC and complexity metrics.

### Tasks
1. Extract pure logic first (no runtime wiring changes).
2. Add tests before/after each extraction.
3. Introduce composition wrappers preserving public APIs.
4. Remove dead code after migration.

### Validation
1. `npm run test:unit`
2. `npm run test:integration`
3. `npm run build:vite`
4. targeted runtime smoke verification.

### Exit Criteria
1. Hotspot LOC reduced to agreed thresholds.
2. No API/behavior regressions.

### Risks
1. Subtle lifecycle regressions in worker/device/transcode flows.
2. Mitigation: phase-specific regression suites and manual smoke checklist.

## Phase 7: Resolve `src/core` Ambiguity
### Goal
Align architecture narrative with runtime reality.

### Deliverables
1. Explicit ADR decision: retire/archive/reintegrate `src/core`.
2. Corresponding code/doc/config changes.
3. Updated onboarding docs and feature map.

### Tasks
1. Decide with maintainers which path is intended.
2. If retiring:
   - move to `docs/legacy` or remove.
3. If reintegrating:
   - re-enable in runtime and typecheck with clear ownership.

### Validation
1. Docs and build config no longer conflict.
2. No stale references in code or docs.

### Exit Criteria
1. `src/core` status is explicit, documented, and enforced.

### Risks
1. Team confusion if decision is not communicated.
2. Mitigation: include clear migration notes in PR and CONTRIBUTING docs.

## Phase 8: CI Policy Lock And Release Hardening
### Goal
Make architecture regression impossible to merge silently.

### Deliverables
1. CI gates for:
   - boundary checker
   - strict TS status
   - scorecard non-regression
   - contract tests
2. Branch policy updates for required checks.
3. Release branch matrix policy clarity.

### Tasks
1. Add required CI jobs and fail-on-regression thresholds.
2. Update workflow docs and contribution checklist.
3. Enforce rules in PR templates.

### Validation
1. Simulated violation PR fails as expected.
2. Clean PR passes end-to-end.

### Exit Criteria
1. Hardening rules become default enforcement, not team memory.

### Risks
1. CI friction from over-strict initial thresholds.
2. Mitigation: start with warnings for one cycle, then enforce.

## Cross-Phase Validation Gates
Run on every phase PR:
1. `npm run lint`
2. `npm run typecheck:app`
3. `node scripts/check-layer-boundaries.js`
4. `npm run test:unit`
5. `npm run test:integration`
6. `npm run build:vite`
7. `npm run architecture:scorecard`

## PR Slicing Strategy
1. One phase may span multiple PRs, but each PR must remain single-purpose.
2. Keep PRs in this order:
   - policy/tooling PRs first
   - code migration PRs second
   - cleanup/docs PRs last
3. Each PR must include:
   - objective
   - scope
   - out-of-scope
   - metric deltas
   - rollback note

## Rollback Strategy
1. Keep compatibility shims for one PR when moving shared constants/utilities.
2. Avoid deleting old paths until consumers are fully migrated.
3. If strictness enablement causes broad breakage, revert only flag changes and continue module-by-module typing PRs.
4. For hotspot decomposition, preserve original public API signatures until final cleanup PR.

## Ownership And Working Cadence
1. Create phase branches using prefix `codex/architecture-hardening-phase-X`.
2. Daily checkpoint updates in this plan document during execution.
3. Mandatory reviewer sign-off before moving to the next phase.

## Sign-Off Checklist (Before Execution Starts)
1. Confirm target end-state definition.
2. Confirm boundary policy matrix.
3. Confirm `any` target threshold for Phase 3.
4. Confirm `src/core` intended outcome for Phase 7.
5. Confirm CI enforcement timing (immediate vs staged).

---

## Execution Log (To Be Filled During Implementation)
### Phase 0
- Status: Completed
- Start: 2026-02-06
- End: 2026-02-06
- Result: ✅
- Notes:
  - Added `scripts/architecture-scorecard.js`.
  - Added npm command `architecture:scorecard`.
  - Added CI scorecard execution and artifact upload in `.github/workflows/reusable-ci-tests.yml`.
  - Added plan status tracking section with current deltas.

### Phase 1
- Status: Completed
- Start: 2026-02-06
- End: 2026-02-06
- Result: ✅
- Notes:
  - Replaced narrow boundary checker with matrix-based enforcement.
  - Added static import, re-export, and literal dynamic import detection.
  - Added fixture-based rule tests in `tests/unit/scripts/check-layer-boundaries.test.js`.
  - Expanded ESLint `no-restricted-imports` architecture guardrails.

### Phase 2
- Status: Completed
- Start: 2026-02-06
- End: 2026-02-06
- Result: ✅
- Notes:
  - Added shared config modules:
    - `src/shared/config/storage-keys.config.ts`
    - `src/shared/config/update-state.config.ts`
  - Added shared utility modules:
    - `src/shared/lib/filename-generator.utils.ts`
    - `src/shared/lib/file-download.utils.ts`
  - Updated infrastructure services and tests to consume shared ownership.
  - Reduced `renderer/infrastructure -> renderer/presentation` imports from `5` to `0`.

### Phase 3
- Status: Pending
- Start:
- End:
- Result:
- Notes:
  - Staged probe for `noImplicitAny: true` executed.
  - Current backlog is broad (hundreds of implicit-any diagnostics across orchestrators, adapters, services, and presentation bridge/effect classes).
  - Deferred to module-cluster execution slices.

### Phase 4
- Status: In Progress
- Start: 2026-02-06
- End:
- Result: Incomplete
- Notes:
  - Converted renderer `ServiceContainer` implementation to TypeScript:
    - `src/renderer/infrastructure/di/service-container.factory.ts`
  - Added typed registration/resolve container APIs.
  - Introduced shared renderer DI registration contract:
    - `src/renderer/application/di/registrable-container.type.ts`
  - Updated all renderer DI registration modules to use the shared typed contract.
  - Added TS-only compile-time type assertions in:
    - `tests/unit/renderer/infrastructure/di/service-container.types.test.ts`
  - Remaining work:
    - define/propagate a concrete renderer container key map through registration modules.

### Phase 5
- Status: Completed
- Start: 2026-02-06
- End: 2026-02-06
- Result: ✅
- Notes:
  - Added missing renderer notes event channel constant:
    - `EventChannels.NOTES.NOTE_UPDATED`.
  - Updated `NotesService.updateNote` to publish `NOTE_UPDATED`.
  - Updated notes panel subscriptions to handle `NOTE_UPDATED` external updates.
  - Expanded contract-focused tests:
    - `tests/unit/shared/ipc/channels.contract.test.js` (existing, retained)
    - `tests/unit/preload/preload-api.contract.test.js` (expanded)
    - `tests/unit/renderer/infrastructure/events/event-channels.contract.test.js` (new)
    - notes service and notes panel event-path assertions updated.

### Phase 6
- Status: Pending
- Start:
- End:
- Result:
- Notes: hotspot decomposition not executed in this pass.

### Phase 7
- Status: Pending
- Start:
- End:
- Result:
- Notes: `src/core` decision required from maintainers before execution.

### Phase 8
- Status: Pending
- Start:
- End:
- Result:
- Notes: CI policy lock and branch protections not executed in this pass.
