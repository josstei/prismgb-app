# Streaming & Rendering Cluster — Type-Debt Retirement Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (preferred for parallel file tasks) or `superpowers:executing-plans` (for serial execution). Track progress by checking each `- [ ]` item as it is completed.

## Goal

Retire the 661 allowlisted strict TypeScript diagnostics across the 13 streaming/rendering target and support files and remove those files from `scripts/type-debt-allowlist.json` without weakening the type gate, deleting runtime behavior, or masking debt with casts. The 13-file scope is the 10 original streaming/rendering files plus the 3 worker-boundary support files that must be cleaned for the worker protocol claim to be true. After completion, this cluster contributes zero allowlist entries; the gate remains active for the remaining non-cluster debt.

## Accuracy audit and plan corrections

This document was reviewed against the repository state on 2026-05-16. The following gaps in the previous draft are corrected here:

- **Typing a `dependencies` parameter is not enough.** `BaseService`/`BaseOrchestrator` are JavaScript bases whose `.d.ts` exposes subclass properties as `unknown`; each subclass must also declare the injected fields it reads, or a typed base/typed assignment helper must be introduced first.
- **Event payload casts are not a long-term solution.** The prior plan used repeated `unknown as Foo` call-site casts. This revision establishes canonical event/worker/domain payload contracts and validates payloads at untyped boundaries.
- **Tests do exist for several target services/orchestrators.** The plan must run and update the relevant Vitest suites; only the worker engine classes currently lack direct unit coverage.
- **`optimization.utils.ts` contains more than three utility classes.** `CaptureBufferManager` and `ShaderProgram` also contribute to the file's diagnostics and must be typed or replaced with package-owned implementations.
- **The recompute filter must be exact.** A regex using `orchestrators/(streaming|capture)` also matches `streaming-audio.orchestrator.ts`, adding 10 unrelated diagnostics. This plan uses an explicit file manifest so scope cannot drift by filename prefix.
- **Worker-boundary support files are in scope.** `worker-protocol.config.ts`, `gpu-worker-manager.ts`, and `render.worker.ts` already have 42 allowlisted diagnostics. Because Task 1 claims the worker message boundary is typed, those files must be cleaned and ratcheted with the cluster.
- **GPU utility imports must target a real public API.** `@prismgb/gpu` currently exposes only its top-level public index; `ShaderProgram`, `BindGroupCache`, and `UniformTracker` are not exported there. Any package reuse must first add deliberate public exports and rebuild the package, or the worker must keep a local typed implementation.
- **Event payload coverage must be mechanically exhaustive.** The payload map cannot be a hand-curated partial list. Every `EventChannels` leaf must be represented, with concrete payloads for touched channels and explicit no-payload entries for command/notification channels.
- **The hardcoded allowlist expiry should not be treated as a recurring manual bump.** Task 0 keeps CI unblocked while making expiry explicit and repeatable so future cleanup does not depend on editing a constant.
- **No `any`, blanket casts, `@ts-ignore`, or allowlist expansion are acceptable fixes.** Each resolved diagnostic must either encode a real invariant in types or add a runtime guard where data enters from an untyped boundary.

## Architecture approach

Use a contract-first cleanup:

1. **Centralize shared contracts** for errors, event payloads, streaming capabilities, worker protocol payloads, renderer state, and injected dependencies.
2. **Declare lifecycle state explicitly** (`_state`/`_requireState()` for initialized renderers; explicit nullable fields for services with incremental setup/teardown).
3. **Type DI at the class boundary** by combining a constructor `Dependencies` type with `declare`d injected fields or a typed base helper.
4. **Validate untrusted payloads at boundaries** (event bus, worker messages, catch values, browser APIs) and keep internals strongly typed after validation.
5. **Ratchet the allowlist down only after diagnostics are actually gone.** Regeneration is verification, not the fix.
6. **Protect behavior with existing tests and targeted smoke coverage.** Update tests when stronger typing reveals missing runtime guards.

This is intentionally not a quick cast-only cleanup. If a file needs a shared type to become correct, add the shared type once and consume it everywhere affected.

## Tech stack

TypeScript strict mode, Vite, Electron renderer, Web Workers, OffscreenCanvas/WebGL2/WebGPU, Web Audio API, custom DI via `BaseService`/`BaseOrchestrator`, custom EventBus, Vitest.

## Pre-flight context

- The gate script is `scripts/typecheck-app.js`. It runs `tsc -p tsconfig.app.json --noEmit`, buckets diagnostics by `(file, code)`, and compares against `scripts/type-debt-allowlist.json`.
- Gate failures are **unexpected** (new bucket), **overflow** (`actual > maxCount`), or **expired** (`expiresOn < today`). Stale buckets are reported but do not fail.
- Current allowlist metadata: 209 buckets, 1,452 strict diagnostics, all expiring on `2026-04-30`.
- The target and support file totals below come from the allowlist. Before implementation, recompute live diagnostics in an environment with dependencies installed; if counts drift, use the live diagnostics as the source of truth but keep the same contract-first approach and exact manifest.
- `src/renderer/application/orchestrators/streaming-audio.orchestrator.ts` is intentionally **not** in this cluster. It currently has 10 allowlisted diagnostics and should be addressed in a separate audio-orchestrator cleanup unless explicitly added to scope.
- Unit tests exist for the streaming/capture/device services and orchestrators under `tests/unit/features/**`; direct worker-engine tests are missing and should be added where deterministic browser mocks already exist or can be added cleanly.
- Do not run `git push origin main` from this plan. Use a normal feature branch/PR unless the user explicitly asks for a direct main hotfix.

## Target files

