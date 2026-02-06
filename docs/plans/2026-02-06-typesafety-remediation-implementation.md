# Type-Safety Remediation Implementation

**Date:** 2026-02-06
**Status:** Completed
**Owner:** Codex

## Objective
Reduce runtime type-safety risk by removing `@ts-nocheck` from low-churn modules first, validating each batch with automated checks and a targeted architecture review.

## Scope
This implementation covers:
- Creating an execution plan for staged `@ts-nocheck` removal.
- Executing **Batch 1** (low-churn modules).
- Executing **Batch 2** (medium-churn renderer interaction modules).
- Executing **Batch 3** (remaining high-churn modules).
- Running a structured post-batch review.

Out of scope for this document execution cycle:
- Full strict-mode migration.
- Broad architectural refactors unrelated to typing remediation.

## Baseline (Before Batch 1)
- `@ts-nocheck` occurrences in runtime source: **58**
- `npm run lint`: passing with warnings only
- `npm run typecheck:app`: passing
- `npm run test:unit`: passing
- `npm run test:integration`: passing

## Batch Plan

### Batch 1 (Low Churn)
Target files:
1. `src/main/infrastructure/events/index.ts`
2. `src/renderer/infrastructure/adapters/devices/device-ipc-status.adapter.ts`
3. `src/renderer/infrastructure/services/settings/cinematic-mode.service.ts`
4. `src/renderer/infrastructure/adapters/platform/metrics.adapter.ts`
5. `src/renderer/presentation/lib/file-download.utils.ts`
6. `src/renderer/application/orchestrators/performance-metrics.orchestrator.ts`
7. `src/renderer/infrastructure/services/devices/device-connection.service.ts`
8. `src/renderer/infrastructure/services/devices/device-storage.service.ts`
9. `src/main/infrastructure/updates/update.bridge.ts`
10. `src/renderer/application/orchestrators/preferences.orchestrator.ts`
11. `src/renderer/application/orchestrators/performance-animation.orchestrator.ts`
12. `src/renderer/infrastructure/adapters/devices/device-ipc.adapter.ts`
13. `src/renderer/infrastructure/services/settings/presentation-mode.service.ts`
14. `src/renderer/application/orchestrators/update.orchestrator.ts`
15. `src/renderer/application/orchestrators/display-mode.orchestrator.ts`
16. `src/renderer/application/orchestrators/performance-state.orchestrator.ts`

Execution rules:
- Remove `@ts-nocheck`.
- Add minimal typing only where required for passing checks.
- Do not broaden scope into medium/high-churn modules.

Acceptance criteria:
- All Batch 1 files compile without `@ts-nocheck`.
- `npm run typecheck:app` passes.
- `npm run lint` passes (warnings allowed if unchanged in nature).
- `npm run test:unit` passes.
- `npm run test:integration` passes.

### Batch 2 (Medium Churn)
Target files:
1. `src/renderer/presentation/effects/body-class.class.ts`
2. `src/renderer/presentation/effects/button-feedback.effect.ts`
3. `src/renderer/presentation/effects/controls-auto-hide.effect.ts`
4. `src/renderer/presentation/effects/cursor-auto-hide.effect.ts`
5. `src/renderer/presentation/effects/toolbar-auto-hide.effect.ts`
6. `src/renderer/presentation/effects/ui-effects.class.ts`
7. `src/renderer/presentation/bridges/capture-ui.bridge.ts`
8. `src/renderer/presentation/bridges/transcode-ui.bridge.ts`
9. `src/renderer/presentation/bridges/ui-event.bridge.ts`
10. `src/renderer/application/state/app-state.ts`
11. `src/renderer/infrastructure/services/updates/update-ui.service.ts`

Execution rules:
- Remove `@ts-nocheck`.
- Add minimal typing only where required for passing checks.
- Keep changes scoped to selected modules.

Acceptance criteria:
- All Batch 2 files compile without `@ts-nocheck`.
- `npm run typecheck:app` passes.
- `npm run lint` passes (warnings allowed if unchanged in nature).
- `npm run test:unit` passes.
- `npm run test:integration` passes.

### Batch 3 (High Churn)
Target files:
- Remaining **31** runtime source files that still contained `@ts-nocheck` after Batch 2.
- Scope included main-process bootstrap/services and renderer orchestrators/services.

Execution rules:
- Remove `@ts-nocheck`.
- Add minimal typing only where required for passing checks.
- Keep behavior unchanged and avoid non-typing refactors.

