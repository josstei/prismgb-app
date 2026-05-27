# PrismGB Future-First Design - Central Tracking Dashboard

This tracking dashboard is a living document used to monitor, audit, and checklist the execution of the **PrismGB Future-First Design Program** (encompassing Options 1A, 2B, 3A, and 4B).

Use this file to track progress, record scorecard milestones, and log completed audits.

---

## 1. Program Status Overview

| Metric | Baseline | Current Status | Target (End of Program) | Status |
| :--- | :---: | :---: | :---: | :---: |
| **Tracked Files** | 639 files | 687 files | **< 600 files** | 🟡 Active |
| **Source LOC** | ~130,000 LOC | 117,318 LOC | **< 90,000 LOC** | 🟡 Active |
| **Strict TS Diagnostics** | 0 | 0 | **0 (Strict)** | 🟢 Passing |
| **Scorecard Violations** | 0 | 0 | **0 (Strict)** | 🟢 Passing |
| **IPC Monadic Envelopes** | ~10% | ~20% (Staged) | **100% (Enforced)** | 🟡 Active |
| **UI Framework Weight** | 0 | 0 | **0 (Pure Headless)** | 🟢 Passing |

---

## 2. Active Branch Baseline Verification

Run this check suite before checking off any new tasks:
```bash
# Verify typecheck, lint, drift-checking, and size thresholds are green
npm run release:preflight
```

---

## 3. Comprehensive Execution Checklist

Use this checklist to track tasks. Mark completed items with `[x]` and in-progress items with `[/]`.

### [x] Step 1: Baseline Stabilization & Worktree Merge
- [x] Commit and merge the active staged worktree (26 files).
- [x] Run `npm run release:preflight` on the merged master/main branch.
- [x] Verify `npm run codebase:size` compiles a stable threshold baseline.

---

### [x] Step 2: Option 1A - Manifest-First IPC Contract Generation
#### [x] Phase 1: Generator Bootstrap
- [x] Parse `ipc.manifest.json` in `scripts/generate-contracts.js`.
- [x] Write code emitter to generate typescript generic endpoints.
- [x] Output `src/types/preload-api.generated.d.ts` without compiler errors.
- [x] Run verification tests.

#### [x] Phase 2: Exposure and Preload Type Cutover
- [x] Delete manual `src/types/preload-api.d.ts`.
- [x] Replace with generated types reference inside compiler scope.
- [x] Refactor `src/preload/index.js` to delegate exposure to the manifest-factory.
- [x] Harden `codebase-phase1-drift-report.js` to assert exact contract alignment.

#### [x] Phase 3: Manifest-Owned Validation & Argument Sanitization
- [x] Integrate validator metadata arrays in `ipc.manifest.json`.
- [x] Generate `src/preload/validators.generated.ts` from schemas.
- [x] Wire generated validators into default preload invoke methods.
- [x] Delete manual validators in `src/preload/validators.ts`.

---

### [x] Step 3: Option 2B - Compile-Time Decorator DI Code Generator
#### [x] Phase 1: Annotations & AST Extractor
- [x] Define `@Service` and `@Inject` decorators inside `src/shared/di/decorators.ts`.
- [x] Enable `experimentalDecorators` in TS configs.
- [x] Build the TypeScript compiler AST parsing script.
- [x] Verify metadata extraction lists all service constructor parameters correctly.

#### [x] Phase 2: Vite Hook Integration & Compiler
- [x] Write generator compiler to output `src/renderer/di.generated.ts`.
- [x] Integrate generator inside `vite.config.js` via a custom rebuild hook.
- [x] Add compile-time checks to reject missing DI tokens during bundling.

#### [x] Phase 3: Service Refactor & Instantiation Cutover
- [x] Add `@Service` decorators to infrastructure services and orchestrators.
- [x] Replace manual Awilix registration files with generated static DI graph imports.
- [x] Cut over main process registration to the static DI generator.
- [x] Verify DI resolution boot times drop to **<1 millisecond**.

---

### [x] Step 4: Option 3A - Enforced Monadic IPC Result Envelopes
#### [x] Phase 1: Monadic Types & Preload Integration
- [x] Establish generic `Result<T, E>` unions inside `ipc.contract.ts`.
- [x] Update preload validations to return `{ success: false, error }` on sanitization fails.
- [x] Verify compiler type-narrowing prevents reading `.data` before checking `.success`.

