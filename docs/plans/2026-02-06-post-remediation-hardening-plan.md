# Post-Remediation Hardening Plan

**Date:** 2026-02-06  
**Status:** Completed  
**Owner:** Codex

## Objectives
1. Replace temporary local typing shims (`[key: string]: any`) with cleaner architecture.
2. Tighten preload/API contracts so renderer code does not rely on `unknown` IPC results.
3. Eliminate remaining lint warnings.

## Design

### 1) Shim Cleanup Strategy
- **Problem:** Local index-signature shims were scattered across many classes after batch migration.
- **Decision:** Move dynamic typing support to framework boundaries and keep local shims only in highly dynamic utility/effect classes where full field typing is not yet cost-effective.
- **Implementation:**
  - Added canonical declaration files for JS base abstractions:
    - `src/shared/base/service.base.d.ts`
    - `src/shared/base/orchestrator.base.d.ts`
    - `src/shared/interfaces/device-adapter.interface.d.ts`
    - `src/shared/interfaces/device-status-provider.interface.d.ts`
    - `src/shared/interfaces/fallback-strategy.interface.d.ts`
  - Removed local `[key: string]: any` shims broadly, then reintroduced a reduced subset only in dynamic renderer utility/effect classes.

### 2) Preload/API Contract Hardening
- **Problem:** `preload-api.d.ts` used `unknown` for most result/event payloads, forcing downstream casts.
- **Decision:** Define a shared contract source and consume it from both main IPC handlers and renderer service layers.
- **Implementation:**
  - Added `src/shared/ipc/preload-api.contract.ts` as shared contract model.
  - Updated `src/types/preload-api.d.ts` to concrete API signatures.
  - Updated main IPC handler typing (`device`, `update`, `transcode`, `window`, `shell`, `performance`, `gpu`) and registry wiring to use concrete contract types.
  - Updated renderer update/transcode services to consume typed preload contracts directly.

### 3) Lint Baseline Cleanup
- **Problem:** 6 pre-existing warnings in transcode/window code.
- **Decision:** Apply minimal no-behavior-change fixes.
- **Implementation:**
  - Removed dead `normalizeArchDir` helper.
  - Cleaned unused catch binding and unused loop tuple variable in transcode service.
  - Removed unused `WebContents` import and renamed unused callback params to `_line`/`_sourceId`.

## Execution Plan and Status
1. Create shared preload contract types: **Completed**
2. Re-type preload global API declarations: **Completed**
3. Re-type main IPC handlers/registry to shared contracts: **Completed**
4. Reduce local shim footprint and stabilize typecheck: **Completed**
5. Clear lint warnings: **Completed**
6. Validate with full checks: **Completed**

## Results
- Local shim count reduced from **93** to **33** (`rg "\\[key:\\s*string\\]:\\s*any" src`).
- Preload API declarations now use concrete contract types (no `Promise<unknown>` in `src/types/preload-api.d.ts`).
- Lint warnings reduced from **6** to **0**.

## Validation
- `npm run typecheck:app` ✅
- `npm run lint` ✅
- `node scripts/check-layer-boundaries.js` ✅ (via lint script)
- `npm run test:unit` ✅ (126 files, 2748 tests)
- `npm run test:integration` ✅ (1 file, 21 tests)

## Follow-up (Optional)
1. Continue shim reduction from 33 to 0 by explicit property declarations in dynamic renderer utility/effect classes.
2. Strengthen contract granularity further (replace remaining `[key: string]: unknown` extension points with strict payload schemas where stable).