Acceptance criteria:
- All Batch 3 files compile without `@ts-nocheck`.
- `npm run typecheck:app` passes.
- `npm run lint` passes (warnings allowed if unchanged in nature).
- `npm run test:unit` passes.
- `npm run test:integration` passes.

## Review Protocol (Run After Each Batch)
1. **Diff Review**
   - Confirm only batch files changed.
   - Confirm `@ts-nocheck` removed from intended files.
2. **Static Validation**
   - `npm run typecheck:app`
   - `npm run lint`
3. **Behavioral Validation**
   - `npm run test:unit`
   - `npm run test:integration`
4. **Architecture Sanity Check**
   - `node scripts/check-layer-boundaries.js`
5. **Result Log**
   - Record pass/fail and notable warnings/regressions.

## Batch Execution Log

### Batch 1
- Status: Completed
- Start: 2026-02-06
- End: 2026-02-06
- Notes:
  - Removed `@ts-nocheck` from all 16 Batch 1 target files.
  - `@ts-nocheck` count reduced from **58** to **42**.
  - Addressed typecheck blockers with minimal scoped fixes:
    - Added `export type` re-exports for isolated modules in `src/main/infrastructure/events/index.ts`.
    - Added minimal index signatures (`[key: string]: any`) to legacy DI classes relying on base-class dynamic assignment.
    - Added explicit constructor typing for `DeviceIpcAdapter`.
    - Fixed `Promise<void>` typing in `file-download.utils.ts`.
    - Made `streamingOverride` optional in `PresentationModeService._updateCinematicVisual`.

#### Batch 1 Review Results
- Diff scope:
  - Exactly the 16 Batch 1 target files were changed, plus this implementation document.
- Static validation:
  - `npm run typecheck:app` ✅ pass
  - `npm run lint` ✅ pass (6 pre-existing warnings, no errors)
- Behavioral validation:
  - `npm run test:unit` ✅ pass (126 files, 2748 tests)
  - `npm run test:integration` ✅ pass (1 file, 21 tests)
- Architecture sanity:
  - `node scripts/check-layer-boundaries.js` ✅ pass

### Batch 2
- Status: Completed
- Start: 2026-02-06
- End: 2026-02-06
- Notes:
  - Removed `@ts-nocheck` from all 11 Batch 2 target files.
  - `@ts-nocheck` count reduced from **42** to **31**.
  - Addressed typecheck blockers with minimal scoped fixes:
    - Added minimal index signatures (`[key: string]: any`) for dynamic class properties.
    - Added constructor parameter typing for destructured `options`/`dependencies`.

#### Batch 2 Review Results
- Diff scope:
  - Exactly the 11 Batch 2 target files were changed during execution.
- Static validation:
  - `npm run typecheck:app` ✅ pass
  - `npm run lint` ✅ pass (6 pre-existing warnings, no errors)
- Behavioral validation:
  - `npm run test:unit` ✅ pass (126 files, 2748 tests)
  - `npm run test:integration` ✅ pass (1 file, 21 tests)
- Architecture sanity:
  - `node scripts/check-layer-boundaries.js` ✅ pass

### Batch 3
- Status: Completed
- Start: 2026-02-06
- End: 2026-02-06
- Notes:
  - Removed `@ts-nocheck` from all remaining 31 runtime source files.
  - `@ts-nocheck` count reduced from **31** to **0**.
  - Addressed typecheck blockers with minimal scoped fixes:
    - Replaced stale import paths for renamed event/profile modules.
    - Added a `WindowService.getMainWindow()` accessor and updated call sites.
    - Resolved legacy `usb-detection` listener typing via compatibility wrapper.
    - Removed logger visibility conflicts in classes extending `BaseService`.
    - Added narrow local typings in renderer services where preload APIs return `unknown`.

#### Batch 3 Review Results
- Diff scope:
  - Exactly the remaining 31 Batch 3 target files were changed during execution.
- Static validation:
  - `npm run typecheck:app` ✅ pass
  - `npm run lint` ✅ pass (6 pre-existing warnings, no errors)
- Behavioral validation:
  - `npm run test:unit` ✅ pass (126 files, 2748 tests)
  - `npm run test:integration` ✅ pass (1 file, 21 tests)
- Architecture sanity:
  - `node scripts/check-layer-boundaries.js` ✅ pass