#### [x] Phase 2: Registry Error Mapping & Sanitization
- [x] Implement global exception catches inside `IpcHandlerRegistry`.
- [x] Convert main process throws into serialized monadic error structures.
- [x] Filter out system-level stack traces, returning structured error codes to the client.

#### [x] Phase 3: Legacy API Cutover
- [x] Refactor "bare" endpoints (`isFullScreen()`, `getDeviceStatus()`) to return `Result` envelopes.
- [x] Align renderer views and subcomponents to consume envelope return types.
- [x] Update architecture scorecard to strictly reject any future `responseMode: 'bare'` endpoints.

---

### [x] Step 5: Option 4B - Pure Headless Controllers + Template-Dom Ref Generation
#### [x] Phase 1: Headless Primitives Integration
- [x] Implement and test `FocusController` and focus traps.
- [x] Refactor primitive controls to leverage generic headless controllers.
- [x] Verify complete ARIA and accessibility compliant inputs.

#### [x] Phase 2: Template Ref Contract Generation
- [x] Scan HTML string templates during pre-build compilation.
- [x] Auto-generate `template-dom.generated.ts` containing elements ref maps.
- [x] Bind generated maps inside `createDomBindings()`, rejecting manual drift in CI.

#### [x] Phase 3: Async Presentation Component Modernization
- [x] Refactor `SettingsMenuComponent`, `UpdateSectionComponent`, and `NotesPanelComponent` to inherit from `PresentationComponent`.
- [x] Route all timers, frames, and event listeners through the async-aware `DisposableBag`.
- [x] Verify zero memory leaks or un-cleared listeners during rapid view toggles.

---

### [x] Step 6: Area I - Deferred Test Suite Cleanup
- [x] Replace custom unit-test mock setups with canonical `createMockDependencies()` factories.
- [x] Standardize settings, notes, and toolbar UI tests using Testing Library accessible role-based queries.
- [x] Replace global test mocks (`MediaRecorder`, `ResizeObserver`, `localStorage`) with clean test-level installers.
- [x] Replace regex-based text scans in tests with generated contract validations.

---

## 4. Ready-to-Use /goal Commands for Each Step

To execute the program using an AI coding assistant, copy and paste the corresponding `/goal` command below:

### 🚀 Step 2 (Option 1A: Manifest-First IPC Generation)
```text
/goal execute Step 2 (Option 1A: Manifest-First IPC Contract Generation) from FUTURE_FIRST_IMPLEMENTATION_PLAN.md. Modify or build the code generator script in scripts/generate-contracts.js to parse src/shared/ipc/ipc.manifest.json. Generate type-safe global declarations in src/types/preload-api.d.ts, generate preload argument validators inside src/preload/validators.generated.ts, and delete the manual validators in src/preload/validators.ts. Fully verify all changes using the 3-Pass Review protocol in FUTURE_FIRST_TRACKING.md, ensuring zero strict typecheck diagnostics, zero layer boundary violations, and 100% pass on all contract tests.
```

### 🚀 Step 3 (Option 2B: Compile-Time DI Generator)
```text
/goal execute Step 3 (Option 2B: Compile-Time Decorator DI Code Generator) from FUTURE_FIRST_IMPLEMENTATION_PLAN.md. Define @Service and @Inject decorators in src/shared/di/decorators.ts and enable experimentalDecorators. Implement the AST parser script in scripts/generate-di.js to read decorator metadata, generate src/renderer/di.generated.ts dynamically, and integrate it into vite.config.js via a pre-build Vite hook. Annotate services, replace manual Awilix DI files, and verify boot times drop below 1ms using the 3-Pass Review protocol in FUTURE_FIRST_TRACKING.md.
```

### 🚀 Step 4 (Option 3A: Enforced Monadic IPC Envelopes)
```text
/goal execute Step 4 (Option 3A: Enforced Monadic IPC Result Envelopes) from FUTURE_FIRST_IMPLEMENTATION_PLAN.md. Establish generic Result<T, E> unions in ipc.contract.ts and update preload validation to return monadic result envelopes on sanitization fails. Refactor the main-process IpcHandlerRegistry to catch service exceptions and serialize them as clean monadic result envelopes. Refactor legacy bare endpoints to return monadic envelopes, update renderer UI views, and verify using the 3-Pass Review protocol in FUTURE_FIRST_TRACKING.md.
```

