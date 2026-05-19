# Codebase Size Reduction Phase 0-3 Audit

Date: 2026-05-19

Audited branch: `refactor/codebase-reduction-phase-3`

Audited range:

- Phase 0 baseline: `20ac639 chore(codebase): add size reduction baselines`
- Phase 1 merge: `68baebf [codex] Codebase size reduction phase 1 (#151)`
- Phase 2 merge: `348e493 [codex] complete generated runtime phase 2 cutover (#152)`
- Phase 2 cleanup merges: `af13109 [codex] clear final codebase audit helpers (#155)`, `4ca72df [codex] clear final audit doc residue (#156)`
- Phase 3 branch commits: `689eb4a`, `37e5fe8`, `53621b5`, `b71c01d`, `473b313`, `e53226f`
- Phase 3 audit and dev-boot hardening commits: `0b8b940`, `851463e`, `a0f6db2`, `a7375cd`, `9a569ac`

## Objective

Audit all completed Phase 0 through Phase 3 work for:

- Contract, manifest, and runtime drift.
- Long-term, future-first design rather than quick cleanup.
- Aggressive source reduction with one owner per migrated concern.
- No legacy or leftover code in migrated areas.
- No backwards-compatibility shims left on migrated public APIs.

## Audit Result

Status: pass, with audit hardening applied.

The current audit found and fixed two non-runtime documentation/testing gaps, one clean-break residue, and two dev-runtime verification gaps:

- The execution-status block in `CODEBASE_SIZE_REDUCTION_IMPLEMENTATION_PLAN.md` still described Phase 2 as the completed phase even though Phase 3 commits are present.
- The old Phase 0/1 audit document was deleted locally, but there was no replacement Phase 0-3 audit artifact.
- The device preload factory still used internal `onConnected` / `onDisconnected` names and warning text behind the current public `onDeviceConnected` / `onDeviceDisconnected` API. Those internal names were removed so the migrated surface has one current naming model.
- The Awilix descriptor migration allowed class constructors to receive the whole proxy cradle when dependencies were not explicit, causing the dev renderer to fail at `uiEffects -> elements`. Class descriptors now support explicit dependency lists and `uiEffects` declares `bodyClassManager`.
- `src/main/infrastructure/window/window.service.ts` imported `channels.json` with a JSON import attribute while the rest of runtime imported it without attributes, causing Vite to emit a dev-build warning. Runtime IPC channel imports now use one style and a regression test scans main/preload imports.

The implementation-level checks found no blocking drift:

- `npm run codebase:phase1 -- --json` exits 0 and all manifest drift checks pass.
- `npm run codebase:size -- --json` exits 0, reports package-owned shader trees, and reports `cleanOwnership: true`.
- `git diff --check` exits 0.
- `npm run lint`, `npm run typecheck`, `npm run test:run`, and `npm run test:run --workspace=@prismgb/gpu` all exit 0 after audit hardening.
- `npm run dev` starts the Vite/Electron app and reaches `Renderer application started successfully`.
- The focused audit loop was run 5 times against the current branch, with each pass verifying manifest drift, size/shader ownership, obsolete source-name absence, deleted legacy-path absence, clean-break regression tests, renderer DI hardening, and runtime IPC import-style hardening.

## Prompt-To-Artifact Checklist