| # | File | Errors | Dominant codes |
|---|---|---:|---|
| 1 | `src/renderer/infrastructure/rendering/workers/webgl2-renderer.engine.ts` | 133 | TS18047 ×126, TS2339 ×5, TS2531 ×2 |
| 2 | `src/renderer/infrastructure/services/streaming/render-pipeline.service.ts` | 91 | TS2571 ×50, TS2339 ×20, TS7006 ×17, TS18046 ×4 |
| 3 | `src/renderer/infrastructure/services/streaming/gpu-renderer.service.ts` | 74 | TS2571 ×48, TS7006 ×13, TS2322 ×4, TS2345 ×3, TS2349 ×3, TS2769 ×3 |
| 4 | `src/renderer/infrastructure/services/streaming/audio-pipeline.service.ts` | 56 | TS2339 ×23, TS7006 ×17, TS2571 ×9, TS2769 ×3, TS7031 ×3, TS2349 ×1 |
| 5 | `src/renderer/application/orchestrators/streaming.orchestrator.ts` | 53 | TS2571 ×27, TS2532 ×13, TS7006 ×9, TS18046 ×4 |
| 6 | `src/renderer/infrastructure/services/devices/device-media.service.ts` | 47 | TS2571 ×23, TS7006 ×19, TS2339 ×3, TS18046 ×1, TS2349 ×1 |
| 7 | `src/renderer/infrastructure/rendering/workers/optimization.utils.ts` | 45 | TS7006 ×30, TS2345 ×9, TS18048 ×4, TS18047 ×2 |
| 8 | `src/renderer/infrastructure/rendering/workers/webgpu-renderer.engine.ts` | 44 | TS2531 ×28, TS2322 ×7, TS2339 ×5, TS2345 ×4 |
| 9 | `src/renderer/infrastructure/services/capture/gpu-recording.service.ts` | 39 | TS2571 ×15, TS18046 ×7, TS2339 ×7, TS7006 ×6, TS2345 ×2, TS7031 ×2 |
| 10 | `src/renderer/application/orchestrators/capture.orchestrator.ts` | 37 | TS2571 ×25, TS2532 ×8, TS7006 ×3, TS2339 ×1 |
| 11 | `src/renderer/infrastructure/rendering/workers/render.worker.ts` | 25 | TS7005 ×13, TS18046 ×5, TS7006 ×4, TS7034 ×3 |
| 12 | `src/renderer/infrastructure/services/streaming/gpu-worker-manager.ts` | 14 | TS7006 ×10, TS7031 ×2, TS2531 ×1, TS2769 ×1 |
| 13 | `src/renderer/infrastructure/rendering/workers/worker-protocol.config.ts` | 3 | TS7006 ×3 |
| **Total** | | **661** | |

Recompute the table if needed:

```bash
jq -r '
  [
    "src/renderer/infrastructure/rendering/workers/webgl2-renderer.engine.ts",
    "src/renderer/infrastructure/services/streaming/render-pipeline.service.ts",
    "src/renderer/infrastructure/services/streaming/gpu-renderer.service.ts",
    "src/renderer/infrastructure/services/streaming/audio-pipeline.service.ts",
    "src/renderer/application/orchestrators/streaming.orchestrator.ts",
    "src/renderer/infrastructure/services/devices/device-media.service.ts",
    "src/renderer/infrastructure/rendering/workers/optimization.utils.ts",
    "src/renderer/infrastructure/rendering/workers/webgpu-renderer.engine.ts",
    "src/renderer/infrastructure/services/capture/gpu-recording.service.ts",
    "src/renderer/application/orchestrators/capture.orchestrator.ts",
    "src/renderer/infrastructure/rendering/workers/render.worker.ts",
    "src/renderer/infrastructure/services/streaming/gpu-worker-manager.ts",
    "src/renderer/infrastructure/rendering/workers/worker-protocol.config.ts"
  ] as $cluster
  | .entries
  | group_by(.file)
  | map({file:.[0].file,count:map(.maxCount)|add,codes:map({(.code):.maxCount})|add})
  | sort_by(-.count)
  | .[]
  | select(.file as $f | $cluster | index($f))
  | [.count,.file,((.codes|to_entries|sort_by(-.value)|map("\(.key)×\(.value)")|join(", ")))]
  | @tsv
' scripts/type-debt-allowlist.json
```

Verify the manifest totals and accidental exclusions:

```bash
jq -r '
  [
    "src/renderer/infrastructure/rendering/workers/webgl2-renderer.engine.ts",
    "src/renderer/infrastructure/services/streaming/render-pipeline.service.ts",
    "src/renderer/infrastructure/services/streaming/gpu-renderer.service.ts",
    "src/renderer/infrastructure/services/streaming/audio-pipeline.service.ts",
    "src/renderer/application/orchestrators/streaming.orchestrator.ts",
    "src/renderer/infrastructure/services/devices/device-media.service.ts",
    "src/renderer/infrastructure/rendering/workers/optimization.utils.ts",
    "src/renderer/infrastructure/rendering/workers/webgpu-renderer.engine.ts",
    "src/renderer/infrastructure/services/capture/gpu-recording.service.ts",
    "src/renderer/application/orchestrators/capture.orchestrator.ts",
    "src/renderer/infrastructure/rendering/workers/render.worker.ts",
    "src/renderer/infrastructure/services/streaming/gpu-worker-manager.ts",
    "src/renderer/infrastructure/rendering/workers/worker-protocol.config.ts"
  ] as $cluster
  | (.entries | map(select(.file as $f | $cluster | index($f))) | map(.maxCount) | add) as $count
  | (.entries | map(select(.file as $f | $cluster | index($f))) | map(.file) | unique | length) as $files
  | "files=\($files) diagnostics=\($count)"
' scripts/type-debt-allowlist.json

jq -r '
  [.entries[] | select(.file == "src/renderer/application/orchestrators/streaming-audio.orchestrator.ts") | .maxCount] | add
' scripts/type-debt-allowlist.json
```

