# Legacy Feature & Codebase Cleanup Audit

**Objective**: Perform a comprehensive codebase audit to identify obsolete, stale, or legacy features, types, tools, and testing suites. Our goal is **zero backwards compatibility, absolute clean breaks, and complete removal** of any legacy codebases following the successful cutover to the compile-time static Dependency Injection (DI) system.

---

## 1. Core Dependency Audit: Awilix Separation

### Findings
- **Renderer Process**: The renderer bundle is now **100% free** of Awilix. All 54 domain services, orchestrators, and components resolve statically in topological order via `src/renderer/di.generated.ts`. We have deleted the obsolete `renderer-container.factory.ts`, `registrable-container.type.ts`, and `renderer-container-map.type.ts` files, along with the entire `src/renderer/application/di` directory.
- **Main Process**: The main process (`src/main/application/container.ts` and `src/main/application/app.orchestrator.ts`) still imports and registers dependencies using `awilix`.
- **Root `package.json`**: `"awilix": "^13.0.3"` remains declared in the global dependencies.

### Clean-Break Recommendation
- **Action**: Migrate the main process container (`src/main/application/container.ts`) to a static, compile-time/build-time DI generator or a direct statically-resolved container module.
- **Impact**: Once the main process DI is migrated, we can run `npm uninstall awilix` to **completely strip Awilix from the entire workspace**, reducing root dependencies, improving main process bootstrap efficiency, and achieving a 100% clean break.

---

## 2. Testing Suite Audit: Obsolete "Codebase Reduction" Verification Tests

### Findings
- In the `tests/unit/codebase-reduction/` directory, several tests (e.g. `phase3-clean-break.test.js`, `phase4-enforcement.test.js`) are failing under `npm run test:run`.
- **Reason for Failure**:
  - `phase3-clean-break.test.js` explicitly asserts that `src/renderer/infrastructure/di/renderer-container.factory.ts` exists and contains `'awilix'`. Since we executed a clean break and deleted the old Awilix factory in Option 2B, this test fails.
  - `phase4-enforcement.test.js` checks for explicit string matches inside templates (like `SettingsDefinitions.definitions.find`) that have since been refactored or improved in the presentation layer.
- These tests were designed as *transitional gates* to verify structural refactorings during early codebase size-reduction phases, but they have now been fully superceded by the final Option 2B compile-time static DI architecture and the modern template ref structures.

### Clean-Break Recommendation
- **Action**: Completely delete the `tests/unit/codebase-reduction/` test directory (7 test files).
- **Impact**: Removes obsolete, transitional tests that enforce old, outdated requirements. Clears the test runner path, removing stale vitest coverage overhead.

---

## 3. Legacy Presentation Mocks & Unit Tests (Step 6 / Area I)

### Findings
- Several unit tests in other modules (e.g., `notes-panel.component.test.js`, `fullscreen.service.test.js`, `transcode.service.test.js`, `ui-setup.orchestrator.test.js`) fail because of stale mock overrides and direct constructor invocations with missing or improperly-mocked dependency arguments.
- These tests are directly coupled to legacy manual mocks instead of using unified mock factories.
- This technical debt is explicitly identified and tracked under **Step 6: Area I - Deferred Test Suite Cleanup** in `FUTURE_FIRST_TRACKING.md`.

### Clean-Break Recommendation
- **Action**: Execute Step 6 (Area I) as planned, replacing custom manual mock overrides with canonical `createMockDependencies()` factories, standardizing selectors, and removing inline test mock assignments.

---

## 4. Stale Build & Compilation Scripts

### Findings
- **`scripts/codebase-phase1-drift-report.js`**: A large, 128KB script used to enforce early-stage schema/manifest constraints.
- **`scripts/codebase-size-report.js`**: Enforces strict line-of-code thresholds on components.
- Now that structural constraints are strictly enforced via compilation (`npx tsc`), rigid layer boundaries (`scripts/check-layer-boundaries.js`), and the architecture scorecard (`scripts/architecture-scorecard.js`), some of these transitional scripts could be consolidated or simplified.

### Clean-Break Recommendation
- **Action**: Consolidate `codebase-phase1-drift-report.js` and `codebase-size-report.js` validation rules into the modern `architecture-scorecard.js` script, allowing us to retire the obsolete report scripts.
