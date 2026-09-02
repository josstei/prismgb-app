# X-Wave Progress and Resolution Plan

This report analyzes `2026-07-07-213932-local-command-caveatcaveat-the-messages-below.txt`, a prior Claude Code transcript, against the current workspace state.

## Outcome

Observed: Wave X1 is implemented locally and pushed to PR #205, but the remote PR is not merge-ready until the local cleanup from this continuation is pushed. The PR was observed open with `mergeStateStatus` `BLOCKED`; the blocking job was `Tests / Test (ubuntu-latest)`, failing in `npm run lint:dead-code` because four exported protocol types were unused after the comlink split. That dead-code blocker is now fixed locally, not pushed.

Observed current X1 state:

- Branch: `wave/x1-comlink-split`, tracking `origin/wave/x1-comlink-split`.
- Branch distance from `origin/main`: `0 5`, meaning no commits behind and five commits ahead.
- X1 commits on this branch:
  - `f2a7a361 test(gpu): land golden byte-test + timing gate for the worker RPC seam`
  - `86efa1ef refactor(gpu): port worker control plane to comlink over dedicated MessagePort`
  - `d724fdb2 test(gpu): migrate client/video-session doubles and testkit mock to comlink handshake`
  - `a5238b86 test(gpu): rewrite service envelope cases as control-API cases, prune dead validation tests`
  - `d369a254 test(gpu): apply wave review minors - JSDoc-only comments, hoist stubControlWorker`
- X1 diff from `origin/main`: 15 files changed, 1098 insertions, 1054 deletions.
- X1 production `src` delta from `origin/main`: `src +320 -739 net -419`.
- `src/platform/gpu/application/video-session.ts` has no diff from `origin/main`.
- `package.json` now has `comlink` as a production dependency.

Observed validation before the continuation cleanup:

- `npm run typecheck`: passed.
- `npm run lint`: exit 0, but with one warning: `src/platform/gpu/worker/service.ts:7` imports `CANVAS_HANDOFF_MESSAGE` unused.
- `npm run test:run`: passed, 165 files and 2033 tests, with repeated `--localstorage-file` warnings.
- `npm run dev:smoke`: passed.
- `npm run lint:dead-code`: failed. Knip reports:
  - `WorkerMessageTypeValue` at `src/platform/gpu/worker/protocol.ts:30`
  - `BrightnessPayload` at `src/platform/gpu/worker/protocol.ts:58`
  - `WorkerMessagePayloadMap` at `src/platform/gpu/worker/protocol.ts:68`
  - `FrameResponse` at `src/platform/gpu/worker/protocol.ts:112`

Observed continuation cleanup:

- Removed those four unused exported protocol types from `src/platform/gpu/worker/protocol.ts`.
- Removed the unused `CANVAS_HANDOFF_MESSAGE` import from `src/platform/gpu/worker/service.ts`.
- Re-ran local gates:
  - `npm run lint:dead-code`: passed.
  - `npm run lint`: passed with no warnings.
  - `npm run typecheck`: passed.
  - `npm run test:run`: passed, 165 files and 2033 tests, with repeated `--localstorage-file` warnings.
  - `npm run dev:smoke`: passed.

Not observed in this session:

- I did not rerun full Playwright e2e. The prior transcript says X1 saw 90/91 e2e with the one failure adjudicated environmental, but that is transcript evidence, not current-run proof.

## Transcript Summary

The transcript shows two major stages.

First, Cycle 2 audit completed and produced a wave program. The transcript records the approved sequence as:

- X1: comlink split port, target `-400...-435` production LOC.
- X2: `UIController` dissolution plus `PlatformBootstrap` base, target `-140...-240` production LOC and `-150...-280` test LOC.
- X3: base-class rework plus cradle-hardening rider, target `-80...-160` production LOC.
- X4: C1 test-harness residue, target `-100...-250` test LOC.
- X5: smalls and renames, target `-35...-55` production LOC.

Second, the transcript shows X1 planned and executed. It records the X1 plan as five tasks: golden gate, split-port, broken-test migration, deleted-machinery test pruning, and wave exit. It also records two important issues during execution:

- A plan sequencing flaw: `testkit/fixtures.ts` had to move partly into Task 2 because pre-commit runs `typecheck:app`.
- A one-time owner-approved pre-commit bypass for the Task 2 commit because lint-staged `vitest related` could not pass until Tasks 3 and 4 migrated the 16 legacy tests.