Expected: `files=13 diagnostics=661` for the cluster, and `10` for the explicitly out-of-scope streaming-audio file.

## Required recipes

### Recipe 0 — Shared contracts before file-local fixes

Create or update these contracts before editing target files. Names may be adjusted to match repository conventions, but there must be one canonical source for each contract.

- `src/shared/lib/errors/error-guards.ts`
  - `isErrorLike(value: unknown): value is { message: string }`
  - `getErrorMessage(value: unknown, fallback = 'Unknown error'): string`
- `src/shared/events/event-payloads.ts` (or equivalent)
  - `EventPayloadMap` keyed by the literal values from `EventChannels` and exhaustive across every leaf channel.
  - `TypedEventBusLike` with `publish<K extends keyof EventPayloadMap>()` and `subscribe<K extends keyof EventPayloadMap>()` overloads.
  - Use `void`/`undefined` for no-payload channels so command and notification events are typed without dummy `{}` payloads.
  - Payload types for every channel touched by this cluster: stream started/stopped/error/health, render pipeline/canvas events, settings volume/brightness/preset/performance mode, performance state/render mode/memory snapshot, capture screenshot/recording events, device enumeration/supported-device/disconnected-during-session events, and UI status/overlay/streaming/stream-info/command events.
  - At minimum, include the channels used by the 13-file manifest plus their current bridge/service consumers: `SETTINGS.VOLUME_CHANGED`, `SETTINGS.BRIGHTNESS_CHANGED`, `SETTINGS.RENDER_PRESET_CHANGED`, `PERFORMANCE.RENDER_MODE_CHANGED`, `PERFORMANCE.STATE_CHANGED`, `PERFORMANCE.MEMORY_SNAPSHOT_REQUESTED`, `CAPTURE.SCREENSHOT_TRIGGERED`, `CAPTURE.RECORDING_READY`, `CAPTURE.RECORDING_ERROR`, `CAPTURE.RECORDING_DEGRADED`, `DEVICE.ENUMERATION_FAILED`, `DEVICE.SUPPORTED_DEVICE_AVAILABLE`, `DEVICE.DISCONNECTED_DURING_SESSION`, `RENDER.CAPABILITY_DETECTED`, `RENDER.PIPELINE_READY`, `RENDER.PIPELINE_ERROR`, `RENDER.STATS_UPDATE`, `RENDER.CANVAS_EXPIRED`, `STREAM.STARTED`, `STREAM.STOPPED`, `STREAM.ERROR`, `STREAM.HEALTH_OK`, `STREAM.HEALTH_TIMEOUT`, and all `UI.*` command/status channels touched by streaming/capture orchestration.
  - Add a compile-time exhaustiveness check such as `type MissingEventPayloads = Exclude<EventChannelValue, keyof EventPayloadMap>` with an assertion that it is `never`.
- `src/renderer/infrastructure/streaming/streaming-contracts.ts` (or equivalent renderer-domain contract module)
  - `Dimensions`, `NativeResolution`, `StreamingCapabilities`, `StreamStartedPayload`, `StreamHealthOkPayload`, `StreamHealthTimeoutPayload`, `PerformanceStatePayload`, `SupportedDeviceAvailablePayload`, `RecordingReadyPayload`, `RecordingErrorPayload`, `RecordingDegradedPayload`.
  - Narrowing functions such as `isPerformanceStatePayload`, `isStreamStartedPayload`, and `isRecordingReadyPayload` for event-bus payloads that originate from JavaScript or external APIs.
- `src/renderer/infrastructure/rendering/workers/worker-protocol.config.ts`
  - Replace JSDoc-only protocol descriptions with exported literal types/unions for `WorkerMessageType`, `WorkerResponseType`, message payloads, response payloads, `WorkerMessage`, `WorkerResponse`, and boundary validators.
  - `GpuWorkerManager.onMessage()` should become payload-aware so `StreamingGpuRendererService` callbacks are contextually typed.
  - `render.worker.ts` must validate `event.data` once at the worker boundary, narrow to typed worker messages, and route typed payloads to typed handlers.
- DI boundary types:
  - Every service/orchestrator task must define a `Dependencies` type and declare the injected fields it reads. Constructor typing alone does not change the type of `this.foo` on a JavaScript base class.

### Recipe A — Initialized renderer `_state` for WebGL2/WebGPU

Use a single initialized-state object for resources that only exist after `initialize()`. Direct nullable members (`this.gl`, `this.device`, `this.config`, etc.) are the cause of the nullability debt.

Required pattern:

```ts
type RendererState = {
  // exact non-null resources, not broad Record<string, T> when keys are fixed
};

class Renderer {
  private _state: RendererState | null = null;

  private _requireState(): RendererState {
    if (!this._state) {
      throw new Error('Renderer not initialized');
    }
    return this._state;
  }
}
```

Rules:

- Construct resources into locals during `initialize()` and assign `_state` only after all required resources are available.
- Helper methods should accept concrete resources as parameters and return concrete resources instead of mutating nullable fields on `this`.
- Guard nullable browser API returns (`getContext`, `createVertexArray`, `createTexture`, `createFramebuffer`, `createProgram`, `createShader`, `getActiveUniform`, `getCurrentTexture` where applicable) with explicit errors or no-op handling that matches the existing lifecycle.
- `destroy()` should be idempotent: if `_state` is null, return; otherwise tear down the captured state, then set `_state = null`.
- Keep pre-initialization utilities and error flags outside `_state` only when they legitimately exist before initialization.

