# Codebase Size Reduction Phase 0/1 Audit

Date: 2026-05-19

Audited branch: `refactor/codebase-size-phase-1`

Audited commits:

- Phase 0 baseline: `20ac639 chore(codebase): add size reduction baselines`
- Phase 0 pause/status docs: `f78780d docs(codebase): record size reduction pause state`
- Phase 1 implementation: `1b7ed21 chore(codebase): implement size reduction phase 1`

## Objective

Run an exhaustive audit against Phase 0 and Phase 1 work to verify:

- No contract drift was introduced.
- Phase 0 baselines are real regression gates, not intent-only documentation.
- Phase 1 foundations are future-first and report-only where planned.
- New utilities and manifests support aggressive later code reduction instead of becoming permanent duplicate systems.
- Generated/local artifacts stay reproducible and ignored.

## Audit Result

Status: pass, with one hardening change made during this audit.

The Phase 0 and Phase 1 implementation matches the plan's staged migration strategy. Phase 1 intentionally increases tracked source temporarily by adding manifests, helpers, and tests; that is acceptable only because every added manifest has a drift gate and a later deletion/adoption path in the implementation plan. The current branch does not yet claim durable net code reduction. It establishes the contract and generation gates needed for Phase 2 deletion work.

Hardening performed during audit:

- Reworded the implementation plan's "Grounding Snapshot" to "Phase 0 Grounding Snapshot" so baseline counts do not masquerade as post-Phase-1 live totals.
- Tightened `scripts/codebase-phase1-drift-report.js` so TypeScript alias checks dedupe wildcard/direct aliases.
- Added a negative test proving `buildPhase1DriftReport()` fails when a manifest intentionally drifts from current IPC channels.

## Prompt-To-Artifact Checklist

| Requirement | Evidence | Audit Finding |
| --- | --- | --- |
| Phase 0 adds tracked measurement command | `scripts/codebase-size-report.js`, `package.json` script `codebase:size` | Present. Current run exits 0 and reports tracked source separately from ignored artifacts. |
| Phase 0 snapshots preload/API public behavior | `tests/unit/preload/preload-api.invoke-contract.test.js`, `tests/unit/preload/preload-api.contract.test.js` | Present. Covers invoke forwarding, response shapes, exposed names, declaration typing, and transcode status shape. |
| Phase 0 snapshots non-IPC public surfaces | `tests/unit/codebase-reduction/non-ipc-baselines.test.js` | Present. Covers EventBus values, settings defaults, Chromatic metadata, shader equivalence, E2E selectors, stale E2E naming, and release targets. |
| Phase 0 distinguishes source reduction from local artifact cleanup | `npm run codebase:size -- --json` output | Present. Current report separates tracked source, local artifacts, test artifacts, build output, release output, package output, and vendored dependency buckets. |
| Phase 1 adds shared generator/schema/flattening helpers | `src/shared/contracts/contract-utils.ts`, `scripts/lib/*` | Present. Helpers are small and reused by drift/generation code. |
| Phase 1 adds lifecycle primitive | `src/shared/base/disposable-bag.ts`, `tests/unit/codebase-reduction/phase1-foundations.test.js` | Present. Tests verify reverse-order, async-aware, idempotent cleanup and event listener cleanup. |
| Phase 1 adds manifests | `src/shared/ipc/ipc.manifest.json`, `src/shared/events/event.manifest.json`, `src/shared/features/devices/device.manifest.json`, `src/shared/features/settings/settings.definitions.json`, `packages/prismgb-gpu/src/domain/render-passes/render-passes.contract.json`, `scripts/manifests/architecture.manifest.json`, `scripts/manifests/platforms.manifest.json` | Present. Phase 2 now enforces runtime-adopted IPC/settings manifests while remaining inventory manifests stay report-only. |
| Phase 1 generates declarations/docs fragments and drift reports before runtime replacement | `scripts/codebase-phase1-drift-report.js`, `npm run codebase:phase1 -- --write-generated --output artifacts/codebase-reduction/phase1/drift-report.json` | Present. Generated outputs are reproducible under ignored `artifacts/codebase-reduction/phase1`. |
| Drift checks pass on current repo | `npm run codebase:phase1 -- --json` | Present. Current run exits 0 with all checks passing. |
| Drift checks fail on intentional mismatch | `tests/unit/scripts/codebase-phase1-drift-report.test.js` | Present after audit hardening. A mutated IPC manifest channel produces `status: fail` with expected missing/extra values. |
| No unplanned runtime behavior change in Phase 1 | `tests/unit/codebase-reduction/phase1-foundations.test.js`, `tests/unit/main/ipc/handlers/login-item.handler.test.js`, `tests/unit/preload/preload-api.invoke-contract.test.js` | Present. Runtime adoption is limited to `updateAPI.onError` subscription factory and login-item handler descriptors; tests preserve payloads, warnings, channels, and response shapes. |
| Official WebGPU type hoist does not regress app/GPU typechecks | `tsconfig.base.json`, `src/types/webgpu-worker.d.ts`, `src/renderer/infrastructure/rendering/workers/webgpu-renderer.engine.ts`, `npm run typecheck` | Present. Local manual declarations were deleted; typecheck passes with official `@webgpu/types`. |
| Generated artifact policy moves coverage away from `tests/coverage` | `vitest.config.js`, `tests/unit/codebase-reduction/phase1-manifests.test.js` | Present. Coverage now targets `artifacts/coverage`; old local `tests/coverage` is still measured as ignored historical noise by the size report. |
| Aggressive reduction remains future-first rather than quick cleanup | Implementation plan Phase 2+ deletion/enforcement phases, Phase 1 manifests, `TypedRegistryFactory`, handler descriptors, subscription factory | Pass with caveat. Phase 1 adds foundation and gates, not net reduction. The next phase must start deleting or reducing old hand-maintained surfaces. |