### 🚀 Step 5 (Option 4B: Pure Headless UI Primitives & DOM Generation)
```text
/goal execute Step 5 (Option 4B: Pure Headless Controllers + Template-Dom Ref Generation) from FUTURE_FIRST_IMPLEMENTATION_PLAN.md. Solidify FocusController and headless primitives. Parse templates at pre-build to generate element ref maps in template-dom.generated.ts and bind them inside createDomBindings. Migrate UI views to PresentationComponent, route all timers, observers, and DOM events through DisposableBag, and verify zero memory leaks and zero frame drops using the 3-Pass Review protocol in FUTURE_FIRST_TRACKING.md.
```

### 🚀 Step 6 (Area I: Deferred Test Suite Cleanup)
```text
/goal execute Step 6 (Area I - Deferred Test Suite Cleanup) from FUTURE_FIRST_TRACKING.md and FUTURE_FIRST_IMPLEMENTATION_PLAN.md. Walk through tests and replace custom mock overrides with canonical createMockDependencies() factories. Standardize settings, notes, and toolbar UI tests using Testing Library accessible role-based queries. Replace global test mocks with explicit installers and replace text scans with generated contract validations. Verify using the 3-Pass Review protocol in FUTURE_FIRST_TRACKING.md.
```

---

## 5. The 3-Pass Review Quality Protocol (Executed After Each Phase)

To ensure maximum accuracy, stability, and future-proof quality, every completed implementation phase must pass **three distinct verification passes** before being marked off:

```
                  +----------------------------------------------+
                  |              3-PASS REVIEW PROTOCOL          |
                  +----------------------+-----------------------+
                                         |
         +-------------------------------+-------------------------------+
         |                               |                               |
         v                               v                               v
+--------+--------+             +--------+--------+             +--------+--------+
|     Pass 1      |             |     Pass 2      |             |     Pass 3      |
|  Strict Types   |             |  Architecture   |             |    Behavior     |
|   & Compiler    |             |  & Boundaries   |             |  & Performance  |
+-----------------+             +-----------------+             +-----------------+
```

### Pass 1: Structural & Strict Type Audits
*   **Method**: Execute strict compilation checks via `npm run typecheck:app` and verify zero TS compile-time errors.
*   **Audit Points**:
    - Confirm **0 strict diagnostics** and **0 allowlist exceptions** (assert that `scripts/type-debt-allowlist.json` remains completely empty).
    - Ensure zero usages of the `any` keyword across all modified files. Everything must be explicitly typed using TS interfaces or generics.
    - Confirm all generated modules are sandboxed cleanly and do not import forbidden Node APIs inside browser-evaluated modules.

### Pass 2: Architectural Layer & Boundary Verification
*   **Method**: Run `npm run lint` and the architecture scorecard to enforce rigid process boundaries.
*   **Audit Points**:
    - Ensure **0 layer boundary violations** (e.g. absolutely no direct imports from `src/renderer/infrastructure/` inside `src/renderer/presentation/`).
    - Verify that no new runtime `.js` files or declaration twins (`.d.ts`) were introduced in `src/`.
    - Run the phase 1 drift report (`npm run codebase:phase1`) and verify all manifest-enforced constraints are completely green.

### Pass 3: Behavioral Parity & Performance Audits
*   **Method**: Execute unit/integration test suites and perform visual performance/disposal smoke tests.
*   **Audit Points**:
    - Run `npm run test:run` and verify 100% of tests are passing.
    - Run the boot smoke check `npm run dev:smoke` to guarantee Context Isolation, asynchronous boot, and clean shutdown are completely functional in the Vite/Electron runtime.
    - Verify that all newly created timers, EventBus subscriptions, and DOM observers are registered in `DisposableBag` and actively cleared on view detaches (zero memory leaks or GC stutter pauses).

---

## 5. Parallel Subagent Execution Strategy

To optimize speed while preserving absolute quality, several components of the outstanding work are decoupled and can be executed **concurrently by parallel subagents** using branched workspaces (`branch` or `share` workspace mode).