### Recipe B — Typed catch/error handling

Never access `error.message` or `error?.message` directly in a `catch` block. Use `getErrorMessage()` from Recipe 0. Re-throw the original value only when preserving stack/identity is required; otherwise publish/log the normalized message.

### Recipe C — Typed event-bus subscribers and payload guards

Use the canonical `EventPayloadMap`/`TypedEventBusLike` instead of ad hoc `unknown as Foo` casts.

- For payloads published internally by typed TypeScript code, annotate the callback with the mapped payload type or rely on the typed bus.
- For payloads that can come from JavaScript, workers, browser APIs, or legacy code, guard once at the handler boundary and return/publish an error if invalid.
- If `BaseOrchestrator.subscribeWithCleanup()` remains untyped, introduce a typed wrapper/helper or annotate callbacks with the canonical payload type. Do not use blanket casts.

### Recipe D — Type DI and declared injected fields

For every subclass of `BaseService` or `BaseOrchestrator`:

```ts
type Dependencies = {
  eventBus: TypedEventBusLike;
  loggerFactory: LoggerFactoryLike;
  // every required dependency read by this class
};

export class ExampleService extends BaseService {
  declare protected readonly eventBus: TypedEventBusLike;
  declare protected readonly logger: LoggerLike;
  declare private readonly someDependency: SomeDependencyLike;

  constructor(dependencies: Dependencies) {
    super(dependencies, ['eventBus', 'loggerFactory', 'someDependency'], 'ExampleService');
  }
}
```

Use existing concrete public types when they are already clean. If a concrete class is still debt-heavy, create one shared `*Like` contract in the canonical contract module and reuse it; do not duplicate slightly different structural types in multiple files.

### Recipe E — Explicit service/orchestrator state and parameters

- Declare all mutable service fields with their actual nullable/non-nullable lifecycle type.
- Annotate all method parameters and destructured parameters.
- Prefer named type aliases for repeated shapes (`AudioEnergyOptions`, `GpuRecordingStartOptions`, `RecordingScaleParams`) over inline object literals.
- Replace optional property access on `unknown` with a guard that returns a typed value.

### Recipe F — Own or remove duplicated rendering utilities

`optimization.utils.ts` overlaps with package-owned `@prismgb/gpu` infrastructure. Use the long-term path:

1. Reuse package implementations only through a deliberate public API. Today `@prismgb/gpu` exposes only its top-level public index and does not export `ShaderProgram`, `BindGroupCache`, or `UniformTracker` from that entry point.
2. If package ownership is the right long-term answer, move any local enhancements needed by the worker into `packages/prismgb-gpu`, export them from a supported package surface, update `packages/prismgb-gpu/package.json` exports if a subpath is introduced, rebuild the package so JS and `.d.ts` outputs both exist, and then import from that public surface.
3. If package promotion is not behaviorally equivalent, keep the worker-local implementation and type it fully. Do not import unexported package internals or rely on TypeScript path aliases that the package runtime exports do not support.
4. Keep only genuinely worker-local utilities in `optimization.utils.ts` (for example `TypedArrayPool` and `CaptureBufferManager` if they are not package concerns), with full inline TypeScript signatures and nullable guards.
5. If a local utility remains, type every parameter/return and convert WebGL/WebGPU nullable returns into explicit errors.

## File structure changes

**Create or update foundational contracts:**

- `src/shared/lib/errors/error-guards.ts`
- `src/shared/events/event-payloads.ts` (or equivalent canonical event contract file)
- `src/renderer/infrastructure/streaming/streaming-contracts.ts` (or equivalent canonical renderer streaming contract file)
- `src/renderer/infrastructure/rendering/workers/worker-protocol.config.ts` (typed protocol, not JSDoc-only)

**Modify infrastructure typings:**

- `src/shared/base/service.base.d.ts` / `src/shared/base/orchestrator.base.d.ts` if helper overloads are needed.
- `src/renderer/infrastructure/events/event-bus.class.js` plus `.d.ts` or TS conversion if the typed event bus cannot be expressed from call sites alone.
- `scripts/typecheck-app.js` and `package.json` scripts for explicit allowlist expiry options.
- `src/renderer/infrastructure/services/streaming/gpu-worker-manager.ts` for payload-aware worker response handlers.
- `src/renderer/infrastructure/rendering/workers/render.worker.ts` for typed worker message validation/routing.
- `packages/prismgb-gpu/src/index.ts`, `packages/prismgb-gpu/package.json`, and package utility files only if shared GPU utilities are promoted to the package public API.

**Modify target files and tests:**

- All 13 target/support cluster files.
- Relevant existing Vitest suites under `tests/unit/features/streaming/**`, `tests/unit/features/capture/**`, and `tests/unit/features/devices/**`.
- Add focused worker utility/engine tests if mocks already exist or can be added cleanly (`tests/mocks/webgl-context.mock.js` is already present).

## Task 0: Make the type-debt gate expiry maintainable and unblock CI

**Why first:** The current allowlist is expired, so all CI runs fail before cleanup work can land. The long-term fix is to make expiry an explicit script option, not to periodically edit a hardcoded constant.

**Files:**

- Modify: `scripts/typecheck-app.js`
- Modify: `package.json`
- Modify: `scripts/type-debt-allowlist.json` (regenerated after script change)

- [x] Add CLI support to `scripts/typecheck-app.js`:
  - `--default-expires-on YYYY-MM-DD` for `--write-allowlist`.
  - Validation that the date is ISO formatted and not before today unless an explicit `--allow-expired-write` escape hatch is provided for historical reproduction.
  - Keep existing read/check behavior unchanged.