## Commands Run

- `npm run codebase:phase1 -- --json`
  - Result: exit 0.
  - Coverage: IPC/preload, events, device manifest, settings manifest, render pass shaders, architecture aliases, release/smoke platform matrix.
- `npm run test:run -- tests/unit/scripts/codebase-phase1-drift-report.test.js`
  - Result: 1 file, 3 tests passed.
  - Coverage: current-pass path, intentional-drift failure path, generated declaration/docs fragments.
- `npm run codebase:size -- --json`
  - Result: exit 0.
  - Coverage: current tracked file counts and source LOC by area.
  - Current shader duplicate status: WebGPU and WebGL2 synchronized.
- Full quality gates rerun after audit hardening:
  - `npm run lint` exit 0 with five existing warnings.
  - `npm run typecheck` exit 0.
  - `npm run test:run` exit 0 with 150 files and 2967 tests.

## Drift Assessment

No current contract drift found after hardening.

Explicit known drift at the Phase 1 audit point:

- The former transcode status declaration mismatch was resolved during Phase 2; preload types and implementation now expose status without a job id argument.
- E2E helper references to `window.deviceAPI?.onConnected` / `onDisconnected` remain captured as stale assumptions, while preload exposes `onDeviceConnected` / `onDeviceDisconnected`.
- Settings default recording format remains `webm`, while `TRANSCODE_CONFIG.defaultFormat` remains `mp4`; both are intentionally preserved and tested.

Resolved audit drift:

- The plan's grounding snapshot was stale after Phase 1. It now explicitly describes the Phase 0 baseline rather than current post-Phase-1 totals.

## Design Assessment

The Phase 0/1 design follows the long-term plan:

- It adds contract tests before replacing plumbing.
- It keeps manifests out of runtime ownership until parity is proven.
- It avoids introducing a new schema runtime dependency and stays aligned with existing project dependencies.
- It moves repeated mechanics into narrow primitives (`DisposableBag`, `createSubscription`, handler descriptors, `TypedRegistryFactory`) rather than broad abstractions.
- It keeps generated preview output out of source directories.

The main risk is temporary duplication: Phase 1 adds manifests beside existing hand-maintained files. This is acceptable only because the plan requires Phase 2/3 adoption and Phase 4 enforcement/deletion. The audit does not consider the overall size-reduction program complete until those deletion gates are executed.
