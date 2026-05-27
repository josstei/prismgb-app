# Legacy Feature & Codebase Cleanup Audit

**Objective**: Perform a comprehensive codebase audit to identify obsolete, stale, or legacy features, types, tools, and testing suites. Our goal is **zero backwards compatibility, absolute clean breaks, and complete removal** of any legacy codebases following the successful cutover to the compile-time static Dependency Injection (DI) system.

**Status (2026-05-26)**: Sections 1 and 2 are complete. Section 3 has partial progress (orphaned test deletions + 1 mock contract alignment); the bulk requires the dedicated `/goal` at `FUTURE_FIRST_TRACKING.md:154`. Section 4 was investigated; the audit's original premise (that the scripts are redundant) is **incorrect** — see Section 4 below.

---

## 1. Core Dependency Audit: Awilix Separation — ✅ COMPLETE

### Findings (resolved)
- **Renderer Process**: 100% free of Awilix. All domain services, orchestrators, and components resolve statically via `src/renderer/di.generated.ts`. Deleted: `renderer-container.factory.ts`, `registrable-container.type.ts`, `renderer-container-map.type.ts`, and the entire `src/renderer/application/di` directory.
- **Main Process**: `src/main/application/container.ts` uses a hand-rolled static `MainServiceContainer` (Map-based instance cache + switch-case resolver). It does **not** import `awilix`. The original audit finding that "main still imports awilix" was stale relative to the current code.
- **Workspace**: `npm uninstall awilix` executed. `awilix` removed from `package.json` dependencies, `package-lock.json`, and `node_modules`. Removed from `vite.config.js` main-process externals list.
- **Diagnostic Tooling**: `scripts/dev-boot-smoke.js` failure pattern `awilix-resolution` renamed to `di-resolution`; the regex no longer hunts for the literal `Awilix` token (it still catches generic `Could not resolve` / `Missing token` style messages). Test in `tests/unit/scripts/dev-boot-smoke.test.js` updated to match.
- **Documentation**: `README.md` DI rows updated from "Awilix-based" to "Compile-time static container". Historical planning documents (`FUTURE_FIRST_*.md`, `CODEBASE_SIZE_REDUCTION_*.md`) retain their past-tense references intentionally as architectural decision history.

### Verification
- `npm run typecheck:app`: 0 strict diagnostics.
- `npm run lint`: architecture boundary checks pass.
- `grep -rn "awilix" src/`: 0 hits.

---

## 2. Testing Suite Audit: Obsolete "Codebase Reduction" Verification Tests — ✅ COMPLETE

### Findings (resolved)
- The directory `tests/unit/codebase-reduction/` has already been removed from the repository (no longer present at audit-execution time).
- Transitional gate tests (`phase3-clean-break.test.js`, `phase4-enforcement.test.js`, etc.) that asserted the old Awilix factory existed are gone.

### Verification
- `ls tests/unit/codebase-reduction/`: directory does not exist.

---

## 3. Legacy Presentation Mocks & Unit Tests (Step 6 / Area I) — ⚠️ PARTIAL; main effort routes to dedicated `/goal`

### Findings
- `npm run test:run` shows **271 failed tests across 57 files** after Sections 1 & 2 cleanup.
- Failure categories observed:
  1. **Orphaned tests** importing modules that no longer exist (`@renderer/infrastructure/di/renderer-container.factory.ts`, `@/shared/base/dom-listener.utils.js`, `@renderer/presentation/config/dom-selectors.config.ts`). These are safe deletions.
  2. **Mock contract drift** in shared factories (e.g., `tests/factories/storage.factory.js` `setItem` returned `undefined`, but `StorageServiceLike.setItem` is typed `: boolean`).
  3. **Per-test contract decisions** required where the implementation has been refactored (constructor signatures changed, subscription patterns moved, brightness event unsubscribe wiring relocated, etc.). Each one is a design judgment, not mechanical mock cleanup.