The transcript's final X1 summary claims PR #205 was created, net `-419` `src` LOC landed, `video-session.ts` stayed byte-identical, typecheck/lint/unit/dev-smoke passed, and e2e was 90/91 with the failure adjudicated environmental. Live evidence verifies the local branch shape and most non-e2e gates, but live CI now contradicts merge-readiness because dead-code lint fails.

## Current Remaining Work

### X1 Closeout

Observed blocker before continuation: PR #205 was open and blocked by dead-code lint. Current local status: the dead-code blocker is fixed in the worktree but not pushed, so GitHub will still show the old blocked state until this local patch is committed and pushed.

Resolution plan:

1. Commit the local X1 cleanup after reviewing the diff.
2. Push the X1 fix to `wave/x1-comlink-split` only after owner approval, because pushing is outward-facing.
3. Rerun or wait for the X1 closeout gates on PR #205:
   - `npm run lint`
   - `npm run lint:dead-code`
   - `npm run typecheck`
   - `npm run test:run`
   - `npm run dev:smoke`
4. Rerun e2e or explicitly document the same environmental failure with fresh current-run evidence.
   - The transcript's e2e evidence is not enough for a current merge report.
   - If e2e still fails on the fullscreen reveal-race spec, reproduce on `origin/main` or a clean control branch before calling it environmental.
5. Recheck PR #205:
   - `gh pr checks 205`
   - `gh pr view 205 --json state,mergeStateStatus,headRefName,baseRefName,url`
6. Merge only after the owner explicitly chooses to merge.

## X2 Plan: Presentation Plane Fold

Goal: Delete the remaining `UIController` facade and then introduce a shared bootstrap base.

Observed live seams:

- `src/renderer/presentation/controller/ui.controller.ts` still owns the facade.
- `src/renderer/app-bootstrap.ts` still constructs `_uiController`, calls `_initializeUI`, binds `TOKENS.uiController`, and disposes `_uiController`.
- `src/renderer/presentation/effects/ui-effects.host.ts` still has mutable `setElements`.
- Current consumers still depend on `TOKENS.uiController`, including:
  - `src/renderer/application/orchestrators/ui-setup.orchestrator.ts`
  - `src/renderer/presentation/bridges/ui-event.bridge.ts`
  - `src/renderer/infrastructure/services/settings/settings-presentation-mode.service.ts`
  - `src/renderer/infrastructure/services/streaming/streaming-view.service.ts`
  - capture/download bridge tests and mocks

Detailed execution:

1. Branch from post-X1 `main`.
   - Do not start from the current X1 branch after PR merge without refreshing.
   - Re-run `git status --short --branch` and record dirty-tree state.
2. Re-measure `UIController` usage.
   - Use `rg -n "UIController|uiController|TOKENS.uiController" src tests`.
   - Classify every hit as component host, effects, dom bindings, download, or test-only mock.
3. Move UI action delegation off `UIController`.
   - In `UISetupOrchestrator`, inject `UiComponentHost` directly for `toggleSettingsMenu`, `toggleShaderSelector`, `toggleNotesPanel`, and deferred component initialization.
   - Preserve the current delegated action table behavior.
   - Gate with `tests/unit/renderer/application/orchestrators/ui-setup.orchestrator.test.ts` and renderer interaction e2e.
4. Move visual effects calls off `UIController`.
   - In `UIEventBridge`, inject `UIEffects` directly for shutter flash, record button pop, record button press, button feedback, recording state, and record-button disabled/enabled behavior.
   - Remove phantom `UiControllerLike` methods that do not exist on the real controller.
   - Replace boolean payload extraction with the X5 helper if X5 lands first; otherwise keep local behavior and let X5 sweep it.
5. Move presentation-mode coordination into `PresentationModeService`.
   - Inject `UIEffects`, `DomBindings`, and/or `UiComponentHost` directly.
   - Preserve the current behavior of streaming-mode auto-hide, fullscreen button title, and fullscreen controls auto-hide.
6. Move streaming DOM access into `StreamingViewService`.
   - Inject `DomBindings` or a narrow stream-view port instead of `UIController`.
   - Preserve `setCanvas` updating both `streamCanvas` and the nested streaming binding.
7. Move download behavior out of `UIController`.
   - `triggerDownload` can become a direct `downloadFile` call from the owning capture bridge or a narrow injected file-download port.
8. Make `UIEffects` own its elements at construction.
   - Delete `UIEffects.setElements` after all late wiring is gone.
   - Ensure `uiEffects` is constructed after `domBindings` is available.
