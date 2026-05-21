# PrismGB Codebase Size Reduction Implementation Plan

Date: 2026-05-18

Source findings: `CODEBASE_SIZE_REDUCTION_FINDINGS.md`

This plan turns every numbered finding in `CODEBASE_SIZE_REDUCTION_FINDINGS.md` into long-term implementation work. The target is not a round of small cleanup. The target is to make PrismGB increasingly contract-driven, generated, typed, measured, and enforceable so codebase size stays lower as the product grows.

## Execution Status

Last updated: 2026-05-21

- Status: Phase 4 enforcement and ratchets are implemented on branch `codex/codebase-reduction-phase-4`; the Phase 0/4 clean-break audit is current in this plan instead of a separate stale audit artifact.
- Completed phase: Phase 4, Enforcement And Ratchets.
- Phase 0 commit: `20ac639 chore(codebase): add size reduction baselines`.
- Phase 0 review: completed with GPT-5.5 xhigh review after fixes; final review found no blocking issues and marked Phase 0 acceptable to commit.
- Verification at Phase 0 commit:
  - `npm run lint` exited 0 with 5 existing warnings and architecture boundary checks passing.
  - Current phase-regression coverage includes PR lint parity (`semantic-pull-request` and `npx commitlint --from <base> --to <head> --verbose`) so invalid PR/commit subjects are caught before GitHub Actions.
  - Current phase-regression coverage includes `npm run architecture:scorecard -- --enforce-thresholds --output artifacts/architecture-scorecard.json --summary-output artifacts/architecture-scorecard-summary.md` so scorecard ratchets are checked with the Phase 0 baselines.
  - Current phase-regression coverage includes `npm run packaging:check-native-abi` so Electron/native-module packaging compatibility is checked before release packaging.
  - `npm run typecheck` exited 0 for app and `@prismgb/gpu`.
  - `npm run test:run` passed with 147 test files and 2951 tests.
  - `npm run codebase:size -- --json` exited 0 and reports tracked source separately from local artifacts, test artifacts, build output, release output, package output, and vendored dependency buckets.
- Phase 0 delivered:
  - `scripts/codebase-size-report.js` and `npm run codebase:size`.
  - Contract baselines for preload/API invoke forwarding, IPC channel shape, EventBus channel values, settings defaults, device metadata, duplicated shader equivalence, E2E selector assumptions, release artifact targets, and known drift cases.
  - `src/preload/apis/inline.preload-api.js`, an extraction of inline preload APIs that made shell, metrics, GPU, and login-item invoke contracts testable.
- Phase 1 delivered:
  - Shared foundations: `DisposableBag`, contract flattening/schema helpers, script utility helpers, canonical test support helpers, `TypedRegistryFactory`, preload `createSubscription()`, and main IPC handler descriptor helpers.
  - Low-risk contract adoption: `updateAPI.onError` now uses the subscription factory, and login-item IPC handlers now use descriptors with public response shapes asserted by tests.
  - Report-only manifests: IPC/preload, scoped events, Chromatic device metadata, settings definitions, GPU render passes, architecture aliases/layers, and platform build targets.
  - Drift/generation command: `npm run codebase:phase1`, with optional generated declaration and docs preview artifacts under `artifacts/codebase-reduction/phase1`.
  - Official WebGPU types are hoisted to the root type environment; local `webgpu-worker.d.ts` is reduced to an augmentation placeholder.
  - Vitest coverage output now targets ignored `artifacts/coverage` instead of `tests/coverage`.
- Phase 2 delivered:
  - Preload subscriptions now use descriptor-style `createSubscription()` plumbing with map-backed listener registries across device, window, update, and transcode APIs; namespace-wide public listener teardown methods were removed and preload owns internal disposal.
  - Main IPC handlers now register descriptor arrays directly with centralized duplicate-channel detection, disposal, and explicit per-handler error mapping; per-domain registration wrappers were removed.
  - Renderer event imports now point directly at the shared event contract; the renderer event-channel re-export was deleted. Main event channels derive from the scoped event manifest.
  - `@prismgb/gpu` exposes worker-safe pipeline creation, render-pass helper metadata, and explicit preset bulk registration without side-effect preset imports.
  - `BaseService` now owns `DisposableBag` lifecycle helpers, and renderer update/transcode services use a generic preload event bridge with per-subscription cleanup.
  - Settings now use manifest-backed generic `getSetting()`/`setSetting()` and typed setting accessors; setting-specific getters/setters and manifest method mappings were removed.
  - Streaming adapter/renderer factories now use the shared typed registry primitive.
  - `npm run clean:generated` removes ignored generated local artifacts without deleting tracked package build outputs.
  - Full-cutover audit after Phase 2 removed outdated preload declaration drift, setting-specific service methods, main IPC registration wrappers, renderer event re-export paths, and dead transcode UI state.
- Phase 3 delivered:
  - Renderer worker internals now delegate rendering, capture, resize, stats, preset, brightness, and disposal to `@prismgb/gpu` through `createWorkerPipeline()`; renderer-private WebGPU/WebGL2 engines, optimization helpers, and duplicate shader trees were deleted.
  - `@prismgb/gpu` now owns worker-safe WebGL2 probing, package shader ownership, and the worker pipeline API while preserving the worker protocol boundary in the renderer.
  - Renderer DI now uses Awilix descriptor registration and typed container metadata; the custom `ServiceContainer` implementation and its old tests were deleted.
  - Renderer descriptor registration now supports explicit class dependency metadata, and `uiEffects` declares `bodyClassManager` directly while keeping DOM element wiring delayed until `UIController` creates the elements.
  - Presentation auto-hide behavior now uses `PresentationComponent` and `ActivityAutoHideController`, consolidating repeated listener, RAF, timer, and disposal behavior behind current UI boundaries.
  - Vitest is split into explicit `shared-node`, `renderer-happy-dom`, `main-preload`, and `gpu-package` projects; browser API mocks moved to project-scoped installers and the lazy/global sandbox helpers were deleted.
  - Runtime `channels.json` imports now use one import style across main/preload sources so Vite cannot emit mixed JSON import-attribute warnings during dev builds.
  - The device preload factory now uses the current `getDeviceStatus`, `onDeviceConnected`, and `onDeviceDisconnected` names internally; the old listener method names are no longer public or internal compatibility surfaces.
  - The stale Phase 0/1 audit artifact was retired into this implementation plan, and `tests/unit/codebase-reduction/phase3-clean-break.test.js` now guards the Phase 3 clean-break requirements.
- Phase 4 delivered:
  - `scripts/architecture-scorecard.js` now enforces no unexpected hand-maintained contract files, no renderer shader duplicate files, no shader divergence, no runtime JS plus `.d.ts` twins, no inline canonical preload API mocks, and no alias/platform drift outside manifests.
  - `src/shared/base/*` and `src/shared/interfaces/*` completed the JS plus `.d.ts` twin cutover to TypeScript sources; the old generated declaration/runtime pairs were deleted rather than kept as compatibility shims.
  - `scripts/typecheck-app.js` and `scripts/type-debt-allowlist.json` enforce strict TypeScript debt with expiring, owned allowlist metadata; stale or overflowed buckets fail the gate.
  - `scripts/coverage-ratchet.js` and `scripts/coverage-thresholds.json` enforce owned, expiring coverage ratchets by runtime area/project, with the main/preload gap explicitly report-only until a dedicated Electron-runtime coverage artifact exists.
  - Generated and local artifact cleanup is cut to current ignored outputs under `artifacts/**`, `.vitest`, and Playwright result directories; the old `tests/coverage` cleanup and ignore path was removed.
  - `npm run dev:smoke` starts `npm run dev` on explicit IPv4 localhost, captures startup output, fails on renderer errors, Awilix missing-token failures, and Vite JSON import-attribute warnings, then tears down the process tree.
  - `npm run release:preflight` and `.github/workflows/reusable-ci-tests.yml` run native ABI checks, architecture thresholds, manifest drift checks, strict type debt checks, coverage plus coverage ratchets, and dev boot preflight before release readiness.
  - `tests/unit/codebase-reduction/phase4-enforcement.test.js` guards the Phase 4 clean-break requirements so the old paths and future-phase status cannot drift back in.
- Verification for Phase 1:
  - Current phase-regression coverage includes PR lint parity (`semantic-pull-request` and `npx commitlint --from <base> --to <head> --verbose`) so invalid PR/commit subjects are caught before GitHub Actions.
  - Current phase-regression coverage includes `npm run architecture:scorecard -- --enforce-thresholds --output artifacts/architecture-scorecard.json --summary-output artifacts/architecture-scorecard-summary.md` so architecture ratchets are checked with the Phase 1 manifest drift gates.
  - Current phase-regression coverage includes `npm run packaging:check-native-abi` so Electron/native-module packaging compatibility is checked before release packaging.
  - `npm run lint` exited 0 with 5 existing warnings and architecture boundary checks passing.
  - `npm run typecheck` exited 0 for app and `@prismgb/gpu`; one outdated type-debt allowlist bucket for login-item handlers was removed.
  - `npm run test:run` passed with 150 test files and 2967 tests after the Phase 0/1 audit hardening test was added.
  - `npm run codebase:phase1 -- --json` exited 0 and all Phase 1 drift checks passed.
  - `npm run codebase:size -- --json` exited 0 and continues to separate tracked source from local artifacts.
- Verification for Phase 2:
  - Current phase-regression coverage includes PR lint parity (`semantic-pull-request` and `npx commitlint --from <base> --to <head> --verbose`) so invalid PR/commit subjects are caught before GitHub Actions.
  - Current phase-regression coverage includes `npm run architecture:scorecard -- --enforce-thresholds --output artifacts/architecture-scorecard.json --summary-output artifacts/architecture-scorecard-summary.md` so architecture ratchets are checked with the Phase 2 generated-runtime and cleanup gates.
  - Current phase-regression coverage includes `npm run packaging:check-native-abi` so Electron/native-module packaging compatibility is checked before release packaging.
  - `npm run lint` exited 0 with 3 existing warnings and architecture boundary checks passing.
  - `npm run typecheck` exited 0 for app and `@prismgb/gpu`; outdated type-debt allowlist buckets from migrated Phase 2 files were removed.
  - `npm run test:run` passed with 154 test files and 2957 tests.
  - `npm run test:run --workspace=@prismgb/gpu` passed with 5 test files and 27 tests.
  - `node scripts/codebase-phase1-drift-report.js` exited 0 and all manifest drift checks passed after main event channels moved to manifest-derived values.
  - `node scripts/codebase-size-report.js --json` exited 0 and continues to separate tracked source from ignored local build/release/package outputs.
- Verification for Phase 3:
  - Current phase-regression coverage includes PR lint parity (`semantic-pull-request` and `npx commitlint --from <base> --to <head> --verbose`) so invalid PR/commit subjects are caught before GitHub Actions.
  - Current phase-regression coverage includes `npm run architecture:scorecard -- --enforce-thresholds --output artifacts/architecture-scorecard.json --summary-output artifacts/architecture-scorecard-summary.md` so architecture ratchets are checked with the Phase 3 clean-break gates.
  - Current phase-regression coverage includes `npm run packaging:check-native-abi` so Electron/native-module packaging compatibility is checked before release packaging.
  - `npm run test:run -- tests/unit/codebase-reduction/phase3-clean-break.test.js tests/unit/scripts/codebase-size-report.test.js tests/unit/scripts/codebase-phase1-drift-report.test.js` passed with 3 test files and 16 tests.
  - `npm run test:run -- tests/unit/preload/preload-api.invoke-contract.test.js tests/unit/preload/preload-api.contract.test.js tests/unit/codebase-reduction/non-ipc-baselines.test.js tests/unit/codebase-reduction/phase3-clean-break.test.js tests/unit/scripts/codebase-phase1-drift-report.test.js` passed with 5 test files and 32 tests after the device preload clean-break cutover.
  - `npm run lint` exited 0 with 3 existing warnings and architecture boundary checks passing.
  - `npm run typecheck` exited 0 for app and `@prismgb/gpu`; strict app diagnostics are 660, tracked buckets are 135, and stale buckets are 0.
  - `npm run test:run` passed with 155 test files and 2853 tests after dev-boot hardening checks were added.
  - `npm run test:run --workspace=@prismgb/gpu` passed with 5 test files and 28 tests.
  - `npm run codebase:phase1 -- --json` exited 0 and all manifest drift checks passed.
  - `npm run codebase:size -- --json` exited 0 and reports WebGPU/WebGL2 shader status as package-owned with clean ownership.
  - The focused Phase 0-3 audit loop was run 5 times; each pass verified manifest drift, size/shader ownership, obsolete source-name absence, deleted legacy-path absence, and the Phase 3 clean-break regression test.
  - `npm run dev` was run until the renderer logged `Renderer application started successfully`; the prior `uiEffects -> elements` Awilix resolution failure is covered by container tests.
  - Dev build output was rechecked after aligning `channels.json` imports; the prior Vite mixed JSON import-attribute warning is covered by the runtime IPC import-style test.