- [x] Confirm or update `package.json` with a clear script. The repository already has this shape today; keep it aligned with the new CLI option:

  ```json
  "typecheck:app:allowlist": "node scripts/typecheck-app.js --write-allowlist scripts/type-debt-allowlist.json"
  ```

  Usage should pass the expiry explicitly:

  ```bash
  npm run typecheck:app:allowlist -- --default-expires-on 2026-08-14
  ```

- [x] Regenerate once with the 90-day date needed for this cleanup window:

  ```bash
  npm run typecheck:app:allowlist -- --default-expires-on 2026-08-14
  npm run typecheck:app
  jq '[.entries[].expiresOn] | unique' scripts/type-debt-allowlist.json
  ```

  Expected unique expiry: `["2026-08-14"]` and no expired entries.
- [x] Add/update a small test or script-level assertion for date parsing if the repository already has script tests. If not, include manual verification output in the PR.
- [x] Commit on a feature/hotfix branch, not directly to `main`, unless explicitly instructed.

## Task 1: Add shared error, event, streaming, and worker contracts

**Why second:** Most target diagnostics are symptoms of missing contracts. Land the contracts once before per-file fixes.

**Files:** foundational contract files listed above, `src/renderer/infrastructure/services/streaming/gpu-worker-manager.ts`, `src/renderer/infrastructure/rendering/workers/render.worker.ts`, plus any base/event bus typings needed for clean consumption.

- [x] Add `getErrorMessage()`/`isErrorLike()` in `src/shared/lib/errors/error-guards.ts`.
- [x] Add `EventPayloadMap` and `TypedEventBusLike`. The map must be exhaustive across `EventChannels`; use `void`/`undefined` for no-payload channels.
- [x] Add compile-time exhaustiveness tests/types proving there are no `EventChannels` values missing from `EventPayloadMap`.
- [x] Add renderer streaming contracts and guards for payloads currently read as unknown (`PerformanceStatePayload`, `StreamStartedPayload`, `SupportedDeviceAvailablePayload`, `RecordingReadyPayload`, etc.).
- [x] Convert worker protocol constants/functions to exported TS literal types and payload unions; update `createWorkerMessage`, `createWorkerResponse`, and `isValidWorkerMessage` to preserve type information.
- [x] Update `GpuWorkerManager`'s public surface (or add a typed wrapper) so `onMessage(WorkerResponseType.ERROR, handler)` contextually types `handler` with the ERROR payload.
- [x] Type `GpuWorkerManager` constructor dependencies, worker lifecycle fields, command payloads, transferable arrays, and ready promise state so `gpu-worker-manager.ts` has zero allowlist entries.
- [x] Type `render.worker.ts` state, renderer union, capture manager state, message handlers, response payloads, and catch/error handling so worker protocol validation actually protects the worker boundary.
- [x] Verify the new contract modules compile with zero diagnostics:

  ```bash
  npm run typecheck:app
  ```

  If the allowlist is current from Task 0, this should pass; new files and worker-boundary support files must not add allowlist buckets.
- [x] Add focused tests for pure guards (`getErrorMessage`, event payload exhaustiveness, streaming payload guards, worker protocol validators) if no equivalent tests exist.
- [x] Regenerate the allowlist after Task 1 and confirm `worker-protocol.config.ts`, `gpu-worker-manager.ts`, and `render.worker.ts` have zero entries.

## Task 2: `optimization.utils.ts` (45 errors → 0)

**Files:**

- Modify: `src/renderer/infrastructure/rendering/workers/optimization.utils.ts`
- Modify package-owned GPU utilities if local enhancements should move there.
- Modify: `scripts/type-debt-allowlist.json`

**Recipes:** F, B where relevant.

- [x] Decide ownership for each class:
  - Prefer package ownership for `ShaderProgram`, `BindGroupCache`, and `UniformTracker` only if the package implementation plus any promoted local enhancements match current worker behavior.
  - Before importing any of those utilities from `@prismgb/gpu`, add a deliberate package export from `packages/prismgb-gpu/src/index.ts` or a supported subpath export in `packages/prismgb-gpu/package.json`, rebuild the package, and verify both runtime JS and declaration files exist.
  - If local stats/cached-view behavior must stay and is generally useful, move it into `packages/prismgb-gpu` and re-export it rather than maintaining two implementations.
  - If a package export would expose worker-only implementation details, keep the utility local and type it fully.
  - Keep/fully type `TypedArrayPool` and `CaptureBufferManager` locally only if they are worker-specific.
- [x] Type every remaining class field, parameter, return value, and callback. Cover `BindGroupCache`, `TypedArrayPool`, `UniformTracker`, `CaptureBufferManager`, and `ShaderProgram` if any remain in the file.
- [x] Add explicit guards for nullable WebGL returns in `ShaderProgram` if it remains local (`createProgram`, `createShader`, `getActiveUniform`).
- [x] Ensure `Map.get()` and pooled array reads cannot return `undefined` silently; restructure branches or throw invariant errors.
- [x] Run:

  ```bash
  npm run typecheck:gpu
  npm run build --workspace=@prismgb/gpu # only if package exports/utilities changed
  node ./node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit --pretty false 2>&1 | grep "optimization.utils"
  npm run test:run -- tests/unit/features/streaming/rendering/gpu tests/unit/features/streaming/rendering
  npm run test:run -- tests/performance/gpu-optimization.benchmark.test.js
  npm run typecheck:app:allowlist -- --default-expires-on 2026-08-14
  npm run typecheck:app
  ```

- [x] Confirm the file has zero allowlist entries.