| Requirement | Evidence | Audit Finding |
| --- | --- | --- |
| Phase 0 measurement and public behavior baselines exist | `scripts/codebase-size-report.js`, `tests/unit/codebase-reduction/non-ipc-baselines.test.js`, `tests/unit/preload/preload-api.invoke-contract.test.js`, `tests/unit/preload/preload-api.contract.test.js` | Present. Baselines cover tracked source metrics, IPC/preload shape, EventBus values, settings defaults, device metadata, shader ownership, E2E selectors, and release targets. |
| Phase 1 manifest and foundation work remains drift-checked | `scripts/codebase-phase1-drift-report.js`, `tests/unit/scripts/codebase-phase1-drift-report.test.js`, `tests/unit/codebase-reduction/phase1-foundations.test.js`, `tests/unit/codebase-reduction/phase1-manifests.test.js` | Present. Current drift command passes and still has negative mismatch coverage. |
| Phase 2 generated-runtime cutover has no legacy public API shims | `src/shared/ipc/ipc.manifest.json`, `src/preload/index.js`, `src/preload/apis/device.preload-api.js`, `src/types/preload-api.d.ts`, `tests/unit/preload/preload-api.invoke-contract.test.js` | Present after audit hardening. Public preload APIs no longer expose `removeListeners`; transcode status no longer accepts the obsolete `jobId` argument; device listener factory names now match the current public API names. |
| Phase 2 settings cutover has no compatibility mappings | `src/shared/features/settings/settings.definitions.json`, `tests/unit/features/settings/services/settings.service.test.js` | Present. Settings tests assert no `legacy` or `compatibilityNotes` mappings exist. |
| Phase 3 renderer GPU consolidation is a clean break | Deleted renderer shader trees and renderer-private engine files, `src/renderer/infrastructure/rendering/workers/render.worker.ts`, `packages/prismgb-gpu/src/factories/worker-pipeline.factory.ts`, `tests/unit/renderer/infrastructure/rendering/workers/render.worker.test.js`, `packages/prismgb-gpu/tests/unit/factories/worker-pipeline.test.ts` | Present. Renderer worker delegates to `@prismgb/gpu`; old renderer engine files and duplicate shader trees are gone. |
| Phase 3 renderer DI consolidation is a clean break | Deleted `src/renderer/infrastructure/di/service-container.factory.ts`, `src/renderer/infrastructure/di/renderer-container.factory.ts`, `tests/unit/renderer/infrastructure/di/renderer-container.test.js`, `tests/unit/renderer/infrastructure/di/renderer-container.types.test.ts`, `tests/unit/app/renderer/container.test.js` | Present. Renderer DI uses Awilix descriptor registration; old custom container files and tests are gone. Explicit class dependency descriptors prevent optional constructor fields such as `elements` from becoming accidental container tokens. |
| Phase 3 dev runtime boots after DI and Vite contract changes | `npm run dev`, `src/renderer/application/di/register-ui.ts`, `src/renderer/infrastructure/di/renderer-container.factory.ts`, `src/main/infrastructure/window/window.service.ts`, `tests/unit/app/renderer/container.test.js`, `tests/unit/codebase-reduction/phase1-manifests.test.js` | Present after dev-boot hardening. The renderer reaches `Renderer application started successfully`, `uiEffects` resolves without a container-level `elements` token, and runtime `channels.json` imports use one style. |
| Phase 3 presentation lifecycle consolidation is future-first | `src/renderer/presentation/primitives/activity-auto-hide.controller.ts`, `src/renderer/presentation/primitives/presentation-component.base.ts`, migrated auto-hide effects, `tests/unit/renderer/presentation/primitives/activity-auto-hide.controller.test.ts` | Present. Repeated activity/timer/listener behavior is centralized behind a reusable controller and disposal base. |
| Phase 3 test topology has explicit mocks and no lazy/global sandbox leftovers | `vitest.config.js`, `tests/setup.js`, `tests/support/mocks/*`, deleted `tests/utils/global-sandbox.js`, deleted `tests/utils/lazy-mocks.js` | Present. Global setup is minimal, mocks are project-scoped installers, and deleted helper implementations do not remain. |
| No stale audit artifact remains as a current source of truth | Deleted `CODEBASE_SIZE_REDUCTION_PHASE_0_1_AUDIT.md`, added `CODEBASE_SIZE_REDUCTION_PHASE_0_3_AUDIT.md` | Present after this audit hardening. |
| No backwards-compatibility shims remain on migrated public APIs | `tests/unit/codebase-reduction/phase3-clean-break.test.js`, preload contract tests, settings service tests | Strengthened during this audit. New clean-break test asserts no obsolete preload `removeListeners`, `onConnected`, or `onDisconnected` public methods are exposed. |

## Drift Assessment

No current drift has been found in the manifest-driven surfaces checked so far.

Known intentional differences that remain are not backwards-compatibility shims:

- `settings.recordingFormat` defaults to `webm` while transcode defaults to `mp4`; this is current product behavior and remains explicitly tested.
- Architecture, platform, device, and render-pass manifests still include report-only inventory surfaces where those domains have not yet become generated runtime ownership. They remain drift-checked and are not alternate runtime paths.
- No standalone obsolete device listener names remain in preload source or the IPC manifest. Remaining matches are negative assertions that the old names stay absent.
- The Chromium macOS `SetApplicationIsDaemon` diagnostic can still appear during Electron dev startup, but it does not block renderer initialization and is not a Phase 0-3 contract or compatibility shim.