```
                      [Baseline Master Staged Branch Merged]
                                        |
         +------------------------------+------------------------------+
         | (Subagent 1: Decoupled)                                     | (Subagent 2: Decoupled)
         v                                                             v
+--------+--------+                                           +--------+--------+
|   Option 2B     |                                           |   Option 4B     |
| Compile-Time DI |                                           |  Headless UI    |
|   Generator     |                                           |   Primitives    |
+--------+--------+                                           +--------+--------+
         |                                                             |
         +------------------------------+------------------------------+
                                        v
                            [Sync & Integrate Master]
                                        |
         +------------------------------+------------------------------+
         | (Subagent 3: Decoupled)                                     | (Subagent 4: Decoupled)
         v                                                             v
+--------+--------+                                           +--------+--------+
|   Option 3A     |                                           |    Area I       |
| Monadic IPC     |                                           | Deferred Test   |
|   Handlers      |                                           |    Cleanup      |
+-----------------+                                           +-----------------+
```

### 1. Prerequisite Sequence (Sequential)
- **Step 1** (Active Worktree Merge) must be committed and merged before launching any subagent.
- **Step 2** (Option 1A: Manifest-First IPC Generation) must be completed first to establish the authoritative global typings and validators that all other layers depend on.

### 2. Parallel Workstream A: Dependency Injection vs. Headless UI (High Leverage)
Once Step 2 is merged into master, the following two steps are completely decoupled and can run concurrently:
- **Subagent Workstream A1: Option 2B (Compile-Time DI Generator)**:
  - *Scope*: Operates entirely in the build tools (`vite.config.js`) and infrastructure layers (`di.generated.ts`).
  - *Tool Setup*: Spawn a subagent in `branch` workspace mode to develop the AST decorator parser and static container generator.
- **Subagent Workstream A2: Option 4B (Headless Primitives & Component Modernization)**:
  - *Scope*: Operates entirely in the renderer presentation layers (`src/renderer/presentation/`).
  - *Tool Setup*: Spawn a subagent concurrently in `share` workspace mode to implement headless primitives and component ref bindings.

### 3. Parallel Workstream B: Monadic Handlers vs. Test Suite Cleanup
Once DI and Headless component generators are integrated into master:
- **Subagent Workstream B1: Option 3A (Enforced Monadic IPC Results)**:
  - *Scope*: Converts remaining IPC handlers to return monadic `Result` envelopes.
- **Subagent Workstream B2: Step 6 (Area I - Deferred Test Cleanup)**:
  - *Scope*: Upgrades unit tests to use Testing Library accessible queries and `createMockDependencies()` factories. Runs concurrently in a separate test-only branch.

---

## 6. Quality Verification Commands

| Phase / Check | Command | Expected Output |
| :--- | :--- | :--- |
| **Strict Typecheck** | `npm run typecheck:app` | `strict diagnostics: 0` |
| **Layer Boundaries** | `npm run lint` | `Architecture boundary checks passed.` |
| **Scorecard Auditing** | `npm run architecture:scorecard` | `boundary violations: 0`, `any occurrences: 0` |
| **Drift Checking** | `npm run codebase:phase1` | `Codebase Size Reduction Phase 1 Drift Report - status: pass` |
| **Smoke Bootstrap** | `npm run dev:smoke` | Successful renderer boot and shutdown |

---

## 7. Progress & Audit Ledger

Use this section to record 3-Pass audit results, scorecard updates, and developer signatures.

| Date | Step/Phase | Pass 1 (Types) | Pass 2 (Boundaries) | Pass 3 (Behavior) | Audited By | Size (Files) |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| 2026-05-27 | Baseline | 🟢 Pass | 🟢 Pass | 🟢 Pass | Antigravity | 687 files |
| 2026-05-27 | Option 2B | 🟢 Pass | 🟢 Pass | 🟢 Pass | Antigravity | 682 files |
| 2026-05-27 | Option 1A | 🟢 Pass | 🟢 Pass | 🟢 Pass | Antigravity | 687 files |
| 2026-05-27 | Option 4B | 🟢 Pass | 🟢 Pass | 🟢 Pass | Antigravity | 687 files |
| 2026-05-27 | Option 3A | 🟢 Pass | 🟢 Pass | 🟢 Pass | Antigravity | 687 files |
| 2026-05-27 | Area I    | 🟢 Pass | 🟢 Pass | 🟢 Pass | Antigravity | 687 files |