## Task 3: `webgl2-renderer.engine.ts` (133 errors → 0)

**Files:**

- Modify: `src/renderer/infrastructure/rendering/workers/webgl2-renderer.engine.ts`
- Modify/add worker engine tests if feasible.
- Modify: `scripts/type-debt-allowlist.json`

**Recipes:** A, F.

- [x] Define exact resource types, for example `WebGL2Programs` with keys `pixelUpscale`, `unsharpMask`, `colorElevation`, and `crtLcd`; do not use a broad `Record<string, ShaderProgram>` if exact keys are known.
- [x] Replace nullable members with `private _state: WebGL2State | null = null` and `_requireState()`.
- [x] Refactor `_createPrograms(gl)` and `_createResources(gl, config)` to return concrete resources. Guard `createVertexArray`, `createTexture`, and `createFramebuffer` results immediately.
- [x] Update `uploadFrame`, `render`, `resize`, and `destroy` to use the required state. `destroy()` must be safe to call before initialization and after prior destruction.
- [x] If using the package-owned `ShaderProgram`, remove the local import from `optimization.utils.ts` and import only from the public package surface added in Task 2; do not import unexported internals.
- [x] Add/adjust tests for initialization failure paths and idempotent `destroy()` using existing WebGL mocks where practical.
- [x] Verify zero diagnostics for this file, regenerate the allowlist, run relevant tests, and confirm the file drops out of the allowlist.

## Task 4: `webgpu-renderer.engine.ts` (44 errors → 0)

**Files:**

- Modify: `src/renderer/infrastructure/rendering/workers/webgpu-renderer.engine.ts`
- Modify/add worker engine tests if feasible.
- Modify: `scripts/type-debt-allowlist.json`

**Recipes:** A, F, B.

- [x] Define exact types for shader modules, pipelines, and uniform buffers instead of `Record<string, ...>`.
- [x] Move initialized GPU resources into `WebGPUState`. Keep pre-init optimization utilities and persistent error metadata outside state only when they are valid before initialization.
- [x] Guard `offscreenCanvas.getContext('webgpu')`; the current code assumes it is non-null.
- [x] Set device lost/uncaptured error handlers after `device` is available. Error reporting must not require `_state` because failures can occur during initialization or destruction.
- [x] Refactor resource/pipeline helpers to accept `device`, `context`, `canvasFormat`, modules, and config explicitly and return concrete state.
- [x] In render paths, check `hasError` first, then call `_requireState()`. Guard intermediate texture indexes or model them as fixed tuples.
- [x] `resize()` should update state atomically and invalidate caches after recreating textures/views; `destroy()` should be idempotent.
- [x] If using package-owned `BindGroupCache` or `UniformTracker`, import only from the public package surface added in Task 2; do not import unexported internals.
- [x] Verify zero diagnostics, regenerate allowlist, and run worker-related tests/smoke checks.

## Task 5: `gpu-renderer.service.ts` (74 errors → 0)

**Files:**

- Modify: `src/renderer/infrastructure/services/streaming/gpu-renderer.service.ts`
- Modify: `src/renderer/infrastructure/services/streaming/gpu-worker-manager.ts` if needed for typed callbacks.
- Modify: relevant GPU renderer tests.
- Modify: `scripts/type-debt-allowlist.json`

**Recipes:** B, C, D, E.

- [x] Add a `Dependencies` type and `declare` fields for `eventBus`, `logger`, `settingsService`, `_frameBuffer`, and `_workerManager` using canonical contracts.
- [x] Declare all mutable state fields with exact types (`_pendingCaptureResolve`, `_pendingCaptureReject`, `_captureTimeoutId`, cached uniforms, capabilities, preset, brightness unsubscribe, message unsubscribers, etc.).
- [x] Type `initialize(canvasElement: HTMLCanvasElement, nativeResolution?: Dimensions): Promise<boolean>`, `renderFrame(videoElement: HTMLVideoElement): Promise<void>`, `setPreset(presetId: string): void`, `resize(width: number, height: number): void`, `captureFrame(): Promise<ImageBitmap>`, and cleanup methods.
- [x] Use typed worker response payloads from Task 1. Replace callback payload property access on `unknown` with typed callbacks or guards.
- [x] Type the brightness subscription as a numeric payload; ignore or log invalid legacy payloads at the boundary instead of assigning unknown to `_globalBrightness`.
- [x] Replace catch logging with `getErrorMessage()`.
- [x] Run/update `tests/unit/features/streaming/rendering/gpu/gpu-renderer.service.test.js` and verify zero diagnostics/allowlist entries for the file.

## Task 6: `render-pipeline.service.ts` (91 errors → 0)

**Files:**

- Modify: `src/renderer/infrastructure/services/streaming/render-pipeline.service.ts`
- Modify relevant render pipeline tests.
- Modify: `scripts/type-debt-allowlist.json`

**Recipes:** B, C, D, E.

- [x] Add `Dependencies` and `declare`d injected fields. Constructor typing alone will not resolve `this.appState`/`this.streamViewService` property reads.
- [x] Use canonical contracts for `StreamingCapabilities`, `Dimensions`, `PerformanceStatePayload`, `IStreamingRenderer`/renderer adapter shape, and renderer factory shape.
- [x] Declare `_currentCapabilities`, `_activeRenderer`, `_activeRendererType`, `_isHidden`, `_performanceModeEnabled`, `_userPresetId`, and `_canvas2dContextCreated` explicitly.
- [x] Annotate all public/private methods. Use `isPerformanceStatePayload()` before reading `state.hidden`.
- [x] Replace catch message handling with `getErrorMessage()` and context-specific fallbacks.
- [x] Avoid `(obj as { x?: T }).x` as a fix. If a property is real, put it in the shared contract; if it is invalid, correct the behavior and update tests.
- [x] Run/update `tests/unit/features/streaming/rendering/render-pipeline.service.test.js`, regenerate allowlist, and verify zero diagnostics for this file.