- Verification for Phase 4:
  - Current phase-regression coverage includes PR lint parity (`semantic-pull-request` and `npx commitlint --from <base> --to <head> --verbose`) so invalid PR/commit subjects are caught before GitHub Actions.
  - Current phase-regression coverage includes `npm run architecture:scorecard -- --enforce-thresholds --output artifacts/architecture-scorecard.json --summary-output artifacts/architecture-scorecard-summary.md` so architecture ratchets are checked with the Phase 4 enforcement gates.
  - Current phase-regression coverage includes `npm run packaging:check-native-abi` so Electron/native-module packaging compatibility is checked before release packaging.
  - `npm run architecture:scorecard -- --enforce-thresholds --output artifacts/architecture-scorecard.json --summary-output artifacts/architecture-scorecard-summary.md` exits 0 with zero unexpected contract files, zero renderer shader duplicate files, zero runtime JS plus `.d.ts` twins, zero inline canonical preload mocks, and zero alias/platform drift.
  - `npm run codebase:phase1 -- --json` exits 0 and all manifest drift checks pass, including IPC/preload, event, settings, device, render-pass, architecture alias, and platform build matrix ownership.
  - `npm run codebase:size -- --json` exits 0 and reports tracked source separately from current ignored artifact buckets without the old `tests/coverage` artifact path.
  - `npm run architecture:type-debt:check` exits 0 with strict mode enabled, owned expiring allowlist metadata, and no stale type-debt buckets.
  - `npm run test:run -- tests/unit/codebase-reduction/phase-ci-gates.test.js tests/unit/codebase-reduction/phase3-clean-break.test.js tests/unit/codebase-reduction/phase4-enforcement.test.js tests/unit/scripts/architecture-scorecard.test.js tests/unit/scripts/clean-generated.test.js tests/unit/scripts/codebase-size-report.test.js tests/unit/scripts/coverage-ratchet.test.js tests/unit/scripts/dev-boot-smoke.test.js tests/unit/scripts/typecheck-app.test.js` exits 0 for the focused Phase 0/4 clean-break audit suite.
  - `npm run test:coverage` followed by `npm run coverage:ratchet` exits 0, proving coverage artifacts are generated under `artifacts/coverage` and the Phase 4 ratchet policy is enforced.
  - `xvfb-run -a npm run dev:smoke` is the CI form of the dev boot preflight; `npm run dev:smoke` is the local equivalent.

## Phase 0 Grounding Snapshot

The plan was grounded in the Phase 0 repository state before Phase 1 added report-only manifests and shared foundations. Treat the counts and examples in this section as the baseline that Phase 0 measured, not as live post-Phase-1 totals. The "Grounded repo truth" blocks in each finding are likewise original planning baselines; current state is recorded in the execution status above and the current audit report:

- The root package is an Electron/Vite app with npm workspaces and `@prismgb/gpu` under `packages/prismgb-gpu`.
- `package.json` already includes `awilix`, `eventemitter3`, `joi`, Vitest, Playwright, Testing Library, Vite, Electron, and Electron Builder.
- `git ls-files` currently reports 639 tracked files, with the largest tracked extension counts at 268 `.js`, 230 `.ts`, 38 `.css`, 23 `.svg`, 10 `.json`, 10 `.glsl`, and 8 `.wgsl`.
- `src/renderer/presentation` currently contains 92 `.js`/`.ts`/`.css` files.
- IPC/preload code is split across `src/shared/ipc/channels.json`, `src/shared/ipc/preload-api.contract.ts`, `src/types/preload-api.d.ts`, `src/preload/index.js`, `src/preload/apis/*.preload-api.js`, `src/preload/listener-registry.js`, `src/preload/validators.js`, and `src/main/ipc/**`.
- Renderer and GPU package shader folders are byte-equivalent by `diff -qr` and account for 1,782 total lines across duplicated WebGPU and WebGL2 shader trees.
- Renderer DI uses a custom container in `src/renderer/infrastructure/di/service-container.factory.ts`, while main already uses Awilix in `src/main/application/container.ts`.
- `BaseService` only validates dependencies and creates a logger; `BaseOrchestrator` owns EventBus subscription cleanup, but services and presentation components still manage timers/listeners/observers ad hoc.
- `SettingsService` repeats default, key, parse, validation, write, logging, and event behavior per setting. Its default recording format is `webm`, while `TRANSCODE_CONFIG.defaultFormat` is `mp4`.
- Built-in Chromatic metadata appears in device registry/config, renderer adapters, CSS/tests/E2E mocks, and hard-coded `160x144` usage.
- `vitest.config.js` currently has one `happy-dom` project, writes coverage to `tests/coverage`, excludes main/preload and multiple rendering paths from coverage, and default root scripts do not run GPU package tests.
- `.gitignore` ignores `tests/coverage/`, `.vitest/`, `artifacts/`, Playwright reports, and release/build outputs. Local ignored artifacts are still present and noisy.

## Program Success Criteria

The overall program succeeds when these conditions are true:

- Repeated contracts are authoritative in manifests or generated sources, not hand-maintained in multiple runtime and test files.
- Manual implementation files contain behavior, not duplicated channel lists, payload maps, registration tables, selector maps, mock fixtures, platform matrices, or lifecycle cleanup patterns.
- Every generated surface has an owner manifest, generation command, drift check, and deletion policy for generated local artifacts.
- Migrated public APIs have one current contract; no migrated surface keeps old method surfaces or duplicate import paths.
- File count and LOC reductions are measured by area before and after each phase, with functionality, performance, and release behavior protected by tests.
- New code cannot reintroduce the old duplication patterns because lint, scorecard, tests, or generated-drift checks reject them.

## Cross-Cutting Program Phases

These phases apply across all findings. Each finding below uses a local version of the same lifecycle.

### Phase 0: Measurement And Contract Baselines

Tasks:

- Add a tracked measurement script that reports tracked file counts, source LOC by area, duplicate shader status, IPC/event contract counts, test mock counts, and generated artifact locations.
- Snapshot current public behavior before replacing hand-written plumbing: preload exposure names, IPC channels and response shapes, EventBus channel values, settings defaults, device capabilities, GPU pipeline outputs, Playwright selectors, and release artifacts.
- Record high-risk current drift as explicit contract tests before centralization. Resolved examples include the former transcode status declaration mismatch, settings `webm` default versus transcode `mp4` default, and the former E2E `deviceAPI.onConnected` naming mismatch.

Success criteria:

- `npm run lint`, `npm run typecheck`, `npm run test:run`, and the new measurement command are green before migration work starts.
- Current behavior snapshots exist for every public surface being refactored.
- The measurement report distinguishes tracked source reduction from ignored local artifact cleanup.

Risks and mitigations:

- Risk: measuring the wrong thing rewards deletion of generated or ignored outputs instead of durable source reduction.
  Mitigation: report tracked source, ignored artifacts, generated source, and vendored/package output as separate buckets.
- Risk: public API drift gets introduced while removing boilerplate.
  Mitigation: add contract tests before deleting old code and keep the post-migration contract singular.

Expected outcome:

- Every later phase has a factual baseline and a regression gate.

### Phase 1: Foundational Utilities And Report-Only Manifests

Tasks:

- Add shared generator utilities, schema helpers, flattening helpers, and a `DisposableBag`/lifecycle primitive.
- Introduce manifests in report-only or generated-test-only mode first: IPC, events, devices, settings, render passes, architecture, and platforms.
- Generate declarations, tests, docs fragments, and drift reports before generated runtime code replaces existing implementations.

Success criteria:

- Generated outputs match the current hand-maintained surfaces.
- Drift checks fail on intentional mismatch and pass on the current repository after intentional differences are resolved or explicitly represented in the manifest.
- No runtime behavior changes are shipped in this phase except low-risk additive utilities.

Risks and mitigations:

- Risk: manifest work adds a second system instead of reducing code.
  Mitigation: every manifest phase has a named deletion target and cannot graduate without deleting or freezing the old source.
- Risk: schema library churn creates long-lived duplication with Joi.
  Mitigation: choose one active runtime schema system per contract family and write retirement tasks for the other.

Expected outcome:

- The repo can prove that generated contracts describe current behavior before it depends on them.

### Phase 2: Generated Runtime Adoption

Tasks:

- Move low-risk domains to generated runtime adapters first.
- Cut over migrated public APIs to their current contract while swapping internals.
- Add parity tests for each domain before deleting hand-written code.

Success criteria:

- Generated code owns channel constants, payload maps, bridge methods, handler descriptors, fixtures, docs fragments, or config fragments for migrated domains.
- Old hand-maintained files are deleted or reduced to generated imports.
- Runtime tests verify both behavior and disposal semantics.

Risks and mitigations:

- Risk: generated runtime code becomes opaque and difficult to debug.
  Mitigation: generate small, readable files with source comments pointing back to the manifest and add manifest-level tests.
- Risk: incremental migration leaves split ownership.
  Mitigation: enforce one source of truth per migrated namespace.

Expected outcome:

- High-duplication runtime plumbing shrinks while migrated contracts remain singular and enforceable.

### Phase 3: High-Impact Consolidation

Tasks:

- Consolidate GPU rendering ownership into `@prismgb/gpu`.
- Replace custom renderer DI and registry patterns with Awilix or generated metadata.
- Introduce presentation lifecycle/controller primitives and migrate duplicated UI patterns.
- Split test projects and centralize mocks/fixtures.
- Add a dev-boot smoke check after renderer DI, preload, Vite, or test-topology changes: start `npm run dev`, wait for `Renderer application started successfully`, and fail on `[Renderer ERROR]`, Awilix missing-token resolution errors, or Vite JSON import-attribute warnings.

Success criteria:

- Duplicate shader trees and renderer-private GPU engines are deleted after parity tests.
- Renderer DI has one container model and explicit factory/class semantics.
- Presentation components share lifecycle/disposal primitives.
- Test setup becomes explicit and project-scoped instead of globally eager.
- The renderer boots in the dev app without missing DI tokens, renderer initialization failures, or contract-import build warnings.

Risks and mitigations:

- Risk: high-impact consolidation regresses core streaming/rendering.
  Mitigation: keep worker protocol stable first, compare frame/capture/stats behavior, and add browser/E2E coverage for streaming paths.
- Risk: UI migration creates churn without net reduction.
  Mitigation: migrate repetitive high-churn components first and measure deleted lifecycle/event wiring.

Expected outcome:

- The largest source-reduction targets are converted from duplicated implementations to one owned implementation per concern.

### Phase 4: Enforcement And Ratchets

Tasks:

- Add lint/scorecard rules for no new hand-maintained contracts, no duplicate shader files, no new JS plus `.d.ts` twins, no inline test mocks for canonical dependencies, and no new aliases/platform entries outside manifests.
- Ratchet type strictness and coverage by directory/project.
- Move generated artifact outputs to ignored `artifacts/**` locations and add cleanup commands.
- Promote the dev-boot smoke check into CI or a local release-preflight command that starts `npm run dev`, captures startup output, asserts renderer initialization success, and tears down Vite/Electron reliably.

Success criteria:

- CI rejects the duplication patterns this plan removes.
- Type and coverage debt decline monotonically by area.
- Generated artifacts are reproducible and not mixed into source directories unless intentionally tracked.
- The local/CI preflight catches renderer startup regressions and dev-build contract warnings before a PR can be marked ready.

Risks and mitigations:

- Risk: strict rules block necessary work before migration is complete.
  Mitigation: introduce allowlists with owners, expiration dates, and per-directory ratchets.
- Risk: generated config drift blocks releases late.
  Mitigation: run generation drift checks in PR CI before packaging.

Expected outcome:

- The codebase cannot silently grow back into the current duplicated shape.

## Finding Plans

## 1. Generate The IPC, Preload, And Event Contracts

Grounded repo truth:

- IPC data is split across `src/shared/ipc/channels.json`, `src/shared/ipc/preload-api.contract.ts`, `src/types/preload-api.d.ts`, `src/preload/index.js`, `src/preload/apis/*.preload-api.js`, `src/preload/listener-registry.js`, `src/preload/validators.js`, and `src/main/ipc/**`.
- The current preload contract test in `tests/unit/preload/preload-api.contract.test.js` regex-scans only `src/preload/index.js` for exposure names and direct `IPC_CHANNELS.X.Y` references.
- The full-cutover audit resolved the former transcode status declaration mismatch; preload types and implementation now expose status without a job id argument.

Long-term target:

- A single IPC contract manifest defines namespaces, exposed API names, channels, direction, request/response schemas, validation, security policy, handler dependencies, and event forwarding behavior.
- Generated outputs own channel JSON, TS payload types, preload bridge factories, global declarations, validators, handler descriptors, mocks, and contract tests.

Reasoning:

- IPC is the highest-leverage reduction because the same contract is currently represented in runtime JSON, wrappers, TS declarations, preload code, main handlers, validators, globals, and tests. Making the contract authoritative first reduces future drift and gives every later IPC/preload deletion a factual parity gate.

Phases and tasks:

- Phase 0: Snapshot current IPC shape.
  - Generate a channel inventory from `channels.json`.
  - Record exposed preload APIs from `src/preload/index.js` and delegated preload APIs from `src/preload/apis`.
  - Add contract tests for each invoke method's argument forwarding and response shape, including `transcodeAPI.getStatus`.
  - Document current validation behavior in `src/preload/validators.js` before replacing it.
- Phase 1: Add manifest in report-only mode.
  - Create `contracts/ipc.contract.ts` or `src/shared/ipc/ipc.contract.ts`.
  - Choose a schema system. Use existing Joi for lowest dependency churn, or adopt Zod/TypeBox only if the migration immediately uses inferred types and retires duplicate Joi layers.
  - Generate declarations and tests first; compare generated channels and exposed API maps to current files.
- Phase 2: Migrate low-risk namespaces.
  - Move `metricsAPI`, `gpuAPI`, and `loginItemAPI` to generated invoke wrappers.
  - Keep `contextBridge.exposeInMainWorld` names stable.
  - Generate factory-level tests that mock `ipcRenderer` and assert channel and argument behavior.
- Phase 3: Migrate subscription-heavy namespaces.
  - Move `deviceAPI`, `windowAPI`, `updateAPI`, and `transcodeAPI` after the subscription factory in finding 2 is stable.
  - Generate listener cleanup and validation.
  - Replace `src/preload/index.js` with generated exposure imports plus explicit security review entry points.
- Phase 4: Delete duplicate contracts.
  - Delete or reduce hand-maintained channel wrappers, preload global declarations, regex contract tests, and manual validator lists only after generated parity is green.
  - Add CI drift check: no channel or preload API exists outside the contract.
  - Add a runtime import-style check for generated JSON contracts so `channels.json` cannot be imported with mixed attributes across main/preload builds.