9. Simplify renderer bootstrap.
   - Delete `UIController` import, `_uiController`, `_initializeUI`, and `_registerUIComponents`.
   - Keep app-shell render before `domBindings` resolution.
   - Keep `bodyClassManager.bindPresentationMode(presentationModeStore)`.
10. Delete `src/renderer/presentation/controller/ui.controller.ts` and migrate/delete `ui.controller.test.ts`.
    - Do not delete behavior coverage; move it to consumer suites.
11. Only after the facade is gone, introduce `PlatformBootstrap`.
    - Add an inversify-free base under `src/platform/core/primitives/`.
    - Factor common initialize/cleanup guard, logger, container, orchestrator ownership, and cleanup nulling from `src/main/app-bootstrap.ts` and `src/renderer/app-bootstrap.ts`.
    - Keep renderer-specific shell render and settings source registration in the renderer subclass.
    - Keep main-specific container creation in the main subclass.
12. Gates:
    - `npm run typecheck`
    - `npm run lint`
    - `npm run lint:dead-code`
    - `npm run test:run`
    - `npm run dev:smoke`
    - targeted e2e for launch, toolbar/settings/shader/notes toggles, fullscreen, capture button, and streaming canvas visibility
    - full Playwright e2e before PR

## X3 Plan: Base-Class Rework

Goal: Normalize lifecycle/event handling in the shared bases and remove residual manual base ceremony.

Observed live seams:

- `BaseOrchestrator.initialize()` auto-subscribes declared `@OnEvent` handlers.
- `BaseService.initialize()` does not auto-bind events; it exposes `bindEventHandlers()`.
- Manual `bindEventHandlers()` calls remain in renderer services and bridges.
- `BaseService` and `BaseOrchestrator` both use `Object.assign(this, dependencyMap)`.

Detailed execution:

1. Re-measure before editing.
   - `rg -n "bindEventHandlers\\(\\)|async initialize\\(|initialize\\(\\):" src`
   - `rg -n "Object.assign\\(this, dependencyMap\\)|super\\(" src/platform src/main src/renderer`
   - Create a small table of exact files and intended changes.
2. Add service-level auto-bind.
   - Update `BaseService.initialize()` to bind `@OnEvent` handlers exactly once.
   - Decide and document ordering: before or after `onInitialize()`.
   - Mirror `BaseOrchestrator` unless a specific service needs setup before subscription.
3. Convert manual service overrides.
   - Move real setup from `initialize()` into `onInitialize()` where needed.
   - Target observed manual bind sites first:
     - `settings-cinematic-mode.service.ts`
     - `settings-fullscreen.service.ts`
     - `ui-event.bridge.ts`
     - `capture-ui.bridge.ts`
     - `transcode-ui.bridge.ts`
4. Deduplicate lifecycle forwarders.
   - Compare `BaseService`, `BaseOrchestrator`, and `PresentationComponent` lifecycle APIs.
   - Extract shared forwarding only where it reduces real duplication without hiding type differences.
5. Move base-owned init/dispose logging into bases where behavior is uniform.
   - Re-measure "trivial overrides" first; do not delete class-specific logs or side effects.
6. Replace cradle spread with explicit typed base parameters.
   - Remove `Object.assign(this, dependencyMap)` from shared bases only after all affected subclasses are updated.
   - This is the risky rider. Treat it as its own commit and gate immediately.
7. Gates:
   - `npm run typecheck`
   - `npm run lint`
   - `npm run lint:dead-code`
   - `npm run test:run`
   - `npm run dev:smoke`
   - targeted event-flow tests for UI, settings, capture, transcode, and fullscreen
   - full Playwright e2e before PR

## X4 Plan: C1 Test-Harness Residue

Goal: Finish measured, bounded test-harness cleanup without reopening retired W9 abstractions.

Observed live seams:

- `tests/support/di/injectable.harness.ts` exists and is widely used.
- The Cycle 2 catalog bounds remaining work to about eight in-scope suites plus nearby preamble trims.
- The standalone lifecycle-contract suite idea was previously demoted; do not reintroduce it wholesale.

Detailed execution:

1. Re-census current harness adoption.
   - `rg -n "createInjectableHarness" tests`
   - `rg -n "createEventBus\\(|createLoggerFactory\\(|new .*Service\\(|new .*Orchestrator\\(" tests/unit`
   - Compare each candidate against `@injectable` source ownership.
2. Select one low-risk directory as the first batch.
   - Prefer a batch with one subject, no large fixture churn, and clear constructor metadata.