## Task 7: `audio-pipeline.service.ts` (56 errors → 0)

**Files:**

- Modify: `src/renderer/infrastructure/services/streaming/audio-pipeline.service.ts`
- Modify/add audio pipeline tests if present or create focused tests for warmup/cleanup guards.
- Modify: `scripts/type-debt-allowlist.json`

**Recipes:** B, D, E.

- [x] Add `Dependencies` and `declare`d fields for `eventBus`, `logger`, and `settingsService`.
- [x] Declare all audio lifecycle fields. `_unsubscribeVolume` must be `(() => void) | null` because cleanup sets it to null.
- [x] Add named option/result types, including `AudioEnergyOptions`, and annotate destructured parameters.
- [x] Type `start(stream: MediaStream): Promise<boolean>`, `_startInternal(stream: MediaStream): Promise<boolean>`, `_createAudioContext(trackSampleRate: number | null): AudioContext | null`, `_waitForTrackUnmute(track: MediaStreamTrack, timeoutMs: number, token: number): Promise<AudioWarmupResult>`, `_computeRms(buffer: Uint8Array): number`, `_sleep(durationMs: number): Promise<void>`, etc.
- [x] Guard timer handles before `clearTimeout()` where the handle can be null.
- [x] Replace catch message handling with `getErrorMessage()`.
- [x] Run relevant streaming/audio tests, regenerate allowlist, and verify zero diagnostics for this file.

## Task 8: `streaming.orchestrator.ts` (53 errors → 0)

**Files:**

- Modify: `src/renderer/application/orchestrators/streaming.orchestrator.ts`
- Modify relevant orchestrator tests.
- Modify: `scripts/type-debt-allowlist.json`

**Recipes:** B, C, D, E.

- [x] Add `Dependencies` and `declare`d fields for every required dependency read by the class.
- [x] Use canonical event payload types/guards for `STREAM.STARTED`, `STREAM.STOPPED`, `STREAM.ERROR`, `SETTINGS.RENDER_PRESET_CHANGED`, `PERFORMANCE.RENDER_MODE_CHANGED`, `PERFORMANCE.STATE_CHANGED`, `DEVICE.DISCONNECTED_DURING_SESSION`, `DEVICE.SUPPORTED_DEVICE_AVAILABLE`, `RENDER.CANVAS_EXPIRED`, and no-payload UI command channels.
- [x] Guard `STREAM.STARTED` before destructuring `stream`, `settings`, and `capabilities`.
- [x] Use `getErrorMessage()` for start/stop/render pipeline failures and for UI error events.
- [x] Resolve `TS2532` by checking array/optional values before use; do not silence with non-null assertions unless the value was just proven.
- [x] Run/update `tests/unit/features/streaming/services/streaming.orchestrator.test.js`, regenerate allowlist, and verify zero diagnostics for this file.

## Task 9: `device-media.service.ts` (47 errors → 0)

**Files:**

- Modify: `src/renderer/infrastructure/services/devices/device-media.service.ts`
- Modify relevant device tests.
- Modify: `scripts/type-debt-allowlist.json`

**Recipes:** B, D, E.

- [x] Add `Dependencies` and `declare`d fields for `eventBus`, `logger`, `browserMediaService`, `deviceConnectionService`, `deviceStorageService`, and `deviceChangeDebounceAdapter`.
- [x] Create shared/local contracts for device enumeration results and dependency shapes; do not duplicate incompatible shapes.
- [x] Declare `videoDevices`, `hasMediaPermission`, `_enumerateInFlight`, `_lastEnumerateResult`, `_knownSupportedDeviceIds`, `_permissionProbeInFlight`, and unsubscribe state.
- [x] Type all method parameters/returns, including `_tryGetPermissionForDevice(deviceId: string): Promise<MediaDeviceInfo | null>`, `_cacheAndReturnDevice(device: MediaDeviceInfo): MediaDeviceInfo | null`, `registerSupportedDevice(device: MediaDeviceInfo): boolean`, and `setupDeviceChangeListener(onChange: () => Promise<void> | void): void`.
- [x] Type temporary streams as `MediaStream | null` and stop tracks safely in `finally`.
- [x] Replace catch message handling with `getErrorMessage()`.
- [x] Run/update device service tests, regenerate allowlist, and verify zero diagnostics for this file.

## Task 10: `gpu-recording.service.ts` (39 errors → 0)

**Files:**

- Modify: `src/renderer/infrastructure/services/capture/gpu-recording.service.ts`
- Modify relevant GPU recording tests.
- Modify: `scripts/type-debt-allowlist.json`

**Recipes:** B, D, E.

- [x] Add `Dependencies` and `declare`d fields for `gpuRendererService`, `eventBus`, and `logger`.
- [x] Define `GpuRecordingStartOptions`, `RecordingScaleParams`, and a canonical `GpuRendererServiceLike` in a shared contract module.
- [x] Declare all recording lifecycle fields. `_lastCapturePromise` should be `Promise<ImageBitmap> | null`, not `Promise<unknown> | null`.
- [x] Guard `getContext('2d')`; if it returns null, throw a clear initialization error before setting recording state.
- [x] Type `start(options: GpuRecordingStartOptions): Promise<MediaStream>`, `_calculateRecordingScale(frameWidth: number, frameHeight: number): RecordingScaleParams | null`, `_startRecordingFrameLoop(): void`, and `_cleanupGpuRecording(): void`.
- [x] Use `getErrorMessage()` in frame-capture error logging.
- [x] Run/update `tests/unit/features/capture/services/gpu-recording.service.test.js`, regenerate allowlist, and verify zero diagnostics for this file.