Success criteria:

- Every exposed preload method, channel, validator, type, and handler descriptor can be traced to one contract entry.
- The generated tests assert method names, argument forwarding, schemas, response shapes, and channel references across delegated preload API modules.
- Existing public preload API names remain stable unless a separately versioned replacement is approved.
- Dev builds do not emit Vite warnings about inconsistent JSON import attributes for the IPC contract.

Risks and mitigations:

- Risk: security policy gets diluted by generic code generation.
  Mitigation: make security policy required per contract entry and fail generation when file/system/URL access lacks explicit constraints.
- Risk: generated code masks subtle behavior differences.
  Mitigation: keep black-box preload tests and add namespace-specific parity tests before deleting hand-written paths.

Expected outcome:

- IPC/preload size shrinks by removing repeated channel names, validators, listener code, declaration twins, and regex tests. Future IPC additions become data changes plus generated code.

## 2. Replace Preload Listener Boilerplate With A Subscription Factory

Grounded repo truth:

- `src/preload/listener-registry.js` hard-codes listener sets such as `connected`, `updateProgress`, `transcodeCompleted`, and `enterFullscreen`.
- `src/preload/apis/device.preload-api.js`, `window.preload-api.js`, `update.preload-api.js`, and `transcode.preload-api.js` previously repeated callback validation, listener limit checks, `ipcRenderer.on`, unsubscribe closures, and cleanup before Phase 2 moved them onto the subscription factory.

Long-term target:

- A generic subscription factory is the authoritative source for per-channel subscriptions from descriptors and uses a `Map<string, Set<listener>>` keyed by channel/API id.

Reasoning:

- The current listener code is mechanically repeated but security-sensitive because it controls renderer-to-main event exposure. A narrow factory is the long-term path because it removes repetition while preserving explicit channel-level validation and listener ownership.

Phases and tasks:

- Phase 0: Characterize current listener behavior.
  - Add tests for invalid callbacks, listener limit handling, event payload mapping, unsubscribe behavior, and preload-owned internal disposal for each API namespace.
  - Capture current warning messages only where tests depend on them.
- Phase 1: Add `createSubscription()`.
  - Implement a small factory that accepts API name, channel, callback validator, optional payload validator, event mapper, registry map, and listener limit.
  - Keep existing API modules but route one low-risk subscription through the factory.
- Phase 2: Convert all preload subscriptions.
  - Replace repeated blocks in device, window, update, and transcode preload modules.
  - Replace hard-coded registry fields with map-backed entries.
- Phase 3: Integrate with generated IPC contract.
  - Generate subscription descriptors from the IPC manifest.
  - Keep disposal internal to preload-owned listener registrations.
- Phase 4: Enforce no new manual subscriptions.
  - Add a contract or lint test that rejects raw `ipcRenderer.on` usage in preload APIs outside the factory.

Success criteria:

- All preload subscription APIs return unsubscribe closures and enforce the same listener cap.
- Public API names and callback payloads match the current manifest.
- `listener-registry.js` is deleted or reduced to a generic exported helper.

Risks and mitigations:

- Risk: `removeAllListeners`-style cleanup removes listeners owned by future consumers.
  Mitigation: track exact wrapped listeners and remove only those listeners.
- Risk: event payload validation changes behavior.
  Mitigation: migrate validators entry by entry and run namespace-specific tests.

Expected outcome:

- Preload listener code becomes descriptor-driven and ready for IPC contract generation.

## 3. Convert Main IPC Handlers To Declarative Descriptors

Grounded repo truth:

- `src/main/ipc/ipc-handler.registry.ts` previously called one registration function per handler module; Phase 2 now imports descriptor arrays directly.
- Handler modules repeat local service interfaces, argument shaping, try/catch, logging, and success/error mapping.
- Current behavior is not uniform: some handlers return explicit success/error objects while others return direct values.

Long-term target:

- Main IPC handlers are arrays of typed descriptors consumed by one registry that owns `ipcMain.handle`, duplicate-channel detection, schema validation, logging, disposal, and error mapping.

Reasoning:

- Handler registration is currently centralized only at the call-site level; behavior remains scattered across modules. Descriptors keep domain behavior local while moving registration, validation, and cleanup into one enforceable path.

Phases and tasks:

- Phase 0: Freeze contracts.
  - Add tests for every registered invoke channel and current response shape.
  - Verify duplicate registration behavior and handler disposal.
  - Record which handlers intentionally return bare values versus `{ success, error }` envelopes.
- Phase 1: Introduce descriptor API.
  - Add `defineIpcHandlers()` with explicit dependency tokens, channel, argument schema, invoke function, and success/error mapping.
  - Convert one low-risk handler module, such as performance or login item, while keeping registry behavior unchanged.
- Phase 2: Move handler modules to descriptors.
  - Convert device, shell, update, window, transcode, GPU, and login item handlers.
  - Centralize duplicate-channel detection in `IpcHandlerRegistry`.
  - Make error mapping explicit per descriptor so public response shape is preserved.
- Phase 3: Generate descriptors from IPC contract where suitable.
  - Generate channel/schema/dependency metadata from the contract.
  - Keep behavior callbacks hand-written where domain logic is not purely declarative.
- Phase 4: Delete old registration plumbing.
  - Remove `register*Handlers` function boilerplate when descriptor arrays are authoritative.
  - Add CI check that all IPC contract invoke entries have a main handler descriptor or a documented renderer-only reason.

Success criteria:

- Every IPC invoke channel is registered exactly once and removed on dispose.
- Compatibility tests prove response shapes match the baseline.
- New IPC handlers require a descriptor/contract entry and cannot bypass central validation.

Risks and mitigations:

- Risk: central error mapping changes public API behavior.
  Mitigation: preserve per-handler mapping in descriptors and only unify after a versioned API decision.
- Risk: dependency typing becomes too broad.
  Mitigation: generate dependency-token types from the container map and reject unknown tokens.

Expected outcome:

- Main IPC code shrinks while behavior becomes more consistent, inspectable, and enforceable.

## 4. Unify Event Catalogs, Payload Maps, And EventBus Implementations

Grounded repo truth:

- Shared renderer channels live in `src/shared/events/event-channels.ts`; payloads and runtime channel lists live separately in `src/shared/events/event-payloads.ts`.
- Renderer imports the shared event contract directly; main has manifest-derived scoped channels in `src/main/infrastructure/events/event-channels.config.ts`.
- Renderer EventBus uses `eventemitter3`; main EventBus wraps Node `EventEmitter`.
- Main and renderer can reuse string values with different payload shapes, such as `update:state-changed`.

Long-term target:

- One scoped event manifest defines renderer, main, cross-process, forwarded, and UI command events with payload schemas.
- Event constants, payload maps, runtime lists, bridge descriptors, and contract tests are generated.
- `eventemitter3` is the shared EventBus implementation unless a measured main-process reason prevents it.

Reasoning:

- Events already have better type coverage than preload, but they still duplicate names, payloads, and bus implementations. Scope-aware generation is necessary because equal string values can carry different payloads in main and renderer.

Phases and tasks:

- Phase 0: Inventory event usage.
  - Generate a map of published/subscribed event names in main and renderer.
  - Identify reused string values with different payloads and classify them by scope.
  - Add tests for EventBus error handling and unsubscribe behavior.
- Phase 1: Add scoped event manifest.
  - Define event identity as `{ scope, domain, name }`, not only string value.
  - Generate constants matching current values.
  - Generate payload maps from schemas or typed definitions.
- Phase 2: Replace duplicated event config.
  - Update renderer imports to consume shared generated scoped constants directly.
  - Keep main scoped event constants generated from the manifest.
- Phase 3: Standardize EventBus implementation.
  - Move shared EventBus behavior into a shared TS module using `eventemitter3`.
  - Preserve renderer handler-error emission behavior and decide whether main should also emit handler-error events.
- Phase 4: Generate bridges and tests.
  - Generate main-to-renderer forwarding descriptors for update, transcode, and device paths.
  - Replace direct send gaps with `RendererEventBridge` descriptors.
  - Delete drift-prone hand-authored event contract helpers.

Success criteria:

- Every event channel has exactly one scoped manifest entry and explicit payload schema or `void`.
- Runtime constants and payload maps are generated from the same source.
- Main and renderer event buses share behavior where possible and tests cover scope-specific payloads.

Risks and mitigations:

- Risk: string reuse causes accidental payload unification.
  Mitigation: require scope in manifest keys and generate types by scope.
- Risk: eventemitter migration changes ordering or error semantics.
  Mitigation: test ordering, unsubscribe, handler exceptions, and recursive error behavior before swapping main.

Expected outcome:

- Event drift is eliminated and bridge code becomes generated descriptor plumbing instead of repeated service-specific forwarding.

## 5. Make `@prismgb/gpu` The Only Rendering Backend

Grounded repo truth:

- Renderer worker engines exist in `src/renderer/infrastructure/rendering/workers/webgpu-renderer.engine.ts` and `webgl2-renderer.engine.ts`.
- Renderer Canvas2D fallback exists in `src/renderer/infrastructure/services/streaming/canvas-renderer.ts` and `canvas2d-renderer.adapter.ts`.
- `@prismgb/gpu` already contains WebGPU, WebGL2, and Canvas2D pipelines.
- WebGPU and WebGL2 shader directories are duplicated exactly between renderer and the GPU package, accounting for 1,782 total shader lines.

Long-term target:

- `@prismgb/gpu` is the single authoritative owner for all rendering backends, shader imports, shader pass definitions, worker-safe pipeline creation, capture, stats, resize, and disposal.
- Renderer worker code becomes only a protocol adapter and telemetry boundary.

Reasoning:

- Rendering has the largest verified duplication, including byte-identical shader trees and parallel backend logic. Consolidating ownership into the package preserves architecture boundaries while preventing the renderer from growing a second GPU toolkit.

Phases and tasks:

- Phase 0: Baseline rendering behavior.
  - Add tests or harnesses for pipeline selection, frame render, resize, stats, capture frame, fallback, and device-loss behavior.
  - Measure performance-sensitive paths before migration.
  - Snapshot worker protocol messages in `worker-protocol.config.ts`.
- Phase 1: Export package-owned shaders.
  - Export raw shader strings from `@prismgb/gpu`.
  - Make renderer worker import package shaders without changing worker protocol.
  - Add a duplicate shader check that fails if renderer shader copies diverge or reappear.
- Phase 2: Add worker-safe package API.
  - Expose `createWorkerPipeline({ canvas, api, nativeSize, outputSize, preset })`, `render`, `resize`, `captureFrame`, `getStats`, and `dispose`.
  - Fix any package APIs that narrow `OffscreenCanvas` to `HTMLCanvasElement`.
- Phase 3: Swap renderer internals.
  - Keep renderer worker protocol stable while using the GPU package pipeline internally.
  - Move Canvas2D fallback policy through the package pipeline factory.
  - Keep renderer telemetry in renderer services.
- Phase 4: Delete duplicate engines and shaders.
  - Remove renderer shader trees and renderer-private GPU utility classes after parity tests.
  - Make CI reject rendering backend implementations outside `@prismgb/gpu`.

Success criteria:

- No duplicate shader tree exists under `src/renderer/infrastructure/rendering/shaders`.
- Rendering behavior for WebGPU, WebGL2, and Canvas2D remains compatible.
- Worker protocol consumers do not change until a versioned protocol update is planned.

Risks and mitigations:

- Risk: OffscreenCanvas transfer behavior differs across platforms.
  Mitigation: add platform-specific smoke coverage and keep fallback paths until package worker API proves stable.
- Risk: performance regresses due to abstraction overhead.
  Mitigation: measure frame time, upload time, capture latency, and stats before and after each migration step.

Expected outcome:

- One rendering implementation per backend, package-owned shaders, and a much smaller renderer worker layer.

## 6. Data-Drive Shader Passes And Uniform Layouts

Grounded repo truth:

- WebGPU and WebGL2 pipelines repeat fixed pass setup for pixel upscale, unsharp mask, color elevation, and CRT/LCD.
- Worker protocol accepts package `PipelineUniforms`, but worker engines still import a separate partial `RenderUniforms` shape.

Long-term target:

- A shader pass manifest defines pass ids, shader module ids, enablement rules, sampler policy, uniform layouts, and pass ordering.
- WebGPU buffers, WebGL setters, render pass execution, and uniform upload arrays are generated from the same manifest.

Reasoning:

- Shader passes are fixed-format and implemented twice across WebGPU and WebGL2. A pass manifest gives both backends the same pipeline definition while still allowing backend-specific optimized execution.

Phases and tasks:

- Phase 0: Characterize current pipeline passes.
  - Document current pass order and enablement conditions in WebGPU and WebGL2.
  - Add tests for uniform builder outputs and pass enablement across presets.
- Phase 1: Add pass manifest.
  - Define a typed `render-passes.contract.ts` inside `@prismgb/gpu`.
  - Generate or derive uniform layout metadata for both APIs.
- Phase 2: Generate low-level helpers.
  - Generate WebGPU uniform buffer layouts and WebGL uniform setter maps.
  - Keep existing hand-written pass runners while comparing generated data.
- Phase 3: Replace pass execution.
  - Convert WebGPU and WebGL2 pipelines to iterate generated pass descriptors.
  - Remove worker-only `RenderUniforms` after all call sites use package uniform types.
- Phase 4: Enforce pass manifest ownership.
  - Add tests that every shader file has a pass or documented utility role.
  - Reject new hand-coded pass sequences outside the package.

Success criteria:

- Pass order, enablement, and uniform upload behavior come from one manifest.
- WebGPU and WebGL2 remain behaviorally equivalent where their APIs overlap.
- Preset growth does not require editing multiple backend-specific pass lists.