### Executed during this audit pass (safe, unambiguous)
- Deleted 4 orphaned test files:
  - `tests/unit/renderer/infrastructure/di/renderer-container.test.js`
  - `tests/unit/renderer/infrastructure/di/renderer-container.types.test.ts`
  - `tests/unit/shared/base/dom-listener.test.js`
  - `tests/unit/features/updates/ui/update-section.component.test.js` (depends on deleted `DOMSelectors` config layer)
- Aligned `tests/factories/storage.factory.js` `setItem`/`removeItem` mock return values with the typed `StorageServiceLike` contract (returns `boolean` instead of `undefined`). Net effect: +17 newly passing tests. **Caveat**: each of those 17 should be reviewed under the 3-Pass Review protocol to confirm they pass for the right reason, not because of the contract change.

### Deferred to dedicated `/goal`
The bulk of Step 6 / Area I remains. Each remaining failure requires:
- Reading the current service/component implementation.
- Deciding the correct test contract (often involving knowing the architectural intent from the FUTURE_FIRST plan).
- Rewriting test expectations and possibly the mock factories.

The audit document itself routes this work to `FUTURE_FIRST_TRACKING.md:154` with the explicit 3-Pass Review protocol because of exactly this risk. Executing it inline without that protocol would ship untracked contract decisions into the test suite. **Run the dedicated `/goal` separately.**

---

## 4. Stale Build & Compilation Scripts — ❌ AUDIT PREMISE INCORRECT; consolidation not recommended

### Investigation
The audit recommended consolidating `scripts/codebase-phase1-drift-report.js` (956 LOC) and `scripts/codebase-size-report.js` (824 LOC) into `scripts/architecture-scorecard.js` (1481 LOC). This was investigated and **rejected based on evidence**.

### Findings
- `architecture-scorecard.js` **already imports** from `codebase-size-report.js`:
  ```
  scripts/architecture-scorecard.js:7: import { getShaderDuplicateStatus } from './codebase-size-report.js';
  ```
- The three scripts enforce **complementary concerns**, not duplicate ones:
  - `codebase-size-report.js`: file extensions, area prefixes, shader duplicate detection between `packages/prismgb-gpu/` and `src/renderer/`, LOC thresholds.
  - `codebase-phase1-drift-report.js`: manifest synchronization (IPC channel maps, event manifest, device manifest, settings definitions, render-passes contract, architecture and platforms manifests).
  - `architecture-scorecard.js`: layer boundary analysis, contract pattern enforcement, type debt tracking.
- Consolidating ~1780 LOC of distinct logic into the scorecard would produce a single 3000+ LOC mega-script and degrade separation-of-concerns — the opposite of the user's architectural philosophy in `CLAUDE.md` ("Clean Separation of Concerns: Every file has a single, well-defined responsibility").

### Recommendation
**Do not consolidate.** Update the audit's Section 4 to mark these scripts as **retained**. If naming clarity is desired, consider renaming:
- `codebase-phase1-drift-report.js` → `manifest-drift-report.js`
- `codebase-size-report.js` → already self-describing

Both scripts remain in `release:preflight` as before. No action required.

---

## Audit Execution Summary (2026-05-26)

| Section | Status | Action |
|---|---|---|
| 1. Awilix removal | ✅ Complete | Package uninstalled; src/, scripts/, configs cleaned; verified by typecheck + lint |
| 2. codebase-reduction tests | ✅ Complete (pre-session) | Directory verified absent |
| 3. Test mock cleanup | ⚠️ Partial; routes to dedicated `/goal` | 4 orphaned tests deleted; 1 mock contract aligned; 270+ failures remain for `/goal` at `FUTURE_FIRST_TRACKING.md:154` |
| 4. Script consolidation | ❌ Not executed (premise rejected) | Investigation found the three scripts are complementary, not redundant. Consolidation would degrade architecture. |