## Task 11: `capture.orchestrator.ts` (37 errors → 0)

**Files:**

- Modify: `src/renderer/application/orchestrators/capture.orchestrator.ts`
- Modify relevant capture orchestrator tests.
- Modify: `scripts/type-debt-allowlist.json`

**Recipes:** B, C, D, E.

- [x] Add `Dependencies` and `declare`d fields for every required dependency.
- [x] Type `_recordingInterrupted` and all method returns.
- [x] Use canonical capture event payload guards before reading `data.error`, `data.blob`, or `data.filename`; type no-payload screenshot/recording command events (`CAPTURE.SCREENSHOT_TRIGGERED`, `UI.SCREENSHOT_REQUESTED`, `UI.RECORDING_TOGGLE_REQUESTED`, and `STREAM.STOPPED`) without dummy payload casts.
- [x] Guard `appState.currentStream` before passing it to GPU recording. Do not pass `MediaStream | null` to APIs that require `MediaStream`.
- [x] Use a typed `StreamingCapabilities` shape (or guard) before reading `currentCapabilities.frameRate`.
- [x] Replace catch message handling with `getErrorMessage()`.
- [x] Run/update `tests/unit/features/capture/services/capture.orchestrator.test.js`, regenerate allowlist, and verify zero diagnostics for this file.

## Task 12: Final ratchet, tests, and smoke verification

- [x] Verify all 13 target/support files have zero allowlist entries:

  ```bash
  jq -r '
    [
      "src/renderer/infrastructure/rendering/workers/webgl2-renderer.engine.ts",
      "src/renderer/infrastructure/rendering/workers/webgpu-renderer.engine.ts",
      "src/renderer/infrastructure/rendering/workers/optimization.utils.ts",
      "src/renderer/infrastructure/services/streaming/render-pipeline.service.ts",
      "src/renderer/infrastructure/services/streaming/gpu-renderer.service.ts",
      "src/renderer/infrastructure/services/streaming/audio-pipeline.service.ts",
      "src/renderer/infrastructure/services/capture/gpu-recording.service.ts",
      "src/renderer/application/orchestrators/streaming.orchestrator.ts",
      "src/renderer/infrastructure/services/devices/device-media.service.ts",
      "src/renderer/application/orchestrators/capture.orchestrator.ts",
      "src/renderer/infrastructure/rendering/workers/render.worker.ts",
      "src/renderer/infrastructure/services/streaming/gpu-worker-manager.ts",
      "src/renderer/infrastructure/rendering/workers/worker-protocol.config.ts"
    ] as $cluster
    | .entries
    | map(select(.file as $f | $cluster | index($f)))
    | length
  ' scripts/type-debt-allowlist.json
  ```

  Expected: `0`.

- [x] Confirm the excluded audio orchestrator remains outside this cluster unless explicitly added:

  ```bash
  jq -r '
    [.entries[] | select(.file == "src/renderer/application/orchestrators/streaming-audio.orchestrator.ts") | .maxCount] | add
  ' scripts/type-debt-allowlist.json
  ```

  Expected before its own cleanup: `10`.

- [x] Confirm overall allowlisted diagnostics dropped by approximately 661:

  ```bash
  jq '[.entries[].maxCount] | add' scripts/type-debt-allowlist.json
  ```

  Expected: about `791`, allowing for incidental fixes outside the cluster.

- [x] Run the verification suite:

  ```bash
  npm run typecheck:gpu
  npm run typecheck:app
  npm run test:run -- tests/unit/features/streaming tests/unit/features/capture tests/unit/features/devices
  npm run test:run -- tests/unit/renderer/infrastructure/events/event-channels.contract.test.js tests/unit/features/streaming/rendering/managers/gpu-worker-manager.class.test.js tests/performance/gpu-optimization.benchmark.test.js
  npm run build:vite
  ```

  Also run `npm run build --workspace=@prismgb/gpu` before app typecheck/build if Task 2 changed `@prismgb/gpu` source or package exports.

  Use `npm run build` only when packaging/electron-builder is required for the PR; `build:vite` is the faster renderer regression check.

- [ ] Manual smoke check:
  1. Launch the app with `npm run dev`.
  2. Start streaming with a real or supported mock device.
  3. Verify GPU initialization, Canvas2D fallback, render-preset switching, performance-mode switching, screenshot capture, and recording start/stop.
  4. Verify cleanup paths: stop stream, disconnect during stream, and close app while recording is inactive/active.

  Partial result: `npm run dev` launched successfully after rebuilding `usb-detection` for Electron 28; main and renderer orchestrators initialized and device enumeration ran. Hardware-dependent stream/capture/record/disconnect paths were not verified because no supported Chromatic device was available in this session.

- [x] Ensure the final PR does not contain:
  - New or increased allowlist buckets.
  - `as any`, `@ts-ignore`, or blanket `unknown as Foo` casts.
  - Deleted behavior used only to satisfy the compiler.
  - A direct push to `main` unless explicitly requested.

## Out of scope

- Retiring the remaining non-cluster type debt after the cluster is clean.
- Replacing the existing DI container wholesale. This plan types the current DI boundary and can introduce helper types, but a broader DI migration should be a separate design.
- Full browser/device E2E automation for every rendering backend. This plan requires targeted unit tests plus manual smoke; deeper E2E coverage should follow as a dedicated testing plan.
- Removing the type-debt gate. The gate is the long-term guardrail and must stay enabled.