Risks and mitigations:

- Risk: generated pass execution hides backend-specific optimization.
  Mitigation: keep backend-specific hooks in descriptors and benchmark before deleting custom code.
- Risk: uniform layout mismatch causes visual defects.
  Mitigation: add golden or deterministic pixel tests for representative presets where feasible.

Expected outcome:

- Shader pipeline code becomes data-driven and easier to extend without duplicated backend edits.

## 7. Replace Renderer DI Boilerplate With Awilix Or Metadata Registration

Grounded repo truth:

- `src/renderer/application/di/register-orchestrators.ts` and `register-infrastructure.ts` repeat dependency names in function parameters, object construction, and dependency arrays.
- Renderer uses a custom `ServiceContainer`, while main already uses Awilix.
- The custom container treats every function as constructable, which blurs class and factory semantics.

Long-term target:

- Renderer uses one explicit DI model: preferably Awilix to match main, or generated metadata registration if browser constraints require a local boundary module.
- Registration metadata derives runtime registrations and container token types.

Reasoning:

- Renderer DI repeats dependency names in three places and uses a custom container despite Awilix already existing in main. A single metadata-driven model removes boilerplate and prevents token/type drift.

Phases and tasks:

- Phase 0: Baseline container behavior.
  - Add tests for duplicate registration, missing dependency errors, circular dependencies, factory versus class registration, disposal, and token map typing.
  - Add tests for class descriptors with explicit dependency lists so constructors that destructure optional fields do not accidentally resolve those optional field names as container tokens.
  - Inventory all renderer registration modules and dependency lists.
- Phase 1: Choose container strategy.
  - Prefer Awilix if browser bundle size and runtime behavior are acceptable.
  - If not, refactor the local container to explicit `asClass`, `asFunction`, and `asValue` semantics and generate registration from metadata.
- Phase 2: Introduce metadata registrations.
  - Define descriptors with token, lifecycle, constructor/factory, and deps.
  - Generate `RendererContainerMap` from descriptors.
  - Convert infrastructure registrations first, then orchestrators.
  - Add a renderer-container regression that resolves `uiEffects` without a container-level `elements` token and keeps DOM element assignment owned by `UIController`.
- Phase 3: Delete redundant registration code.
  - Remove repeated function parameter/object/dependency array patterns.
  - Keep bootstrap module boundaries, but make them import descriptor arrays.
- Phase 4: Enforce generated registration ownership.
  - Add lint/scorecard rule that new renderer services require metadata registration.
  - Add the dev-boot smoke check to the renderer DI gate so missing-token errors are caught in the real Vite/Electron runtime, not only in unit tests.

Success criteria:

- Renderer has one container implementation and explicit factory/class semantics.
- Registration descriptors are the source of runtime registration and token typing.
- Existing tests pass and container error messages remain useful.
- The dev app boots through renderer initialization without Awilix resolution errors such as `uiEffects -> elements`.

Risks and mitigations:

- Risk: adopting Awilix increases bundle or changes lifecycle semantics.
  Mitigation: prototype with bundle measurement and keep a narrow migration boundary.
- Risk: generated registration obscures dependency cycles.
  Mitigation: add descriptor-level cycle detection in tests and generation.

Expected outcome:

- Renderer DI shrinks significantly and future service additions stop multiplying boilerplate.

## 8. Promote `BaseService` Into A Real Lifecycle Base

Grounded repo truth:

- `src/shared/base/service.base.js` validates dependencies and creates a logger only.
- `BaseOrchestrator` tracks EventBus subscriptions, but services and presentation effects manage cleanup arrays, timers, RAF ids, observers, and listeners independently.
- Examples include renderer update/transcode services, performance services, streaming services, `SettingsDisplayModeOrchestrator` visibility listener, and main `TranscodeService` `before-quit` listener registration.
- Renderer container `dispose()` does not await async service cleanup, while `StreamingService` has async cleanup.

Long-term target:

- `BaseService` owns a typed `DisposableBag` for event subscriptions, DOM/listener cleanup, timers, RAF, observers, and async disposal.
- Containers await `dispose(): void | Promise<void>`.

Reasoning:

- Larger manifest/codegen migrations will create more generated subscriptions and lifecycle hooks. A real service lifecycle base must land first so later deletions do not trade code size for leaks or shutdown races.

Phases and tasks:

- Phase 0: Inventory cleanup patterns.
  - Generate a report of `setTimeout`, `setInterval`, `requestAnimationFrame`, `ResizeObserver`, `MutationObserver`, `addEventListener`, and custom cleanup arrays.
  - Add tests for async disposal and idempotent cleanup.
- Phase 1: Add `DisposableBag`.
  - Implement `add`, `addEvent`, `addTimeout`, `addInterval`, `addAnimationFrame`, `addObserver`, `clear`, and async-aware clear support.
  - Use `AbortController` where practical.
- Phase 2: Extend `BaseService`.
  - Add `this.disposables`, `listen`, `subscribe`, `timeout`, `interval`, `animationFrame`, and template `dispose`.
  - Keep dependency validation behavior compatible.
- Phase 3: Migrate services by risk.
  - Start with update/transcode renderer services and performance timers.
  - Migrate streaming and GPU services after tests cover cleanup races.
  - Fix `SettingsDisplayModeOrchestrator` visibility listener and main `TranscodeService` `before-quit` removal.
- Phase 4: Update containers.
  - Make renderer and main cleanup await async disposals.
  - Add lint/test checks for untracked listeners in services.

Success criteria:

- Services do not own ad hoc cleanup arrays where `DisposableBag` can own them.
- Async cleanup is awaited by containers.
- Leak-prone listeners and timers have explicit tests.

Risks and mitigations:

- Risk: central disposal changes cleanup ordering.
  Mitigation: preserve ordering in `DisposableBag` and migrate high-risk streaming cleanup last.
- Risk: async disposal introduces shutdown delays.
  Mitigation: add timeouts/logging around disposal phases.

Expected outcome:

- Lifecycle code becomes consistent, leak-resistant, and reusable by later UI and bridge migrations.

## 9. Generate Device Profiles, Adapter Metadata, Mocks, And Docs From A Device Manifest

Grounded repo truth:

- Built-in device identity is in `src/shared/features/devices/device.registry.js`.
- Chromatic constants are in `src/shared/features/devices/profiles/chromatic/device-chromatic.config.js`.
- Renderer adapters, CSS, tests, and E2E helpers still repeat native resolution, labels, and capability assumptions.
- `tests/e2e/helpers/ipc-mock.js` now derives Chromatic USB IDs from the shared E2E Chromatic specs.

Long-term target:

- One typed device manifest defines device identity, USB IDs, labels, display geometry, media constraints, rendering policy, capture policy, capabilities, CSS variables, fixtures, E2E serialized data, and docs fragments.

Reasoning:

- Device metadata is product-critical and repeated across runtime, CSS, tests, and docs. A manifest is the durable way to support future devices without copying Chromatic-specific constants across the repo.

Phases and tasks:

- Phase 0: Inventory device metadata.
  - Collect all current Chromatic metadata from shared config, registry, main profile, renderer adapter, CSS, tests, E2E mocks, and docs.
  - Add drift tests for VID/PID, native resolution, and exposed preload device event names.
- Phase 1: Add device manifest.
  - Create a typed manifest with the existing Chromatic values.
  - Generate read-only reports comparing generated values to current files.
- Phase 2: Generate test fixtures and docs.
  - Generate unit fixtures, Playwright serialized fixture data, and feature-map device tables.
  - Replace E2E data first when it drifts from production.
- Phase 3: Generate runtime metadata.
  - Generate `DeviceRegistry` entries, main profile factory data, renderer adapter metadata, media constraints, and CSS custom properties.
  - Keep hand-written behavior in adapters and profiles.
- Phase 4: Enforce manifest ownership.
  - Add rule that new device metadata cannot be introduced outside the manifest.

Success criteria:

- Chromatic VID/PID, native resolution, label patterns, and capability data have one manifest source.
- Unit and E2E mocks are generated or imported from generated serialized fixtures.
- CSS aspect ratio uses generated custom properties instead of hard-coded `160 / 144`.

Risks and mitigations:

- Risk: browser-evaluated Playwright helpers cannot import Node modules.
  Mitigation: generate serializable JSON fixtures and pass them into `page.evaluate`.
- Risk: runtime profile behavior becomes over-generated.
  Mitigation: generate metadata and factories, not behavior-heavy adapter logic.

Expected outcome:

- Adding another supported device becomes manifest work plus focused behavior code, not multi-file copy/paste.

## 10. Convert Settings To A Definition Map

Grounded repo truth:

- `SettingsService` repeats `getX`, `setX`, storage key, default, validation, logging, and event publishing for each setting.
- `loadAllPreferences()` returns only a subset of defaults.
- `SettingsDefinitions` owns recording-format allowed values and keeps the default explicit.
- Settings default recording format is `webm`, while `TRANSCODE_CONFIG.defaultFormat` is `mp4`.

Long-term target:

- One authoritative settings definition map owns key, type, default, parser, validator, allowed values, event, protected-key policy, and UI option metadata.

Reasoning:

- Settings growth currently requires synchronized service, storage, event, UI, and test edits. Definitions move setting policy into one data surface and remove setting-specific service method repetition.

Phases and tasks:

- Phase 0: Freeze settings behavior.
  - Add tests for each getter/setter, invalid values, clamping, event emissions, protected keys, and `loadAllPreferences()` shape.
  - Explicitly test that recording format defaults to `webm`.
- Phase 1: Add definitions.
  - Create `SettingsDefinitions` using existing storage keys and defaults.
  - Import allowed recording formats from `TRANSCODE_CONFIG.formats` without changing `webm` default.
- Phase 2: Generate generic accessors.
  - Add `getSetting(name)` and `setSetting(name, value)` plus typed generic accessors.
  - Remove setting-specific getters/setters from production call sites and tests.
- Phase 3: Generate UI/storage/test surfaces.
  - Generate settings UI options, protected-key metadata, and table-driven settings tests.
  - Update `loadAllPreferences()` to derive from definitions or explicitly documented startup subset.
- Phase 4: Enforce definition ownership.
  - Reject new settings outside `SettingsDefinitions`.

Success criteria:

- Every setting has one definition for key, default, validation, and event behavior.
- Setting access goes through definition names, and migrated call sites no longer use setting-specific service methods.
- Recording format allowed values come from transcode config and default remains `webm` unless intentionally changed.

Risks and mitigations:

- Risk: settings migration changes persisted-value parsing.
  Mitigation: snapshot existing localStorage strings and test migrations.
- Risk: generic APIs make call sites less readable.
  Mitigation: keep typed generic helpers such as `getNumberSetting`, `getBooleanSetting`, and `getStringSetting`.

Expected outcome:

- Settings additions become definition entries instead of repeated service/UI/storage/test edits.

## 11. Convert Presets To Data And Bulk Registration

Grounded repo truth:

- Each preset module in `packages/prismgb-gpu/src/domain/presets/presets/*.preset.ts` repeats imports, object shape, and self-registration.
- `packages/prismgb-gpu/src/index.ts` imports preset modules to trigger registration.
- `PresetRegistry` defaults to `true-color`, while renderer defaults use `vibrant`.
- UI availability hides the `performance` preset separately.

Long-term target:

- A validated preset config array owns preset data, default selection policy, UI visibility, and current public exports.
- `PresetRegistry.registerMany(presets)` replaces side-effect imports.

Reasoning:

- Presets are already data-shaped but stored as self-registering modules. Moving them to validated data removes import side effects and makes default/UI policy explicit before shader combinations grow.

Phases and tasks:

- Phase 0: Baseline preset behavior.
  - Add tests for registered preset ids, default id, renderer default id, UI visibility, and uniform builder results.
- Phase 1: Add `presets.config.ts`.
  - Move preset objects into one typed array with metadata for default and UI visibility.
  - Keep named exports only when they remain the current package contract.
- Phase 2: Bulk registration.
  - Add `PresetRegistry.registerMany`.
  - Replace side-effect imports in package index with explicit registration from config.
- Phase 3: Align default policy.
  - Decide whether package and renderer defaults should remain intentionally different or be unified.
  - If different, encode that distinction in config instead of scattering constants.
- Phase 4: Generate UI lists.
  - Generate shader preset UI availability from preset config and delete hard-coded `performance` hiding.

Success criteria:

- Preset data is centralized and registration is explicit.
- Defaults and UI visibility are encoded once with documented policy.
- Existing public preset exports still work.

Risks and mitigations:

- Risk: removing side-effect imports changes tree-shaking or initialization.
  Mitigation: add tests that import package entry and verify registry contents.
- Risk: default unification changes user preference behavior.
  Mitigation: preserve current defaults until a product decision changes them.

Expected outcome:

- Preset additions require one data entry and no module import choreography.

## 12. Replace Presentation Lifecycle Boilerplate With A Component Base Or Lit

Grounded repo truth:

- Presentation components manually track subscriptions, listeners, initialized flags, refs, timers, observers, and disposal.
- `createDomListenerManager()` already exists but covers only part of lifecycle ownership.
- Presentation has 92 `.js`/`.ts`/`.css` files and multiple dynamic JS components.

Long-term target:

- Presentation components use an authoritative local `PresentationComponent` lifecycle base or migrate selected dynamic components to Lit if measured deletion justifies the dependency.
- Lifecycle ownership includes DOM listeners, EventBus/preload subscriptions, timers, RAF, `MutationObserver`, `ResizeObserver`, refs, and disposal.

Reasoning:

- Presentation has the largest source-file count inside `src` and repeated lifecycle code. A local base is the safest first move because it deletes repetition without forcing a framework migration before the repo proves the benefit.

Phases and tasks:

- Phase 0: Inventory presentation lifecycle patterns.
  - Count manual listeners, refs, initialized flags, timeouts, RAF ids, and observers by component.
  - Add disposal tests for notes panel, settings menu, shader controls, update section, and toolbar components.
- Phase 1: Add local base.
  - Implement `PresentationComponent` using `DisposableBag`.
  - Provide `listen`, `subscribe`, `timeout`, `animationFrame`, `observe`, `ref`, `init`, and `dispose`.
- Phase 2: Migrate high-duplication components.
  - Start with notes panel subcomponents and settings menu because they have repeated listener/ref/disposal code.
  - Migrate update section and shader controls next.
- Phase 3: Evaluate Lit.
  - Prototype Lit only for render-heavy dynamic surfaces, such as notes list, game autocomplete, update section, or shader preset list.
  - Compare deleted local code, bundle size, accessibility, and test complexity.
- Phase 4: Enforce lifecycle base.
  - Add lint/scorecard rule: no new presentation component without `PresentationComponent` or approved Lit component lifecycle.

Success criteria:

- Migrated components no longer maintain ad hoc listener arrays and initialized flags.
- Disposal tests pass and prove timers/listeners/observers are cleaned up.
- Lit is adopted only if it deletes enough imperative code to justify dependency cost.

Risks and mitigations:

- Risk: UI migration changes behavior and focus/keyboard interactions.
  Mitigation: add Testing Library and Playwright coverage around migrated components.
- Risk: base class becomes a broad abstraction with no reduction.
  Mitigation: measure deleted repeated lifecycle code per migration.

Expected outcome:

- Presentation code becomes lifecycle-consistent and ready for generated refs/actions.

## 13. Generate DOM Refs, Actions, And Template Bindings

Grounded repo truth:

- IDs live in templates; selector constants live in `src/renderer/presentation/config/dom-selectors.config.ts`; components separately define refs and dependency shapes.
- `createDomBindings()` documents `Document | Element`, but `bindById()` uses `getElementById()`, a `Document` API.
- `register-ui.ts` manually wires component IDs, stages, constructors, and element dependency slices.

Long-term target:

- Templates use `data-ref` and `data-action`; refs, actions, selector maps, UI component definitions, and element dependency slices are generated from template metadata.
- DOM-originated actions publish EventBus events or invoke explicit command descriptors.

Reasoning:

- Template IDs, selector maps, component registration, and controller wiring describe the same UI graph from different angles. Generating refs/actions from template metadata makes the template the inspectable source of truth while preserving existing DOM IDs during migration.

Phases and tasks:

- Phase 0: Baseline template and selector usage.
  - Inventory template ids, selector constants, `createDomBindings()` call sites, UI component registry definitions, and action/listener bindings.
  - Add tests for current binding root behavior.
- Phase 1: Add template metadata convention.
  - Introduce `data-ref` and `data-action` in one low-risk template while keeping IDs stable.
  - Add parser/generator that outputs typed refs and action descriptors.
- Phase 2: Generate refs.
  - Generate ref accessors and selector maps.
  - Fix root ambiguity by using `querySelector` for component roots or narrowing generated APIs to `Document`.
- Phase 3: Generate actions and component registration.
  - Centralize action descriptors that publish UI command events or call service/preload commands.
  - Generate `register-ui.ts` component definitions and element dependency slices.
- Phase 4: Delete manual selector/registration drift.
  - Remove redundant selector constants where generated refs cover them.
  - Add drift tests that template refs/actions match generated outputs.

Success criteria:

- Template refs, selector constants, component registration, and controller wiring derive from one metadata source.
- UI actions are descriptor-owned and testable.
- Existing DOM ids remain stable for CSS and E2E until explicitly migrated.

Risks and mitigations:

- Risk: generated selectors break CSS/E2E assumptions.
  Mitigation: keep IDs during migration and generate aliases before deletion.
- Risk: action descriptors become too generic for domain logic.
  Mitigation: use descriptors only for DOM-originated command wiring; keep domain behavior in services/orchestrators.

Expected outcome:

- UI wiring shrinks and template-to-component drift becomes mechanically detectable.

## 14. Promote Headless UI Controllers For Disclosure, Listbox, Combobox, And Auto-Hide

Grounded repo truth:

- `ListboxDropdownController` exists, but notes filter and game autocomplete still implement related menu/listbox behavior by hand.
- Cursor, toolbar, and fullscreen controls repeat enabled/listener/show-hide/pause-condition behavior across `UIEffects`, cursor auto-hide, toolbar auto-hide, and fullscreen controls.
- Notes panel placement hand-rolls anchor measurement and viewport clamping.

Long-term target:

- Headless controllers are the authoritative source for reusable listbox, combobox, disclosure, activity auto-hide, and positioning behavior. Floating UI or Web Awesome/Shoelace are considered only if they replace enough local code.

Reasoning:

- UI behaviors like listbox navigation and auto-hide are accessibility-sensitive and currently implemented in related but separate ways. Headless controllers centralize behavior without forcing visual or markup redesign.

Phases and tasks:

- Phase 0: Inventory UI behavior duplication.
  - Compare keyboard behavior, focus management, ARIA state, timer logic, pause conditions, and viewport collision logic across current components.
  - Add tests for notes filter, game autocomplete, toolbar auto-hide, cursor auto-hide, and fullscreen controls.
- Phase 1: Upgrade existing listbox.
  - Extend `ListboxDropdownController` to cover keyboard navigation, active option state, option rendering hooks, ARIA, and dynamic options.
- Phase 2: Add `ComboboxController` and `DisclosureController`.
  - Move game autocomplete and notes filter onto shared controllers.
  - Keep markup/classes compatible.
- Phase 3: Add `ActivityAutoHideController`.
  - Replace cursor, toolbar, and fullscreen auto-hide internals behind current UI boundaries.
  - Centralize pause conditions and timer/RAF behavior.
- Phase 4: Evaluate positioning library.
  - Prototype Floating UI for notes panel/dropdowns and compare deleted placement code.
  - Adopt only if accessibility and bundle impact are acceptable.

Success criteria:

- Repeated UI interaction logic is owned by headless controllers.
- Keyboard and ARIA behavior is covered by tests.
- Existing UI boundaries remain stable while internals consolidate.

Risks and mitigations:

- Risk: shared controllers force unrelated UI behaviors into one model.
  Mitigation: keep controllers narrow and composable.
- Risk: dependency adoption increases size.
  Mitigation: require a deletion and accessibility benefit before adopting Floating UI or component libraries.

Expected outcome:

- UI behavior code shrinks and accessibility-sensitive logic becomes centralized.

## 15. Consolidate CSS Into Semantic Tokens And Utilities

Grounded repo truth:

- Presentation CSS includes repeated feature-level shells for settings, notes, toolbar, shader panels, dropdowns, pills, gradient borders, scrollbar styles, and range controls.
- `src/renderer/presentation/styles/tokens.css` and utility/style files already exist.

Long-term target:

- Semantic tokens and utility classes are the authoritative source for repeated visual primitives. Feature CSS keeps only layout and feature-specific variants.

Reasoning:

- CSS reduction is safest when repeated primitives move to semantic tokens and utilities first. This preserves feature layout ownership while reducing copied visual shells that otherwise drift silently.

Phases and tasks:

- Phase 0: CSS duplication audit.
  - Use a CSS parser or stylelint-compatible script to report repeated colors, shadows, borders, popover shells, option rows, pills, scrollbars, range inputs, and gradient borders.
  - Snapshot key screens with Playwright before migration.
- Phase 1: Expand semantic tokens.
  - Add tokens for surfaces, overlays, borders, text states, focus rings, menu rows, tags, and range controls.
  - Keep existing token names stable where used.
- Phase 2: Add utilities.
  - Introduce `.ui-popover`, `.ui-option`, `.ui-field`, `.ui-pill`, `.ui-scrollbar-thin`, `.ui-gradient-border`, and `.range-control`.
  - Migrate one feature at a time.
- Phase 3: Delete duplicate feature CSS.
  - Remove repeated style blocks after visual snapshots pass.
  - Keep feature CSS for layout and unique variants.
- Phase 4: Enforce token usage.
  - Add CSS lint/report checks for raw repeated color/border/shadow values.

Success criteria:

- Repeated CSS primitives are reduced to tokens/utilities.
- Playwright screenshots show no visual regressions on migrated surfaces.
- New feature CSS uses semantic tokens for shared primitives.

Risks and mitigations:

- Risk: utility classes make markup noisy.
  Mitigation: use utilities for repeated primitives and keep component classes for semantic layout.
- Risk: visual regressions are subtle.
  Mitigation: use screenshot comparisons around settings, notes, toolbar, and streaming surfaces.

Expected outcome:

- CSS size and drift decline while the visual system becomes easier to maintain.

## 16. Replace Icon Registry Maintenance With `import.meta.glob`

Grounded repo truth:

- `src/renderer/presentation/icons/icon.utils.js` manually imports and maps SVG assets.
- Vite supports `import.meta.glob`, and the app already uses Vite.

Long-term target:

- Icons are discovered with `import.meta.glob` and exposed through stable `getIconSvg()` APIs. Unregistered/unused assets are reported or pruned.

Reasoning:

- Icon assets already live in a Vite app where glob imports can discover files. This is a low-risk reduction because it keeps the public utility stable while deleting a hand-maintained asset map.

Phases and tasks:

- Phase 0: Inventory icon assets.
  - List SVG assets and current registry keys.
  - Add tests for current `getIconSvg()` behavior and fallback/error behavior.
- Phase 1: Add generated/discovered registry.
  - Use `import.meta.glob('@renderer/assets/icons/*.svg', { query: '?raw', import: 'default', eager: true })`.
  - Normalize filenames to keys matching current API.
- Phase 2: Add drift report.
  - Report assets without callers and callers without assets.
  - Keep explicit aliases only where the current icon key is still the owned contract.
- Phase 3: Delete manual map.
  - Replace hand-maintained imports with glob output.
  - Add test that asset files and registry keys cannot drift silently.

Success criteria:

- Adding an SVG asset does not require editing a manual registry.
- Existing icon keys remain stable.
- Unused/unregistered assets are visible in CI or scorecard output.

Risks and mitigations:

- Risk: generated key normalization breaks existing callers.
  Mitigation: snapshot current keys and keep explicit aliases until callers migrate.
- Risk: test environment cannot process raw SVG imports.
  Mitigation: add Vitest transform/mock support or keep icon tests at utility level with injected module maps.

Expected outcome:

- Icon registry maintenance is eliminated and assets become self-reporting.

## 17. Collapse Renderer Bridge Services Into A Generic Preload Event Bridge

Grounded repo truth:

- Renderer update and transcode services subscribe to preload API events, map them to EventBus events, store state, and cleanup via local arrays.
- Device and window/fullscreen paths also subscribe to preload-backed events.
- Namespace-wide public preload teardown methods were removed because they can become unsafe if APIs gain multiple consumers.

Long-term target:

- A generic `createPreloadEventBridge()` maps preload subscription methods to EventBus events and optional state transitions, using per-subscription unsubscribe closures.

Reasoning:

- Renderer bridge services repeat subscription and cleanup mechanics but still contain domain-specific commands. Extracting only the event bridge layer gives a long-term reusable path without flattening service behavior into an over-generic abstraction.

Phases and tasks:

- Phase 0: Inventory bridge behavior.
  - List update, transcode, device, and window preload subscriptions and their EventBus mappings.
  - Add tests for cleanup, state reset, duplicate initialization, and event payload forwarding.
- Phase 1: Add bridge factory.
  - Implement descriptor-driven bridge creation with `api`, `subscriptions`, payload mapper, optional state updates, logger, and `DisposableBag`.
  - Migrate one update subscription first.
- Phase 2: Convert update/transcode services.
  - Extract event subscription boilerplate only.
  - Keep command methods domain-specific.
- Phase 3: Convert device/window bridge paths.
  - Use the same descriptor model where it reduces code without hiding domain behavior.
- Phase 4: Generate bridge descriptors.
  - Generate from IPC/event contracts once both manifests are authoritative.
  - Enforce that new preload event subscriptions are declared as bridge descriptors unless they have a documented domain-specific exception.

Success criteria:

- Renderer preload event bridges use unsubscribe closures, not namespace-wide listener removal.
- Domain command methods remain readable and explicit.
- Event mappings are traceable to contract descriptors.

Risks and mitigations:

- Risk: bridge factory becomes too broad and obscures state logic.
  Mitigation: extract only subscription/state reset boilerplate; keep complex state machines in services.
- Risk: multiple consumers expose listener ownership bugs.
  Mitigation: tests must prove one bridge dispose does not remove another bridge's listeners.

Expected outcome:

- Renderer bridge services shrink and event forwarding becomes consistent.

## 18. Consolidate Generic Registry And Factory Code

Grounded repo truth:

- `src/renderer/infrastructure/factories/streaming-adapter.factory.ts` and `streaming-renderer.factory.ts` manage maps, metadata, initialization, creation, unregister, and clear behavior.
- Similar lifecycle exists in `DeviceProfileRegistry` and `UIComponentRegistry`.

Long-term target:

- A generic typed registry/factory primitive owns common map/metadata lifecycle while domain-specific policies remain in thin wrappers.

Reasoning:

- The repo repeats registry mechanics without needing to merge domain policies. A typed primitive removes the map/metadata lifecycle once while preserving separate device, renderer, and UI ownership.

Phases and tasks:

- Phase 0: Compare registry semantics.
  - Document differences in registration validation, metadata lookup, creation arguments, unregister behavior, and initialization.
  - Add tests to lock current domain-specific behavior.
- Phase 1: Add `TypedRegistryFactory`.
  - Implement generic register/create/getMetadata/unregister/clear/list behavior.
  - Keep domain wrappers for streaming adapters, renderers, device profiles, and UI components.