## Design Assessment

The completed Phase 0-3 work follows the long-term reduction strategy in the migrated areas:

- Phase 0 added measurements and behavior baselines before migration.
- Phase 1 added small reusable primitives and report-only contracts before cutover.
- Phase 2 moved high-duplication preload, IPC, settings, event, registry, and cleanup surfaces to singular contracts or shared primitives.
- Phase 3 deleted high-impact duplicate implementations: renderer shader copies, renderer-private GPU engines, custom renderer DI, eager global test mocks, and duplicated auto-hide lifecycle wiring.

The clean-break standard is met for migrated areas when this audit's new clean-break regression test and full quality gates pass. Phase 4 still needs to add CI enforcement/ratchets so these patterns cannot reappear.

## Commands Run

- Five-pass focused audit loop:
  - Result: 5 passes, 0 failures.
  - Per pass: `npm run codebase:phase1 -- --json` reported 23 manifest checks and `status: pass`.
  - Per pass: `npm run codebase:size -- --json` reported 673 tracked files, 112,936 counted source lines, and WebGPU/WebGL2 shader status `package-owned,package-owned`.
  - Per pass: source scan found no obsolete `onConnected`, `onDisconnected`, `device.onConnected`, `device.onDisconnected`, `deviceAPI.onConnected`, `deviceAPI.onDisconnected`, or `getStatus(jobId` references in `src/preload`, `src/shared/ipc`, or `src/types`.
  - Per pass: deleted legacy paths were absent: stale Phase 0/1 audit doc, custom renderer service container, renderer-private GPU engines, duplicate renderer shader trees, `tests/utils/global-sandbox.js`, and `tests/utils/lazy-mocks.js`.
  - Per pass: `npm run test:run -- tests/unit/codebase-reduction/phase3-clean-break.test.js tests/unit/codebase-reduction/phase1-manifests.test.js tests/unit/renderer/infrastructure/di/renderer-container.test.js tests/unit/app/renderer/container.test.js` passed with 4 files and 30 tests.
- `npm run codebase:phase1 -- --json`
  - Result: exit 0.
  - Coverage: IPC/preload methods, request schemas, handler descriptors, event manifest values, settings storage derivation, render pass shader existence, architecture aliases, and platform matrices.
- `npm run test:run -- tests/unit/codebase-reduction/phase3-clean-break.test.js tests/unit/scripts/codebase-size-report.test.js tests/unit/scripts/codebase-phase1-drift-report.test.js`
  - Result: exit 0.
  - Coverage: clean-break deletion gates, package-owned shader ownership, no obsolete preload public listener methods, explicit mock topology, size-report behavior, and manifest drift behavior.
  - Count: 3 files, 16 tests.
- `npm run test:run -- tests/unit/preload/preload-api.invoke-contract.test.js tests/unit/preload/preload-api.contract.test.js tests/unit/codebase-reduction/non-ipc-baselines.test.js tests/unit/codebase-reduction/phase3-clean-break.test.js tests/unit/scripts/codebase-phase1-drift-report.test.js`
  - Result: exit 0.
  - Coverage: device preload clean-break cutover, preload declaration shape, non-IPC baselines, clean-break checks, and manifest drift behavior.
  - Count: 5 files, 32 tests.
- `npm run codebase:size -- --json`
  - Result: exit 0.
  - Current staged tracked file count: 673.
  - Current staged counted source lines: 112,936.
  - Current duplicate shader status: package-owned for WebGPU and WebGL2, with `cleanOwnership: true`.
- `npm run dev`
  - Result: Vite/Electron dev startup reached `Renderer application started successfully`.
  - Coverage: real renderer boot path, Awilix descriptor resolution, `uiEffects` dependency wiring, and runtime `channels.json` import consistency.
- `git diff --check`
  - Result: exit 0.
- `git diff --cached --check`
  - Result: exit 0.
- `npm run lint`
  - Result: exit 0 with three existing warnings and architecture boundary checks passing.
- `npm run typecheck`
  - Result: exit 0.
  - App typecheck gate: 660 strict diagnostics, 135 tracked buckets, 0 stale buckets.
  - GPU package `tsc --noEmit`: exit 0.
- `npm run test:run`
  - Result: exit 0.
  - Count: 155 files, 2853 tests.
- `npm run test:run --workspace=@prismgb/gpu`
  - Result: exit 0.
  - Count: 5 files, 28 tests.