3. Convert suites to `createInjectableHarness`.
   - Keep assertions; remove mock-deps boilerplate.
   - Update `tests/support/di/token-mock.registry.ts` only when a missing token factory is proven.
4. Delete exact duplicate lifecycle blocks only when the touched suite already has equivalent base coverage.
   - Preserve class-specific initialization/disposal assertions.
5. Track test-count arithmetic in each commit body.
   - Any deleted test must map to deleted duplicated ceremony or a replaced shared harness assertion.
6. Gates:
   - targeted suite runs after each batch
   - `npm run typecheck:tests`
   - `npm run test:run`
   - `npm run lint:dead-code`

## X5 Plan: Smalls and Naming

Goal: Land independent cleanup items after the larger waves settle.

Detailed execution:

1. Main tRPC subscription helper.
   - Add a local `sub<TPayload>(channel, schema, label)` helper beside `pushSubscription` in `src/main/ipc/router.ts`.
   - Convert the 14 byte-uniform `publicProcedure.subscription` entries to one-line `sub<T>()` entries.
   - Do not touch query/mutation procedures.
   - Gates: `npm run typecheck`, `npm run test:run`, and e2e covering subscription wire shape.
2. Boolean payload guard dedup.
   - Add a small helper under `@platform/events` or an existing event utility module.
   - Replace local helpers in:
     - `src/renderer/presentation/bridges/ui-event.bridge.ts`
     - `src/renderer/presentation/state/presentation-mode.store.ts`
     - relevant device/status stores only where the same object-key boolean guard exists.
   - Keep semantic differences, such as bare boolean payloads, explicit.
3. Residual `Pick<>` ports.
   - Convert `StreamingRenderService`'s `AppStateLike` to `Pick<AppState, 'isStreaming'>`; this is the clear live candidate.
   - Verify before changing `CinematicModeAppStateLike`; it includes a mutator and may be a deliberate narrow port.
   - Verify before changing `src/platform/transcode/transcode-temp.utils.ts`'s `Logger`; it may intentionally only need `error`.
4. Runtime naming standard.
   - Apply owner-recorded `runtime.ts` standard to `src/platform/transcode/service.ts` and `src/platform/gpu/worker/service.ts`.
   - Update imports in the same commit.
   - Add any compatibility alias table only if the public package/import surface requires it; otherwise do not preserve internal aliases.
5. Explicit non-work:
   - Do not revive Lit, NestJS, or own-transport. The catalog records them as rejected.
   - Do not implement the GPU worker switch-table fallback; X1 adoption makes it void.
6. Gates:
   - `npm run typecheck`
   - `npm run lint`
   - `npm run lint:dead-code`
   - `npm run test:run`
   - `npm run dev:smoke`
   - targeted e2e for tRPC subscription behavior if router changes land

## Recommended Order

1. Close X1 by fixing dead-code lint and the unused import, then refresh CI on PR #205.
2. Merge X1 after owner approval.
3. Write and execute X2 as its own plan: facade deletion first, bootstrap base second.
4. Write and execute X3 as its own plan: auto-bind first, lifecycle dedup second, cradle-hardening as a separate high-risk commit.
5. Execute X4 after X3, because base changes affect many of the same tests.
6. Execute X5 last, except the tRPC `sub<T>()` helper can be pulled earlier if it is isolated and there is no active bootstrap/base branch.

## Evidence Notes

Observed from current workspace:

- `git status --short --branch`
- `git log --oneline --decorate --max-count=20`
- `git rev-list --left-right --count origin/main...HEAD`
- `git diff --stat origin/main..HEAD`
- `git diff --name-status origin/main..HEAD`
- `git diff --numstat origin/main -- src`
- `git diff --stat origin/main -- src/platform/gpu/application/video-session.ts`
- `gh pr view 205 --json number,state,title,headRefName,baseRefName,url,mergeStateStatus,isDraft`
- `gh pr checks 205`
- `XDG_CACHE_HOME=/private/tmp/gh-cache gh run view 28774634388 --job 85315745218 --log`
- `npm run typecheck`
- `npm run lint`
- `npm run lint:dead-code`
- `npm run test:run`
- `npm run dev:smoke`

Assumptions:

- The intended final order is still X1 through X5 unless the owner changes priorities.
- Post-X1 work should branch from refreshed `main` after PR #205 merges.
- Existing `.gitignore` changes are user/prior-session state and are intentionally left untouched by this analysis.