- Phase 2: Migrate low-risk factories.
  - Move streaming renderer and streaming adapter factories to the primitive.
  - Preserve error messages and metadata behavior where tests depend on them.
- Phase 3: Evaluate UI/device registries.
  - Migrate only shared lifecycle, not domain-specific validation or initialization policy.
- Phase 4: Enforce registry primitive usage.
  - Add review/lint guidance for no new bespoke map/factory lifecycle without documented reason.

Success criteria:

- Shared registry lifecycle is implemented once.
- Domain wrappers preserve policy and type names.
- Tests prove create/unregister/clear behavior remains compatible.

Risks and mitigations:

- Risk: over-generalization hides important domain differences.
  Mitigation: keep policy outside the generic primitive and only share mechanical lifecycle.
- Risk: generic typing becomes complex.
  Mitigation: start with two factories and simplify before expanding.

Expected outcome:

- Factory/registry code shrinks without collapsing domain boundaries.

## 19. Migrate JS Plus `.d.ts` Twins To TypeScript

Grounded repo truth:

- Shared base/interface files include `.js` plus `.d.ts` twins, such as `src/shared/base/service.base.js` and `service.base.d.ts`, `device-adapter.interface.js` and `.d.ts`.
- `tsconfig.app.json` has `allowJs: true` but `checkJs: false`, and includes TS/declarations rather than checking runtime JS.
- Presentation still has many `.js` modules.

Long-term target:

- Shared base/interface modules and gradually presentation components are TypeScript. Declarations are emitted, not hand-authored twins.
- New runtime `.js` in `src` is disallowed unless generated or documented by build constraints.

Reasoning:

- JS plus `.d.ts` twins are a structural source of drift because runtime and type surfaces can change independently. TypeScript conversion removes the twin files and gives later manifest-generated APIs stronger compiler checks.

Phases and tasks:

- Phase 0: Inventory JS/declaration pairs.
  - Generate a list of `.js` files with matching `.d.ts`.
  - Add typecheck and import contract tests for shared base/interfaces.
- Phase 1: Convert shared base modules.
  - Convert `BaseService`, `BaseOrchestrator`, dependency validation, and safe/disposer utilities to `.ts`.
  - Update imports with the existing build-compatible extension strategy.
- Phase 2: Convert shared interfaces.
  - Replace runtime abstract interface JS files with TS interfaces or abstract classes only where runtime checks require them.
  - Delete hand-authored `.d.ts` twins after emitted declarations are sufficient.
- Phase 3: Convert presentation with generated refs/actions.
  - Convert components as they adopt `PresentationComponent` and typed refs/actions.
  - Avoid mass conversion without behavior tests.
- Phase 4: Ratchet policy.
  - Add scorecard/lint rule banning new runtime `.js` plus `.d.ts` twins.
  - Tighten `checkJs` or TS includes only where it produces useful gates during migration.

Success criteria:

- Shared base/interface twins are removed.
- Typecheck covers converted runtime code.
- New runtime JS requires an explicit exception.

Risks and mitigations:

- Risk: ESM import extension changes break Vite/Electron builds.
  Mitigation: convert in small batches and run `npm run build:vite` plus typecheck.
- Risk: presentation conversion churn is high.
  Mitigation: tie conversion to lifecycle/ref/action migrations.

Expected outcome:

- Type drift from hand-authored declaration twins disappears and strictness can ratchet by directory.

## 20. Hoist Official WebGPU Types

Grounded repo truth:

- `src/types/webgpu-worker.d.ts` manually declares many WebGPU interfaces.
- `packages/prismgb-gpu/package.json` already depends on `@webgpu/types`.
- Root `tsconfig.base.json` currently lists `node` and `vite/client` types, not `@webgpu/types`.

Long-term target:

- Official WebGPU types are the authoritative root/workspace type source, and app-local declarations keep only project-specific worker/offscreen augmentations.

Reasoning:

- Manual WebGPU declarations duplicate a maintained type package already used by `@prismgb/gpu`. Hoisting official types reduces local declarations while aligning app and package type behavior.

Phases and tasks:

- Phase 0: Baseline type behavior.
  - Run root and GPU package typecheck.
  - Identify manual declarations that overlap official WebGPU types.
- Phase 1: Hoist type dependency.
  - Add `@webgpu/types` to root dev dependencies or workspace type ownership.
  - Add it to root type environment carefully.
- Phase 2: Shrink local declarations.
  - Replace manual sampler/texture/usage/message shapes with official types.
  - Keep only worker/offscreen augmentations not covered by official DOM/WebGPU types.
- Phase 3: Validate across projects.
  - Run `npm run typecheck`, GPU package typecheck, and build.
  - Fix DOM/worker lib conflicts explicitly.
- Phase 4: Enforce no re-declaration.
  - Add a check that local WebGPU declaration file stays below a small project-augmentation threshold.

Success criteria:

- Root app and GPU package use official WebGPU types.
- `webgpu-worker.d.ts` contains only project-specific augmentations.
- Typecheck remains green.

Risks and mitigations:

- Risk: DOM and worker lib declarations conflict.
  Mitigation: introduce types in a branch with targeted `types` and `lib` settings, not global broad includes without tests.
- Risk: official types expose stricter errors.
  Mitigation: fix errors in the GPU package first, then renderer worker code.

Expected outcome:

- Manual WebGPU type debt shrinks and future browser API changes are handled by maintained types.

## 21. Generate Aliases And Architecture Rules From One Manifest

Grounded repo truth:

- Aliases repeat in `tsconfig.base.json`, `tsconfig.app.json`, `vite.config.js`, and `vitest.config.js`.
- `vite.config.js` also has environment-specific aliases, including renderer `url` polyfill and `@prismgb/gpu` source resolution.
- `tsconfig.app.json` resolves `@prismgb/gpu` to built declarations.
- `scripts/check-layer-boundaries.js` implements custom layer/import scanning and still recognizes retired `@core` imports according to findings.

Long-term target:

- One architecture manifest defines aliases, layer ownership, environment-specific resolution, forbidden imports, retired aliases, diagram metadata, and generated config fragments.

Reasoning:

- Alias and layer rules are repeated across build, test, typecheck, lint, scripts, and docs. A manifest is required because some outputs intentionally differ by environment and need explicit modeling rather than copy/paste.

Phases and tasks:

- Phase 0: Inventory current config.
  - Generate a diffable alias/layer report from TS, Vite, Vitest, ESLint, and custom layer script.
  - Add tests for retired aliases and current no-violation baseline.
- Phase 1: Add architecture manifest.
  - Model environment-specific outputs for base TS, app TS, Vite main/preload/renderer, Vitest, and ESLint.
  - Explicitly encode `@prismgb/gpu` source-versus-dist behavior and renderer `url` polyfill.
- Phase 2: Generate read-only config snapshots.
  - Generate JSON/JS fragments next to current configs and compare in tests.
  - Keep current config files hand-authored until generated output reaches parity.
- Phase 3: Adopt generated config.
  - Replace repeated alias maps and layer rules with generated imports/fragments.
  - Evaluate `vite-tsconfig-paths`, `eslint-plugin-boundaries`, or `dependency-cruiser` only if they delete local scanner code.
- Phase 4: Delete custom scanner pieces.
  - Retire regex scanner logic only after generated or library-backed enforcement covers current tests and diagrams.

Success criteria:

- Aliases and layer rules have one manifest source.
- Environment differences are explicit, not accidental duplication.
- Retired aliases fail fast.

Risks and mitigations:

- Risk: generated config breaks Vite/Electron build modes.
  Mitigation: generate and compare before replacing, then run `npm run build:vite`.
- Risk: dependency-cruiser or boundaries plugin does not match custom semantics.
  Mitigation: run both in parallel until parity is proven.

Expected outcome:

- Config drift declines and architecture docs/rules can be generated from the same layer model.

## 22. Consolidate Tooling Scripts Around Shared Script Utilities

Grounded repo truth:

- Scripts such as `type-debt-report.js`, `typecheck-app.js`, `architecture-scorecard.js`, `check-layer-boundaries.js`, and `scripts/ci/build-matrix.mjs` repeat CLI parsing, file walking, JSON read/write, path normalization, diagnostics, or report formatting.
- `architecture-scorecard.js` already reuses exports from `check-layer-boundaries.js`, so duplication is not uniform.

Long-term target:

- Shared `scripts/lib/*` utilities are the authoritative generated/tooling helper layer for CLI parsing, file walking, JSON reports, TS diagnostic parsing, architecture model access, and output formatting. Scripts focus on their domain logic.

Reasoning:

- Tooling scripts should be small domain commands, not each script's private utility framework. Extracting only proven shared helpers keeps the reduction pragmatic and protects CI output contracts.

Phases and tasks:

- Phase 0: Script duplication inventory.
  - Identify duplicated helpers and classify by exact reuse, near reuse, and script-specific logic.
  - Add smoke tests for each script's CLI behavior and output format.
- Phase 1: Add script utility library.
  - Create `scripts/lib/cli.js`, `files.js`, `json-report.js`, `ts-diagnostics.js`, and `architecture.js` as needed.
  - Keep APIs small and ESM-compatible.
- Phase 2: Migrate scripts incrementally.
  - Start with path/JSON/CLI helpers.
  - Move TypeScript diagnostic parsing only after tests prove output parity.
- Phase 3: Consider TypeScript/ts-morph.
  - Move scripts to TS or use `ts-morph` only where it deletes regex parsing and improves correctness.
- Phase 4: Enforce shared helpers.
  - Add script tests and review guidance for no new ad hoc CLI/file/report helpers.

Success criteria:

- Script outputs remain compatible.
- Common helpers live in `scripts/lib`.
- Tests cover CLI parsing and report generation.

Risks and mitigations:

- Risk: utility extraction changes CI output consumed by workflows.
  Mitigation: snapshot outputs and preserve fields/exit codes.
- Risk: script library becomes too broad.
  Mitigation: only extract helpers used by at least two scripts or needed by generated manifests.

Expected outcome:

- Tooling code becomes smaller, more testable, and ready for architecture/platform generation.

## 23. Make Type Debt A Ratchet, Not A Permanent Side System

Grounded repo truth:

- Strict base TS flags are enabled, but `tsconfig.app.json` relaxes `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, and `exactOptionalPropertyTypes`.
- `scripts/type-debt-allowlist.json` is large.
- Generated type-debt artifacts live under ignored `artifacts/`.
- `typecheck:app:allowlist` writes allowlists with a default expiry that the findings say is already past as of 2026-05-18 unless explicitly overridden.
- Current typecheck does not check runtime presentation JS.

Long-term target:

- Type debt has an authoritative ratchet by directory with expiring allowlist entries, out-of-date artifact checks, and policy forbidding new unchecked runtime JS.

Reasoning:

- The current allowlist and relaxed app TS options make type debt a side system that can persist indefinitely. Directory ratchets turn strictness into a migration path that can advance without blocking the whole repo at once.

Phases and tasks:

- Phase 0: Baseline type debt.
  - Run `npm run architecture:type-debt:report` and `npm run typecheck:app`.
  - Record debt by directory and option category.
- Phase 1: Fix allowlist expiry policy.
  - Require explicit future `--default-expires-on` or policy-configured expiry for writing allowlists.
  - Add tests for expired entries and write behavior.
- Phase 2: Ratchet by directory.
  - Start with `src/shared` and `packages/prismgb-gpu`, then `src/main`, renderer application, infrastructure, and presentation.
  - Enable stricter options per directory as conversion allows.
- Phase 3: Connect JS-to-TS migration.
  - Ban new JS plus `.d.ts` twins.
  - Track runtime JS count as a scorecard metric.
- Phase 4: CI enforcement.
  - Fail on new debt outside allowlist.
  - Fail on out-of-date generated debt artifacts only when the command explicitly expects checked artifacts.

Success criteria:

- Type debt decreases or remains flat with explicit expiring exceptions.
- No new unchecked runtime JS appears without documented exception.
- Stricter TS options are enabled by directory over time.

Risks and mitigations:

- Risk: ratchets block urgent fixes.
  Mitigation: allow expiring exceptions with owners and rationale.
- Risk: generated artifacts create noisy diffs.
  Mitigation: keep reports ignored by default and upload from CI.

Expected outcome:

- Type debt becomes an actively shrinking budget rather than permanent infrastructure.

## 24. Build Canonical Test Support Factories

Grounded repo truth:

- `tests/factories/event-bus.factory.js`, `tests/mocks/index.js`, and inline mocks repeat EventBus, logger, app state, UI controller, service, and preload API collaborators.
- `tests/factories/index.js#createMockDependencies()` uses CommonJS `require(...)` inside an ESM package.
- Preload/global `window.*API` mocks are duplicated across tests.

Long-term target:

- `tests/support/dependencies.ts` owns canonical factories for logger, logger factory, EventBus, AppState, services, and preload API mocks generated from the IPC contract.

Reasoning:

- Repeated mocks inflate tests and drift from production contracts. Canonical factories reduce test size while generated preload mocks keep tests aligned with the same IPC manifest used by runtime code.

Phases and tasks:

- Phase 0: Inventory mock duplication.
  - Search for inline logger/EventBus/appState/preload API mocks and classify high-volume patterns.
  - Add tests for current factory behavior before consolidation.
- Phase 1: Create canonical support module.
  - Add `createLogger`, `createLoggerFactory`, `createEventBus`, `createAppState`, and service dependency bundles using ESM imports.
  - Deprecate CommonJS `require` paths.
- Phase 2: Add generated preload mocks.
  - Generate `createIpcApiMock(manifest)` from IPC contract.
  - Include subscription methods that return unsubscribe closures.
- Phase 3: Migrate tests by directory.
  - Convert unit UI, renderer infrastructure, preload, and integration tests in batches.
  - Delete duplicate factories only after no consumers remain.
- Phase 4: Enforce canonical usage.
  - Add lint or review policy banning inline logger/EventBus/preload API mocks outside support factories.

Success criteria:

- Tests import canonical support factories instead of repeating common collaborators.
- No CommonJS `require` remains in ESM factory indexes.
- Preload mocks are generated from IPC contract.

Risks and mitigations:

- Risk: shared factories hide test-specific assumptions.
  Mitigation: keep factories configurable with explicit overrides and avoid implicit global state.
- Risk: mass test migration causes broad failures.
  Mitigation: migrate one test directory at a time.

Expected outcome:

- Test LOC declines and mock behavior becomes consistent with production contracts.

## 25. Split Vitest Into Projects

Grounded repo truth:

- Root `vitest.config.js` uses one `happy-dom` environment.
- Coverage excludes `src/main/**`, `src/preload/**`, update services, workers, GPU/canvas paths, audio, templates, declarations, and JSON.
- Coverage writes to `tests/coverage`.
- `packages/prismgb-gpu` has its own Vitest config, but root scripts do not run package tests.
- Performance benchmark tests are included by default root test patterns.

Long-term target:

- Vitest projects are the authoritative test topology for shared, renderer, main, preload, GPU, and performance tests with appropriate environments, mocks, coverage directories, and opt-in performance gates.

Reasoning:

- One happy-dom test project hides runtime differences and coverage gaps. Project-level topology lets each code area use the right environment and makes coverage exclusions explicit ratchets instead of permanent blind spots.

Phases and tasks:

- Phase 0: Baseline current test behavior.
  - Record current test file counts, run time, coverage output, and excluded paths.
  - Identify benchmark/performance files that should not run by default.
- Phase 1: Introduce projects without coverage tightening.
  - Add projects for shared/node, renderer/happy-dom, main/node, preload/node or happy-dom with Electron mocks, GPU package, and performance opt-in.
  - Keep thresholds equivalent to current effective coverage.
- Phase 2: Move coverage output.
  - Change reports directory to `artifacts/coverage` and keep it ignored/uploaded in CI.
  - Update `.gitignore` only if a new root `coverage/` path is chosen.
- Phase 3: Add main/preload report-only coverage.
  - Include main/preload with realistic mocks and report-only thresholds first.
  - Wire GPU package tests into root quality gate.
  - Add a local dev-runtime smoke check for Vite/Electron startup that asserts `Renderer application started successfully` and fails on renderer console errors.
- Phase 4: Ratchet thresholds.
  - Add per-project thresholds and exclude performance benchmarks from default runs.
  - Run the dev-runtime smoke check in CI or release preflight after project-split changes, especially when DI, preload, or Vite import behavior changes.

Success criteria:

- Default tests run the right environment per code area.
- GPU package tests are part of the root quality gate.
- Coverage output no longer pollutes `tests/coverage`.
- The test plan includes a real dev startup check, not only unit/project tests, so renderer boot failures are caught before review.

Risks and mitigations:

- Risk: project split lengthens CI.
  Mitigation: use project-level filters and keep performance tests opt-in.
- Risk: main/preload tests require difficult Electron mocks.
  Mitigation: start report-only and use explicit mock installers.

Expected outcome:

- Test configuration reflects actual runtime contexts and hidden coverage exclusions become visible ratchets.

## 26. Replace Global Test Mocks With Explicit Installers

Grounded repo truth:

- `tests/setup.js` eagerly stubs RAF, mediaDevices, MediaStream, tracks, video callbacks, and canvas.
- `tests/utils/lazy-mocks.js` reimplements lazy versions of similar mocks.
- `tests/utils/global-sandbox.js` reimplements restore logic.
- `ResizeObserver` is mocked inline in multiple tests according to findings.

Long-term target:

- Explicit mock installers are the authoritative source for browser API test doubles. Global setup is minimal, and tests install needed browser APIs explicitly with `installMediaMocks`, `installCanvasMocks`, `installVideoFrameMocks`, `installResizeObserverMock`, and related cleanup using `vi.stubGlobal`/`vi.unstubAllGlobals`.

Reasoning:

- Eager global mocks make tests pass through hidden dependencies and duplicate lazy/mock sandbox code elsewhere. Explicit installers make each test's browser API assumptions visible and cleanable.

Phases and tasks:

- Phase 0: Identify implicit mock dependencies.
  - Run tests with instrumentation to find files touching global media/canvas/video/RAF APIs.
  - Add a temporary report for globals used without explicit installer.
- Phase 1: Add installers.
  - Implement installers under `tests/support/mocks` with cleanup handles.
  - Keep current global setup while introducing installers.
- Phase 2: Migrate tests by project.
  - Convert renderer/canvas/media tests first.
  - Add `ResizeObserver` installer and remove inline duplicates.
- Phase 3: Shrink global setup.
  - Remove eager stubs after all dependent tests install explicitly.
  - Delete overlapping lazy/global sandbox helpers when unused.
- Phase 4: Enforce explicit mocks.
  - Add test setup guard or lint rule for forbidden direct global mutation outside installers.

Success criteria:

- Tests declare browser API mocks they need.
- Global setup is minimal and does not mask missing dependencies.
- Duplicate lazy/global sandbox implementations are deleted.

Risks and mitigations:

- Risk: tests fail because they depended on hidden globals.
  Mitigation: migrate directory by directory with usage reports.
- Risk: explicit installers add boilerplate.
  Mitigation: compose installers into project-level fixtures where a whole project needs the same baseline.

Expected outcome:

- Test state leakage declines and test setup code shrinks to reusable installers.

## 27. Standardize DOM Tests Around Testing Library

Grounded repo truth:

- Testing Library is installed and configured.
- Many component tests still manually append DOM, query selectors, and clear DOM.
- `tests/utils/render-component.js` exists but is not broadly used or re-exported; the unused DOM selector helper was deleted after confirming no consumers.

Long-term target:

- DOM tests use one `renderComponent()` helper, Testing Library `screen`/`within`, and `userEvent` or `fireEvent`. Unused helpers are deleted.

Reasoning:

- DOM tests should verify user-visible behavior with consistent setup. Standardizing on Testing Library reduces manual DOM plumbing and exposes accessibility gaps that selector-only tests can miss.

Phases and tasks:

- Phase 0: Inventory DOM test helpers.
  - Find manual `document.body.innerHTML`, `querySelector`, `appendChild`, and cleanup patterns.
  - Verify whether DOM helper modules have dynamic consumers before deletion.
- Phase 1: Standardize render helper.
  - Promote or replace `render-component.js` as `tests/support/render-component.ts`.
  - Re-export from canonical test support.
  - Add `@testing-library/jest-dom` only if matcher benefits justify dependency.
- Phase 2: Migrate high-value tests.
  - Convert settings, notes, toolbar, update section, and UI controller tests.
  - Use generated refs/actions as they become available.
- Phase 3: Delete unused helpers.
  - Remove unused DOM helpers and manual cleanup utilities once tests use Testing Library cleanup.
- Phase 4: Enforce query style.
  - Add review/lint guidance preferring role/text/label queries where available.

Success criteria:

- DOM tests consistently render through one helper.
- Unused helpers are deleted.
- Tests assert user-visible behavior rather than implementation selectors where practical.

Risks and mitigations:

- Risk: role-based queries expose accessibility gaps.
  Mitigation: treat those gaps as useful findings and fix markup during migration.
- Risk: selector-heavy tests are faster to write for internal components.
  Mitigation: allow `data-testid` or generated refs only where user-facing queries are not appropriate.

Expected outcome:

- DOM tests become clearer, less repetitive, and better aligned with UI behavior.

## 28. Generate Contract Tests Instead Of Regex-Scanning Source

Grounded repo truth:

- Preload contract tests parse `src/preload/index.js` with regex.
- Channel flattening logic is duplicated across contract tests.
- `tests/contracts/event-contracts.js` duplicates payload contracts using Joi but is not matched by current Vitest test file patterns.
- Preload channel-reference test misses delegated `src/preload/apis/*.preload-api.js` channel usage.

Long-term target:

- IPC/event manifests generate contract tests for every channel, preload exposure, request schema, response schema, handler descriptor, bridge mapping, and preload factory channel reference.

Reasoning:

- Regex-scanning source is brittle and currently misses delegated preload modules. Generated contract tests can cover the complete manifest while black-box runtime tests still verify actual module exports and registration.

Phases and tasks:

- Phase 0: Preserve current tests as baseline.
  - Keep regex tests temporarily but mark their gaps.
  - Add explicit tests for delegated preload API modules.
- Phase 1: Add shared contract test helpers.
  - Implement `flattenStringLeaves()` once.
  - Add helpers for manifest schema validation and generated output comparison.
- Phase 2: Generate IPC contract tests.
  - Assert every invoke channel has preload exposure where expected, handler descriptor, request schema, response schema, and mock generation.
  - Assert every subscription channel has cleanup and payload validation tests.
- Phase 3: Generate event contract tests.
  - Retire or generate the Joi event contract layer from the event manifest.
  - Ensure test files match Vitest include patterns.
- Phase 4: Delete regex scanning.
  - Keep one black-box preload exposure test only for bundling/`contextBridge` integration.

Success criteria:

- Contract tests are generated from authoritative manifests.
- Delegated preload modules and main handlers are covered.
- Regex source parsing is removed from correctness tests.

Risks and mitigations:

- Risk: generated tests only test generated code against itself.
  Mitigation: include integration tests that load generated runtime modules and verify actual exports/registrations.
- Risk: deleting regex test removes a bundling signal.
  Mitigation: retain a small black-box exposure smoke test.

Expected outcome:

- Contract tests become comprehensive and mechanically aligned with source-of-truth manifests.

## 29. Centralize Chromatic Test Mocks From The Production Device Manifest

Grounded repo truth:

- Unit mocks, fixtures, E2E helpers, and browser-injected mocks repeat Chromatic VID/PID, native resolution, labels, stream settings, and media constraints.
- `tests/e2e/helpers/ipc-mock.js` now uses production-aligned VID/PID values and current preload names.
- `mock-chromatic.helper.js` now restores the media-device listener patches it stores during setup.

Long-term target:

- The production device manifest generates unit fixtures, Playwright serialized data, mock Chromatic helper inputs, mock stream settings, and docs/test tables.

Reasoning:

- Test device data already drifts from production. Generating fixtures from the same manifest used by runtime metadata keeps E2E and unit tests realistic while still allowing overrides for negative cases.

Phases and tasks:

- Phase 0: Add drift tests.
  - Compare E2E/mock VID/PID, native resolution, labels, and preload event method names against production device config.
  - Add cleanup tests for media device listener restoration.
- Phase 1: Generate serialized test data.
  - Emit JSON-safe Chromatic specs from the device manifest for Playwright browser contexts.
  - Replace constants in `ipc-mock.js` and `mock-chromatic.helper.js`.
- Phase 2: Generate unit fixtures.
  - Replace `tests/mocks/MockDevice.js`, factories, and settings/media fixtures where values duplicate manifest data.
- Phase 3: Integrate with E2E fixtures.
  - Pass generated specs into `page.evaluate` helpers.
  - Enforce current preload event names in E2E helper baseline tests.
- Phase 4: Enforce fixture ownership.
  - Add CI drift check for device metadata in tests.

Success criteria:

- Test Chromatic specs match production manifest by generation, not by copy/paste.
- Copied USB IDs and obsolete device callback assumptions are removed or explicitly test-only with rationale.
- E2E helper cleanup restores patched methods.

Risks and mitigations:

- Risk: browser context cannot import generated TS.
  Mitigation: generate JSON and serialize into page functions.
- Risk: central test data makes tests less varied.
  Mitigation: support overrides in generated fixtures for negative cases.

Expected outcome:

- Device mocks become production-aligned and future device additions automatically produce test scaffolding.

## 30. Add Playwright Page Objects And Fixtures

Grounded repo truth:

- E2E specs repeat settings popup opening, toggle flows, selectors, waits, and assertions.
- `tests/e2e/fixtures/electron.fixture.js` already provides an Electron app/window fixture and launches `dist/main/index.js`.
- `npm run test:e2e` does not build first, so tests rely on existing `dist`.

Long-term target:

- Playwright page objects and domain fixtures own repeated E2E flows. The E2E gate verifies or builds fresh app output before launching Electron.

Reasoning:

- E2E tests are expensive and brittle when selectors, waits, and app-build assumptions are repeated per spec. Page objects and build preflight reduce repetition while making failures easier to diagnose.

Phases and tasks:

- Phase 0: Inventory repeated E2E flows.
  - List repeated selectors, waits, settings interactions, stream interactions, and device mock setup.
  - Add a preflight check for `dist/main/index.js` freshness.
- Phase 1: Add page objects.
  - Create `settings.page.ts`, `stream.page.ts`, and shared app shell helpers.
  - Keep selector names tied to generated refs/actions where possible.
- Phase 2: Add domain fixtures.
  - Extend Playwright with `settingsMenu`, `streamPage`, and `chromaticDevice` fixtures.
  - Generate table-driven tests from settings/device manifests.
- Phase 3: Make build deterministic.
  - Add a Playwright global setup or npm script that runs `npm run build:vite` or verifies a fresh build artifact.
  - Document when full packaged Electron builds are required versus Vite build output.
- Phase 4: Enforce page-object usage.
  - Add review/lint guidance for no repeated selector flows in specs.

Success criteria:

- E2E specs use page objects/fixtures for common workflows.
- `test:e2e` fails early if build output is missing or out of date.
- Generated settings/device data drives repetitive test cases.

Risks and mitigations:

- Risk: page objects hide assertions and reduce test readability.
  Mitigation: keep page objects as workflow helpers, with assertions visible in specs where meaningful.
- Risk: building before E2E slows local runs.
  Mitigation: provide explicit `test:e2e:built` and `test:e2e` scripts or freshness checks.

Expected outcome:

- E2E code is shorter, less brittle, and aligned with generated UI/device metadata.

## 31. Generate Architecture Docs And Feature Maps

Grounded repo truth:

- `docs/architecture-diagrams.md` and `docs/architecture-diagrams-onboarding.md` overlap.
- `docs/feature-map.md` is maintained manually today and should continue to be checked for path drift against settings and architecture manifests.

Long-term target:

- Architecture diagrams, dependency tables, layer maps, and feature path tables are generated from architecture/device/settings manifests or dependency-cruiser output between marked doc blocks.

Reasoning:

- Architecture docs duplicate source-path and dependency facts that already drift. Generating structured doc blocks preserves human narrative while making diagrams and path tables reproducible.

Phases and tasks:

- Phase 0: Identify generated versus narrative doc content.
  - Mark sections in architecture docs and feature maps that should remain hand-authored versus generated.
  - Add a docs drift check for known removed paths.
- Phase 1: Generate path tables.
  - Use architecture and feature manifests to generate path tables into docs between stable markers.
  - Keep narrative text hand-authored.
- Phase 2: Generate diagrams.
  - Evaluate dependency-cruiser for diagrams if it can replace local diagram maintenance.
  - Generate diagrams from architecture manifest or dependency graph.
- Phase 3: Integrate with CI.
  - Add docs generation drift check.
  - Upload diagrams or update tracked docs depending on project preference.
- Phase 4: Delete overlapping docs.
  - Consolidate onboarding and architecture diagrams where content is generated and duplicated.

Success criteria:

- Path tables and diagrams reflect current repo paths.
- Hand-authored narrative remains readable.
- CI catches drift in generated doc blocks.

Risks and mitigations:

- Risk: generated docs become noisy and less useful.
  Mitigation: generate compact tables/diagrams and keep explanation human-authored.
- Risk: dependency graphs are too broad.
  Mitigation: scope diagrams by layer/feature rather than dumping the whole graph.

Expected outcome:

- Docs stop duplicating architecture/source maps manually.

## 32. Generate Platform Build Matrix And Packaging Config From One Manifest

Grounded repo truth:

- Build targets exist in `package.json` scripts and Electron Builder config.
- `scripts/ci/build-matrix.mjs` separately encodes linux x64/arm64, macOS x64/arm64, and Windows x64 matrix entries.
- `scripts/smoke-test.js` separately discovers release artifacts.
- GitHub workflows encode platform input choices and artifact upload/publish/checksum globs.

Long-term target:

- One platform manifest owns platform ids, OS runners, arches, package targets, artifact names/globs, smoke executable discovery, update YAML policy, workflow input choices, and release upload/checksum policy.

Reasoning:

- Platform policy is release-critical and currently spread across package config, scripts, smoke tests, and workflows. A manifest reduces drift while snapshot tests protect packaging behavior before generated config takes over.

Phases and tasks:

- Phase 0: Inventory platform surfaces.
  - Map platforms across `package.json`, `scripts/ci/build-matrix.mjs`, `scripts/smoke-test.js`, `.github/workflows/**`, and release upload globs.
  - Add tests for current matrix output and smoke artifact discovery.
- Phase 1: Add platform manifest.
  - Create `tooling/platforms.ts` or `build.platforms.json`.
  - Encode existing platform ids and artifact policies.
- Phase 2: Generate matrix and smoke data.
  - Generate `build-matrix` output from manifest.
  - Replace smoke-test platform artifact discovery with manifest-derived rules.
- Phase 3: Generate packaging/workflow fragments.
  - Generate Electron Builder target fragments and workflow input/matrix snippets where practical.
  - Keep snapshots before replacing release-critical config.
- Phase 4: Enforce platform ownership.
  - Add CI drift check that package scripts, matrix, smoke, and workflow choices match manifest.

Success criteria:

- Adding/removing a platform is a manifest change plus generated output.
- Release artifact globs, smoke discovery, and CI matrix agree.
- Existing release behavior is snapshot-tested before generated config replaces it.

Risks and mitigations:

- Risk: release packaging breaks across OSes.
  Mitigation: run generated outputs in smoke build workflow before full release adoption.
- Risk: workflow generation becomes awkward.
  Mitigation: generate JSON/snippets consumed by workflows rather than fully generating YAML if that is more maintainable.

Expected outcome:

- Platform/release policy stops drifting across package config, scripts, and workflows.

## 33. Local Generated Artifact Policy

Grounded repo truth:

- `.gitignore` ignores `tests/coverage/`, `.vitest/`, `artifacts/`, Playwright outputs, and release/build outputs.
- Local `tests/coverage/` and `artifacts/` exist and add workspace noise.
- `vitest.config.js` writes coverage under `tests/coverage`.

Long-term target:

- Generated local artifacts live under ignored `artifacts/**` or other explicitly ignored paths, are uploadable from CI, and can be removed by a single cleanup command.

Reasoning:

- Ignored outputs still create local noise and can obscure meaningful source changes. A generated artifact policy keeps reports reproducible and cleanable without confusing tracked source reduction with workspace cleanup.

Phases and tasks:

- Phase 0: Inventory generated outputs.
  - List ignored generated directories and command outputs: coverage, architecture scorecards, type-debt reports, Playwright reports, release/build outputs, package dist outputs, and `.vitest`.
  - Distinguish generated package build outputs that are tracked from local ignored outputs.
- Phase 1: Move coverage.
  - Change Vitest coverage output to `artifacts/coverage`.
  - Update CI upload paths and any docs/scripts referencing `tests/coverage`.
- Phase 2: Add cleanup script.
  - Add `npm run clean:generated` to remove ignored generated outputs: `artifacts/coverage`, `.vitest`, Playwright outputs, test-results, and local scorecards.
  - Avoid deleting tracked package `dist` unless a separate build-clean script owns it.
- Phase 3: Add artifact policy docs.
  - Document tracked generated outputs versus ignored local generated outputs.
  - Explain CI upload behavior.
- Phase 4: Enforce output locations.
  - Add tests or script checks that coverage and reports are configured for ignored artifact paths.

Success criteria:

- Coverage no longer writes into `tests/coverage`.
- Developers can clean local generated noise with one command.
- Generated artifact paths are explicit and ignored unless intentionally tracked.

Risks and mitigations:

- Risk: cleanup removes useful build outputs unexpectedly.
  Mitigation: scope cleanup to ignored local artifacts and document exclusions.
- Risk: CI upload paths break.
  Mitigation: update workflow paths and test with CI artifact conditions.

Expected outcome:

- Local workspace noise declines and generated outputs have a clear ownership policy.

## Integrated Migration Sequence

1. Measurement and contract baselines:
   - Add file/LOC/artifact measurement.
   - Add IPC/preload, settings, device, GPU, and test baseline coverage.
   - Fix known drift tests so they describe current behavior or intentional gaps.

2. Shared foundations:
   - Add `DisposableBag`.
   - Add preload subscription factory.
   - Add shared contract-test helpers.
   - Add canonical test support factories.
   - Add script utility library where duplication is already proven.

3. Report-only manifests:
   - IPC manifest generates declarations/tests.
   - Event manifest generates constants/payload maps.
   - Device manifest generates fixtures/docs data.
   - Settings definitions generate tests/options.
   - Architecture and platform manifests generate comparison snapshots.

4. Low-risk runtime adoption:
   - Generated IPC for low-risk APIs.
   - Settings generic getters/setters as the current service contract.
   - Icon glob registry.
   - CSS utilities for repeated primitives.
   - Test mock installers and canonical factories.

5. High-impact runtime consolidation:
   - Move shaders and worker-safe rendering into `@prismgb/gpu`.
   - Data-drive shader passes.
   - Replace renderer DI boilerplate.
   - Move bridge services to generic preload event bridge.
   - Migrate presentation lifecycle and generated refs/actions.

6. Test/tooling hardening:
   - Split Vitest projects.
   - Add Playwright page objects and build preflight.
   - Generate contract tests.
   - Generate architecture docs and platform matrix/config fragments.

7. Ratchets and deletion:
   - Delete duplicate code after parity tests.
   - Enforce manifest ownership.
   - Ratchet type debt and coverage by directory/project.
   - Move generated artifacts to `artifacts/**` and add cleanup.

## Global Risks And Mitigations

- Risk: manifest-driven migration adds more code before it deletes code.
  Mitigation: every manifest has report-only, runtime-adoption, deletion, and enforcement milestones. A manifest is not complete until at least one duplicated hand-maintained surface is deleted or reduced to generated code.

- Risk: public API contracts break while internal code shrinks.
  Mitigation: all public preload APIs, IPC response shapes, settings defaults, device metadata, and E2E selectors get contract tests before replacement.

- Risk: rendering regressions are hard to see in unit tests.
  Mitigation: combine unit tests for uniform/pass data, worker protocol tests, browser/E2E streaming smoke tests, and performance snapshots before deleting renderer engines.

- Risk: generated tests compare generated outputs to generated sources.
  Mitigation: keep black-box runtime tests that instantiate actual modules, inspect actual exports, and exercise real registration paths.

- Risk: unit tests pass while the Vite/Electron dev runtime fails during startup.
  Mitigation: add a dev-runtime smoke check that starts `npm run dev`, waits for renderer initialization success, fails on renderer console errors and Vite contract-import warnings, and always tears down the dev server and Electron process.

- Risk: dependency additions offset code-size reduction.
  Mitigation: prefer existing dependencies (`awilix`, `eventemitter3`, `joi`, Testing Library, Playwright) unless a new library deletes meaningful local code and improves correctness.

- Risk: strict enforcement blocks ongoing development.
  Mitigation: use expiring allowlists, directory ratchets, and phased CI warnings before hard failures.

## Ten Audit Rounds

These audit rounds were used to harden this implementation plan after drafting. Each round states the check and the refinement applied or confirmed.

### Audit Round 1: Finding Coverage

Check:

- Compare plan sections against the 33 numbered headings in `CODEBASE_SIZE_REDUCTION_FINDINGS.md`.

Result:

- The plan includes sections for findings 1 through 33, with titles matching the source finding names.

Refinement:

- Added this audit log and the explicit source mapping statement at the top.

### Audit Round 2: Repository Grounding

Check:

- Verify that plan claims reference actual files or observed repo facts instead of generic advice.

Result:

- The plan cites the current IPC/preload files, renderer DI files, GPU package paths, duplicated shader directories, settings/transcode config, device config, Vitest config, tests, scripts, docs, workflows, and `.gitignore`.

Refinement:

- Added the `Grounding Snapshot` section so the evidence is visible before the plan details.

### Audit Round 3: Long-Term Design Bias

Check:

- Ensure recommendations favor durable architecture rather than quick patches.

Result:

- Each finding targets manifests, generated outputs, shared lifecycle utilities, typed registries, or ratcheted enforcement.

Refinement:

- Added program-level success criteria requiring deletion, generation ownership, and CI enforcement.

### Audit Round 4: Phase Structure

Check:

- Ensure every finding is broken into phases with concrete tasks.

Result:

- Every finding has phased tasks, generally starting with baseline/inventory, then report-only foundations, migration, deletion, and enforcement.

Refinement:

- Normalized phase wording across sections so auditability is consistent.

### Audit Round 5: Success Criteria

Check:

- Ensure every finding and global program has testable success criteria.

Result:

- Every finding has a `Success criteria` subsection, and the program has overall success criteria.

Refinement:

- Tightened criteria to require deletion/reduction of old surfaces, not just introduction of new abstractions.

### Audit Round 6: Risks And Mitigations

Check:

- Ensure every finding includes risks and mitigations, especially for rendering, IPC, settings, and release work.

Result:

- Every finding has risks and mitigations.

Refinement:

- Added extra mitigation language for generated-code opacity, release packaging, and tests comparing generated code to itself.

### Audit Round 7: Expected Outcomes

Check:

- Ensure each finding states expected outcomes in codebase-size and maintainability terms.

Result:

- Every finding has an `Expected outcome` subsection.

Refinement:

- Reworded outcomes to focus on reducing repeated maintenance surfaces and preventing future growth.
- Added explicit authoritative-owner wording where long-term intent was implied but not mechanically auditable.

### Audit Round 8: Cross-Finding Dependencies

Check:

- Ensure dependent work is sequenced correctly.

Result:

- The integrated sequence puts measurement, lifecycle utilities, subscription factory, and canonical tests before generated runtime adoption and high-risk rendering/UI changes.

Refinement:

- Added an `Integrated Migration Sequence` section tying findings together.

### Audit Round 9: Known Drift Handling

Check:

- Ensure known live drift from the findings is not lost.

Result:

- The plan calls out the resolved `transcodeAPI.getStatus` argument drift, resolved E2E device VID/PID and preload-name drift, settings `webm` versus transcode `mp4`, ignored coverage/artifact noise, and event scope collisions.

Refinement:

- Added explicit baseline tests for these drift areas in their finding phases.

### Audit Round 10: Completion And Enforcement

Check:

- Ensure the plan does not stop at implementation ideas and includes deletion/enforcement gates.

Result:

- Each finding includes final deletion or enforcement phases where applicable.

Refinement:

- Added global risks and mitigations plus enforcement language that CI/lint/scorecard checks must prevent regression.

## Completion Checklist

- Every numbered finding in `CODEBASE_SIZE_REDUCTION_FINDINGS.md` has a corresponding section in this document.
- Every finding section includes grounded repo truth, a long-term target, phases/tasks, success criteria, risks and mitigations, and expected outcomes.
- The plan is root-level Markdown and is intentionally named `CODEBASE_SIZE_REDUCTION_IMPLEMENTATION_PLAN.md`.
- The plan includes an integrated migration sequence across findings.
- The plan includes 10 audit rounds documenting review and hardening.
