# Codebase Normalization, Deduplication & Hand-Written-Code Reduction Analysis

> Historical note (2026-07-02): file paths in this document predate the P3 workspace collapse — `packages/prismgb-<name>/src/…` now lives at `src/platform/<name>/…`.

**Date:** 2026-07-01
**Branch analyzed:** `refactor/gpu_normalization` (working tree, incl. uncommitted WIP)
**Mandate:** Aggressive options allowed; breaking changes allowed if necessary.
**Method:** Package-by-package exploration (Opus 4.8 @ xhigh agents), findings verified against source before recording. Each finding carries category, LOC impact, risk, and a concrete proposal.

## Scope & Status

| # | Area | Files / LOC | Status |
|---|------|-------------|--------|
| 1 | `@prismgb/core` + `config` + `ipc` + `events` | 29 / ~2,077 | ✅ complete (~−640 to −690 LOC) |
| 2 | `@prismgb/gpu` | 25 / ~3,885 | ✅ complete (~−190 to −280 LOC) |
| 3 | `@prismgb/devices` + `transcode` + `notes` + `updates` | 22 / ~3,545 | ✅ complete (~−300 surgical; ~−500 incl. aggressive ffmpeg swap) |
| 4 | `@prismgb/ui-base` | 12 / ~1,599 | ✅ complete (−250 to −310 LOC surgical; ~−400 aggressive) |
| 5 | `src/main` + `src/preload` + `src/types` | 27 / ~2,349 | ✅ complete (~−340 LOC) |
| 6 | `src/renderer/application` + renderer root + `lib/` | ~21 / ~2,518 | ✅ complete (~−90 to −130 in-area; ~−220 incl. cross-layer stores) |
| 7 | `src/renderer/infrastructure` | 38 / ~6,163 | ✅ complete (~−230 to −260 LOC) |
| 8 | `src/renderer/presentation` | 55 / ~6,715 | ✅ complete (~−265 LOC) |
| 9 | `scripts/` + build & tooling config | 14+ / ~2,620+ | ✅ complete (~−1,050 LOC) |
| 10 | `tests/` (unit, integration, e2e) | 212 / ~37,308 | ✅ complete (~−2,300 to −2,900 LOC) |

**Category legend:** `normalize` (unify inconsistent patterns) · `dedupe` (collapse duplicated logic) · `library` (replace hand-written code with a dependency) · `codegen` (replace hand-written code with generation) · `delete` (dead/unneeded code).

> **Round 2 (added same day, on request):** a second pass of *structural* maximum-aggression options — removing whole layers and planes rather than trimming them — is at the end of this document (§ Round 2). Round-2 choices change which Round-1 waves are worth executing; read the decision-gate note there before starting Wave 3 or Wave 5.
>
> **Round 3 (added same day, on request):** the **framework-maximalist** alternative (§ Round 3) — Spring-Boot-style decorator DI, container-managed lifecycle, `@OnEvent` subscriptions, and AOP decorators, optimizing *hand-written-wiring count* rather than raw LOC. Paths B (Round-2 monolith) and C (Round 3) fork at exactly two decisions: container (delete vs adopt Inversify) and event bus (remove vs annotate). Everything else composes with either.
>
> **➡ DIRECTION CHOSEN: Path C.** The executable north-star plan — phase-by-phase (P0–P13), with dependency graph, risk classes, agent allocation, and gates — is **`NORTH_STAR_DESIGN_PLAN.md`** (repo root). That document is now authoritative for sequencing; this one remains the evidence base its finding IDs point into.

---

## Findings by Area

<!-- Sections appended per-area as exploration completes -->

## Area 1: `@prismgb/core` + `@prismgb/config` + `@prismgb/ipc` + `@prismgb/events`

**Snapshot:**
- **`@prismgb/core`** — 16 src files, ~1,076 LOC. The workspace base-layer: error helpers (`getErrorMessage` et al., defined *inline in `index.ts`*), the `Logger`/type-utility contracts, and 12 `primitives/` classes/utils — DI `Container`, `TypedRegistryFactory`, `PerformanceCache`/`AnimationCache`, `DisposableBag`, `BaseService`, `BaseOrchestrator`, `ConsoleLoggerFactory`, plus `safe-disposer`/`async`/`guards`/`string`/`timing` helper modules.
- **`@prismgb/config`** — 4 src files, ~143 LOC. Static, device-agnostic app config: a frozen `appConfig`/`uiConfig` object validated once by a Zod schema (`config-loader.utils.ts`), the `TIMING` constant bag, and the `UpdateState` enum.
- **`@prismgb/ipc`** — 3 src files, ~169 LOC. Cross-process contract surface: `IPC_CHANNELS` string constants (main→renderer push channel names) and `preload-api.contract.ts`, a bag of request/response + payload interfaces shared by the tRPC router and renderer services.
- **`@prismgb/events`** — 7 src files, ~783 LOC (incl. a 94-line manifest JSON). The event system: `SharedEventBus` (eventemitter3 wrapper), the `EventChannels`/`MainEventChannels` constant trees and the `EventPayloadMap` typing — all keyed off a hand-maintained `event.manifest.json` (78 events) with runtime + compile-time drift guards.

**Top opportunities:**
- **Codegen the events manifest** (largest): `event-channels.ts` + `main-event-channels.ts` + the hand-written `EventPayloadOverrides`/`VoidEventChannel`/drift-check in `event-payloads.ts` re-encode data already in `event.manifest.json` (which even carries an unused `payload` column). Generating them removes ~300 hand-written LOC (net ~−150 to −200 after a ~100-LOC generator).
- **Delete two genuinely-dead core primitives**: `performance-cache.utils.ts` (204 LOC; `AnimationCache` is registered in DI but injected/called nowhere, `PerformanceCache` has 0 consumers) and `TypedRegistryFactory` (75 LOC; 0 production consumers, test-only). ~−280 src LOC + ~−64 test LOC.
- **Boundary-preserving cleanups**: hoist the 4 near-identical `tsconfig.json`/`vite.config.ts` pairs to a shared preset (~−120), dedupe the 7 byte-identical IPC↔events payload interfaces (~−40), and replace `createDeferred` with `Promise.withResolvers` (~−24).

### Prior-audit reconciliation (the "dead primitive layer" claim), per primitive

The claim (Bus/Cache/Store/Pipeline/Validator/Factory/Container, ~227 LOC, 0 consumers) is **partly stale, partly still true, and wrong on the headline**:

| Primitive | Verdict | Evidence |
|---|---|---|
| Bus / Store / Pipeline / Validator | **File absent** — no such files in `primitives/`. Likely relocated, not just deleted (a "Bus" now lives as `SharedEventBus` in `@prismgb/events`). | `packages/prismgb-core/src/primitives/` contains none of these |
| Cache (`PerformanceCache`) | **DEAD** — 0 production consumers | only referenced as `AnimationCache`'s base within the same file |
| Factory (`TypedRegistryFactory`) | **DEAD** — 0 production consumers (test-only) | refs only in `index.ts`, its own file, and `tests/unit/packages/core/typed-registry.test.ts` |
| **Container** | **ALIVE** — the headline refutation | `src/main/application/container.ts:7,49` and `src/renderer/application/container.ts:1` both `new Container()` from `@prismgb/core` |

### EVT-1 Codegen the event manifest; drop the hand-maintained channel/payload mirrors
- **Category:** codegen
- **Files:** `packages/prismgb-events/src/event-channels.ts:34-155` (`CODEBASE_RENDERER_EVENT_CHANNELS` block), `packages/prismgb-events/src/main-event-channels.ts:10-45`, `packages/prismgb-events/src/event-payloads.ts:217-329` (`CODEBASE_EVENT_PAYLOAD_MAP` + `VoidEventChannel` + runtime drift-check + `AssertNever`), source-of-truth `packages/prismgb-events/src/event.manifest.json`
- **LOC impact:** ~−150 to −200 net (~−300 hand-written, +~100 generator)
- **Risk / Breaking:** med / no (values byte-identical if generated from the same manifest)
- **Evidence:** The `CODEBASE_*:START/END` markers imply generation, but **no generator script exists** (grep for the markers across `scripts/` finds only the two source files themselves). `EventChannels` is 78 hand-written `getRendererChannel('domain','name')` calls whose only job is to re-look-up the manifest at runtime and `throw` on drift (`event-channels.ts:22-31`). `event-payloads.ts:298-311` runs a second runtime drift-check, and `EventPayloadOverrides` (lines 220-272) hand-restates the exact `payload` strings already in `event.manifest.json` (e.g. manifest `"payload": "DeviceInfoPayload | null | undefined"` == override map entry). Crucially, `.payload` is the **unexploited seam**: `event-channels.ts` reads the manifest for *name* validation, but **nothing reads `.payload`** (grep confirms 0 reads) — it exists only to mirror the TS map by hand.
- **Proposal:** Add `scripts/generate-events.js` (a peer of the existing manifest-driven scripts) that emits `event-channels.ts`, `main-event-channels.ts`, and the `EventPayloadOverrides`/`VoidEventChannel` block from `event.manifest.json`. The generator makes the two runtime drift-checks and the `AssertNever` exhaustiveness types redundant (they exist *because* the mirror is hand-kept), so they delete too.

### CORE-1 Delete `PerformanceCache` / `AnimationCache` (dead)
- **Category:** delete
- **Files:** `packages/prismgb-core/src/primitives/performance-cache.utils.ts:1-204` (whole file), export at `packages/prismgb-core/src/index.ts:78`, DI registration `src/renderer/application/di/service-registrations.ts:113` (`animationCache: () => new AnimationCache()`) + import at line 1
- **LOC impact:** ~−205 src (no dedicated test file exists)
- **Risk / Breaking:** low / no
- **Evidence:** `PerformanceCache` has **0 refs outside core/src**. `AnimationCache` is instantiated only at `service-registrations.ts:113`, but grepping `animationCache` across all of `src/renderer` returns *only that registration line* — no service lists it as a dependency and no `this.animationCache`/`cradle.animationCache` access exists; every `AnimationCache` method (`registerAnimation`, `cancelAnimation`, `cancelAllAnimations`, …) has 0 callers. The `container.test.ts` comment "`canvasRenderLoopService -> animationCache`" is stale (no `canvasRenderLoop*` service exists). So the entire 204-LOC generic LRU/TTL cache is dead weight kept alive by one unconsumed provider.
- **Proposal:** Delete the file + export + DI provider. Touch-ups: `tests/integration/streaming.test.js` (instantiates `AnimationCache` directly) and the `animationCache`-token assertions in `container.test.ts`/`manual-providers.test.ts`.

### CORE-2 Delete `TypedRegistryFactory` (dead)
- **Category:** delete
- **Files:** `packages/prismgb-core/src/primitives/typed-registry.ts:1-75` (whole file), export `packages/prismgb-core/src/index.ts:65-66`, test `tests/unit/packages/core/typed-registry.test.ts` (64 LOC)
- **LOC impact:** ~−77 src, ~−141 incl. test
- **Risk / Breaking:** low / no
- **Evidence:** After filtering `dist/`, the only refs to `TypedRegistryFactory` are its own definition, the `index.ts` re-export, and its test file. **Zero production consumers.** This is the "Factory" primitive the prior audit flagged — that half of the claim is correct.
- **Proposal:** Delete file, exports (`TypedRegistryFactory`, `RegistryFactory`, `RegistryEntry`), and test. If a future keyed-factory need arises it can be reintroduced with a real consumer.

### NORM-1 Hoist duplicated `tsconfig.json` / `vite.config.ts` to a shared preset
- **Category:** normalize
- **Files:** `packages/prismgb-{core,config,ipc,events}/tsconfig.json` and `.../vite.config.ts` (8 files)
- **LOC impact:** ~−120 across the four packages
- **Risk / Breaking:** low / no
- **Evidence:** All four `tsconfig.json` are identical except `types` (`["vite/client"]` vs ipc's `["vite/client","electron"]`) and core's extra `experimentalDecorators`/`emitDecoratorMetadata`. All four `vite.config.ts` are the same lib-build boilerplate differing only in `name`, and the `external` array. Two dead-config sub-findings: (a) core's `experimentalDecorators`/`emitDecoratorMetadata` are now **vestigial** — `@Service` has 0 uses repo-wide and core exports no `Service` value, so no decorator syntax exists anywhere; (b) `packages/prismgb-config/vite.config.ts` externalizes `'joi'` while the code imports **zod** (`config-loader.utils.ts:8`) — a stale external.
- **Proposal:** Add `packages/tsconfig.base.json` and a `vite.lib-config.ts` factory (`makeLibConfig({ name, external })`); each package's config shrinks to an `extends` + a 3-line override. Drop the decorator flags and the `joi` external in the process.

### IPC-2 Dedupe the 7 byte-identical payload interfaces shared by `@prismgb/ipc` and `@prismgb/events`
- **Category:** dedupe
- **Files:** `packages/prismgb-ipc/src/preload-api.contract.ts:16-45` vs `packages/prismgb-events/src/event-payloads.ts:5-45`
- **LOC impact:** ~−40
- **Risk / Breaking:** low / no
- **Evidence:** `UpdateInfoPayload`, `UpdateProgressPayload`, `UpdateErrorPayload`, `TranscodeProgressPayload`, `TranscodeCompletedPayload`, `TranscodeCancelledPayload`, `TranscodeErrorPayload` are defined **verbatim** in both packages (diffed `UpdateProgressPayload` and the two are identical field-for-field). Both are real: `src/main/ipc/router.ts` imports them from `@prismgb/ipc`; the events package uses its own copies in `EventPayloadOverrides`.
- **Proposal:** Pick one owner and re-export. Cleanest is to have `@prismgb/ipc` import these from `@prismgb/events` (ipc already depends on `@prismgb/config` + `@prismgb/devices`; adding `@prismgb/events` keeps the dependency direction sane since events is lower-level contract data). Note the honest-negative below on the *channel constants*, which are NOT a clean dedupe.

### CORE-3 Replace `createDeferred` with `Promise.withResolvers`
- **Category:** library (ES built-in)
- **Files:** `packages/prismgb-core/src/primitives/async.utils.ts:16-24` + export `index.ts:76-77`; 12 consumers
- **LOC impact:** ~−24 (the helper), consumers become one-liners
- **Risk / Breaking:** low / no
- **Evidence:** `createDeferred` returns `{ promise, resolve, reject }` — exactly `Promise.withResolvers()` (ES2024). Runtime supports it: Electron ^41.6.1 ships Node 22 (main) and Chromium 138 (renderer), both of which have `Promise.withResolvers`.
- **Proposal:** Delete `async.utils.ts`; replace call sites with `Promise.withResolvers<T>()`. Caveat: bump TS `lib` to `ES2023`+/`ESNext` (packages currently `target: ES2022`) for the typecheck to see it, or keep the `Deferred<T>` type alias only.

### CORE-4 Adopt `type-fest` for the generic type utilities
- **Category:** library
- **Files:** `packages/prismgb-core/src/types/type-utils.ts:6-13`
- **LOC impact:** ~−10
- **Risk / Breaking:** low / no
- **Evidence:** `ValueOf` (6 consumers) and `UnionToIntersection` (3 consumers) are the standard definitions, present verbatim in `type-fest` (not currently a dependency). `LeafValues` and `AssertNever` are bespoke to the manifest exhaustiveness checks — keep those.
- **Proposal:** Add `type-fest` as a dep; re-export `ValueOf`/`UnionToIntersection` from it (or import at call sites), retaining `LeafValues`/`AssertNever` locally.

### CORE-5 Relocate error helpers out of the barrel; delete dead `formatErrorLabel`
- **Category:** normalize + delete
- **Files:** `packages/prismgb-core/src/index.ts:8-48`
- **LOC impact:** ~−6 (dead `formatErrorLabel`), ~0 net for the relocation
- **Risk / Breaking:** low / no
- **Evidence:** `index.ts` is the only package barrel that also **defines runtime logic** — 40 LOC of `ErrorLike`/`isErrorLike`/`getErrorMessage`/`formatErrorLabel` live in the barrel itself, whereas config/ipc/events keep `index.ts` a pure re-export barrel. `formatErrorLabel` has **0 refs anywhere** (dead). `isErrorLike` is exported but used only internally by `getErrorMessage` (its export is unnecessary). `getErrorMessage` itself is canonical and healthy (46 consumers, no rival impl in `src/` — see negatives).
- **Proposal:** Move the error helpers to `primitives/error.utils.ts` and re-export from the barrel (matching every other module's convention); delete `formatErrorLabel`; stop exporting `isErrorLike` unless a consumer appears.

### EVT-3 Consolidate the triplicated `isPromiseLike`
- **Category:** dedupe
- **Files:** `packages/prismgb-core/src/primitives/disposable-bag.ts:20-23`, `packages/prismgb-events/src/event-bus.ts:11`, plus a third `_isPromiseLike` in `src/renderer/infrastructure/services/settings/settings.service.ts`
- **LOC impact:** ~−6 net
- **Risk / Breaking:** low / no
- **Evidence:** Identical `value is Promise<void>` thenable guard defined three times.
- **Proposal:** Export one `isPromiseLike` (or `isThenable`) from core `guards.utils.ts` and import it in all three sites. (Dependency direction is fine: events and the renderer already depend on core.)

### NORM-2 Re-format `event-bus.ts` to match workspace style
- **Category:** normalize
- **Files:** `packages/prismgb-events/src/event-bus.ts` (whole file)
- **LOC impact:** ~0 (readability, not reduction)
- **Risk / Breaking:** low / no
- **Evidence:** Alone among these packages, `event-bus.ts` is written in an ultra-dense one-statement-per-clause style (interfaces collapsed onto single lines, multi-statement lines at 34/37/47/52). Every other file is conventionally formatted. If Prettier/ESLint were enforced on `packages/**`, this file would be the outlier.
- **Proposal:** Run the workspace formatter over `packages/**` (verify these packages are actually included in the lint/format globs — core is the only one with a `lint` script).

### Honest negatives (looked reducible, but don't collapse)

- **`IPC_CHANNELS` vs `EventChannels` is only a *partial* overlap, not a clean dedupe.** `tests/unit/packages/ipc/channel-parity.test.ts` asserts equality for the device/update/transcode push channels — but `IPC_CHANNELS` also carries request/response channels with **no** `EventChannels` equivalent (`SHELL.OPEN_EXTERNAL`, `GPU.GET_POLICY`, `LOGIN_ITEM.*`, `PERFORMANCE.GET_METRICS`, `WINDOW.SET_FULLSCREEN`, `TRANSCODE.START/CANCEL/GET_STATUS`), and `WINDOW.RESIZED` **deliberately diverges** (`window:resized` ≠ `EventChannels.UI.WINDOW_RESIZED`, asserted by the parity test). Treat only the 7 payload *interfaces* (IPC-2) as a clean dedupe; the channel constants are a documented, intentional partial overlap.
- **`@prismgb/ipc` is NOT vestigial post-tRPC.** `IPC_CHANNELS` is consumed by `main/ipc/router.ts`, `window.service.ts`, `device-integration.service.ts`, and the updates/transcode packages (push-channel names for tRPC subscriptions), and the contract types are the shared request/response surface for `router.ts`/`trpc.ts` + renderer services. It stays.
- **`@prismgb/config` earns its package boundary.** 19 consumers spanning **main + renderer + sibling packages** (updates, ipc) — it cannot be inlined into either process without recreating a shared dep. Verdict: keep the package. But `config-loader.utils.ts` is a **misnomer under the repo's own naming rules** — it loads nothing (no file/env I/O); it's a static frozen object plus a one-shot Zod validation. Rename to `app-config.ts` (or split the schema into `app-config.schema.ts`).
- **Core `EventBusLike` vs events `IEventBus`/`TypedEventBusLike` is a *deliberate* structural dup, not removable.** Three overlapping bus-shape interfaces exist (`service.base.ts:10-15`, `event-bus.ts:9`, `event-payloads.ts:341-345`), but core is the base layer and **cannot import `@prismgb/events`** without inverting the dependency graph — so `EventBusLike` must remain a hand-kept structural mirror. This is the correct trade-off given the layering; flag it, don't "fix" it.
- **The two `EventBus` subclasses (main + renderer) diverge meaningfully.** `src/main/infrastructure/events/event-bus.ts` passes only `loggerFactory`; `src/renderer/.../event-bus.class.ts` additionally wires `handlerErrorEvent` + `createHandlerErrorPayload`. They are thin, correct adapters over `SharedEventBus`, not duplicates — leave them.
- **`getErrorMessage` / disposal utilities are clean.** No rival `getErrorMessage`, `escapeHtml`, `throttle`, `debounce`, or id-generator implementation exists anywhere in `src/` (category B is genuinely near-empty for the core utils — they are the single canonical home, which is the intended design). `DisposableBag`, `BaseService`, `BaseOrchestrator`, `SharedEventBus`, `Container`, `getErrorMessage`, `escapeHtml`, `generateEntityId`, `isRecord/isNumber/isString` are all live and well-consumed.

**Aggressive-flattening note (labeled, not recommended lightly):** `DisposableBag` (169 LOC) could in principle migrate toward the ES2023 `Symbol.dispose`/`using` protocol (no `using` usage exists in the repo today), but it adds convenience surface (`addEvent`/`addTimeout`/`addInterval`/`replaceManaged`/`AggregateError` fan-in) that `using` alone doesn't cover, and it has real consumers via `BaseService`/`BaseOrchestrator` — so this is a rewrite, not a deletion. Flag as a future direction, not a near-term reduction.

## Area 2: `@prismgb/gpu`

**Snapshot:** 25 source files / ~3,885 LOC (20 `.ts` + 5 `.wgsl`; 4,332 incl. shaders). A self-contained WebGPU rendering package that upscales/filters GBC video frames through an ordered multi-pass pipeline. Module map: **domain/** (`types`, `uniforms` logical uniform shapes, `pass-specs` typed pass registry + byte layouts, `presets` frozen preset map, `errors`); **application/** (`catalog` preset lookup, `passes` pass-plan/enablement engine, `uniform-builder`, `renderer.service` backend selection+fallback, `video-session` the app-facing session facade); **infrastructure/** (`pipeline-controller` owns shared state, delegates to a `RenderDriver` — `webgpu.driver` and `canvas.driver`; `capabilities.browser`/`capabilities.worker`; `shaders` glob loader + 5 WGSL); **worker/** (`protocol` typed message contract, `client`, `service`, `worker-entry`); three entrypoints (`index`, `runtime`, `testkit`). Just refactored (controller+drivers, explicit present pass, WebGL2 removed, typed pass-specs).

**Top opportunities:**
- Collapse the identity-mapping uniform `source` layer + `_padding` bookkeeping in `pass-specs.ts`/`passes.ts`/`webgpu.driver.ts` (no new dependency): **~−90 to −130 LOC**.
- Collapse the triple-layer `RenderPipeline → WorkerRendererPipeline → WorkerRenderer` forwarding in `worker/service.ts`: **~−50 to −70 LOC**.
- Contract the over-broad public surface (dead re-exports, test-only catalog builders, unused `./testkit` public entrypoint): **~−40 to −60 LOC**.

### GPU-1 Uniform packing has an identity-mapping indirection layer + hand-maintained byte offsets
- **Category:** dedupe / library
- **Files:** `src/domain/pass-specs.ts:5-14` (`UniformValueSource`), `:39-52` (`WebGpuUniform*` layout types), `:73-79` (`field`/`constant`), `:88-96,111-118,127-138,157-167` (`webgpuUniformLayout` member arrays incl. `_padding`); `src/application/passes.ts:77-105` (`readUniformSourceValue`/`readFiniteNumber`/`readFiniteNumberPair`); `src/infrastructure/webgpu.driver.ts:18-25,113-168` (`WebGpuUniformLayout`, `normalizeWebGpuUniformLayout`, `writeWebGpuUniformMember`, `buildWebGpuUniformDataBuilder`, `compileWebGpuPassState`).
- **LOC impact:** ~−90 to −130
- **Risk / Breaking:** med / no (internal). De-risked by the existing golden byte-packing test at `tests/unit/domain/pass-specs.test.ts:32-60`.
- **Evidence:** Every non-padding member's `source` is an **identity** map: e.g. `{ name: 'inputSize', ..., source: field('upscale', 'inputSize') }` — `source.uniformBlock === pass.uniformBlock` and `source.uniformField === member.name` for all real fields across all four passes; the only non-identity sources are `constant(0)` padding members (`_padding`, `_padding1..3`). So `UniformValueSource`, `field()`, `constant()`, and `readUniformSourceValue` exist only to re-express `state.uniforms[pass.uniformBlock][member.name]`. The `_padding` members write literal 0 into a `new Float32Array(...)` that is already zero-initialized (`webgpu.driver.ts:151`). This is a third parallel definition of each struct (the first two being `domain/uniforms.ts` TS interfaces and the WGSL `struct XUniforms`).
- **Proposal:** **Primary (no dependency):** delete the `source`/`field`/`constant` layer and the `_padding` members; keep each member as `{ name, type, offsetBytes }` and have the packer write `block[member.name]` at `offsetBytes/4` (vec2 writes two lanes). This is provably safe because pass-spec member names already equal `PipelineUniforms` keys, and it reproduces the golden packing (`upscale → [11,12,13,14,15,0]`) unchanged. **Aggressive variant:** adopt `webgpu-utils` (`makeShaderDataDefinitions(wgsl)` + `makeStructuredView(defs.uniforms.X).set(block)`), making the WGSL struct the single source of truth and deleting the offset/`byteLength` bookkeeping entirely. Caveat: `webgpu-utils` matches **by field name**, and the WGSL names have drifted (`pixel-upscale.wgsl` declares `sourceSize`/`targetSize` vs `PipelineUniforms.upscale.inputSize`/`outputSize`), so this variant additionally requires renaming the WGSL fields, and introduces the package's first runtime dependency (weigh against the known `build:vite` worker double-bundling issue). WGSL uses its own uniform address-space layout rules (not std140).

### GPU-2 `worker/service.ts` wraps the pipeline in two redundant forwarding layers
- **Category:** dedupe / normalize
- **Files:** `src/worker/service.ts:34-43` (`WorkerRendererPipeline` type), `:45-59` (`WorkerRenderer` type), `:65-112` (`createWorkerRendererPipeline`), `:129-164` (`createRenderer`).
- **LOC impact:** ~−50 to −70
- **Risk / Breaking:** med / no (internal)
- **Evidence:** `createWorkerRendererPipeline` builds a `WorkerRendererPipeline` object whose seven methods are near-pure pass-throughs to the `RenderPipeline` it just created (`render: (s) => renderer.renderFrame(s)`, `resize: (w,h) => renderer.resize(w,h)`, `captureFrame: () => renderer.captureFrame()`, `dispose: () => renderer.dispose()`, `setPreset`, `setBrightness`, `getStats`). `createRenderer` then wraps *that* in a `WorkerRenderer` whose methods forward again to `workerRenderer.pipeline.X` (`render → pipeline.render`, `captureFrame → pipeline.captureFrame`, `getStats → pipeline.getStats`, `release → pipeline.dispose`). The only behavior these wrappers add beyond forwarding is two field writes: `setPreset` sets `activePreset` and `resize` sets `config.scaleFactor`. `RenderPipeline` (from `renderer.service.createGpuRenderer`) already exposes exactly this interface.
- **Proposal:** Have `startWorkerRendererService` hold the `RenderPipeline` directly (plus `config` and the `activePreset` module variable it already keeps), calling `renderer.renderFrame/resize/captureFrame/setPreset/setBrightness/getStats/dispose` inline. Delete both wrapper types and both factory functions; keep the single `isWorkerRenderBackend(renderer.backend)` guard. `handleSetBrightness` (`:309`) already reaches through `renderer.pipeline.setBrightness` — after the collapse it calls `renderer.setBrightness` on the pipeline.

### GPU-3 Public surface still exports symbols with zero app consumers
- **Category:** delete / normalize
- **Files:** `src/index.ts:9-30`, `src/runtime.ts:14-27`, `src/testkit.ts:1`, `src/application/catalog.ts:4-50` (`freezePreset`, `createShaderPresetCatalog`, `getAllPresets`), `packages/prismgb-gpu/package.json:16-19` + `scripts/check-gpu-package-boundaries.js:15` (`EXPECTED_GPU_EXPORTS`).
- **LOC impact:** ~−40 to −60
- **Risk / Breaking:** low / no
- **Evidence:** Whole-repo grep of app `src/`+`tests/` (excluding the package) shows the app consumes only: `PRESET_POLICY`, `getUiPresets`, `resolvePreset`, `RenderCapabilities` (from `index`), and `createGpuVideoRendererSession`, `detectBrowserGpuCapabilities`, `GpuVideoRendererSession`, `GpuVideoRendererStats` (from `runtime`). Zero app consumers for `index`'s `getRendererDefaultPreset`, `PresetPolicy`, `ShaderPresetCatalog`, `RenderPresetSummary`, `RenderPipeline`, `RenderPipelineConfig`, `RenderStats`, `RenderBackend`, `RenderCanvas`, `RenderPreset`, `WebGPULimits`, `RecoverableBackendInitializationError`, nor for `runtime`'s `GpuVideoRendererSessionOptions`/`GpuVideoRendererError` (and its 9-type re-export block duplicates `index`'s). `@prismgb/gpu/testkit` is imported by **no** app/test file — package tests import `@/testkit/fixtures` directly, so `src/testkit.ts` (barrel) and the `./testkit` public entrypoint are unconsumed surface. `createShaderPresetCatalog` (`catalog.ts:16-44`, ~28 LOC), `getAllPresets`, and `freezePreset` are referenced only by `catalog.test.ts` (and `index.root-safety.test.ts` asserts they are *not* exported) — dead extensibility with no producer.
- **Proposal:** Drop the unconsumed `index`/`runtime` re-exports (keep `index` = the 4 consumed symbols; demote `getRendererDefaultPreset` to internal since only `video-session`/`fixtures` use it). Delete `src/testkit.ts` + the `./testkit` export + its tsconfig/vitest aliases — but note this is **coupled**: `check-gpu-package-boundaries.js` hard-requires `EXPECTED_GPU_EXPORTS = ['.', './runtime', './testkit']` and the surface tests (`index.root-safety.test.ts`, `runtime/export-surface.test.ts`) lock the exact surface, so all must change together. Delete `createShaderPresetCatalog`/`getAllPresets`/`freezePreset` unless a user-supplied-catalog producer is actually planned. **Tension:** this narrowing partly conflicts with the repo's anti-YAGNI "keep extensibility seams" philosophy and the recent "contract root public API" commit already did one pass — flag for owner decision rather than assume.

### GPU-4 Present pass rebuilds its bind group every frame while effect passes cache theirs
- **Category:** normalize
- **Files:** `src/infrastructure/webgpu.driver.ts:471-483` (`present`) vs `:39-79` (`BindGroupStore.getOrCreate`) / `:432-469` (`renderPass`).
- **LOC impact:** ~0 (net; small add to cache, removes per-frame alloc)
- **Risk / Breaking:** low / no
- **Evidence:** Effect passes obtain their bind group through `this.bindGroupStore.getOrCreate(...)` (cached, invalidated on resize via `bindGroupStore.invalidate()`). `present()` calls `this.device!.createBindGroup({ label: 'Present BindGroup', ... })` unconditionally on every `renderFrame` (`:476`), even though its two inputs — the final intermediate texture view and `linearSampler` — only change on resize/release. Same job (build a bind group), two inconsistent mechanisms, and a per-frame GPU allocation the cache pattern exists to avoid.
- **Proposal:** Cache the present bind group (memoize on the present source view; invalidate in `resize()`/`releaseResources()` alongside `bindGroupStore.invalidate()`), or route present through `BindGroupStore` with a present-specific 2-entry key so both bind-group sites share one construction/caching path.

### GPU-5 Thin alias/wrapper indirection and an obfuscated method-name lookup
- **Category:** normalize
- **Files:** `src/domain/pass-specs.ts:64` (`RenderPassDefinition = RenderPassSpec`), `src/infrastructure/webgpu.driver.ts:18` (`WebGpuUniformMember = WebGpuUniformMemberSpec`), `src/application/passes.ts:107-109` (`getRenderPassEnablement` returns `pass.enabledWhen`) & `:177-183` (`isRenderPassEnabled` calls `pass.isEnabled`), `webgpu.driver.ts:37,259-262` (`CREATE_NATIVE_RENDER_PIPELINE_ASYNC`), and `webgpu.driver.ts:449-450` (index→texture→`indexOf`→index round-trip).
- **LOC impact:** ~−10 to −20
- **Risk / Breaking:** low / no
- **Evidence:** `RenderPassDefinition` and `WebGpuUniformMember` are pure `= X` aliases of a single other type. `getRenderPassEnablement(pass)` is a one-line `return pass.enabledWhen` wrapper; `isRenderPassEnabled` wraps `pass.isEnabled(...)`. `CREATE_NATIVE_RENDER_PIPELINE_ASYNC = ['create', 'Render', 'PipelineAsync'].join('')` builds the literal string `'createRenderPipelineAsync'` at runtime (and the test at `webgpu.driver.test.ts:13` repeats the identical trick) — a repo-wide grep finds **no** boundary/lint gate that forbids the literal `createRenderPipeline`, so the obfuscation has no discoverable enforcement reason. In `renderPass`, `resolvePlanTargetTexture(step.target)` returns `intermediateTextures[index]`, then the method immediately does `intermediateTextures.indexOf(outputTexture)` to recover the same index for `intermediateTextureViews[index]`.
- **Proposal:** Inline the two type aliases and the two enablement wrappers at their single call sites. Replace the array-join with a direct `device.createRenderPipelineAsync(...)` call (or a plain named constant) unless a concrete reason surfaces — treat as "simplify pending justification," not confirmed cruft, given the mirrored trick in the test. Pass the plan target **index** through so `renderPass` uses `intermediateTextureViews[index]` directly instead of the texture→`indexOf` round-trip.

### Honest negatives (checked, not worth changing)
- **Capability detection is not reinventing anything:** `capabilities.browser.ts` uses the standard `navigator.gpu.requestAdapter()` → `adapter.requestDevice()` → `device.limits` queries; there is no library that would shrink it. `capabilities.worker.ts` (21 LOC) serves a distinct worker context and shouldn't be merged with the browser detector.
- **No hand-rolled TS matrix/color math exists:** all color/geometry math (`rgb2hsv`/`hsv2rgb`, gamma, barrel distortion) lives in WGSL and is not replaceable by a JS library; the only TS math is `calculateScaleFactor` (`uniform-builder.ts:13`, three `Math` calls) — not worth a dependency.
- **Presets are already a plain frozen const map** (`presets.ts`), not registry machinery — good. (The `catalog` parameter threaded through 7 lookup functions is intentional future-first extensibility; see GPU-3 for the one dead builder.)
- **The ping-pong render-pass plan and the controller/driver split were just refactored and are clean** — `createRenderPassPlan`/`RenderDriver`/`PipelineController` need no normalization.
- **`worker/protocol.ts` (363 LOC) looks large but is a legitimate typed message contract** with exhaustive runtime guards; a schema library (e.g. Zod) could generate the guards, but that duplicates the app's separate IPC stack and adds a runtime dep to a zero-dep package — not recommended here.
- **`capability-detector.utils.ts` (renderer side) composes a GPU-policy overlay on top of the package detector** — it does not duplicate package logic.

## Area 3: `@prismgb/devices` + `@prismgb/transcode` + `@prismgb/notes` + `@prismgb/updates`

**Snapshot:**

| Package | Files (src) | ~LOC | Role |
|---|---|---|---|
| `@prismgb/devices` | 11 TS + 1 JSON | ~1,577 | Capture-device domain. A JSON `catalog.json` (one device: ModRetro Chromatic) normalized into frozen `DeviceDescriptor`s (`domain/catalog.ts`), USB/label matching (`domain/matching.ts`), payload mappers (`domain/payloads.ts`), a native-`usb`-module hotplug monitor with a Noop fallback (`infrastructure/usb.monitor.ts`), a `BaseService` connection reconciler (`application/connection.service.ts`), and a `testkit` fixture generator. Consumed by both renderer and main. |
| `@prismgb/transcode` | 7 TS | ~1,198 | Main-process ffmpeg transcoding. `TranscodeService` (`BaseService`) manages jobs/sessions and maps process events to IPC; `TranscodeProcess` (`EventEmitter`) wraps `child_process.spawn` with progress parsing/cancellation; `ffmpeg-path.utils` resolves ffmpeg/ffprobe binaries; `transcode-temp.utils` manages temp sessions; `transcode.config` holds format→ffmpeg-args tables. Split barrels: `index` (renderer-safe config) vs `service` (node/native). |
| `@prismgb/notes` | 2 TS | ~293 | Single renderer-side `NotesService` (`BaseService`): CRUD over notes persisted as JSON via an injected `storageService`, an in-memory cache, and an `indexOf`-based "fuzzy" search. Consumed only by the renderer. |
| `@prismgb/updates` | 3 TS | ~477 | Main-process app updates. `UpdateService` (`BaseService`) wraps `electron-updater`'s `autoUpdater` into a state machine + IPC bridge with auto-check scheduling; `UpdateBridge` is a thin init/dispose coordinator. |

**Top opportunities:**
- **Replace hand-rolled ffmpeg process wrapper + collapse duplicate binary resolvers** (TRC-1 + TRC-2): ~−260 LOC of spawn/progress/error-parsing and near-identical binary-path functions.
- **Eliminate re-declared core interfaces and duplicated helpers** (X-1, X-2, X-3, DEV-2, UPD-2): the "future-first" packages each re-invent `LoggerFactoryLike`/`EventBusLike`/`StorageServiceLike`, `deepFreeze`, an electron-app accessor, `_notifyRenderer`, and `MainEventChannels` that already exist in `@prismgb/core`/`@prismgb/events`: ~−135 LOC.
- **Delete dead abstraction + dead members** (UPD-1, DEV-1, NOTE-1, dead deps): `UpdateBridge` indirection, the identical `DeviceInfoPayload` type + its identity mapper, unused `eventBus`/`interrupted`/`!storageService` branches: ~−110 LOC.

### TRC-1 Replace hand-rolled `TranscodeProcess` with fluent-ffmpeg
- **Category:** library (aggressive)
- **Files:** `packages/prismgb-transcode/src/transcode-process.ts:1-310` (whole file); call site `packages/prismgb-transcode/src/transcode.service.ts:198-264`
- **LOC impact:** ~−190 (310 → ~120)
- **Risk / Breaking:** med / no (internal; public service API unchanged)
- **Evidence:** `TranscodeProcess` hand-rolls `spawn(ffmpegPath, args)` (`transcode-process.ts:145`), a stdout `-progress pipe:1` line parser `_parseProgressLine` (`:203-228`), a stderr heuristic error extractor `_extractErrorMessage` (`:236-260`), SIGTERM-then-SIGKILL cancellation (`:265-281`), and a completion-promise. `probeDuration` (`:28-82`) similarly hand-spawns ffprobe. `fluent-ffmpeg` provides `.on('progress')`, `.on('error')`, `.on('end')`, `.kill('SIGTERM')`, and `ffprobe(cb)` out of the box.
- **Proposal:** Use `fluent-ffmpeg`: build the command with `.input(inputPath).outputOptions(formatConfig.ffmpegArgs).save(outputPath)`, wire the four events. Use `Ffmpeg.ffprobe()` for duration. **Two honest caveats:** (a) fluent-ffmpeg is maintenance-stalled — accept the dependency risk deliberately; (b) its progress is parsed from stderr `time=`, a precision regression from the current `out_time_us` via `-progress pipe:1`. Note: it does **not** resolve binary paths — you still call `Ffmpeg.setFfmpegPath()/setFfprobePath()` from the resolver in TRC-2, so `ffmpeg-path.utils.ts` and `transcode-temp.utils.ts` stay. If the precision/maintenance risk is unacceptable, skip this and keep TRC-2/TRC-3 only.

### TRC-2 Collapse near-duplicate `getFfmpegPath` / `getFfprobePath` into one parameterized resolver
- **Category:** dedupe
- **Files:** `packages/prismgb-transcode/src/ffmpeg-path.utils.ts:40-107` (`getFfmpegPath`) vs `:113-192` (`getFfprobePath`)
- **LOC impact:** ~−70
- **Risk / Breaking:** low / no
- **Evidence:** The two functions are structurally identical: env-var override → packaged `app.asar.unpacked/node_modules/<pkg>` path → non-unpacked fallback → `require('<static-pkg>')` → `process.cwd()` manual path → `resolveSystemBinary()` → throw. Only the package name (`ffmpeg-static` vs `ffprobe-static`), the exported-path shape (`require('ffmpeg-static')` is the path itself vs `ffprobe-static.path`), and ffprobe's extra `bin/<platform>/<arch>/` subpath differ.
- **Proposal:** One `resolveStaticBinary({ executable, staticModule, resolvePackagePath, subpath })` driving both. Keep `getFfmpegPath`/`getFfprobePath` as one-line wrappers to preserve the API.

### X-1 Stop re-declaring `@prismgb/core` interfaces in every package
- **Category:** normalize / dedupe
- **Files:** `packages/prismgb-notes/src/notes.service.ts:21-24` (`StorageServiceLike`); `packages/prismgb-updates/src/update.bridge.ts:15-24` (`LoggerFactory`+`Logger`); `packages/prismgb-updates/src/update.service.ts:27-33` (`WindowService`,`EventBus`); `packages/prismgb-transcode/src/transcode.service.ts:76-89` (inline `loggerFactory`/`windowService` structural types); `packages/prismgb-transcode/src/transcode-temp.utils.ts:25-27` (`Logger`)
- **LOC impact:** ~−40
- **Risk / Breaking:** low / no
- **Evidence:** `@prismgb/core` already exports `LoggerLike`, `LoggerFactoryLike`, `EventBusLike`, and `StorageServiceLike` (`service.base.ts:3-25`, re-exported from core index). Yet `notes.service.ts:21-24` locally re-declares `StorageServiceLike` (missing `removeItem`) while already importing from `@prismgb/core`; `update.bridge.ts:15-24` re-declares a full `Logger`/`LoggerFactory` pair; `update.service.ts` and `transcode.service.ts` inline their own `{ create(name): {...} }` logger shapes. `connection.service.ts:14` already does it right (`import type { LoggerFactoryLike }`), proving the canonical form exists.
- **Proposal:** Canonical form: import `LoggerFactoryLike`/`LoggerLike`/`EventBusLike`/`StorageServiceLike` from `@prismgb/core`; delete the local copies. Caveat for notes: core's `StorageServiceLike` adds `removeItem` — widening the required contract, so verify the injected renderer storage impl provides `removeItem` before swapping (the notes service itself never calls it).

### DEV-1 `DeviceInfoPayload` is identical to `DeviceInfo`; `toDeviceInfoPayload` is an identity copy; optional-field copying is hand-rolled
- **Category:** dedupe (aggressive on the type-merge; boundary-preserving alt given)
- **Files:** `packages/prismgb-devices/src/domain/types.ts:155-164` (`DeviceInfo`) vs `:174-183` (`DeviceInfoPayload`); `packages/prismgb-devices/src/domain/payloads.ts:10-70` (`toDeviceInfo`/`toDeviceInfoPayload`/`toDeviceStatusPayload`); `packages/prismgb-devices/src/application/connection.service.ts:76-111` (`toObservedUsbDevice`)
- **LOC impact:** ~−50
- **Risk / Breaking:** low / no
- **Evidence:** `DeviceInfo` and `DeviceInfoPayload` have byte-identical field lists (`id,name,manufacturer,vendorId,productId` + optional `locationId,deviceAddress,serialNumber`), so `toDeviceInfoPayload` (`payloads.ts:34-56`) is a 22-line identity copy. `toObservedUsbDevice` (`connection.service.ts:76-111`) is 35 lines of `if (x !== undefined) obj.x = x`. The package **already has** the generic tool: `catalog.ts:85-89` defines `compactRecord = Object.fromEntries(entries.filter(([,v]) => v !== undefined))`, unused outside catalog.
- **Proposal:** Boundary-preserving: keep both types (deliberate domain-type vs wire-payload split) but make `toDeviceInfoPayload` return `{ ...info }`, and replace the manual optional-copy blocks in `toObservedUsbDevice`/`toDeviceInfo` with a shared `pruneUndefined` helper (promote `compactRecord`). Aggressive: alias `type DeviceInfoPayload = DeviceInfo` and drop the mapper entirely.

### UPD-1 Collapse `UpdateBridge` — 53-line indirection that does two method calls
- **Category:** delete
- **Files:** `packages/prismgb-updates/src/update.bridge.ts:1-53` (whole file); DI token `src/main/application/container.ts:70` (`updateBridgeService`); barrel `packages/prismgb-updates/src/index.ts:8`
- **LOC impact:** ~−53
- **Risk / Breaking:** med / yes (removes the `updateBridgeService` DI token; `app.orchestrator.ts` must call the two methods itself)
- **Evidence:** `UpdateBridge` extends `BaseService` (pulling in logger/disposables it never references) solely to run `updateService.initialize()` + `updateService.startAutoCheck(3600000)` in `initialize()` and forward `dispose()`. It also carries the dead local `Logger`/`LoggerFactory` interfaces from X-1. It adds no behavior beyond hard-coding the 1-hour interval.
- **Proposal:** Move the `initialize()`+`startAutoCheck(3_600_000)` pair into `AppOrchestrator` (or default the interval inside `UpdateService.initialize()`), delete the file and the `updateBridgeService` registration.

### TRC-3 De-duplicate temp-session cleanup and remove the dead logger parameter
- **Category:** dedupe / delete
- **Files:** `packages/prismgb-transcode/src/transcode-temp.utils.ts:101-116` (`cleanupSession`) vs `:123-168` (`cleanupAllSessions`); callers `transcode.service.ts:271,310,380`
- **LOC impact:** ~−25
- **Risk / Breaking:** low / no
- **Evidence:** The `if (fs.existsSync(dir)) fs.rmSync(dir, {recursive,force})` + `logger?.error(...) : console.error(...)` block is written three times. The `existsSync` guard is redundant with `{ force: true }` (which no-ops on missing paths). The `logger: Logger | null = null` parameter and its `Logger` interface (`:25-27`) are **dead**: all three call sites pass no logger, so only the `console.error` branch is ever reachable.
- **Proposal:** Extract `removeDir(path)`; drop the `logger` param + `Logger` interface + `console.error` fallback (or route through the service logger, but callers currently don't).

### X-2 Duplicated electron-app / `createRequire` accessor across four files
- **Category:** dedupe
- **Files:** `packages/prismgb-updates/src/update.service.ts:15-25` (`getApp`); `packages/prismgb-transcode/src/ffmpeg-path.utils.ts:14-26` (`require` + `checkIsPackaged`); `packages/prismgb-transcode/src/transcode-temp.utils.ts:44-57` (`getTempBaseDir`); `packages/prismgb-transcode/src/transcode.service.ts:173-181` (inline downloads-dir require)
- **LOC impact:** ~−25
- **Risk / Breaking:** low / no
- **Evidence:** Each independently does `createRequire(import.meta.url)` → `require('electron')` → `try { app… } catch { os fallback }`. `getApp` (updates), `checkIsPackaged` (ffmpeg-path), `getTempBaseDir` (temp), and the inline block at `transcode.service.ts:173-181` are the same lazy-optional-electron pattern.
- **Proposal:** A single `@prismgb/core` helper `getElectronApp(): App | null` (and/or `getElectronPath(name, osFallback)`) reused by all four. Boundary note: this adds an electron-aware accessor to core — acceptable since core is already the shared main/renderer layer.

### DEV-2 `deepFreeze` (and `cloneJson`) duplicated within `@prismgb/devices`
- **Category:** dedupe
- **Files:** `packages/prismgb-devices/src/domain/catalog.ts:60-70` vs `packages/prismgb-devices/src/testkit/fixtures.ts:30-40`
- **LOC impact:** ~−18
- **Risk / Breaking:** low / no
- **Evidence:** Both files define a byte-identical `deepFreeze<T>`. `@prismgb/core` exports many primitives (`DisposableBag`, `throttle`, `escapeHtml`…) but **not** `deepFreeze`/`cloneJson`, so the recursive-freeze logic was copied.
- **Proposal:** Add `deepFreeze` (and optionally `cloneJson`) to `@prismgb/core` primitives; import in both sites. Serves the future-first goal (one canonical immutability primitive).

### X-3 `_notifyRenderer` copied verbatim between `UpdateService` and `TranscodeService`
- **Category:** dedupe
- **Files:** `packages/prismgb-updates/src/update.service.ts:247-253` vs `packages/prismgb-transcode/src/transcode.service.ts:349-355`
- **LOC impact:** ~−12
- **Risk / Breaking:** low / no
- **Evidence:** Both are `try { this.windowService.send(channel, data) } catch (error) { this.logger.warn('Failed to notify renderer', { channel, error: (error as Error).message }) }` — identical modulo the optional-chaining `?.`.
- **Proposal:** A small `WindowNotifier`/`safeSend(windowService, logger, channel, data)` helper in core or main-shared, injected/used by both services.

### UPD-2 `UpdateService` re-declares `MainEventChannels` that `@prismgb/events` already exports
- **Category:** dedupe
- **Files:** `packages/prismgb-updates/src/update.service.ts:64-68`; canonical `packages/prismgb-events/src/main-event-channels.ts:15-16`
- **LOC impact:** ~−8
- **Risk / Breaking:** low / no
- **Evidence:** `update.service.ts` declares `const MainEventChannels = { UPDATE: { STATE_CHANGED: 'update:state-changed' } }` — an exact copy of `@prismgb/events` `MainEventChannels.UPDATE.STATE_CHANGED = 'update:state-changed'`. The sibling `device-integration.service.ts:4` already imports `MainEventChannels` from `@prismgb/events`, proving the canonical import path.
- **Proposal:** `import { MainEventChannels } from '@prismgb/events'`; delete the local literal.

### X-4 The `DeviceInfo` shape is defined three times (2 TS interfaces + 1 Zod schema) with no drift guard
- **Category:** normalize
- **Files:** `packages/prismgb-devices/src/domain/types.ts:155-164` + `:174-183`; `src/main/ipc/schemas/device.schemas.ts:10-21` (`deviceInfoSchema`)
- **LOC impact:** ~0 (drift-safety, not deletion)
- **Risk / Breaking:** low / no
- **Evidence:** `deviceInfoSchema` re-encodes the same 8 fields in Zod. Because the dependency direction is `devices → main` (main imports devices, not vice-versa), a full single-source-of-truth needs codegen or a shared schema package — out of scope for a low-risk change.
- **Proposal:** Actionable low-risk step: annotate `deviceInfoSchema` with `satisfies z.ZodType<DeviceInfoPayload>` (importing the type from `@prismgb/devices`) so any future field drift fails compilation. Full dedup (z.infer as source, or generated schema) is the aggressive option.

### DEV-3 / TRC-4 / NOTE-1 Dead members
- **Category:** delete
- **Files:** `packages/prismgb-transcode/src/transcode.service.ts:80` (`eventBus: unknown` dep — never read; ctor `:107-110` ignores it) and `:43` (`interrupted?: boolean` in `TranscodeOptions` — never destructured/used); `packages/prismgb-notes/src/notes.service.ts:267-272` (`_saveNotes` `if (!this.storageService)` branch — `storageService` is a required ctor dep assigned at `:42`, never null)
- **LOC impact:** ~−12
- **Risk / Breaking:** low / no
- **Evidence:** Grep confirms `eventBus` appears only at `transcode.service.ts:80` and `interrupted` only at `:43`. Notes' constructor requires `storageService` and assigns it unconditionally, so the guarded no-storage branch is unreachable.
- **Proposal:** Delete all three.

### X-5 Services re-implement `BaseService.timeout`/`interval` (keyed-timer gap)
- **Category:** normalize
- **Files:** `packages/prismgb-updates/src/update.service.ts:360,369`; `packages/prismgb-transcode/src/transcode.service.ts:339`; base helpers `packages/prismgb-core/src/primitives/service.base.ts:83-99`
- **LOC impact:** ~−10 (only if BaseService is extended)
- **Risk / Breaking:** low / no
- **Evidence:** `BaseService` offers `timeout()`/`interval()` that register into `disposables`; grep shows **zero** uses across all four packages. Instead they hand-roll `setTimeout`/`setInterval` + `disposables.replace(SYMBOL, …)`. **Honest caveat:** not a drop-in — `stopAutoCheck` and the job-TTL cleanup need *keyed* cancel/replace, which the base helpers don't provide (they return an anonymous disposer).
- **Proposal:** Add a keyed variant to `BaseService` (`schedule(key, fn, ms)` / `cancelScheduled(key)`) and route these three sites through it; otherwise accept the local pattern. Low/medium value — don't treat as a free win.

### Honest negatives (asked, and justified — do not flag)
- **`@prismgb/updates` does NOT hand-roll electron-updater.** `UpdateService` is a legitimate thin wrapper: it delegates checking/downloading/installing to `autoUpdater` and only adds app-specific concerns electron-updater doesn't provide — IPC fan-out, a UI-facing `UpdateState` machine, platform-404 suppression (`_isPlatformNotFoundMessage`, `update.service.ts:226-228`), and **auto-check scheduling** (there is no built-in scheduler). Keep it.
- **`@prismgb/devices` does NOT hand-roll USB polling.** `usb.monitor.ts` uses the native `usb` module's event-driven `attach`/`detach` hotplug (`:44-47,129`), not a poll loop; `navigator.mediaDevices` is renderer-only and inapplicable to this main-process package. The hint's suggested replacements don't apply.
- **`UsbMonitor` interface earns its abstraction.** It has two real implementations (`NodeUsbMonitor` + `NoopUsbMonitor` for headless/CI, `:93,173`) **and** is the injected test seam (`DeviceConnectionDependencies.usbMonitor?`, `connection.service.ts:35,125`). This is a justified split, not one-impl-with-no-double.
- **`transcode/service.ts` naming** is the documented `/service` subpath barrel (keeps node/native deps out of the renderer bundle, `service.ts:1-8`). Weak/cut — not a real violation.
- **`@prismgb/notes` fuzzy search / package boundary:** `_fuzzyScore` (`:260-265`) is a 5-line `indexOf` scorer; swapping to `fuse.js` adds a dependency for marginal gain — optional at best. The 293-LOC single-service package boundary is defensible under the future-first philosophy; folding it back into `renderer/infrastructure/services/notes` is available as an aggressive flattening option but yields no LOC and loses a seam.

## Area 4: `@prismgb/ui-base`

**Snapshot:** 12 files / 1,599 LOC (9 impl files = 1,550 LOC; barrels + `vite-env.d.ts` = 49). A hand-rolled, framework-agnostic presentation toolkit for the vanilla-DOM renderer (no React). Module map: `reactive/` — a bespoke signals runtime (`signal.ts`) + 5 DOM-binding helpers (`dom-bindings.ts`); `lifecycle/presentation-component.base.ts` — a `DisposableBag` facade base class every UI component extends; `template/template-ref.helpers.ts` — `data-ref`/`data-action` attribute query/delegation glue; `widgets/` — four hand-written ARIA widget controllers (disclosure/popover, listbox-dropdown, combobox/autocomplete, activity-auto-hide) + `listbox.utils.ts`. Consumer surface is real and wide: ~30 `src/renderer/presentation` files + 6 state stores + `ui-setup.orchestrator` + `app-state`; `PresentationComponent` and the `reactive` barrel are the load-bearing exports.

**Top opportunities:**
- **Replace the hand-rolled signals runtime** (`signal.ts`, 96 LOC) with `@preact/signals-core` — API is a near-exact 1:1 (`signal`/`computed`/`effect`/`.value`/`.peek()`). Consumer-transparent. **~−90 LOC.**
- **Collapse the triplicated `DisposableBag` facade** — `PresentationComponent` re-implements the same `timeout`/`interval`/`animationFrame`/`track`/`replaceManaged`/`cancelManaged` wrappers already in core's `BaseService` and `BaseOrchestrator`. Extract one shared host in core. **~−60 LOC in ui-base** (plus more across the boundary).
- **Replace `calculateAnchoredDisclosureLayout`** (73 LOC of pure positioning math) with `@floating-ui/dom` middleware, plus delete dead exports/types. **~−80 LOC combined.**

Boundary-preserving total: roughly **−250 to −310 LOC**. Aggressive (UIB-8, full `lit` adoption): removes the entire ~330-LOC reactivity+lifecycle scaffold but trades widget code for library config; net widget savings are modest.

### UIB-1 `PresentationComponent` is a third copy of the core `DisposableBag` facade
- **Category:** dedupe
- **Files:** `packages/prismgb-ui-base/src/lifecycle/presentation-component.base.ts:47-141` vs `packages/prismgb-core/src/primitives/service.base.ts:83-104` and `packages/prismgb-core/src/primitives/orchestrator.base.ts:88-111`
- **LOC impact:** ~−60 (ui-base local; more across the three classes)
- **Risk / Breaking:** med / no (internal refactor; `PresentationComponent` API unchanged)
- **Evidence:** All three base classes independently wrap the same `DisposableBag`. `timeout`/`interval`/`animationFrame` are byte-for-byte equivalent to `BaseService:83-104`; `track`/`replaceManaged`/`replaceManagedAsync`/`cancelManaged` are byte-for-byte equivalent to `BaseOrchestrator:97-111`. Note one genuine divergence to preserve: `listen` differs by layer — `BaseService.listen` (`service.base.ts:59`) is event-bus, `PresentationComponent.listen` (`presentation-component.base.ts:29`) is DOM `addEventListener`.
- **Proposal:** Extract a `ManagedLifecycleHost` in `@prismgb/core` owning the DisposableBag facade (the timer/frame/track/replace/cancel methods). `BaseService`, `BaseOrchestrator`, and `PresentationComponent` compose it; each keeps its own `listen` variant + domain-specific bits (`PresentationComponent` retains `createLifecycleToken`, `replaceTimeout`, `replaceAnimationFrame`, `trackSubscription`, `onDisposeError`, `observe`).

### UIB-2 Hand-rolled signals runtime → `@preact/signals-core`
- **Category:** library
- **Files:** `packages/prismgb-ui-base/src/reactive/signal.ts:1-96` (whole file); consumed via `reactive/index.ts:1-2` by 12+ files (stores in `presentation/state/*`, `app-state.ts:3`, all `bind*` sites)
- **LOC impact:** ~−90 (delete impl; keep a re-export from `reactive/index.ts`)
- **Risk / Breaking:** low for consumers / no — but med for the package's own test suite
- **Evidence:** `signal.ts` exports `signal`, `computed`, `effect`, `ReadonlySignal`, `Signal` with `.value` getter/setter and `.peek()` — an exact subset of `@preact/signals-core` (`signal()`, `computed()`, `effect()`, `batch()`, `untracked()`, `Signal` class, `.value`/`.peek()`). The library is strictly better: glitch-free diamond resolution, lazy `computed`, and `batch()`, none of which the hand-rolled version has. One behavioral delta: hand-rolled `computed` is **eager** (`signal.ts:83-88` immediately runs an effect that writes a signal) vs preact's **lazy** — transparent to `bind*(el, computed(...))` consumers, but `packages/prismgb-ui-base/tests/unit/reactive/signal.test.ts` has 9 `toHaveBeenCalledTimes` assertions and an explicit "runs effects eagerly and re-runs synchronously" test (`signal.test.ts:5,58-66`) that are coupled to the hand-rolled re-run timing and must be rewritten to preact semantics.
- **Proposal:** `npm i @preact/signals-core`; make `reactive/index.ts` re-export `signal, computed, effect` and the `Signal`/`ReadonlySignal` types from it. Delete `signal.ts`. Rewrite `signal.test.ts` (or delete it — the library is externally tested).

### UIB-3 `calculateAnchoredDisclosureLayout` → `@floating-ui/dom`
- **Category:** library
- **Files:** `packages/prismgb-ui-base/src/widgets/disclosure.class.ts:79-175` (the pure calculator + `toFiniteNumber`/`clamp`/`normalizeAnchoredLayoutSizes` helpers); one consumer `src/renderer/presentation/features/notes/notes-panel-layout.component.ts:66`
- **LOC impact:** ~−55 net (remove ~95 LOC of math; add ~15 LOC middleware config + the shim keeps a thin wrapper)
- **Risk / Breaking:** med / no — architecture shifts pure→async/DOM-coupled
- **Evidence:** The function reimplements anchored-popover positioning: place right-of-anchor with `gap`, flip to dock-below when `availableWidth < minWidth` (`disclosure.class.ts:127-136`), clamp within `safeEdge` viewport insets (`145-164`), and constrain min/max width+height. This is precisely `computePosition(anchor, panel, { placement: 'right-start', middleware: [offset(gap), flip(), shift({ padding: safeEdge }), size({ apply: clamp maxWidth/maxHeight }) ] })` + `autoUpdate`. Honest caveat: `computePosition` is async and reads live `getBoundingClientRect`, whereas the current function is pure and unit-tested (`disclosure.test.ts:12-`); and the bespoke `minDockedVisibleHeight`/`minFittableHeight` floors (`disclosure.class.ts:138-160`) do not map 1:1 onto `flip`/`size` and would need a small custom middleware. Keep this finding lower-confidence than UIB-2.
- **Proposal:** Adopt `@floating-ui/dom` for placement; retain a thin `AnchoredDisclosureLayout` adapter only if the docked-height floors prove necessary.

### UIB-4 Duplicate type definitions (`EventTargetLike` ×3, `{ warn }` logger ×3)
- **Category:** dedupe
- **Files:** `EventTargetLike` — `packages/prismgb-core/src/primitives/disposable-bag.ts:12-15` (exported), redefined at `presentation-component.base.ts:8-19` and `activity-auto-hide.controller.ts:3-14`. `PresentationPrimitiveLogger = { warn(...) }` — redefined at `disclosure.class.ts:47-49`, `listbox-dropdown.class.ts:9-11`, `combobox-listbox.class.ts:6-8`
- **LOC impact:** ~−25
- **Risk / Breaking:** low / no
- **Evidence:** `presentation-component.base.ts` already imports `Disposable`/`DisposableFunction`/`DisposableKey` from `@prismgb/core` (`:1-6`) but redefines `EventTargetLike` locally instead of importing the exported one two files over. The three `PresentationPrimitiveLogger` shapes are identical and are a strict subset of core's exported `LoggerLike` (`service.base.ts:3-8`).
- **Proposal:** Import `EventTargetLike` from `@prismgb/core` (delete 2 copies); replace the three `PresentationPrimitiveLogger` with a single import of `LoggerLike` (or one shared local alias).

### UIB-5 Inconsistent widget construction + lifecycle conventions
- **Category:** normalize
- **Files:** `disclosure.class.ts:207-222` and `listbox-dropdown.class.ts:74-91` (explicit `this.x = x`) vs `combobox-listbox.class.ts:84-89` and `:236-240` (`Object.assign(this, {...})`) vs `activity-auto-hide.controller.ts:48-66` (private `_`-prefixed fields). Lifecycle: elements passed to the **constructor** (disclosure, listbox-dropdown) vs to **`initialize()`** (`combobox-listbox.class.ts:92`, `activity-auto-hide` via `enable()`)
- **LOC impact:** ~−10 (mostly consistency, not raw reduction)
- **Risk / Breaking:** low / no
- **Evidence:** Four widgets, three different field-assignment styles and two different "when are DOM elements supplied" contracts. The `declare` + `Object.assign`/explicit-assign split also makes the DI/field-mirror shape inconsistent (combobox uses `Object.assign(this, {...})` at `:84`; disclosure hand-assigns each at `:208-219`).
- **Proposal:** Pick one canonical form — explicit typed field assignment in the constructor, DOM elements supplied at construction (disclosure/listbox-dropdown pattern) — and migrate combobox + activity-auto-hide. Enumerated deviators above.

### UIB-6 Repeated ad-hoc disposer-array idiom
- **Category:** normalize
- **Files:** `disclosure.class.ts:337`, `listbox-dropdown.class.ts:152`, `activity-auto-hide.controller.ts:92` — all three build a local `Array<() => void>` and tear down with `disposers.splice(0).reverse().forEach((d) => d())` inside a `replaceManaged(SYMBOL, ...)`
- **LOC impact:** ~−10
- **Risk / Breaking:** low / no
- **Evidence:** Identical grouped-listener disposal pattern hand-written three times, each pairing a private `Symbol` lifecycle key with the same splice/reverse teardown.
- **Proposal:** Add `PresentationComponent.replaceManagedGroup(key, disposers)` that owns the reverse-teardown, so widgets just push into a returned collector. Removes the idiom triplication and the per-widget `Symbol` boilerplate.

### UIB-7 Dead exports and one dead method
- **Category:** delete
- **Files:** `template/template-ref.helpers.ts` + `index.ts:33-44`; `presentation-component.base.ts:79-81`; `listbox.utils.ts` export in `index.ts:30`
- **LOC impact:** ~−20
- **Risk / Breaking:** low / no
- **Evidence:** Verified by grep across `src` + `tests` (excluding the ui-base package and the renderer re-export shim `template-ref.utils.ts`). Not uniform — three distinct cases:
  - `createTemplateActionSelector` — **zero** internal or external use → delete the function + export entirely.
  - `TEMPLATE_REF_ATTRIBUTE` / `TEMPLATE_ACTION_ATTRIBUTE` — no consumer uses them, but they are used internally by `createTemplateRefSelector`/`getTemplateAction` → **drop the export**, keep the consts.
  - `updateListboxActiveState` — no external `src` consumer (only `listbox-dropdown.class.ts:169` internally + a direct unit test) → **drop from `index.ts`**, keep the internal function.
  - `PresentationComponent.replaceManagedAsync` (`presentation-component.base.ts:79-81`) — **zero** call sites in `src`/`tests` → dead protected method, delete.
  (Also note the renderer's `src/renderer/presentation/primitives/template-ref.utils.ts:3-31` is a pure pass-through re-export of ui-base's template helpers; once the dead ones are pruned it can re-export only `createTemplateRefSelector`/`getTemplateAction`/`getTemplateActionTarget`/`bindTemplateRefs`.)

### UIB-8 Aggressive alternative — replace the hand-rolled reactivity+lifecycle base with `lit`
- **Category:** library
- **Files:** subsumes `reactive/signal.ts` (96), `reactive/dom-bindings.ts` (88), `lifecycle/presentation-component.base.ts` (148), `template/template-ref.helpers.ts` (74) = ~406 LOC of framework scaffold; blast radius ≈ 40 consumer files (all `presentation/**` components + effects + stores + `ui-setup.orchestrator.ts` + `app-state.ts`)
- **LOC impact:** removes ~330–400 LOC of hand-rolled scaffold, but re-adds lit template/directive code at call sites — **net negative but modest on the widgets**, and it rewrites every consumer
- **Risk / Breaking:** high / yes
- **Evidence:** The package is, in aggregate, a miniature framework: a signals runtime (UIB-2), a `ReactiveElement`-style disposal/lifecycle base (UIB-1), lit-html-style `bind*` directives (`dom-bindings.ts:26-88`), and a query-refs system (`template-ref.helpers.ts` — lit offers `@query`/`ref()`). `lit` (`ReactiveElement` + `lit-html` + `@lit-labs/signals` or `@preact/signals-core`) covers all four concerns with a maintained, tested implementation.
- **Proposal:** Only worthwhile if the deferred React/PrimeReact "P4" is abandoned in favor of Web Components. Otherwise prefer the surgical wins (UIB-1/2/3/7), which capture most of the reduction at a fraction of the blast radius. **Honest negative:** the four `widgets/` ARIA controllers (disclosure/listbox/combobox keyboard nav, roving tabindex, `aria-activedescendant`) have no clean vanilla drop-in replacement — headless combobox/listbox libs (Headless UI, Downshift, Ariakit) are React-bound. That ARIA logic is defensibly hand-rolled; only its *positioning* math (UIB-3) and *reactivity* substrate (UIB-1/2) are cleanly replaceable.

## Area 5: `src/main` + `src/preload` + `src/types`

**Snapshot:** 23 TS files / ~2,291 LOC in `src/main`, 1 file / 25 LOC in `src/preload`, 3 `.d.ts` / 33 LOC in `src/types`. The main process boots via `index.ts` (Electron app lifecycle, single-instance lock, GPU flags, macOS menu, quit-cleanup) → `app-bootstrap.ts` (`MainBootstrap` owns the container + orchestrator) → `application/container.ts` (hand-registration onto the `@prismgb/core` `Container` primitive) → `application/app.orchestrator.ts` (`AppOrchestrator extends BaseOrchestrator`, resolves + wires every service). `infrastructure/` holds window, tray, login-item, device-integration, event-bus, gpu-policy, and the winston logger factory. `ipc/` is the post-tRPC surface: `trpc.ts` (initTRPC + `resultEnvelope`), `router.ts` (8 sub-routers, ~30 procedures), `ipc-handler.registry.ts` (electron-trpc transport + per-request context), `event-bridge.ts` (in-process push fan-out), `test-control.port.ts`, and `schemas/` (7 Zod files). `src/preload` inlines electron-trpc's `exposeElectronTRPC`. `src/types` is ambient `.d.ts`.

Two premises corrected up front: (1) `scripts/generate-di.js` no longer exists — both main and renderer containers are now manual hand-registration onto the core `Container`, so there is no codegen for main to "reuse"; (2) there are no leftover hand-rolled IPC channel enums/contracts/preload globals in main — the tRPC migration is clean. The old-IPC residue is smaller and subtler (dead event bus, ported preload validators as Zod).

**Top opportunities:**
- Replace winston `MainLogger` (169 LOC) with `electron-log` behind the same `LoggerFactoryLike` interface: net ~−110 LOC + drop the `winston` dependency (MAIN-1).
- Collapse repeated `resultEnvelope` failure-mappers in `router.ts` and the repeated `{ success, ... }` / `.passthrough()` envelope patterns in `schemas/`: ~−75 LOC combined (MAIN-2, MAIN-4).
- Delete dead code: the unconsumed main `EventBus` publish-sink (~−30 main + cross-package), the dead `{ value }` override envelope in both containers (~−20), dead `PlatformInfo` fields (~−15), redundant cast + empty `.d.ts` (~−11): ~−75 LOC of pure removal.

### MAIN-1 winston `MainLogger` → `electron-log`
- **Category:** library
- **Files:** `src/main/infrastructure/logging/logger.factory.ts:1-169`
- **LOC impact:** ~−110 (net; 169 → ~40-line adapter, interface preserved)
- **Risk / Breaking:** med / no
- **Evidence:** `winston` appears in exactly one file repo-wide (grep confirmed). The class hand-rolls: dynamic `await import('electron')` app-path resolution with try/catch fallback (lines 13-20, 74-106), console+file transports with manual `fs.mkdirSync` and 5MB/5-file rotation (65-106), and a 47-line hand-written adapter (121-168) mapping `LoggerLike` methods onto a winston child logger (including the `Error → {error, stack}` shaping). The whole `winston` dependency exists only to serve the `LoggerFactoryLike` interface (`create(context): LoggerLike`). The renderer, by contrast, uses `@prismgb/core`'s `ConsoleLoggerFactory` — so main is the only winston consumer.
- **Proposal:** `electron-log` (`main` package) is purpose-built for this: it resolves `app.getPath('logs')`, does file rotation (`transports.file.maxSize`), console coloring, and scoped loggers (`log.scope(context)`) out of the box. Implement `MainLogger implements LoggerFactoryLike { create(context) { const s = log.scope(context); return { debug: s.debug, info: s.info, warn: s.warn, error: s.error }; } }`. Keep the `LoggerFactoryLike`/`create(context)→LoggerLike` contract the DI graph depends on, so nothing downstream changes. Deletes the winston transport config, path resolution, mkdir/fallback, and rotation logic. Note: `electron-log`'s error-object handling differs slightly from the current `{error, stack}` meta shaping — verify the two error-log tests still pass.

### MAIN-2 `router.ts` repeated failure-envelope closures
- **Category:** normalize / dedupe
- **Files:** `src/main/ipc/router.ts:100-311` (~12 procedures); helper site `trpc.ts:91-100`
- **LOC impact:** ~−50
- **Risk / Breaking:** low / no
- **Evidence:** ~12 procedures repeat the identical error branch: `(error) => { ctx.logger.error('Failed to X:', error); return { success: false, error: errorMessage(error) } as T; }` (shell openExternal 150-153, window setFullScreen 166-169, update checkForUpdates 199-202, downloadUpdate 211-214, installUpdate 223-226, getStatus 235-238, loginItem set 308-311, transcode start/cancel/getStatus 327-348, performance 281-284). Only the log label and (in 2 cases) extra fields (`isFullscreen: false`, device `state/connected/device`) vary. Additionally `deviceRouter.getStatus`/`refreshStatus` (91-134) are near-identical: same override-check + `toDeviceStatusPayload` body, differing only sync-vs-async and the reconcile reason.
- **Proposal:** Add a `failureEnvelope<T>(ctx, label, extras?: Partial<T>)` factory beside `resultEnvelope` returning the mapper, so each call site drops from 4 lines to `failureEnvelope(ctx, 'Failed to X:')`. Extract the device status body into one private helper parameterized by `() => DeviceStatus | Promise<DeviceStatus>`. Aggressive variant: a `resultProcedure(label, run)` builder wrapping `publicProcedure...mutation/query` collapses the boilerplate further, at some cost to per-procedure legibility — present as boundary-tension.

### MAIN-3 Main `EventBus` is an unconsumed publish-sink (coordinated cross-package)
- **Category:** delete
- **Files:** `src/main/infrastructure/events/event-bus.ts:1-11`; `container.ts:58`; `device-integration.service.ts:3-4,21,29,38,50,63`; publishers also in `packages/prismgb-updates/src/update.service.ts:238`
- **LOC impact:** ~−30 in `src/main` (+ package-side cleanup)
- **Risk / Breaking:** med / yes (cross-package)
- **Evidence:** The main `EventBus` (a thin `SharedEventBus` subclass) receives only `.publish()` calls — `MainEventChannels.DEVICE.CONNECTION_CHANGED` and `.CHECK_ERROR` (device-integration.service.ts:50,63) and `.UPDATE.STATE_CHANGED` (updates package:238). A repo-wide grep for the channel string values (`device:connection-changed`, `device:check-error`, `update:state-changed`) finds **zero production subscribers** — only the manifest definition and the publishers. Nothing in `src/` or `packages/` ever calls `.subscribe()` on this bus. It is a write-only sink; the renderer receives device/update state via the separate `IpcPushBridge` + tRPC path, not this bus. Tests do reference it (`event-bus.test.ts`, `device-integration.service.test.ts`, `update.service.test.ts`), so it is tested-but-unsubscribed.
- **Proposal:** Two labels. **Boundary-preserving:** keep as a deliberate future seam (future-first), but document it as currently-unconsumed. **Aggressive:** remove the `eventBus` token from `container.ts`, drop the `eventBus` dependency + 2 publish calls from `DeviceIntegrationService`, delete `event-bus.ts`, and (coordinated with Area 3) drop the `eventBus`/`STATE_CHANGED` publish from `@prismgb/updates` UpdateService — deleting the token breaks both services' cradle construction, so this must land as one change. Note direction: main owns the token; two package/app services consume it.

### MAIN-4 Zod schemas re-encode `@prismgb/devices` types and repeat the envelope shape
- **Category:** dedupe / normalize
- **Files:** `src/main/ipc/schemas/device.schemas.ts:10-38`, `gpu.schemas.ts:10-16`, `login-item.schemas.ts:9-14`, `update.schemas.ts:8-27`, `transcode.schemas.ts:35-58`
- **LOC impact:** ~−25
- **Risk / Breaking:** low / no
- **Evidence:** `deviceInfoSchema` (device.schemas.ts:10-21) hand-re-encodes `DeviceInfoPayload` from `packages/prismgb-devices/src/domain/types.ts:174-183` field-for-field (id, name, manufacturer, vendorId, productId, locationId?, deviceAddress?, serialNumber?); `deviceStatusPayloadSchema` (:25-32) mirrors `DeviceStatusPayload` (:185-190). These are the source-of-truth TS types the payloads are already typed as — the Zod copies can silently drift. Separately, `deviceStatusResponseSchema`, `gpuPolicyResponseSchema`, and `loginItemGetResponseSchema` each hand-build a `{ success, ...shape }` object, and the update/transcode subscription schemas each independently repeat `.object({...}).passthrough()`.
- **Proposal:** (1) Add `type _Check = z.infer<typeof deviceInfoSchema> satisfies DeviceInfoPayload` (and the status equivalent) so drift becomes a compile error — cheap, zero-runtime, keeps the trust-boundary validation. (2) Add a small `successEnvelope(shape)` / `passthroughPayload(shape)` builder in a schema-primitives module to collapse the repeated `{ success: z.literal(true), ... }.passthrough()` / `.object().passthrough()` scaffolding. (Overlaps Area 3's X-4 — same root cause, coordinate.)

### MAIN-5 `IpcContext` re-packing duplicates `IpcHandlerRegistryDependencies`
- **Category:** dedupe
- **Files:** `src/main/ipc/trpc.ts:15-65`; `src/main/ipc/ipc-handler.registry.ts:21-58,103-116`
- **LOC impact:** ~−30
- **Risk / Breaking:** med (crosses the port abstraction) / no
- **Evidence:** `IpcHandlerRegistryDependencies` (registry:21-30) lists 8 deps; the constructor copies 7 of them into private fields (:51-57); `createContext()` (:103-116) re-packs those same 7 fields plus `app`/`shell`/`logger` into an `IpcContext` (trpc.ts:54-65). The registry adds no logic between inject and re-pack — it is a pass-through. Separately, `trpc.ts:15-47` declares 5 structural port interfaces (`DeviceConnectionPort`, `UpdateService`, `WindowService`, `LoginItemService`, `TranscodeService`) that re-state the public method subsets of concrete service classes.
- **Proposal:** **Boundary-preserving (recommended):** have `createContext()` build the context directly from the injected `dependencies` object (spread + add `app/shell/logger`), eliminating the 7 private-field mirror in the registry. **Aggressive (with philosophy tension):** the 5 port interfaces could be replaced by importing the concrete service types, but that fights the deliberate hexagonal port seam — flag, don't push. Note this overlaps Area 3's X-1 "re-declared structural interfaces."

### MAIN-6 `AppOrchestrator` 9-field resolve/null mirror
- **Category:** normalize
- **Files:** `src/main/application/app.orchestrator.ts:36-44,62-70,149-159`
- **LOC impact:** ~−30 (if collapsible) — but see risk
- **Risk / Breaking:** high / yes
- **Evidence:** The orchestrator declares 9 `private _service: T | null` fields (36-44), resolves each from the container in `onInitialize` (62-70), and nulls each in `onCleanup` (149-159) — ~27 lines of mechanical mirror. `BaseOrchestrator` already does `Object.assign(this, dependencyMap)` (orchestrator.base.ts:17).
- **Proposal:** Do **not** naively collapse into cradle-assigned `declare` fields. Per the documented CRADLE-NO-OP GOTCHA, the core `Container.cradle` proxy returns `ownKeys → []`, so `Object.assign(this, cradle)` is a silent no-op — the explicit resolves exist precisely because of that. A safe reduction would resolve into a single typed record (`this.services = resolveAll(container, [...tokens])`) driven by a token list, cutting the triplication to one array; but this must be gated on `dev:smoke` (boot regression is invisible to typecheck/tests). Honest: the current verbosity is a correctness workaround, not sloppiness.

### MAIN-7 Inline structural `loggerFactory` types instead of `LoggerFactoryLike`
- **Category:** dedupe
- **Files:** `src/main/infrastructure/window/window.service.ts:14-22`, `tray/tray.service.ts:31-38`, `window/login-item.service.ts:5-12`
- **LOC impact:** ~−21
- **Risk / Breaking:** low / no
- **Evidence:** Three services each redeclare `loggerFactory: { create: (name) => { info; debug; warn; error } }` inline (7 lines each). `device-integration.service.ts:10` correctly imports `LoggerFactoryLike` from `@prismgb/core` — so main is internally inconsistent about it.
- **Proposal:** Replace the inline shapes with `import type { LoggerFactoryLike } from '@prismgb/core'` in all three dependency interfaces (canonical form: whatever `device-integration` does).

### MAIN-8 Dead `{ value }` override envelope + duplicated container plumbing
- **Category:** delete / dedupe
- **Files:** `src/main/application/container.ts:28-34,75-77,86-95`; twin at `src/renderer/application/container.ts:8-14,32-34`
- **LOC impact:** ~−20
- **Risk / Breaking:** low / no
- **Evidence:** `unwrapOverride` unwraps a legacy `{ value: X }` override envelope, but no caller passes that shape: the only override caller is `container.shutdown.test.ts:93` which passes plain instances (`{ appOrchestrator: orchestrator, transcodeService: { dispose } }`); the renderer container test calls `createRendererContainer()` with no overrides; runtime `createAppContainer` passes none. The envelope branch is dead — and worse, it would wrongly unwrap any legitimate override that happens to be an object with a `value` key. The identical `unwrapOverride` + override-loop is copy-pasted between the main and renderer containers. `createAppContainer` (86-95) is a thin async wrapper that only logs a token count.
- **Proposal:** Delete `unwrapOverride` in both containers; register overrides directly (`container.registerValue(token, value)`). Optionally hoist the shared "register standard map + apply overrides" into a small `@prismgb/core` container-builder helper consumed by both processes, removing the duplication rather than just the dead branch.

### MAIN-9 `gpu-policy.ts` `PlatformInfo` — 5 of 6 fields dead
- **Category:** delete
- **Files:** `src/main/infrastructure/gpu-policy.ts:3-10,23-33`
- **LOC impact:** ~−15
- **Risk / Breaking:** low / no
- **Evidence:** `detectPlatform()` returns `{ isLinux, isMac, isWindows, isArm64, isArm, isLinuxArm }`, but a repo-wide grep shows only `isLinuxArm` is ever read (inside `getGpuPolicy` itself, line 44). `detectPlatform` has no other consumers; `isMac/isWindows/isArm/isArm64/isLinux` are never accessed anywhere in `src/` or `packages/`.
- **Proposal:** Inline the single `isLinuxArm` check into `getGpuPolicy` and delete the `PlatformInfo` interface + `detectPlatform`, or trim `PlatformInfo` to just `isLinuxArm`. Keep the `GPU_ENV_VARS` override behavior intact. (Cross-check INF-1: if `gpu.getPolicy` is deleted as an orphaned route, this file may go entirely.)

### MAIN-10 Redundant `AppWithQuitFlag` cast
- **Category:** dedupe
- **Files:** `src/main/infrastructure/window/window.service.ts:37-39,206`
- **LOC impact:** ~−4
- **Risk / Breaking:** low / no
- **Evidence:** `AppWithQuitFlag = typeof app & { isQuitting?: boolean }` and the `(app as AppWithQuitFlag).isQuitting` cast exist even though `src/types/electron-extensions.d.ts:1-5` already augments `Electron.App` with `isQuitting?: boolean` globally — `index.ts:182` sets `app.isQuitting = true` with no cast, proving the augmentation is in effect.
- **Proposal:** Delete the local type and read `app.isQuitting` directly.

### TYP-1 Empty `webgpu-worker.d.ts`
- **Category:** delete
- **Files:** `src/types/webgpu-worker.d.ts:1-7`
- **LOC impact:** ~−7
- **Risk / Breaking:** low / no
- **Evidence:** The file is a comment plus `export {};` — it declares nothing; WebGPU types come from `@webgpu/types`. It is a placeholder "augmentation point" with zero current content.
- **Proposal:** Delete it (recreate if/when a real worker-type gap appears).

### Honest negatives (checked, not reducible)
- **PRE-1 `src/preload/index.ts` (25 LOC):** minimal and necessary. It deliberately inlines electron-trpc's `exposeElectronTRPC` because `electron-trpc/main` emits a top-level `import 'electron'` that cannot bundle into the CJS-scoped preload IIFE (documented at :7-10). Not trivially deletable; importing the library here would break the sandboxed preload bundle. No reduction.
- **Window-state / `electron-window-state`:** N/A. `WindowService.createWindow` always opens at fixed `WINDOW_CONFIG` dimensions (window.service.ts:88-107) — there is no bounds/position persistence to replace.
- **Settings/storage / `electron-store`:** N/A in main. The main process persists no settings; the only OS-level "storage" is `app.setLoginItemSettings` (LoginItemService), which is already the correct Electron built-in — no hand-rolled storage exists to replace.
- **`index.ts --smoke-test` block (69-83):** live, not dead. It is invoked by `scripts/smoke-test.js:150` (`npm run test:smoke`) and the release/build-smoke CI workflows. Keep.
- **`login-item.service.ts` (42 LOC):** already a thin wrapper over the `app.setLoginItemSettings` / `getLoginItemSettings` built-ins with correct per-platform args. No library beats the built-in; leave as-is.
- **`src/types/asset-modules.d.ts` + `electron-extensions.d.ts`:** both consumed (`?raw` imports; `app.isQuitting` augmentation used in index.ts + window.service.ts). Keep.

## Area 6: `src/renderer/application` + renderer root

**Snapshot:** 15 files / 1,943 LOC in `application/` + renderer-root `index.ts` (92) and `app-bootstrap.ts` (197) + `lib/` (4 `.ts` / 286 LOC) ≈ **2,518 LOC**. (No `renderer-app.orchestrator.ts` exists — that pointer is stale; the root orchestrator is `application/orchestrators/app.orchestrator.ts`.) Role: this is the renderer's composition + coordination layer. `container.ts` + `di/{service-registrations,manual-providers}.ts` (219 LOC) is the DI root wiring 53 tokens onto the generic `@prismgb/core` `Container`. `orchestrators/` (9 files, ~1,288 LOC) are `BaseOrchestrator` subclasses that subscribe to the event bus and coordinate infrastructure services through `onInitialize`/`onCleanup`. `state/app-state.ts` (127) is a signal-backed reactive store. `app-bootstrap.ts` drives DI init → UI wiring → `appOrchestrator.initialize()`/`.start()`; `index.ts` is the DOM entry + error/HMR shell. `lib/` holds leaf utilities.

**Top opportunities (est. in-area LOC):**
- **Orchestrator dependency field-mirror boilerplate** (~9 orchestrators × 4-11 field decls + assignments): **−40 to −70** via a typed cradle/deps handle.
- **Reactive-store consolidation** (`app-state.ts` + 5 presentation stores all hand-roll signal + eventBus-subscribe + manual-unsubscribe + `dispose`): **−30 in-area**, ~**−120 cross-boundary** via a `ReactiveEventStore` base.
- **`AppOrchestrator` hand-maintained child lists** + dead token + `LoggerFactoryLike` dupes: **~−25**.

**Headline:** the big DI reduction *already happened* — codegen was deleted (commit `12d2e2c5`), `@Service` is at 0 usages, and the current DI is a plain ~219-LOC registration map. awilix would be a lateral move, not a reduction. What remains in-area is modest, real normalization/dedupe.

### APP-1 Orchestrator dependency field-mirror boilerplate
- **Category:** dedupe | normalize
- **Files:** every orchestrator, e.g. `streaming.orchestrator.ts:84-104`, `capture.orchestrator.ts:78-104`, `app.orchestrator.ts:32-61`, `streaming-audio.orchestrator.ts:42-60`, `display-mode.orchestrator.ts:32-45`, `ui-setup.orchestrator.ts:51-74`; pattern also in `state/app-state.ts:21-46`.
- **LOC impact:** −40 to −70
- **Risk / Breaking:** med / no (internal shape only)
- **Evidence:** Every orchestrator declares `private readonly xxx: XxxLike;` for each dep, then re-assigns `this.xxx = dependencies.xxx` in the constructor after `super(dependencies, 'Name')`. This is *not* removable by adding `declare` + deleting the assignment: `Container.cradle` (`packages/prismgb-core/src/primitives/container.ts:121-123`) is a Proxy whose `ownKeys()` returns `[]`, so `BaseOrchestrator`'s `Object.assign(this, dependencyMap)` (`orchestrator.base.ts:17`) copies **nothing** when handed the cradle (which is always the case in prod via `container.ts:25` `factory(resolver.cradle)`). Each subclass field is populated *only* by the explicit `this.xxx = dependencies.xxx` read, which triggers the proxy `get`. This holds regardless of `useDefineForClassFields` — the no-op is structural.
- **Proposal:** Store one typed handle — `constructor(deps: XDeps){ super(deps,'X'); this.deps = deps; }` with `private readonly deps: XDeps` — and reference `this.deps.streamingService`. Converts N decls + N assignments into 1 + 1 per orchestrator. Trades terse `this.x` for `this.deps.x`; net −40 to −70 across 9 files. No new abstraction, boundary-preserving.

### APP-2 Reactive-store pattern duplicated (signals + eventBus subscribe + dispose)
- **Category:** dedupe | library
- **Files:** `application/state/app-state.ts:26-74,120-124` (in-area); cross-boundary twins `presentation/state/presentation-mode.store.ts:23-73`, `stream-info.store.ts:11-49`, plus `device-status.store.ts` (94), `transcode-progress.store.ts` (118), `status-notification.store.ts` (48).
- **LOC impact:** −30 in-area (app-state); ~−120 across all 6 stores
- **Risk / Breaking:** med / no
- **Evidence:** Six classes independently reimplement the identical shape: private `signal(...)` fields, a constructor that pushes `eventBus.subscribe(channel, handler)` calls, a manual disposer, and a `dispose()`. They even diverge on the disposer type for the *same concern*: `app-state.ts` uses `@prismgb/core` `DisposableBag` (`_bag`), while `presentation-mode.store.ts`/`stream-info.store.ts` use raw arrays (`_unsubscribes` / `_unsubs`). All read from `@prismgb/ui-base/reactive` `signal`/`computed`.
- **Proposal:** Introduce a `ReactiveEventStore` base (natural home: `@prismgb/ui-base`, alongside `signal`) that takes `{ eventBus, subscriptions: Record<channel, handler> }`, wires them through one `DisposableBag`, and exposes a protected `signal` helper + `dispose()`. Each store shrinks to its signal declarations + a subscription map. Canonicalizes the disposer strategy. (Same finding as PRES-2 — one fix covers both.)

### APP-3 `AppOrchestrator` hand-maintained child references + dual ordered lists
- **Category:** dedupe
- **Files:** `application/orchestrators/app.orchestrator.ts:32-42` (11 field decls), `:49-59` (11 assignments), `:68-80` (init order), `:151-163` (cleanup order)
- **LOC impact:** −15 to −20
- **Risk / Breaking:** med / no — **with a correctness caveat**
- **Evidence:** The 11 child orchestrators are declared, assigned, then listed *twice more* (init sequence, cleanup sequence). **The cleanup order is NOT the reverse of the init order** — init runs the perf cluster `[state, animation, metrics]` (`:74-76`) while cleanup runs `[animation, metrics, state]` (`:153-155`), and the streaming/device tail doesn't mirror either. Teardown is order-sensitive (see `streaming.orchestrator.ts:246-251`: "Stop GPU recording BEFORE releasing GPU resources"), so the two orders are intentionally independent.
- **Proposal:** Collapse the 11 field-mirrors into one typed `children: Record<ChildKey, LifecycleOrchestrator>` (subsumes APP-1 for this file and gives `onInitialize` something to iterate via an explicit `initOrder: ChildKey[]`). **Keep `cleanupOrder` as its own explicit `ChildKey[]`** — do *not* refactor to a single list + `.reverse()`; that would silently reorder teardown.

### APP-4 (NEGATIVE) Replace hand-rolled DI with awilix — not recommended
- **Category:** library
- **Files:** `container.ts` (50), `di/service-registrations.ts` (114), `di/manual-providers.ts` (55)
- **LOC impact:** ~0 (lateral); at best −30 to −50 from `container.ts` plumbing, offset by a new runtime dependency
- **Risk / Breaking:** high / yes
- **Evidence:** The premise (codegen + `@Service` source-of-truth) is **stale**. `scripts/generate-di.js`, `di.generated.ts`, and `external-tokens.ts` were **deleted** in `12d2e2c5 refactor(di): wire renderer onto core Container primitive, delete codegen stack`; `grep '@Service'` over `src/` returns **0**. So codegen LOC = 0 (already banked). What remains is a ~219-LOC explicit map. awilix `asClass(X).proxy()` is ~1 line/token = ~55 lines + the same 48 imports that `service-registrations.ts` already carries — a wash. awilix `loadModules` auto-registration is **blocked** because tokens diverge from class names (`animationPerformanceService`→`PerformanceAnimationService`, `streamViewService`→`StreamingViewService`, `gpuRecordingService`→`CaptureGpuRecordingService`), forcing explicit aliasing anyway. Adopting awilix would **lose** the typed token map and the insertion-order `dispose()` the core `Container` provides (`container.ts:131-149`, relied on for deterministic teardown) and add a proxy-heavy runtime dep.
- **Proposal:** Do not migrate. The reduction awilix was meant to deliver was realized by the codegen deletion. Keep the core `Container`.

### APP-5 Dead DI token + dead import: `animationCache`
- **Category:** delete
- **Files:** `di/service-registrations.ts:1` (`import { AnimationCache, ... }`), `:113` (`animationCache: () => new AnimationCache()`)
- **LOC impact:** −2 (in-area; see CORE-1 for the 204-LOC class deletion this unlocks)
- **Risk / Breaking:** low / no
- **Evidence:** Exhaustive scan of all 53 registered tokens: `animationCache` is the **only** one with **0** production references (`grep` across `src/` excluding the two registration files and tests = 0 files). Its sole references are `tests/unit/renderer/application/container.test.ts:21,139`, which assert the token exists/resolves — i.e., the test enforces dead wiring. `AnimationCache` from `@prismgb/core` is imported *only* here. Lazy provider ⇒ never even constructed.
- **Proposal:** Delete the registration + the `AnimationCache` import (narrow the line-1 import to `ConsoleLoggerFactory`), and drop the two test assertions. Confirms and unlocks CORE-1.

### APP-6 `LoggerFactoryLike` redefined locally in 2 orchestrators
- **Category:** normalize
- **Files:** `capture.orchestrator.ts:15-17`, `streaming.orchestrator.ts:16-18`
- **LOC impact:** −4
- **Risk / Breaking:** low / no
- **Evidence:** Both define `type LoggerFactoryLike = { create(name: string): LoggerLike };` locally, structurally identical to the exported `@prismgb/core` type — which `app`, `preferences`, `display-mode`, `streaming-audio`, and all `performance/*` orchestrators already `import type … from '@prismgb/core'`. Pure inconsistency, no segregation benefit. (The other local `*Like` collaborator interfaces — `AppStateLike` ×4, `StreamViewServiceLike` ×3, `SettingsServiceLike` ×2 — are *intentional* interface-segregation; leave them.)
- **Proposal:** Delete both local aliases; import `LoggerFactoryLike` from `@prismgb/core` like the sibling orchestrators.

### APP-7 Minor normalization deviations (zero-LOC, consistency)
- **Category:** normalize
- **Files:** `performance/performance-metrics.orchestrator.ts:15-19`, `performance-animation.orchestrator.ts:21-26`, `performance-state.orchestrator.ts:21-25` inline the deps object type in the constructor param; all six non-perf orchestrators use a named `XxxDependencies` type. `eventBus` is re-declared with a narrower `TypedEventBusLike` in `capture`/`streaming`/`ui-setup` but left as the base `EventBusLike` in the rest. `app-bootstrap.ts:132` hand-constructs `PresentationModeStore` outside DI while every peer store/service goes through the container.
- **LOC impact:** ~0
- **Risk / Breaking:** low / no
- **Proposal:** Canonical form: named `XxxDependencies` type per orchestrator; declare `eventBus` once with the project-standard `TypedEventBusLike`; register `PresentationModeStore` as a DI token (`presentationModeStore`) rather than `new`-ing it in bootstrap. Consistency only, no reduction.

**Honest negatives**
- **No hand-rolled pub/sub to eliminate.** `infrastructure/events/event-bus.class.ts` is a thin `SharedEventBus` subclass; `SharedEventBus` (`@prismgb/events`) already wraps `eventemitter3`. Nothing to do.
- **Bootstrap boilerplate is thin and load-bearing.** `RendererBootstrap` (`app-bootstrap.ts`) has genuine ordering constraints (settings-source registration → shell render → DI init → UI wiring → orchestrator init/start); it is not padding. `index.ts`'s HMR/error handlers are entry-point-appropriate.
- **`lib/`** is small leaf utilities; only `settings.definitions.ts` (175) is sizable and it is a real registry, not duplication.

## Area 7: `src/renderer/infrastructure`

**Snapshot:** 38 files, ~6,163 LOC.
- `services/streaming/` (14 files, ~2,300 LOC) — the render pipeline: `streaming-render.service.ts` (612, uncommitted WIP), `audio-pipeline.service.ts` (499), `streaming.service.ts` (343), plus canvas/view/acquirer/health helpers and two util files.
- `services/devices/` (3, ~713) — `device-runtime.service.ts` (470) refresh state machine + `device-platform.adapters.ts` (200, three tRPC/browser ports) + `device-selection.ts` (43, pure catalog matching).
- `services/{capture,gpu,transcode,updates,settings,performance,platform}/` (18, ~2,600) — thin domain services over tRPC + eventBus.
- `adapters/` (4) + `browser/` (2) — browser-signal wrappers (visibility, reduced-motion, user-activity, metrics, mediaDevices, storage).
- `ipc/` `events/` `rendering/` (3) — tRPC client shim, `EventBus` subclass, and a dead capability detector.

The layer wraps browser/main-process I/O behind DI'd services that extend `BaseService` and republish through `@prismgb/events`. Most services are correct and thin; the reducible mass is concentrated in the two largest streaming files, a set of structurally-identical adapters, and two orphaned util files.

**Top opportunities (net LOC, helper additions already subtracted):**
- **Two verified dead files: −115 net, zero risk.** `capability-detector.utils.ts` (−83) and `native-resolution.utils.ts` (−32) have zero importers across `src/` and `tests/`. Deleting the detector also orphans the `gpu.getPolicy` IPC route and surfaces a behavioral drop (see INF-1).
- **Intra-file duplication in the two biggest streaming files: ~−75 net.** `streaming-render` triplicates the `createGpuVideoRendererSession` config+callback block (INF-2); `audio-pipeline`/`gpu-recording`/`capture` triplicate the same "settle-once + timeout + abort-listener" promise ceremony that belongs in `@prismgb/core` async utils (INF-3).
- **Structural adapter/service boilerplate: ~−45 net.** Three browser-signal adapters are the identical shell (INF-5); `update`/`transcode`/`fullscreen` repeat the tRPC-subscription `initialize()` (INF-6); a hand-rolled `debounce` should join `throttle` in core (INF-7).

Total realistic net reduction ~**−230 to −260 LOC**, roughly half from deletions (high-confidence) and half from dedupe refactors (net of helpers added to core/base).

### INF-1 Delete orphaned `capability-detector.utils.ts` (dead; also orphans an IPC route)
- **Category:** delete
- **Files:** `src/renderer/infrastructure/rendering/capability-detector.utils.ts` (entire file, 83 LOC); it is the **sole** caller of `trpcClient.gpu.getPolicy` (line 11).
- **LOC impact:** −83 (net, in-area) plus a now-dead `gpu.getPolicy` router/handler in `src/main` (out of area).
- **Risk / Breaking:** low / no (nothing imports it) — but see caveat.
- **Evidence:** `grep -rn CapabilityDetector src tests` returns only a doc-comment mention in `src/main/ipc/schemas/gpu.schemas.ts`; no code importer. The live path, `streaming-render.service.ts:324` (`_resolveGpuCapabilities`), calls `detectBrowserGpuCapabilities()` from `@prismgb/gpu/runtime` **directly**, with no policy application. So the detector's whole job — query `gpu.getPolicy`, apply the ARM-Linux WebGPU-skip UA fallback (lines 10-48) — is unwired.
- **Proposal:** Delete the file. **Before deleting, confirm with the owner that dropping the ARM-Linux WebGPU-skip policy was intentional and not a WIP regression** — if the policy is still wanted, the fix is to route `detectBrowserGpuCapabilities()` in streaming-render through the policy check, not to keep dead code. If intentional, the `gpu.getPolicy` tRPC procedure and its main handler are also collectable.

### INF-2 Collapse triplicated GPU-session construction in `streaming-render.service.ts`
- **Category:** dedupe
- **Files:** `src/renderer/infrastructure/services/streaming/streaming-render.service.ts:358-397` (`_startRendering`), `:436-481` (`_switchToGPUMidStream`), `:488-517` (`_startCanvas2DRendering`); shared teardown prologue at `:400-417` and `:419-435`.
- **LOC impact:** ~−40 net (a private `_createSession(overrides)` builder ~15 lines replaces ~55 of duplicated options+callbacks).
- **Risk / Breaking:** med / no (behavior-preserving; file is uncommitted WIP so coordinate).
- **Evidence:** All three call `createGpuVideoRendererSession({...})` with a **verbatim-identical** `capabilities: {...}` map and the same four callbacks — `onReady`/`onStats`/`onError`/`onCanvasExpired` each publishing to `EventChannels.RENDER.*`. `_startRendering` and `_switchToGPUMidStream` differ only in `preferredBackend`/`presetId`. Separately, `_switchToCanvas2DMidStream` (400-417) and `_switchToGPUMidStream` (419-435) share the same prologue (`_stopRenderLoop` → `session.terminate({emitCanvasExpired:false})` → `recreateCanvas()` → `setupCanvasSize()`).
- **Proposal:** Extract `private _createSession(overrides: Partial<CreateSessionOptions>)` that builds base options + the four eventBus callbacks once; extract `private async _teardownAndRecreate(useGpu: boolean)` for the shared prologue. Three call sites become one-liners.

### INF-3 Extract the "settle-once + timeout + abort" promise ceremony to `@prismgb/core`
- **Category:** dedupe → library (own core package)
- **Files:** `audio-pipeline.service.ts:316-366` (`_waitForTrackUnmute`), `:368-434` (`_waitForAudioEnergy`), `:480-498` (`_sleep`); `gpu-recording.service.ts:331-347` (`_waitForCaptureDrain`); `capture.service.ts:282-322` (`_createStopWaiter`).
- **LOC impact:** ~−30 to −40 net (gross ~−60-80 removed; ~−25 added to `core/primitives/async.utils.ts`).
- **Risk / Breaking:** med-high / no — audio warmup is timing-critical; the *ceremony* collapses but the domain guards (warmupToken, `track.muted`, energy sampler, dropped-frame count) stay inline.
- **Evidence:** Each site re-implements the same scaffold: `new Promise` → `let settled=false` → a `finish()` that clears a timer, removes the `abort` listener, and resolves once → `signal.addEventListener('abort', handleAbort, {once:true})`. `_sleep` is a plain abortable delay; `_waitForCaptureDrain` is a plain promise-vs-timeout race. `capture.service.ts` already imports `createDeferred` from core (`:1,:293`) — precedent for hosting these primitives in core.
- **Proposal:** Add `abortableDelay(ms, signal)` and `raceWithTimeout<T>(promise, ms): Promise<'completed'|'timed-out'>` (and optionally a `settleOnce` guard) to `core/primitives/async.utils.ts` next to `createDeferred`. Reduces three-line-plus-cleanup blocks to single calls; the abort/token domain logic remains local.

### INF-4 Delete dead `native-resolution.utils.ts`
- **Category:** delete
- **Files:** `src/renderer/infrastructure/services/streaming/native-resolution.utils.ts` (entire file, 32 LOC).
- **LOC impact:** −32 (net).
- **Risk / Breaking:** low / no.
- **Evidence:** `grep -rn "native-resolution|normalizeNativeResolution|createNativeBitmapOptions|calculateNativeScaleFactor" src tests` returns **only the file itself** — no importer and no test. `calculateNativeScaleFactor` also duplicates the integer-scale math already living in `viewport.service.ts:143-145`.
- **Proposal:** Delete the file.

### INF-5 Unify three structurally-identical browser-signal adapters
- **Category:** normalize / dedupe
- **Files:** `adapters/visibility.adapter.ts` (24), `adapters/reduced-motion.adapter.ts` (33), `adapters/user-activity.adapter.ts` (34); each redefines `type Cleanup = () => void` (lines 1/1/3).
- **LOC impact:** ~−25 to −30 net (a `BrowserSignalAdapter` base ~30 lines + three ~8-line subclasses replaces ~91).
- **Risk / Breaking:** low-med / no.
- **Evidence:** All three are the same shell: guard `typeof document/window === 'undefined'`, store a single `_handleX` field, `addEventListener`/`matchMedia().addEventListener`, and a `dispose()` that removes it and nulls the field; `onX()` returns `() => this.dispose()`. Only the event source (`visibilitychange` / `matchMedia('(prefers-reduced-motion)')` / a set of activity events) and the payload projection differ.
- **Proposal:** Introduce a `BrowserSignalAdapter<T>` base (or a `createEventSourceAdapter` factory) parameterized by `{ subscribe(cb), read() }`; each concrete adapter supplies only source + projection. Replace the three local `type Cleanup` aliases with `DisposableFunction` from `@prismgb/core`.

### INF-6 Deduplicate the per-service tRPC-subscription `initialize()` shell
- **Category:** dedupe / normalize
- **Files:** `updates/update.service.ts:59-79`, `transcode/transcode.service.ts:42-59`, `settings/settings-fullscreen.service.ts:28-47`; the `_initialized` guard is repeated in update (`:42,:60-63`) and transcode (`:31,:43-46`).
- **LOC impact:** ~−15 net.
- **Risk / Breaking:** low / no.
- **Evidence:** Each `initialize()` does `disposables.replace(SOME_LIFECYCLE, createTrpcEventBridge('<Name>', [ ...starters ], this.logger))`, and update/transcode additionally guard with an identical `_initialized` boolean + "already initialized" warn. The `SETTINGS_FULLSCREEN`/`UPDATE`/`TRANSCODE_SUBSCRIPTION` lifecycle symbols are one-per-file duplicates of the same idea.
- **Proposal:** Add a `protected subscribeTrpc(name, starters)` helper on `BaseService` (owns the symbol + `disposables.replace` + the bridge), so services pass only their starter array. Optionally fold the `_initialized` guard into it.

### INF-7 Move hand-rolled `debounce` into `@prismgb/core` timing utils
- **Category:** library (own core package) / normalize
- **Files:** `services/devices/device-platform.adapters.ts:116-158` (`BrowserMediaDevicesPort.subscribeDeviceChange`).
- **LOC impact:** ~−10 in-area (net ~0 after adding `debounce` to core, but removes a bespoke timer + `debounceTimer` field and its cleanup).
- **Risk / Breaking:** low / no.
- **Evidence:** The port hand-rolls trailing debounce with a `debounceTimer` field, `clearTimeout` on each event and on unsubscribe. `core/primitives/timing.utils.ts` exports `throttle` but **no** `debounce`; there is no lodash dependency. This is exactly the "hand-rolled debounce vs core primitive" case the audit targets.
- **Proposal:** Add `debounce(fn, ms)` (with a `.cancel()`) next to `throttle` in `core/primitives/timing.utils.ts`; the port keeps only its cancel-on-unsubscribe wiring.

### INF-8 Normalize error-message extraction onto `getErrorMessage`
- **Category:** normalize (consistency; ~0 net LOC)
- **Files:** `adapters/platform-metrics.adapter.ts:20`, `capture/capture-save.service.ts:83,116`, `updates/update.service.ts:194,216,238`, `transcode/transcode.service.ts:96,114`; plus the bespoke `getThrownMessage` in `browser/browser-storage.adapter.ts:8-14`.
- **LOC impact:** ~0 (one line → one line); include for consistency, not reduction.
- **Risk / Breaking:** low / no.
- **Evidence:** Eight sites inline `error instanceof Error ? error.message : String(error)` while six other infra files already import `getErrorMessage` from `@prismgb/core` for the identical job. `browser-storage.adapter` reinvents a third variant (`getThrownMessage`).
- **Proposal:** Replace all inline variants (and `getThrownMessage`) with `getErrorMessage(error)`. Pure consistency; do not book it as LOC savings.

### INF-9 Route raw timer/listener wiring through existing `BaseService` helpers
- **Category:** normalize (consistency)
- **Files:** `platform/health.service.ts:78-82`, `platform/viewport.service.ts:169-180,213-220`, `performance/performance-state.service.ts:201-205`, `settings/settings-fullscreen.service.ts:30-33`.
- **LOC impact:** ~0-10 net; mainly consistency.
- **Risk / Breaking:** low / no — nuanced (see below).
- **Evidence:** `BaseService` already provides `timeout()`, `interval()`, `animationFrame()`, and `subscribe(target,type,listener)` that auto-track via `disposables` — and `performance-metrics.service.ts:76-99` uses them as the canonical form. The four files above instead hand-write `setTimeout(...)` + `disposables.replace(KEY, () => clearTimeout(h))` (or, in fullscreen, a raw `document.addEventListener` + manual remove). The nuance: several of these use `replace(KEY, …)` deliberately for restart-by-key semantics that plain `this.timeout()` doesn't offer.
- **Proposal:** Convert the one-shot/listener cases (e.g. `settings-fullscreen` → `this.subscribe(document,'fullscreenchange',handler)`) directly; for the restart-by-key timers, add a keyed `timeoutManaged(key, fn, ms)` to `BaseService` so the whole area shares one timer idiom.

### INF-10 Flagged-but-keep + honest negatives
- **Category:** normalize (flag only) / negatives
- **1-impl port interfaces** — `device-platform.adapters.ts` defines `DeviceStatusPort`, `MediaDevicesPort`, `DevicePreferenceStore`, each with exactly one implementation and **no interface-named test double** (`grep` in `tests/` returns nothing). Per the audit's collapse heuristic these are flaggable; however, collapsing them **contradicts the repo's stated future-first "reach for the interface ahead of the second consumer" mandate**, and `MediaDevicesPort` genuinely has two consumers (`device-runtime` + `device-media-acquirer`). Recommendation: **keep**, surfaced here only to record the tension. Similarly `MetricsAdapter.isAvailable()` (`platform-metrics.adapter.ts:12`) and `TranscodeService.isAvailable()` (`transcode.service.ts:123`) are hardcoded `return true` — vestigial capability gates, but harmless; leave unless the seam is removed.
- **Honest negatives (examined, leave alone):** `browser/browser-storage.adapter.ts` is a correct thin `localStorage` wrapper with quota-eviction — no `localForage`/`idb-keyval` warranted. `streaming.service.ts` IDLE/STARTING/STREAMING/STOPPING/ERROR state machine is bespoke but justified (start/stop race coordination); no library fits. `device-selection.ts` (43 LOC) is already a clean pure module delegating to `@prismgb/devices.matchByLabel` — no renderer-side device-matching duplication of the package was found. `capture.service.ts` screenshot/recording uses standard `canvas.toBlob`/`MediaRecorder`; the download path already delegates to `@renderer/lib/file-download.utils` (out of area). `trpc-event-bridge.factory.ts` is a genuine multi-subscription grouping primitive with 4 consumers — keep.

## Area 8: `src/renderer/presentation`

**Snapshot:** 55 `.ts` files (~6,715 LOC) plus 32 `.css` files. By subdirectory (TS only): `features/` 3,880 (notes ~1,600, toolbar ~670, settings 397, updates 381, streaming 154, transcode 48), `effects/` 891, `controller/` 668, `state/` 384, `bridges/` 317, `primitives/` 231, `shell/` 123, `config/` 90, `shared/` 77, `icons/` 38, `lib/` 16. This is the vanilla-DOM renderer UI: feature components extend `PresentationComponent` (from `@prismgb/ui-base`), reactive state lives in `state/*.store.ts` (hand-rolled signals), DOM is produced by `*.template.ts` string builders and bound by a typed `data-ref` layer in `primitives/`. The layer is **normalization-heavy, not dead-code-heavy** — the biggest wins are collapsing repeated component/store scaffolding and finishing an already-started migration to declarative `bind*` helpers, not deleting orphans. Net reduction is partly offset because the clean fixes extract shared helpers/base-classes *into* `@prismgb/ui-base`.

**Top opportunities:**
- Delete ~75 LOC of `dispose()` field-nulling ceremony and normalize the imperative-component init/re-init contract (4 divergent guard mechanisms today) → ~−90 net.
- Collapse the 5 near-identical event-store subscription harnesses + 2 copy-pasted payload-narrowing helpers into a `ReactiveEventStore` base / shared reader → ~−45.
- Finish the declarative-binding migration (streaming-controls + notes-panel still hand-roll state→DOM that sibling components already do via `bindClass`/`bindText`) and route list rendering through the existing `renderListboxOptions` → ~−60.

### PRES-1 `dispose()` field-nulling ceremony across imperative components
- **Category:** normalize
- **Files:** `features/notes/notes-editor-view.component.ts:248-266` (14 null-assignments), `features/notes/game-autocomplete.component.ts:157-171` (10), `features/notes/game-filter.component.ts:174-186` (7), `features/notes/notes-resize-handler.component.ts:231-247` (7), `features/notes/notes-panel.component.ts:457-467` (5), `features/notes/notes-panel-layout.component.ts:124-132` (5), `features/toolbar/shader-slider-controls.component.ts:247-256` (6), `features/settings/settings-menu.component.ts:341-349` (`_clearElementReferences`, 5+), plus notes-list-view, streaming-controls, shader-selector, notes-search, shader-preset-list, cinematic-toggle, button-feedback (2-4 each). ~75-80 lines total.
- **LOC impact:** ~−75
- **Risk / Breaking:** med / no
- **Evidence:** Every imperative component ends with a `dispose()` that manually nulls each field (`this.editorElement = null; this.titleInput = null; …`). The reactive components in the *same layer* (`shared/device-status.component.ts`, `shared/status-notification.component.ts`, `features/transcode/transcode-toast.component.ts`) do **none** of this — they rely on `this.track(...)` + `super.dispose()`. The nulling is redundant: components that are re-`initialize()`d already reset state at the top of `initialize()` (e.g. `notes-editor-view.ts:89-91`), and disposed-and-dropped components are GC'd regardless.
- **Proposal:** Adopt the reactive components' philosophy as canonical: track disposers, don't null fields. Where a released element ref genuinely must be dropped before dispose completes (guarded reads like `notes-search.ts:45`), move that to a single base-class `releaseElementRefs()` hook rather than repeating it per field. Verify with `dev:smoke` (not just typecheck/vitest — a documented boot-break class exists around field-declaration changes).

### PRES-2 Five event-stores duplicate the subscription harness + payload readers
- **Category:** dedupe / library
- **Files:** `state/stream-info.store.ts:13,46-49`, `state/device-status.store.ts:25,90-93`, `state/transcode-progress.store.ts:26,112-117`, `state/presentation-mode.store.ts:27,70-73`, `state/status-notification.store.ts:16,44-47`. Duplicated readers: `state/presentation-mode.store.ts:5-9` (`readBooleanField`) ≡ `bridges/ui-event.bridge.ts:37-44` (`getBooleanPayloadValue`).
- **LOC impact:** ~−45
- **Risk / Breaking:** low / no
- **Evidence:** Each store hand-rolls `private readonly _unsubs: DisposableFunction[] = []`, pushes `bus.subscribe(...)` results, and repeats `dispose(){ this._unsubs.forEach(u => u()); this._unsubs.length = 0; }`. `status-notification.store.ts` diverges to a single `_unsubscribe` variable for the same purpose. Separately, the narrowing idiom `typeof payload === 'object' && payload !== null ? (payload as {x?: unknown}).x : …` is copy-pasted inline in device-status (`:35,:51,:61,:69`), stream-info (`:20`), status-notification (`:34-38`), transcode-progress (`:66-71`), and hoisted into two identically-shaped named helpers (`readBooleanField` / `getBooleanPayloadValue`).
- **Proposal:** Same fix as APP-2 (`ReactiveEventStore` base) — one change covers all six stores. Replace the payload readers with Zod `safeParse` (already a dependency via the IPC migration) or one shared `readField(payload, key, guard)`.

### PRES-3 Hand-rolled `innerHTML` list rendering + inconsistent `renderListboxOptions` adoption
- **Category:** library
- **Files:** `features/notes/notes-list-view.component.ts:70-99,176-214` (`render`/`_renderGameGroup`/`_renderNoteItem`), `features/toolbar/shader-preset-list.component.ts:88-118` (`_renderPresetList`), `features/notes/game-filter.component.ts:80-87,136-144`.
- **LOC impact:** ~−40
- **Risk / Breaking:** med / no
- **Evidence:** `notes-list-view` builds ~80 LOC of HTML via template strings with manual `escapeHtml()` per interpolation (XSS-prone by construction). Meanwhile `@prismgb/ui-base` exports `renderListboxOptions`/`updateListboxActiveState` for exactly this. Adoption is inconsistent: `game-filter` calls `renderListboxOptions` but still hand-rolls its `createOption` (`:136-144`); `shader-preset-list` ignores the helper entirely and hand-rolls `container.innerHTML=''` + a `createElement` loop (`:88-118`) that re-implements option creation, active-state, and per-option listener disposal.
- **Proposal:** Route all three option/list renderers through `renderListboxOptions` (extend it with an `escape`/`safe-text` option so callers stop hand-escaping). For the notes list's grouped view, replace string concatenation with a cloned `<template>` element or a tiny `html`-tagged-template helper in `primitives/` so escaping is centralized.

### PRES-4 Imperative-component init/re-init skeleton has four divergent guard mechanisms
- **Category:** normalize
- **Files:** `features/settings/settings-menu.component.ts:131-133,303-307` (`_resetExistingInitialization` + `_initialized` flag), `features/toolbar/shader-selector.component.ts:72-73` / `shader-preset-list.component.ts:52-53` / `shader-slider-controls.component.ts:65-73` / `cinematic-toggle.component.ts:42-43` (`void this.dispose()` at top of `initialize`), `features/notes/notes-search.component.ts:31-32` + siblings (`cancelManaged(SETUP_LIFECYCLE)`), `features/updates/update-section.component.ts:190-193` (`if (this._initialized) return` — refuses re-init).
- **LOC impact:** ~−30 net (adds a base to ui-base)
- **Risk / Breaking:** med / no
- **Evidence:** Thirteen components share the shape *constructor stores deps + nulls element refs → `initialize(elements)` guards + assigns + wires listeners via `this.listen` → symbol-keyed `SETUP_LIFECYCLE` token → verbose `dispose()`*. But the re-entrancy guard is done four incompatible ways (above), and `notes-resize-handler.ts:11-17` alone declares 7 module-level `Symbol('…Lifecycle')` constants. `update-section`'s "refuse re-init" contract even contradicts the others' "dispose-and-rebuild" contract.
- **Proposal:** Add a `ReinitializableComponent` base in `@prismgb/ui-base` exposing one `reinitialize(elements, setupFn)` that owns a single canonical setup-lifecycle token (cancel-then-run) and a `bindRefs(elements)` that stores/releases element refs generically. This removes the per-component `Symbol` constants, the top-of-`initialize` guard, and (with PRES-1) the dispose nulling.

### PRES-5 streaming-controls & notes-panel hand-roll state→DOM that sibling components already do declaratively
- **Category:** normalize
- **Files:** `features/streaming/streaming-controls.component.ts:73-140` (`setStreamingMode`/`_finishStreamingEnter`/`_finishStreamingExit`), `features/notes/notes-panel.component.ts:147-154,226-248,396-407` (`show`/`hide`/`_resetPanelVisibilityState`/`_setupEscapeKey`). Canonical form already in-repo: `features/transcode/transcode-toast.component.ts:37-43`, `shared/device-status.component.ts:24-46`, `features/toolbar/cinematic-toggle.component.ts:52-57`.
- **LOC impact:** ~−30
- **Risk / Breaking:** med / no
- **Evidence:** `transcode-toast`, `device-status`, `status-notification`, and `cinematic-toggle` were already converted to `store + bindClass/bindText/bindAttr` — a signal drives the class/text and teardown is automatic. But `streaming-controls.setStreamingMode` still imperatively `classList.add/remove(HIDING/HIDDEN/TRANSITIONING_TO_STREAM)` across ~65 lines with duplicated enter/exit finalizers, and `notes-panel` hand-toggles `VISIBLE`/`PANEL_OPEN` + `aria-expanded` + focus in three places. This is the exact state→DOM sync the `bind*` helpers exist for. **This is the strongest normalization finding** — the canonical target already ships next door, so it's "converge on the adopted pattern," not a hypothetical.
- **Proposal:** Give streaming-controls a `StreamPresentationStore` (phase signal: idle/entering/streaming/exiting) and bind classes/disabled via `bindClass`/`bindProperty`, keeping only the timing in the store. Route notes-panel visibility through `DisclosureController` (see PRES-7).

### PRES-6 Auto-hide effect trio duplicates the controller-wrapper skeleton
- **Category:** dedupe
- **Files:** `effects/cursor-auto-hide.effect.ts`, `effects/toolbar-auto-hide.effect.ts`, `effects/controls-auto-hide.effect.ts` (all wrap `ActivityAutoHideController`).
- **LOC impact:** ~−20
- **Risk / Breaking:** med-high / no
- **Evidence:** All three extend `PresentationComponent`, construct an `ActivityAutoHideController`, expose `enable(el)/disable()`, implement `_show()/_hide()` as single `classList.add/remove(<oneClass>)` calls, and end with the identical `dispose(){ this.disable(); return super.dispose(); }`. Real divergence exists (toolbar's `MutationObserver` panel cache `:166-219`, controls' focus handlers `:110-118`), so this is partial, not total, overlap.
- **Proposal:** Parameterize the shared skeleton in `ActivityAutoHideController` (or a thin `ClassToggleAutoHide` base) taking `{ target, hiddenClass, extraEvents }`; keep toolbar's panel-observer as a subclass. Lower priority given the divergence.

### PRES-7 notes-panel re-implements `DisclosureController` instead of reusing it
- **Category:** dedupe / library
- **Files:** `features/notes/notes-panel.component.ts:226-248,396-407` vs `@prismgb/ui-base` `DisclosureController` (used by `shader-selector.component.ts:118-134` and `settings-menu.component.ts:265-301` for both menu and disclaimer).
- **LOC impact:** ~−15
- **Risk / Breaking:** med / no
- **Evidence:** notes-panel hand-codes show/hide (`classList.add/remove(VISIBLE)` + `PANEL_OPEN` + `aria-expanded` + focus) and its own Escape-key handler — precisely what `DisclosureController` (with `visibleClass`, `toggleOpenClass`, `closeOnEscape`) provides and what the two other panels in the same layer already delegate to.
- **Proposal (boundary-preserving):** Have notes-panel use `DisclosureController`. **(aggressive):** Replace the shader/settings/notes panels' bespoke controllers with native `<dialog>` (`.showModal()`/`::backdrop`) or the Popover API, which give Escape/focus-trap/light-dismiss for free and would let `DisclosureController`, `ListboxDropdownController`, and the auto-hide observers shrink substantially — larger, cross-cutting, breaking.

### PRES-8 `constants.config.ts` is a one-line re-export shim
- **Category:** delete
- **Files:** `config/constants.config.ts:1` (`export { TIMING } from '@prismgb/config';`); consumers `bridges/capture-ui.bridge.ts`, `effects/button-feedback.effect.ts`, `effects/ui-effects.class.ts`, `effects/body-class.class.ts`, `effects/controls-auto-hide.effect.ts` (5).
- **LOC impact:** ~−8 (one file)
- **Risk / Breaking:** low / no
- **Evidence:** The file adds nothing but an indirection hop. Adoption is already inconsistent — `infrastructure/services/platform/viewport.service.ts:17` and `infrastructure/services/devices/device-platform.adapters.ts:1` import `TIMING` directly from `@prismgb/config`, while these 5 presentation files go through the shim.
- **Proposal:** Repoint the 5 imports to `@prismgb/config` and delete `constants.config.ts`.

### PRES-9 `app-animations-off` class string defined in two sources of truth
- **Category:** dedupe
- **Files:** `config/css-classes.config.ts:72` (`APP_ANIMATIONS_OFF: 'app-animations-off'`) vs `effects/body-class.class.ts:8-12` (`APP_CSS_CLASSES.ANIMATIONS_OFF: 'app-animations-off'`).
- **LOC impact:** ~−3
- **Risk / Breaking:** low / no
- **Evidence:** `body-class.class.ts` declares a private frozen `APP_CSS_CLASSES` whose `ANIMATIONS_OFF` literal duplicates `CSSClasses.APP_ANIMATIONS_OFF`; `streaming-controls.ts:70` reads the class via `CSSClasses.APP_ANIMATIONS_OFF`, so the same token is authored twice. (The other two keys, `IDLE`/`HIDDEN` = `app-idle`/`app-hidden`, are unique to body-class and fine.)
- **Proposal:** Move `app-idle`/`app-hidden` into `CSSClasses` and delete the local `APP_CSS_CLASSES` object, referencing `CSSClasses` throughout.

### PRES-10 Two parallel element-reference systems (`id=` + `data-ref=`) — investigated, NOT recommended
- **Category:** normalize (negative)
- **Files:** all `*.template.ts` (71 elements carry `id="X"` and `data-ref="X"` with identical values, e.g. `features/toolbar/toolbar.template.ts:12-74`).
- **LOC impact:** ~0 (do not pursue)
- **Risk / Breaking:** high / yes
- **Evidence:** JS binding is exclusively via `data-ref` (`bindTemplateRefs`); `getElementById` is used only once app-wide (`app-bootstrap.ts:54`, `appContainer`). That *looks* like ~60 droppable `id` attributes — but verification shows **8 ids are targeted by presentation CSS `#id` selectors** (`#recordBtn`, `#streamCanvas`, `#streamVideo`, `#fsExitBtn`, `#fullscreenBtn`, `#overlayMessage`, `#screenshotBtn`, `#settingsBtn`) and **~30 ids are used as selectors by the 86 Playwright e2e specs** (`#shaderDropdown`, `#settingsMenuContainer`, `#updateActionBtn`, `#linkGithub`, …). Removing the ids would break CSS and e2e.
- **Proposal:** Leave as-is unless the CSS `#id` rules are migrated to class selectors and the e2e suite is migrated to `[data-ref=…]` first — high effort, ~zero LOC payoff. Reporting as an honest negative.

**Honest negatives (investigated, no action):**
- `lib/brightness.utils.ts` (16 LOC, single consumer `shader-slider-controls`): a real domain concept with a clear name; inlining saves ~16 LOC but loses a tested seam — not worth it. (Note: `filename-generator.utils.ts` lives in `src/renderer/lib/`, not this layer.)
- `primitives/` typed DOM-ref layer (`dom-bindings.utils.ts` + `template-dom.contract.ts`, 231 LOC): heavy but earns its keep as the type-safe binding surface; aligns with the future-first mandate — keep. (Minor: `template-dom.contract.ts:10-20` is compressed onto mega-lines — a readability, not LOC, issue.)
- `controller/` registry+catalog (668 LOC of generics): legitimate extension seam for the component system — keep.
- **`declare`-field vs `private readonly` inconsistency** (16 components use `declare x` + constructor assign; `update-section.component.ts` uses `private readonly`): deliberately NOT flagged for normalization. The `declare` form suppresses field emit so `useDefineForClassFields` doesn't clobber constructor assignments; a documented *silent boot-break* class exists here that only `dev:smoke` catches. Low value, real risk — leave it.

## Area 9: `scripts/` + build & tooling config

**Snapshot:** `scripts/` = 14 files, 2,620 LOC (2,427 top-level + 193 in `ci/`).

| File | LOC | Purpose | Called by |
|---|---|---|---|
| `afterPack.js` | 357 | electron-builder afterPack: locale prune, ffmpeg perms/signing, Linux libz bundling + wrapper + strip | `package.json > build.afterPack` |
| `check-layer-boundaries.js` | 381 | Intra-`src/` layer import gate (full LxL matrix) | `npm run lint` → CI |
| `dev-boot-smoke.js` | 361 | Boots `npm run dev`, watches stdout markers, kills process group | `dev:smoke`, CI, `release:preflight` |
| `clean-generated.js` | 255 | rm generated/build artifacts (hard-coded 30-entry inventory) | `clean:generated`, `clean:build` (via `build:vite`) |
| `smoke-test.js` | 250 | Packaged-app smoke: find executable via manifest globs, spawn/watch/kill | `test:smoke`, CI action |
| `check-gpu-package-boundaries.js` | 235 | GPU export map / alias / dist-leak gate | `check:gpu-boundaries` → CI |
| `generate-icons.js` | 222 | Sharp/png2icons icon compositing (png/ico/icns/tray) | `generate-icons` (manual) |
| `check-electron-native-abi.js` | 118 | node-abi compat gate from lockfile | `packaging:check-native-abi` → CI ×5 |
| `ci/build-matrix.mjs` | 107 | CI matrix from `platforms.manifest.json` | release/smoke workflows |
| `ci/merge-mac-yaml.sh` | 86 | Merge per-arch mac `latest-mac.yml` | release-publish workflow |
| `typecheck-app.js` | 73 | `tsc -p tsconfig.app.json` wrapper + strict-flag guard | `typecheck:app` (via `typecheck`) |
| `patch-appimage-runtime.js` | 70 | electron-builder artifactBuildCompleted: patchelf libz on non-x64 | `package.json > build.artifactBuildCompleted` |
| `check-package-exports.js` | 60 | Export-target existence for all 10 packages | `check:exports` → CI |
| `patch-mac-app-name.js` | 45 | Regex-patch dev Electron `Info.plist` name | `dev` (inline) |

Config surface also covered: 4 root tsconfigs, 10 package tsconfigs (+ ui-base `tsconfig.build.json`), 10 package `vite.config.ts`, root `vite.config.js`/`vitest.config.js`, `turbo.json`, `knip.json`, `eslint.config.js`, `patches/electron-trpc+0.7.1.patch`.

**Top opportunities (est. total ~−1,050 LOC):**
- **Config presets (~−430):** 8 of 10 package tsconfigs are byte-identical except the `types` array; collapse all ten onto one shared base, and stop re-declaring the ~90-line `paths` block in `tsconfig.app.json` (it already inherits it). Collapse 10 near-identical `vite.config.ts` lib configs onto one factory with per-package `external` derived from `package.json` deps + node builtins.
- **Replace hand-rolled checkers (~−500):** `check-layer-boundaries.js` (381) + the deep-import guard in `check-gpu-package-boundaries.js` are exactly what **dependency-cruiser** / **eslint-plugin-boundaries** do declaratively; `clean-generated.js`'s 30-entry path inventory (255) collapses to `packages/*/dist packages/*/.turbo` globs via `rimraf`/`git clean -fdX`.
- **Dedupe shared helpers + delete cruft (~−200):** spawn-watch-kill, file-walking, glob-to-regex, and arg-parsing are re-implemented across `dev-boot-smoke`/`smoke-test`/`check-layer-boundaries`/`check-gpu`/`build-matrix`; plus dead npm scripts, a dead turbo task, and vestigial knip ignores.

### CFG-1 Ten package tsconfigs duplicate one base; root `tsconfig.app.json` re-declares the whole `paths` map it already inherits
- **Category:** dedupe / config
- **Files:** `packages/prismgb-*/tsconfig.json` (10× ~19 LOC identical); `tsconfig.app.json:5-98` (re-declares the identical ~90-line `paths` block from `tsconfig.base.json:22-107`) and lines 99-108 re-set `strict`/`noImplicitAny`/`strictNullChecks`/`declaration` already in base; `tsconfig.json` is a 3-line passthrough.
- **LOC impact:** ~−240
- **Risk / Breaking:** med / no (compiler) — see coupling below
- **Evidence:** Answering "can a single base cover all ten?" — **yes.** 8/10 package tsconfigs are identical except `types` (`vite/client` base; `+node` for devices/notes/transcode/updates; `+electron` for ipc/transcode; `@webgpu/types` for gpu). Only deltas: `core` + `notes` add `experimentalDecorators`/`emitDecoratorMetadata` (vestigial per NORM-1); `ui-base` is the lone oddball (`rootDir: "../../"`, extra `@prismgb/core` paths, separate `tsconfig.build.json`). None of the ten `extends` the root base — they each re-type the same 12 compiler flags. **Coupling (load-bearing):** `check-gpu-package-boundaries.js:64-66` raw-`JSON.parse`s `tsconfig.app.json` and reads `compilerOptions.paths` directly — it does **not** resolve `extends`. Dropping app.json's `paths` block makes that gate see `paths:{}` → 0 vs 3 expected GPU aliases → **CI fails**. So this "obvious" dedup is blocked until that checker is updated/removed — which is itself an argument for SCR-1 (raw-JSON config gates are brittle).
- **Proposal:** Add `packages/tsconfig.base.json` (the shared 12 flags); each package `tsconfig.json` becomes `{ "extends": "../tsconfig.base.json", "compilerOptions": { "types": [...], "rootDir":"src","outDir":"dist" } }`. Delete the `paths` + redundant-flag blocks from `tsconfig.app.json` (keep only overrides). Update `check-gpu` (or migrate it — SCR-1) so the alias assertion resolves `extends` or reads a single source. (Merges with Area 1's NORM-1, which covered the core-cluster subset.)

### SCR-1 `check-layer-boundaries.js` (+ gpu deep-import guard) is a hand-rolled dependency-graph linter replaceable by dependency-cruiser / eslint-plugin-boundaries
- **Category:** library
- **Files:** `scripts/check-layer-boundaries.js:1-382`; overlaps `eslint.config.js:88-161` (`no-restricted-imports` layer rules); GPU deep-import half of `check-gpu-package-boundaries.js:141-165`
- **LOC impact:** ~−340 (script deleted; ~40-line declarative config added)
- **Risk / Breaking:** med / yes (gate rewrite)
- **Evidence:** The script hand-implements file classification (`classifyFileLayer`), a regex import extractor (`getImportSpecifiers`, brittle vs a real parser), a forbidden-layer matrix, and CLI reporting. The eslint config *already* enforces a subset of the same rules via `no-restricted-imports` — but they are **complementary, not duplicate**: eslint's alias-pattern rules miss *relative* cross-layer imports (`../../main/foo`), which the script resolves (`resolveTargetLayer`, lines 267-279). That gap is precisely eslint-plugin-boundaries' job, so it can unify *both* the script and the scattered `no-restricted-imports` blocks into one config. **KNOWN GOTCHA confirmed:** `analyzeLayerBoundaries` does `if (!sourceLayer) continue;` (line 311) and `resolveTargetLayer` returns `null` for anything not matching a layer prefix or `SPECIAL_FILE_LAYER_MAP` — so unclassified files are silently exempt. `main/index.ts` is classified *only* via the special map (line 25); renaming it drops its guardrail with a green gate. Also **dead branch:** `resolveAliasTarget` handles `@core/` (lines 260-262) but no `@core` alias exists anywhere (it's `@prismgb/core`).
- **Proposal:** `dependency-cruiser` (`forbidden` rules over `from.path`/`to.path` regex, with `doNotFollow`/`orphan` detection that closes the silent-exempt hole) or `eslint-plugin-boundaries` (`settings.boundaries/elements` + `element-types` rule). Both parse the module graph properly, removing the regex import-scraper. Fold the GPU deep-import ban (`@prismgb/gpu/src`, `/worker`) into the same ruleset.

### SCR-2 Ten package `vite.config.ts` files are one lib-build skeleton with per-package entry/external
- **Category:** dedupe / library
- **Files:** `packages/prismgb-*/vite.config.ts` (312 LOC total; 26-41 each)
- **LOC impact:** ~−190
- **Risk / Breaking:** low / no
- **Evidence:** Every file is `defineConfig({ build:{ lib:{entry…}, rollupOptions:{ external:[…], output:{preserveModules:false} }, sourcemap:true, minify:false }, resolve:{ alias:{'@': resolve(__dirname,'src')} } })`. The only variance is `entry` map, the hand-maintained `external` array, and `name`/`fileName`. The `external` lists literally restate each package's `package.json` `dependencies` + node builtins.
- **Proposal:** `packages/vite.preset.ts` exporting `createPackageConfig({ entries })`; derive `external` automatically from `Object.keys(pkg.dependencies)` + `builtinModules` (+ `node:` prefixes) instead of hand-listing. Each package config drops to ~5 lines. (Merges with Area 1's NORM-1.)

### SCR-3 `clean-generated.js` hard-codes a 30-entry artifact inventory that is a glob
- **Category:** library / dedupe
- **Files:** `scripts/clean-generated.js:11-145` (per-package `dist` ×10 and `.turbo` ×10 enumerated by hand)
- **LOC impact:** ~−180
- **Risk / Breaking:** low / no
- **Evidence:** Lines 45-123 list `packages/prismgb-<name>/dist` and `.../.turbo` for all ten packages individually with identical `owner` strings; the module then reimplements depth-sorted recursive delete (`resolveGeneratedPaths`, `cleanGeneratedOutputs`) that `rimraf` provides. The "ownership" metadata is only used for console labels.
- **Proposal:** Replace the inventory with globs (`packages/*/dist`, `packages/*/.turbo`, plus the fixed roots) and delete via `rimraf` (already transitively present) or `git clean -fdX` for the generated set. Keep the tiny `--build` vs `--generated` switch.

### SCR-4 `dev-boot-smoke.js` and `smoke-test.js` duplicate spawn → watch-stdout → timeout → kill-process-group; file-walk/arg-parse/glob helpers are re-implemented across 5 scripts
- **Category:** dedupe
- **Files:** `scripts/dev-boot-smoke.js:139-326` vs `scripts/smoke-test.js:132-243` (both: `spawn` with `ELECTRON_DISABLE_GPU`/detached, stream collector, `setTimeout` kill, win32 `taskkill` vs `SIGTERM`); file-walkers triplicated (`check-layer-boundaries.js:167 walkCodeFiles`, `check-gpu-package-boundaries.js:105 walkFiles`, `smoke-test.js:52 walkPaths`); hand-rolled arg parsing in `dev-boot-smoke.js:41` and `ci/build-matrix.mjs:10` and `clean-generated.js:241`.
- **LOC impact:** ~−150
- **Risk / Breaking:** med / no
- **Evidence:** Two near-identical `shutdownDevProcess`/timeout blocks; three copies of "recurse a dir collecting source files by extension."
- **Proposal:** `scripts/lib/process-runner.js` (spawn + marker-watch + graceful-kill, parameterized by success/failure patterns) shared by both smokes; `scripts/lib/fs-walk.js` for the walker; standardize arg parsing on `node:util parseArgs` (built-in).

### CFG-2 The `@prismgb/*` → src alias map is authored in four places
- **Category:** dedupe / codegen
- **Files:** `vitest.config.js:11-32` (`sharedAlias`, all 10 pkgs), `vite.config.js:143-154` (gpu-only + `@`-aliases), `tsconfig.base.json:22-107` `paths`, `tsconfig.app.json:9-98` `paths`; asserted again in `check-gpu-package-boundaries.js:91-103`
- **LOC impact:** ~−60 net
- **Risk / Breaking:** med / no
- **Evidence:** The same ten packages' `src` targets are restated in vitest's `sharedAlias`, both tsconfig `paths` blocks, and (for gpu) vite + the boundary checker. They already drift: vite.config.js source-aliases only `@prismgb/gpu` (others resolve via `node_modules` workspace symlinks), whereas vitest source-aliases all ten — a real inconsistency in how packages resolve across build vs test.
- **Proposal:** One `build/workspace-aliases.mjs` that reads `packages/*/package.json` names + `exports` and emits the alias/paths objects; import it into `vite.config.js`, `vitest.config.js`, and generate the tsconfig `paths` (or a single generated `tsconfig.paths.json` all configs extend). Removes the check-gpu alias-drift assertions as a side effect.

### SCR-5 `typecheck-app.js` wraps one `tsc` invocation behind a strict-flag config-drift guard
- **Category:** delete / normalize
- **Files:** `scripts/typecheck-app.js:1-73`
- **LOC impact:** ~−60
- **Risk / Breaking:** low / no
- **Evidence:** `runTypeScript` (lines 6-28) just spawns `tsc -p tsconfig.app.json --noEmit`; `assertStrictEnabled` (42-57) re-reads the tsconfig to fail if `strict`/`noImplicitAny`/`strictNullChecks` aren't `true`. With CFG-1 making `strict` inherit from a single base, this guard guards against a value it now controls centrally.
- **Proposal:** Set `typecheck:app` to `tsc -p tsconfig.app.json --noEmit` directly in `package.json`. If the strict-drift guard is still wanted, it's a one-line `tsc --showConfig | grep` or an eslint rule — not a 73-line script.

### CFG-3 Dead / redundant npm scripts, turbo task, and knip ignores
- **Category:** delete
- **Files:** `package.json:48` (`test:all` = `vitest run`, exact dup of `test:run`), `package.json:40` (`lint:ui-base` — zero references; root `lint` already globs `packages/*/src/**`), `turbo.json:12-14` (`lint` task — no `turbo run lint` exists anywhere; root lint uses eslint directly), `knip.json:36` (`**/*.generated.ts` — no such file exists post-DI-codegen removal), `knip.json:14` (`ignoreDependencies:["joi",…]` — `joi` is not in `package.json`)
- **LOC impact:** ~−20 + hygiene
- **Risk / Breaking:** low / no
- **Evidence:** greps confirm `test:all`/`lint:ui-base` appear only in package.json (+ a DEVELOPMENT.md "alias" row); no `.generated.ts` files exist repo-wide; `grep joi package.json` → none. (Matches Area 1's stale-`joi` external finding in `prismgb-config/vite.config.ts` — the joi→zod migration left residue in two config surfaces.)
- **Proposal:** Delete `test:all`, `lint:ui-base`, the turbo `lint` task, and the two stale knip ignores.

### SCR-6 `smoke-test.js` hand-rolls glob→regex though `picomatch` is already a dependency
- **Category:** library / dedupe
- **Files:** `scripts/smoke-test.js:44-50` (`escapeRegex`, `globToRegex`); `picomatch` is a devDependency used only in `tests/unit/scripts/test-set-coverage.test.js:4`
- **LOC impact:** ~−15
- **Risk / Breaking:** low / no
- **Evidence:** `globToRegex` reimplements single-`*` matching; `picomatch` (already installed, already imported in a sibling test) does this correctly incl. `**`.
- **Proposal:** `import picomatch` in `smoke-test.js` for the manifest executable-priority matching. (Note: `picomatch` is *not* unused — do not delete the dep; dedupe onto it.)

### CFG-4 knip is configured but never enforced, and its ignores mask dead code
- **Category:** normalize
- **Files:** `package.json` (`lint:dead-code: knip`), `knip.json` (whole file)
- **LOC impact:** 0 (process finding)
- **Risk / Breaking:** low / no
- **Evidence:** `knip`/`lint:dead-code` appear in **no** workflow and **no** husky hook (grep of `.github/`, `.husky/` is empty) — it is a manual-only command, so dead exports accumulate unchecked. Compounding it, `knip.json` `ignore`/`ignoreDependencies` carry two provably-stale masks (CFG-3) plus six GPU barrel `index.ts` exemptions (lines 30-35) — over-broad ignores that hide unused-export drift.
- **Proposal:** Either wire `knip` into `reusable-ci-tests.yml` (a real gate) or drop the tool + config; prune the stale ignores regardless. Given the volume of dead code this audit found by hand (CORE-1/2, INF-1/4, APP-5, MAIN-9…), an enforced knip would have caught several automatically.

### SCR-7 `generate-icons.js` — partial library replacement only (honest negative)
- **Category:** library (partial)
- **Files:** `scripts/generate-icons.js:1-223`
- **LOC impact:** ~−40 best case
- **Risk / Breaking:** med / no
- **Evidence:** The ICO/ICNS emission via `png2icons` (lines 175-192) is generic and could be `electron-icon-builder` or electron-builder's own single-PNG icon generation. **But** the macOS rounded-rect gradient background, gem edge-color recoloring, drop-shadow/glow compositing (lines 49-155) is bespoke brand design work no library replaces. Net: modest, and risky to touch. Recommend leaving unless icon regeneration cadence justifies it.

### Honest negatives (keep as-is)
- `afterPack.js` (357) and `patch-appimage-runtime.js` (70): genuine gaps electron-builder does *not* cover — Linux `libz.so`-vs-`libz.so.1` bundling/symlink/patchelf and ffmpeg/ffprobe hardened-runtime signing. Bespoke by necessity.
- `check-electron-native-abi.js` (118): already delegates the ABI computation to `node-abi`; the lockfile-reading around it is thin and legitimate.
- `ci/build-matrix.mjs` (107) + `ci/merge-mac-yaml.sh` (86): manifest-driven CI glue with no off-the-shelf equivalent.
- `patches/electron-trpc+0.7.1.patch`: rewrites electron-trpc's named `import { ipcMain… } from "electron"` to a namespace import — the standard electron ESM/CJS interop fix. Still required at the pinned `electron-trpc@0.7.1`; version-coupled, so re-verify on any electron-trpc bump, but do not remove now.

### Cross-check answers (recorded for the synthesis)
- **DI codegen:** Confirmed and stronger than the sibling stated — `scripts/generate-di.js` **does not exist on this branch**, no `di.generated.ts` exists anywhere, and `@Service` has **zero** occurrences repo-wide. The DI container is now fully hand-wired: `src/renderer/application/container.ts` imports `./di/service-registrations.ts` + `./di/manual-providers.ts` and registers them onto the `@prismgb/core` `Container` (the agent's raw note said "awilix" — corrected here; Areas 5/6 verified the core `Container` directly). There is no codegen script left to audit.
- **Events codegen:** Confirmed — **no** existing script covers `packages/prismgb-events`'s `CODEBASE_*:START/END` markers. The only `generate-*` script is `generate-icons.js`. A proposed `scripts/generate-events.js` (EVT-1) would slot beside the other `check:*` steps in CI and should reuse the shared fs-walk helper (SCR-4) rather than adding a 4th walker.
- **GPU testkit coupling:** Confirmed — `check-gpu-package-boundaries.js:15` hard-codes `EXPECTED_GPU_EXPORTS = ['.', './runtime', './testkit']` and `:17-21` includes `@prismgb/gpu/testkit` aliases. Deleting `./testkit` (GPU-3) requires editing both constants *and* the vitest/tsconfig aliases, plus `vite.config.js:145`, `vitest.config.js:17`, `tsconfig.base.json`/`tsconfig.app.json`. This is exactly the raw-JSON-gate brittleness that motivates SCR-1/CFG-2.

## Area 10: `tests/`

**Snapshot:**
- **`tests/` total: 212 files, 37,308 LOC** (all `.ts`/`.js`/`.tsx` under `tests/`). Extension mix: 99 `.test.ts`, 39 `.test.js`, 6 `.spec.js` (e2e).
- **LOC by directory:**
  - `tests/unit/` — 25,537 LOC / 133 test files. Breakdown: `renderer/` 19,862 (91 files), `main/` 2,300 (11), `packages/` (root-tree guard tests) 1,090 (9), `utils/` 996 (5), `scripts/` 649 (7), `shared/` 549 (8), `config/` 53 (1), `factories/` (meta) 38 (1).
  - `tests/e2e/` — 2,612 LOC / 14 files (6 `.spec.js` + pages/helpers/fixtures). Playwright, run separately.
  - `tests/performance/` — 1,007 LOC (benchmarks 384 + baseline 278 + baseline.config 345).
  - `tests/workflows/` — 458 LOC (2). `tests/integration/` — 420 LOC (1).
  - **Non-test helper infra (part of the 37,308):** `tests/factories/` 4,102 LOC (17 files), `tests/support/mocks/` 1,482 (15), `tests/devices/media.testkit.ts` 656, `tests/fixtures/layer-boundaries/` 606 (21 input fixtures), `tests/utilities/ResolutionCalculator.js` 290, `tests/utils/index.js` 84.
- **Package-local tests (collected by their own vitest projects, ~1,993 LOC):** `packages/prismgb-gpu/tests` 1,775 (17), `prismgb-ui-base/tests` 199 (3), `prismgb-core/tests` 19 (1). **All are wired into `vitest.config.js` projects (`gpu-package`, `core-package`, `ui-base-package`) — there is NO never-executed package test code on this branch.**
- **Largest 10 test files (LOC):** notes-panel.component 874, capture-ui.bridge 608, main/update.service 591, notes.service 579, disclosure 494, browser-services 494, shader-slider-controls 471, settings-fullscreen.service 464, gpu-recording.service 459, capture.orchestrator 450.
- **Helper infrastructure that exists today (mature):** `tests/factories/index.js` re-exports ~120 `create*Mock` factories across 17 domain factory files; `createMockDependencies`/`createStreamingDependencies`/`createCaptureDependencies` assemble full DI dependency bundles; `tests/support/mocks/installers/` provides browser-API installers (canvas/media/blob/worker/storage). This layer is heavily consumed (factory `index.js` imported by ~81 test files; `createLoggerFactory` in 51).

**Top opportunities (honest — the suite is largely earned; realistic aggressive reduction ≈ 2,300–2,900 LOC, ~7% of `tests/`):**
- **Retire the wall-clock performance/benchmark suites + their test-only `ResolutionCalculator` subject: ≈ −1,600 LOC** (highest-confidence, real file LOC, not a projection). These run in the pre-commit suite on every commit.
- **DOM-mount boilerplate helper for the 22 component-test files (111 `createElement` + 39 `appendChild`): ≈ −450 LOC.**
- **Parameterize the pure-utility tests (`it.each`) + drop hand-maintained list/parity tests: ≈ −350 LOC.**

### TEST-1 Performance/benchmark suites + test-only `ResolutionCalculator` are wall-clock threshold tests running in pre-commit
- **Category:** delete
- **Files:** `tests/performance/benchmarks.test.js` (384), `tests/performance/baseline.test.js` (278), `tests/performance/baseline.config.js` (345), `tests/utilities/ResolutionCalculator.js` (290, test-only), `tests/unit/utils/ResolutionCalculator.test.js` (338). **Cluster = 1,635 LOC.** Consumer coupling: `ResolutionCalculator` is also imported by `tests/integration/streaming.test.js` (8 refs) and `performanceUtils` (`tests/factories/performance.factory.js`, 203 LOC) is imported by benchmarks + integration.
- **LOC impact:** −1,007 (delete `tests/performance/` outright) is clean and self-contained. A further −628 (`ResolutionCalculator.js` + its dedicated 338-LOC unit test) requires first removing the `ResolutionCalculator` usage from `tests/integration/streaming.test.js`. Total reachable ≈ **−1,635**.
- **Risk / Breaking:** low / no. Coverage lost = timing assertions only, which the file itself admits are noise-prone: baseline.test.js comment "*Median timing keeps sub-millisecond baselines stable under full-suite worker scheduling noise*". `ResolutionCalculator` is a **test-only re-implementation** (grep confirms no `ResolutionCalculator` symbol anywhere in `src/` or `packages/*/src/`) — its 338-LOC exhaustive unit test is testing scaffolding, not product code. `PerformanceCache`/`AnimationCache` (the only real `@prismgb/core` subjects these touch) are themselves flagged dead in CORE-1.
- **Evidence:** `grep -rl ResolutionCalculator src packages/*/src` → no match (subject is test-only). `benchmarks.test.js:20-27` defines `THRESHOLDS` (e.g. `resolutionCalcCached: 0.1ms`) and asserts `result.avg < threshold` — classic flaky wall-clock gates. `vitest.config.js` `renderer-happy-dom` project includes `tests/performance/**`, so these run on every `vitest run` → every pre-commit hook.
- **Proposal:** Delete `tests/performance/` (−1,007). Then remove `ResolutionCalculator` from `tests/integration/streaming.test.js` (replace its calls with inline literals or the real streaming-math source path) and delete `tests/utilities/ResolutionCalculator.js` + `tests/unit/utils/ResolutionCalculator.test.js` (−628). If any perf-guarding is desired, it belongs in a separate, non-pre-commit `npm run bench` lane, not the commit-gating suite.

### TEST-2 Hand-built DOM setup duplicated across 22 component test files
- **Category:** dedupe
- **Files:** 22 files use `document.createElement` (111 total calls) + 39 `appendChild`. Representative: `tests/unit/renderer/presentation/features/toolbar/shader-slider-controls.component.test.ts:27-51` (hand-builds `input[type=range]` ×2, `span` ×2, `div`, `video`, then 6× `document.body.appendChild`). Same pattern in `settings-menu.component.test.ts`, `notes-panel.component.test.ts`, `disclosure.test.ts`, `notes-resize-handler.component.test.ts`, toolbar/*.
- **LOC impact:** ≈ **−450** (roughly 20 LOC of setup × 22 files, minus a ~60-LOC helper).
- **Risk / Breaking:** low-med / no. These are real happy-dom elements exercised for real attribute/event behavior, so the helper must return real (not mock) elements — mechanical but must preserve element identity/attributes each test relies on.
- **Evidence:** `grep -rho document.createElement tests → 111` across `grep -rl → 22` files; `appendChild → 39`. The existing `tests/factories/ui.factory.js` `createMockElement`/`createMockButton`/`createMockInput` return **mock objects**, not DOM nodes, so component tests that need live DOM bypass them and hand-roll — a genuine gap in the otherwise-complete factory layer.
- **Proposal:** Add `tests/support/dom-mount.helper.js` exporting a declarative mount, e.g. `mountElements({ brightnessSlider: 'input[type=range]', brightnessPct: 'span', streamVideo: 'video' }) → { elements, cleanup }` that creates real nodes, appends to `document.body`, and returns a `cleanup()` for `afterEach`. Migrate the 22 files to it.

### TEST-3 Pure-utility tests are unparameterized literal-varying `it()` clusters
- **Category:** parameterize
- **Files:** `tests/unit/utils/string.utils.test.js` (escapeHtml block: ~11 `it()` differing only in input→output literals, `:10-62`), `brightness.utils.test.js`, `FilenameGenerator.test.js`, `tests/unit/renderer/presentation/icons/icon-utils.test.js`, `tests/unit/shared/lib/errors.test.js` + `errors/error-guards.test.js`, `tests/unit/renderer/infrastructure/events/event-payloads.test.js`, `channels.contract.test.js`. **`it.each`/`test.each` is currently used in only 1 file repo-wide.**
- **LOC impact:** ≈ **−250 to −350** (parameterization wins are concentrated in these small pure-function files).
- **Risk / Breaking:** low / no (same assertions, table-driven — no coverage change).
- **Evidence:** `grep -rlE '(it|test|describe)\.each' tests → 1 file`. Verified per-file: `string.utils.test.js:10-62` is a genuine `it.each` table. By contrast the *fat* files are NOT parameterizable — `app-state.test.ts`'s 39 blocks are all distinct behaviors (constructor, derived-state, getter-fallback, dispose-idempotency, edge cases), and `shader-slider-controls`'s blocks test distinct behaviors. **Do not target the fat component/service suites for parameterization — the LOC is in behavior, not repetition.**
- **Proposal:** Convert only the pure-function tests to `it.each` tables (input/expected pairs).

### TEST-4 Hand-maintained list/parity lock tests (maintenance tax with zero behavior coverage)
- **Category:** delete (the *lists* only — keep the behavioral guards)
- **Files:** `tests/unit/factories/installer-parity.test.js` (38 — asserts a hardcoded `expectedSymbols` array matches the installer barrel's exports; must be edited on every installer add/remove). `tests/unit/renderer/application/container.test.ts:79-82` — the `expectedRegistrationKeys` `arrayContaining` token list (still hand-maintained; must be updated on every DI change). Consider also `tests/unit/packages/ipc/channel-parity.test.ts`.
- **LOC impact:** ≈ **−80 to −120** (delete `installer-parity.test.js`; excise only the token-list assertion from `container.test.ts`, keeping its `resolve()` tests).
- **Risk / Breaking:** med / no. Losing a compile-adjacent tripwire. Mitigated because the symbols they guard are already exercised: installer symbols are imported by real installer usages; DI token resolution is covered by `container.test.ts`'s own `expect(() => container.resolve(...)).not.toThrow()` assertions (`:104-139`).
- **Evidence:** `installer-parity.test.js:4-25` is a literal `expectedSymbols = [...]` array compared to `Object.keys(Barrel)`. `container.test.ts:81` `expect(tokens).toEqual(expect.arrayContaining(expectedRegistrationKeys))`.
- **Proposal:** Delete `installer-parity.test.js`; drop the `expectedRegistrationKeys`/`arrayContaining` assertion from `container.test.ts` (keep the behavioral `resolve()`/`not.toContain('uiController')` checks). **Do NOT delete** the GPU boundary/import-safety guards (see honest negative below).

### TEST-5 Convention normalization: `.test.js`/`.test.ts` mix, test-file naming drift, assertion style
- **Category:** normalize
- **Files:** 39 `.test.js` vs 99 `.test.ts` (e.g. `tests/unit/utils/*.test.js`, `tests/unit/shared/**/*.test.js`, `tests/unit/renderer/infrastructure/adapters/*.adapter.test.js` while sibling adapters use `.ts`). Test-file name ≠ subject name in ≥5 files: `settings-display-mode.orchestrator.test.ts` → subject `display-mode.orchestrator.ts`; `settings-preferences.orchestrator.test.ts` → `preferences.orchestrator.ts`; `animation-performance.orchestrator.test.ts` → `performance/performance-animation.orchestrator.ts`; `animation-performance.service.test.ts` → `performance/performance-animation.service.ts`; `stream-health.service.test.ts` → `platform/health.service.ts`. Assertion style: `toEqual` used 178×, `toStrictEqual` 0×.
- **LOC impact:** ~0 (consistency, not reduction).
- **Risk / Breaking:** low / no.
- **Evidence:** `find tests -name '*.test.js' | wc -l → 39`; the 5 naming-drift files verified — each `import`s a real, differently-named `@renderer/...` subject (so they are **naming drift, NOT orphaned tests**; the subjects exist). `grep toStrictEqual → 0`.
- **Proposal:** Rename `.test.js` → `.test.ts` where the module under test is TS (mechanical, `git mv`); rename the 5 drifted test files to match their subject module; adopt `toStrictEqual` for object-shape assertions. Low priority.

### Honest negatives (surfaces that look big but earn it)
- **Mock/factory centralization is already done — the hypothesized "hand-rolled mock duplication" is NOT a real opportunity.** `createMockDependencies` + the 4,102-LOC `tests/factories/` layer is consumed by ~81 files; only **3** files define a local logger object literal, **1** of 11 `main/` tests hand-rolls a logger, and **1** package test hand-rolls. Do not propose a "shared mock factory" — it exists and is used.
- **The fat feature suites earn their LOC.** notes-panel (874), capture-ui.bridge (608), notes.service (579), main/update.service (591) map 1:1 to large product surfaces and test distinct behaviors; they are not dedupe/parameterize targets.
- **Service-test setup is already thin** (`beforeEach` → `createMockDependencies(...)`); the *component*-test setup is the fat half — captured as TEST-2.
- **Keep the GPU behavioral guard tests.** `index.root-safety.test.ts` (36), `runtime/export-surface.test.ts` (23), `application/renderer.service.import-safety.test.ts` (47) are cheap tripwires for the exact regression class this repo keeps hitting (the `catalog.test.ts` blocker, the dist-boundary fix at `365152d3`, the worker double-bundling `build:vite` break). Deleting these is med/high risk, not a reduction win.
- **`tests/fixtures/layer-boundaries/` (606 LOC, 21 fixtures)** are legitimate input fixtures for `check-layer-boundaries.test.js` — not dead, not reducible (though they migrate/shrink if SCR-1 replaces the checker).
- **Streaming's four-layer coverage (unit / integration / workflow / performance) is legitimate layering**, not duplication — except the `performance/` layer (TEST-1) which is timing-gate noise, not behavior.

---

## Cross-Cutting Synthesis

### Consolidated ledger

| Bucket | Findings | Est. net LOC |
|---|---|---|
| Pure deletions (dead code, zero consumers, verified by grep) | CORE-1, CORE-2, TEST-1, INF-1, INF-4, UIB-7, GPU-3, MAIN-8/9/10, TYP-1, APP-5, CFG-3, `formatErrorLabel` | **~−2,600** |
| Config/tooling consolidation | CFG-1, CFG-2, SCR-2, SCR-3, SCR-4, SCR-5, SCR-6, NORM-1 (subset of CFG-1) | **~−900** |
| Library swaps (hand-written → dependency/built-in) | MAIN-1 (electron-log), UIB-2 (@preact/signals-core), UIB-3 (@floating-ui/dom), CORE-3 (Promise.withResolvers), CORE-4 (type-fest), SCR-1 (dependency-cruiser / eslint-plugin-boundaries), TRC-1 (fluent-ffmpeg — flagged) | **~−780 (−970 w/ TRC-1)** |
| Codegen (hand-kept mirrors → generated) | EVT-1 (events manifest — the generator markers exist but no generator does), CFG-2 (alias map) | **~−210** |
| Structural dedupe (shared base/helper extraction) | UIB-1, APP-2≡PRES-2, GPU-1, GPU-2, TRC-2, TRC-3, INF-2/3/5/6, MAIN-2/4/5, APP-1/3, PRES-1/4/5/6/7, DEV-1, UPD-1, X-1/2/3, UIB-4/6 | **~−1,100** |
| Test-suite refactors (beyond TEST-1's deletions) | TEST-2, TEST-3, TEST-4 | **~−800 to −900** |
| **Total** | (overlaps deduplicated: NORM-1⊂CFG-1, APP-2≡PRES-2, APP-5⊂CORE-1) | **≈ −6,000 to −6,800 LOC** (~9–10% of the ~66k-LOC tree), plus one dependency removed (winston) and 2–4 added (electron-log, @preact/signals-core, optionally @floating-ui/dom, dependency-cruiser as devDep) |

### Themes (the same five defects recur in every area)

1. **Re-declared structural contracts.** `LoggerFactoryLike`/`LoggerLike`/`EventBusLike`/`StorageServiceLike`/`EventTargetLike` and channel constants are re-typed locally in ≥14 files across packages, main, renderer, and ui-base (X-1, MAIN-7, APP-6, UIB-4, UPD-2) even though `@prismgb/core`/`@prismgb/events` export the canonical forms — and in each layer at least one sibling file already imports them correctly, proving the convention exists. One mechanical sweep fixes all of it.
2. **The lifecycle/disposal facade is written three-plus times.** `BaseService`, `BaseOrchestrator`, and `PresentationComponent` each wrap `DisposableBag` with byte-equivalent timer/track/replace methods (UIB-1); services then bypass those helpers and hand-roll keyed timers anyway because the base lacks keyed variants (X-5, INF-9); widgets re-invent grouped disposal (UIB-6); stores re-invent subscription teardown six times (APP-2/PRES-2). **One core `ManagedLifecycleHost` + keyed `schedule()` + `ReactiveEventStore` base collapses ~10 findings.**
3. **Hand-kept mirrors that should be generated or drift-guarded.** The events manifest is mirrored by ~300 hand-written LOC with runtime drift-checkers standing in for the missing generator (EVT-1); the `@prismgb/*` alias map is authored in four config surfaces plus a checker that asserts their agreement (CFG-2); Zod schemas re-encode devices' TS types with no `satisfies` guard (X-4/MAIN-4); DI token lists are re-asserted in hand-maintained tests (TEST-4).
4. **Refactor residue.** Every recent migration left a corpse: the DI-codegen deletion stranded `AnimationCache`, decorator tsconfig flags, and a knip ignore for `*.generated.ts`; the joi→zod migration left a `joi` external and a `joi` knip ignore; the tRPC migration left a write-only main EventBus (MAIN-3) and an unwired GPU policy path (INF-1); the GPU refactor left identity-mapping uniform indirection (GPU-1) and triple-forwarding (GPU-2). **Recommendation:** wire `knip` into CI (CFG-4) so the next migration's residue is caught mechanically.
5. **The suite's biggest single cost is self-inflicted:** 1,635 LOC of wall-clock benchmark gates + a test-only re-implementation of production math, running in the pre-commit hook on every commit (TEST-1).

### Execution plan (wave-ordered; each wave independently shippable)

Gates for every wave: `npm run test:run` + `npm run typecheck` + `npm run lint` + **`npm run dev:smoke`** (mandatory — DI/base-class/field-shape changes have a documented boot-break class invisible to typecheck and vitest). Presentation-facing waves also need `npm run test:e2e` (the 86 specs select by `#id` — PRES-10).

- **Wave 1 — pure deletions (~−2,600, low risk, no design decisions):** TEST-1 performance suites; CORE-1 + APP-5 (`AnimationCache`/`PerformanceCache` + token + integration-test touchups); CORE-2 `TypedRegistryFactory`; INF-4; MAIN-8/9/10 + TYP-1; UIB-7; CFG-3; `formatErrorLabel`. Exception: INF-1 first needs owner decision D1.
- **Wave 2 — mechanical normalization (~−250):** canonical `*Like` imports everywhere (X-1, MAIN-7, APP-6, UIB-4); `getErrorMessage` adoption (INF-8); UPD-2; EVT-3; PRES-8/9; `satisfies` drift-guards (X-4, MAIN-4); CORE-5; TEST-5 renames.
- **Wave 3 — config/tooling (~−900):** CFG-1 + SCR-2 presets (**sequencing constraint:** update or replace `check-gpu-package-boundaries.js` first — it raw-parses `tsconfig.app.json` without resolving `extends`); CFG-2 alias module; SCR-3, SCR-4, SCR-5, SCR-6; CFG-4 (enforce knip in CI); decide D7 on SCR-1.
- **Wave 4 — library swaps (~−500 without TRC-1):** MAIN-1 electron-log; UIB-2 @preact/signals-core (rewrite `signal.test.ts` to lazy semantics); CORE-3 `Promise.withResolvers` (bump TS `lib`); CORE-4 type-fest; UIB-3 @floating-ui/dom last (lowest confidence).
- **Wave 5 — structural dedupe (~−1,100):** EVT-1 events generator; `ManagedLifecycleHost` + keyed timers + `ReactiveEventStore` (UIB-1, X-5, INF-9, APP-2/PRES-2, UIB-6 together — one core change, many consumers); GPU-1/GPU-2; TRC-2/TRC-3; INF-2/3/5/6; MAIN-2/5; APP-1/3; PRES-1/4/5/6/7; DEV-1/UPD-1; X-2/X-3.
- **Wave 6 — test refactors (~−850):** TEST-2 dom-mount helper; TEST-3 `it.each`; TEST-4 parity-list removal.

Waves 1–3 are mechanical enough for cheaper-model execution with the gates above; waves 4–5 change behavior-adjacent code and deserve stronger review. TEST-1 (wave 1) also directly cuts pre-commit latency for every subsequent commit, so do it first.

### Owner decisions required before execution

| # | Decision | Recommendation |
|---|---|---|
| D1 | **INF-1:** the ARM-Linux WebGPU-skip policy is unwired (streaming-render calls `detectBrowserGpuCapabilities` directly). Dead code, or a WIP regression to re-wire? | Investigate before wave 1; if intentional, also delete `gpu.getPolicy` route + `gpu-policy.ts` (MAIN-9 expands) |
| D2 | **TRC-1:** replace the 310-LOC `TranscodeProcess` with maintenance-stalled `fluent-ffmpeg` (loses `-progress pipe:1` precision)? | **Skip**; take TRC-2/TRC-3 only. The wrapper is tested and correct |
| D3 | **GPU-3:** narrow the GPU public surface + delete the `./testkit` entrypoint (coupled: boundary script, aliases, surface-lock tests)? | Yes, but as one coordinated commit; it partially reverses the future-first seam policy — owner call |
| D4 | **MAIN-3:** main-process EventBus is a write-only sink. Future seam or delete? | Delete (aggressive) — the renderer push path is tRPC; re-add when a real subscriber exists |
| D5 | **UIB-8:** adopt `lit` to replace the hand-rolled UI framework? | **No** — surgical wins (UIB-1/2/3/7) capture most value; ARIA widgets are defensibly bespoke. Revisit only if the React "P4" plan is formally abandoned |
| D6 | **APP-4:** awilix DI migration (the old P2 plan)? | **Close it as obsolete** — the codegen deletion already banked the reduction; awilix is lateral and loses typed tokens + ordered dispose |
| D7 | **SCR-1:** replace hand-rolled boundary checkers with dependency-cruiser or eslint-plugin-boundaries? | Yes — dependency-cruiser; it also closes the confirmed silent-exemption hole (unclassified files pass a green gate) |

### Stale-knowledge corrections this audit produced (recorded so future work doesn't re-assume them)

- `scripts/generate-di.js`, `di.generated.ts`, `external-tokens.ts`, and all `@Service` usage were **deleted** (commit `12d2e2c5`); DI is hand-wired registration modules onto the `@prismgb/core` `Container` in both processes.
- The core "dead primitive layer" claim is now precise: `PerformanceCache`/`AnimationCache` and `TypedRegistryFactory` dead; `Container` very alive; Bus/Store/Pipeline/Validator files no longer exist.
- `@prismgb/ipc` is **not** vestigial post-tRPC; `@prismgb/config` earns its boundary; the main/renderer EventBus subclasses are deliberate adapters, not duplicates.
- Package-local tests (`packages/{gpu,ui-base,core}/tests`) **are** collected by dedicated vitest projects on this branch.
- `renderer-app.orchestrator.ts` no longer exists at the renderer root; the root orchestrator is `application/orchestrators/app.orchestrator.ts`.
- Test factories/mocks are already centralized (~120 factories, 81 consumer files) — "shared mock factory" is done, not an opportunity.

---

# Round 2: Maximum-Aggression Structural Options

Round 1 trimmed layers; Round 2 removes them. Every option below is a *architecture decision*, not a cleanup — each deletes an entire plane of the codebase and the ceremony that exists to serve it. All numbers below were re-measured on the working tree (not taken from Round 1): **133** eventBus publish/subscribe sites across **45** files; orchestrators = **1,409** LOC; DI plane (both containers + di/ modules + core `Container` primitive) = **464** src + **386** test LOC; GPU worker path = **1,135** LOC; per-package config boilerplate (10× package.json + tsconfig + vite.config) = **871** LOC; `@prismgb/events` = **783** LOC; presentation bridges = **317** LOC; notes feature = **2,220** src + **2,220** test LOC (coincidentally identical); renderer performance subsystem = **685** LOC; `.husky/pre-commit` = full `npm run test:run`; **32** `super(dependencies…)` ceremony sites.

**Decision gate:** choose from this menu FIRST, then re-scope Round 1. R2-1 makes Wave 3's config presets moot (don't build presets for configs you're deleting); R2-3 converts EVT-1 from "write a generator" to "delete the thing being generated"; R2-2 subsumes MAIN-8/APP-4/APP-5; R2-6 subsumes UIB-1/X-5/INF-9 by deletion instead of extraction.

### R2-1 Collapse the npm workspace: 10 packages → in-tree modules
- **Deletes:** 10× `package.json`/`tsconfig.json`/`vite.config.ts` (871 LOC), `turbo.json` + the `predev`/`prebuild:vite` build step, `check-package-exports.js` (60), most of `check-gpu-package-boundaries.js` (235), the 4-way alias map (CFG-2), `clean-generated.js`'s package inventory (SCR-3), per-package `dist/` lifecycle entirely.
- **Est. LOC:** **~−1,300 config/tooling**, plus it *eliminates the failure class* that currently breaks the repo: the `build:vite` worker double-bundling (packages consumed via built `dist/`), stale-dist boot bugs, alias drift between vite/vitest/tsconfig, and the dist-boundary checks. That bug class has produced at least three real incidents on this branch alone.
- **What you lose:** package publishability (nothing is published — no `publishConfig`, no registry pipeline; packages are consumed only via workspace + src aliases, so the workspace is currently *pure overhead*), and directory-enforced boundaries (replace with dependency-cruiser rules per SCR-1/D7 — same enforcement, one config).
- **Shape:** `packages/prismgb-gpu/src` → `src/platform/gpu/`, etc. Folder structure and import rules preserve the architecture; only the build-unit boundary dissolves. Moderate variant: one `@prismgb/platform` package with subpath exports (keeps a single lib build if a future extraction is genuinely planned).
- **Risk / Breaking:** high (build wiring touches everything) / internal-only. Gate on `dev:smoke` + `build:vite` + e2e — note this likely *fixes* `build:vite` rather than breaking it.
- **Verdict: recommended.** This is the highest-leverage structural option per unit of risk: the workspace's benefits are all hypothetical (publishing, independent versioning) while its costs are all realized (config ×10, broken prod build, three checker scripts, alias drift).

### R2-2 Delete the DI container plane → explicit composition roots
- **Deletes:** core `Container` primitive, both `container.ts` files, `di/service-registrations.ts` + `manual-providers.ts` (464 LOC total), the container test suites (386 LOC), `AppOrchestrator`'s resolve/null mirrors (MAIN-6), the token-list test (TEST-4), and the entire cradle-proxy gotcha class (the documented silent-boot-break family).
- **Replacement:** one plain `composeRenderer(): AppServices` function per process that constructs services in dependency order and returns a typed record; teardown is an explicit reversed array. TypeScript enforces construction order (you can't pass what isn't constructed yet) — strictly stronger than the current runtime proxy, which defers missing-dependency failures to first access. With 53 tokens and exactly one composition per process, the container resolves nothing dynamically that a function couldn't.
- **Est. LOC:** **~−700 to −800 net** (src + tests, after the ~150-LOC compose functions).
- **Risk / Breaking:** high touch-count, mechanical in nature / internal. Gate on `dev:smoke` (this is exactly the change class it exists for).
- **Verdict: recommended.** The codegen deletion (`12d2e2c5`) already conceded the container's dynamic features weren't earning their keep; this is the consistent end-state. Supersedes APP-4 (awilix question dissolves), MAIN-8, APP-5.

### R2-3 Retire the renderer event bus as the state plane → services write signal stores directly
- **The observation:** the renderer has **two reactive planes**: a stringly-typed event bus (manifest → channels → publish → subscribe → narrow payload → set signal) and the signal graph itself. Every bus round-trip exists to move data from a service into a signal that a component binds. 133 pub/sub sites, 45 files, plus 783 LOC of events-package machinery (manifest, channel trees, payload maps, two runtime drift-checkers), 317 LOC of bridges, and the six store subscription harnesses — all serving as plumbing *between* the two planes.
- **Replacement:** services receive (or own) their stores and call `store.setX(...)` — typed, jump-to-definition, no manifest, no payload narrowing, no drift checking (the compiler is the drift check). tRPC subscriptions update stores directly. Keep a minimal typed emitter (or `eventemitter3` raw) only for genuinely broadcast concerns (handler-error reporting) — or nothing.
- **Est. LOC:** **~−900 to −1,200 net** (events package internals, bridges, store harnesses, payload readers, drift tests; publish sites become direct calls of similar length).
- **What you lose:** publisher/subscriber decoupling — services would know which stores they feed. Under the future-first philosophy this is the most contentious option here: the bus is a *deliberate* seam. Counterpoint: 100% of current traffic is 1-producer→1-consumer state sync, the payloads are `unknown` (every consumer re-narrows by hand — PRES-2), and the manifest needs a generator that was never written (EVT-1). The seam is paying costs, not earning them.
- **Risk / Breaking:** high / internal. Sequence after the R2-4 decision (a UI rewrite would redo the consumer side anyway).
- **Verdict: recommended in principle, decide after R2-4.** Supersedes EVT-1 (delete instead of generate), APP-2/PRES-2, MAIN-3, and most of IPC-2.

### R2-4 UI rewrite: Preact + `@preact/signals` (the P4 resurrection, minus PrimeReact)
- **Scope:** replaces the entire hand-rolled UI substrate — template-string builders + `data-ref` binding layer (231 LOC primitives + template files), `dom-bindings` (88), `PresentationComponent` lifecycle (148), the imperative init/dispose ceremony (PRES-1/4: ~105 LOC of pure ceremony), the component controller/catalog registry (668), and most per-feature wiring — with JSX components over the same signal stores. `@preact/signals` is the natural continuation of UIB-2 (same API).
- **Est. LOC:** **~−2,500 to −3,500 net** across `presentation/` (6,715) + `ui-base` (1,599), based on typical 35–45% shrink for imperative-DOM → declarative conversions of this shape. The four ARIA widget controllers port as headless hooks (their keyboard/ARIA logic survives; their DOM-wiring scaffold dissolves). Component tests (22 files, TEST-2's cluster) rewrite onto `@testing-library/preact`. E2e survives if `id` attributes are kept in JSX (PRES-10's constraint).
- **Risk / Breaking:** very high — this is a rewrite, the only Round-2 item that is one. It is the largest single lever in the codebase and only rational if bundled with R2-3 (one reactive plane) and treated as a project, not a cleanup.
- **Verdict: genuine option, owner call (supersedes D5/UIB-8).** If the answer is no, take UIB-1/2/3/7 from Round 1 and stop there.

### R2-5 Collapse the orchestrator layer
- **The observation:** 9 orchestrators, 1,409 LOC, whose dominant content is: mirror deps (APP-1), subscribe to bus channels, forward to a service or store, manage init/cleanup order. With R2-3 (no bus) most of their body evaporates; even without it, the per-domain orchestrators can merge into their domain services (which already own lifecycle via `BaseService`) leaving one `AppCoordinator` that owns ordering.
- **Est. LOC:** **~−400 to −600** standalone; more under R2-3.
- **Risk / Breaking:** med-high / internal. The teardown-order subtleties (APP-3: cleanup ≠ reverse-init, GPU-before-recording constraints) must move intact — this is where the risk lives.
- **Verdict: do with R2-3, not before.**

### R2-6 Replace the inheritance bases with composition
- **Deletes:** the `BaseService`/`BaseOrchestrator`/`PresentationComponent` class hierarchy and its 32 `super(dependencies, 'Name')` sites, replaced by `const ctx = createLifecycle('Name', deps)` returning `{ logger, bag, timeout, interval, subscribe }`. UIB-1's triplicated facade is solved by *deletion* rather than extraction; the keyed-timer gap (X-5/INF-9) gets one home; the `declare`-field/`useDefineForClassFields` boot-break class disappears with the inheritance.
- **Est. LOC:** **~−250 to −350 net**, plus removal of a documented gotcha family.
- **Risk / Breaking:** med (mechanical, wide) / internal. Natural companion to R2-2 (both are "composition over framework").
- **Verdict: recommended alongside R2-2.**

### R2-7 Test-suite policy shifts (beyond Round 1's deletions)
- **Pre-commit:** `.husky/pre-commit` runs the full `vitest run` on every commit. Replace with `lint-staged`-style `vitest related --run` + typecheck, moving the full suite to pre-push/CI. Zero LOC; the single biggest recurring time cost in the repo. (TEST-1's deletion helps; this fixes the policy itself.)
- **Delete tests of hand-rolled tooling when the tooling goes:** `tests/unit/scripts/` (649 LOC) tests the checker/smoke scripts; adopting SCR-1 (dependency-cruiser) and R2-1 orphans most of it. Tests follow their subjects out.
- **E2e-first stance for presentation (aggressive):** where one of the 86 Playwright specs already covers a user flow, retire the overlapping happy-dom component test rather than maintaining both. Honest cost: unit-level failure localization. Est **−1,500 to −3,000** beyond Round 1 if applied firmly; apply per-file judgment, not a blanket rule.
- **Coverage ratchet:** the coverage waivers expire 2026-07-31 — decide whether the ratchet survives Round 2 before it starts failing builds mid-refactor.
- **Verdict: pre-commit change immediately; the rest follows the structural choices.**

### R2-8 Feature deletion menu (product decisions, full-stack costs)
| Feature | Full-stack cost | Notes |
|---|---|---|
| **Notes** | **~−4,700** (2,220 src + 2,220 tests + DI/catalog/CSS/e2e glue) | The single largest feature lever, and the most boilerplate-dense surface in the app (most PRES findings live in `features/notes/`). If notes has low usage, deleting it outperforms every refactor in this document. |
| **GPU worker render path** | **~−1,300** (1,135 src + tests) | The worker path is also the *cause* of the broken `build:vite` (double-bundling). Options: delete if main-thread rendering meets frame budget (measure first), or keep and let R2-1 fix the bundling. |
| **Performance metrics/HUD subsystem** | **~−1,000** (685 renderer + main router + tests) | Diagnostic feature; if it's not user-facing value, it's removable. |
| **Canvas2D fallback driver** | **~−400** | WebGPU-only stance. **Caveat:** Linux (esp. ARM) WebGPU support is still uneven — this interacts directly with the unwired policy in D1/INF-1. Do not take this until D1 is resolved. |
- **Verdict: owner menu.** Not recommendations — priced options.

### R2-9 Let tRPC be the error channel: delete the `{ success, error }` envelope protocol
- **The observation:** the router wraps every procedure in hand-rolled `resultEnvelope`/failure-mapper closures (MAIN-2) and Zod `successEnvelope` response schemas (MAIN-4) — a pre-tRPC convention ported into tRPC, which already has typed error propagation (`TRPCError`, `onError`, client-side error links). Renderer services then re-branch on `.success`.
- **Replacement:** throw `TRPCError` in procedures; let the client catch. Envelope schemas, failure mappers, and consumer `.success` branches all delete. Keep Zod *input* validation (the actual trust boundary); output schemas on a same-process trusted channel are optional ceremony.
- **Est. LOC:** **~−200 to −300** across router, schemas, and renderer consumers. Converts MAIN-2/MAIN-4 from "dedupe the boilerplate" to "delete the protocol."
- **Risk / Breaking:** med / yes (renderer call sites change shape).
- **Verdict: recommended.**

### Considered and rejected
- **Leaving Electron (Tauri/Wails):** a full main-process rewrite in Rust/Go plus loss of the native `usb`/ffmpeg-static/electron-updater integrations. A platform migration, not a reduction — rejected.
- **Deleting the `@prismgb/devices` catalog/matching layer:** it is the product's domain core (one supported device today, but the catalog *is* the extensibility story for more). Keep.
- **Dropping TypeScript strictness or Zod input validation to shrink ceremony:** shrinks LOC by weakening the trust boundary and the compiler — the opposite trade this codebase wants.

### The stacked end-state ("the monolith option")
Adopting R2-1 + R2-2 + R2-3 + R2-5 + R2-6 + R2-9 (no UI rewrite, no feature deletion) yields, with overlaps deduplicated, roughly **−3,500 to −4,500 LOC of production/tooling code** *on top of* the non-superseded Round-1 findings (~−3,500 of Round 1 survives the supersessions), plus Round-1 test reductions (~−2,500). **Combined potential ≈ −9,500 to −11,500 LOC — roughly 15–17% of the tree — while deleting four entire concept-planes** (workspace build units, DI container, event bus, inheritance bases) **and the three recurring bug classes they host** (stale-dist/double-bundling, cradle-proxy silent no-ops, declare-field boot breaks). Adding R2-4 (Preact) and one feature deletion (notes) pushes past −16,000, but those are projects, not refactors.

Execution reality check: the monolith option invalidates enough of Round 1 that the right sequence is **decide Round 2 first** → re-scope Round 1 waves → then Wave 1 deletions (still valid regardless) → structural moves one plane at a time, `dev:smoke` + full suite + e2e between each plane.

---

# Round 3: The Framework-Maximalist Option (Spring-Boot-style — zero hand-written wiring)

Round 2's monolith path (R2-2/R2-6) reduces LOC by *removing* the framework plane — plain composition functions instead of a container, functions instead of base classes. That preserves decoupling (interfaces, layer boundaries, typed contracts survive) but it is the **opposite** of the Spring Boot model, where boilerplate disappears because a framework absorbs it: annotate the class, and DI, lifecycle, event subscription, and cross-cutting concerns are handled declaratively. If the governing goal is **decoupling + OOP + a standard base layer + zero hand-written wiring** — boilerplate *authored by a framework*, not deleted — this is the third direction. It optimizes a different metric than Rounds 1–2: **hand-written-wiring count, not raw LOC** (net LOC is roughly flat on the wiring itself; the payoff is that adding a service/subscription/procedure never again means editing a central registration map).

### The constraint box first (what Spring parity is physically possible in TypeScript)

1. **Type erasure is the hard ceiling.** Java DI reflects over runtime types; TS interfaces do not exist at runtime. Injection by *interface* therefore always needs an explicit token (`@inject(TOKENS.streamingService)`) or a class reference. "Bare constructor param, container figures it out" works only for concrete classes, and only with emitted metadata (below). Full Spring parity is impossible; ~90% of the ergonomics is achievable.
2. **esbuild never emits decorator metadata.** Vite 7 transforms TS with esbuild (confirmed: no swc/babel in this repo's pipeline). esbuild supports `experimentalDecorators` *syntax* but not `emitDecoratorMetadata` — so type-inference autowiring (`@injectable()` + bare constructor, what NestJS/Inversify autowiring rely on) requires adding **`unplugin-swc`** (or `@rollup/plugin-typescript`) to the vite/electron build for the decorated files, plus `reflect-metadata`. **Explicit-token decorators need no build change** — they run under today's esbuild. This is the same failure family the repo already documented (per-package `experimentalDecorators` flags; "Invalid or unexpected token" boot breaks).
3. **TC39 stage-3 decorators (the TS 5 default) have no parameter decorators.** Constructor-param injection requires `experimentalDecorators: true` (legacy mode) — fine and universally used by these frameworks, but it's a deliberate fork away from the future standard.
4. **R2-1 is synergistic, not competitive:** collapsing the workspace first means ONE tsconfig carrying the decorator flags and ONE build config carrying the swc plugin, instead of ten drifting copies — it removes the exact incident class that killed the previous decorator experiment.

### R3-1 Decorator DI: Inversify 7 (or tsyringe) in both processes — replaces R2-2
- **Model:** `@injectable()` on the ~53 renderer + ~9 main classes; injection via explicit tokens (`@inject(TOKENS.x)`) so it works under plain esbuild today, upgradeable to autowired concrete classes if `unplugin-swc` is adopted. Container assembled from per-layer binding modules (infrastructure/application/presentation), or `autoBindInjectable` for concrete classes.
- **What it deletes:** the central hand-maintained registration maps (`service-registrations.ts` 114 + `manual-providers.ts` 55 + both `container.ts` files) and the core `Container` primitive — replaced by class-site declarations + ~40 LOC of container setup. **Net LOC ≈ flat; net hand-written wiring → near zero.** New service = write class + decorate. No central file edit, no token-list test to update (TEST-4 dies naturally).
- **Why a library, not a revival of `@Service`:** the deleted `@Service`/generate-di stack was a *bespoke* framework — hand-written machinery to avoid hand-written wiring, which just relocated the problem. "Zero hand-written" must include zero hand-written framework. Inversify is maintained, browser-safe (renderer-compatible), and ships the lifecycle decorators below. `tsyringe` is the lighter alternative (weaker lifecycle, lighter maintenance).
- **Risk / Breaking:** med-high / internal. Gate on `dev:smoke`. The cradle-proxy gotcha class disappears (real constructor injection — fields are genuinely populated, `Object.assign` mirrors and APP-1's deps-handle both become moot).

### R3-2 NestJS in the main process — the literal "Spring Boot of Node" (optional, main only)
- **What it brings:** `@Module` graph, `@Injectable` DI, **dependency-ordered lifecycle** (`OnModuleInit`/`OnModuleDestroy` — replaces `AppOrchestrator`'s hand-maintained init/cleanup lists), `@nestjs/event-emitter` with **`@OnEvent(channel)`**, interceptors for cross-cutting concerns, `ConfigModule`. Main is 2,291 LOC / ~9 services — Nest replaces `container.ts`, the orchestrator's ordering lists, the bootstrap, and the event wiring wholesale.
- **The glue cost:** electron-trpc has no official Nest adapter — a ~50–80 LOC bridge exposing the router from a Nest service (or the young `nestjs-trpc` package, not recommended yet). Nest requires `emitDecoratorMetadata` + `reflect-metadata` → `unplugin-swc` in the electron-main vite config (constraint #2).
- **Renderer:** Nest is not built for the browser — do **not** run it in the renderer. The two processes can deliberately diverge: Nest in main (Node-native, where the Spring model fits perfectly), Inversify (R3-1) in the renderer.
- **Verdict:** the fullest Spring experience available, at the cost of a heavyweight framework for 9 services plus custom tRPC glue. Take it if the module/interceptor system is wanted for its own sake; otherwise R3-1+R3-3 capture most of the value in both processes uniformly.

### R3-3 Declarative lifecycle + typed event subscription — replaces R2-3's deletion with annotation
- **Lifecycle:** Inversify's `@postConstruct`/`@preDestroy` make the container own init/dispose. `AppOrchestrator`'s dual ordered lists (APP-3) reduce to container-managed order + one small explicit module for the genuinely order-critical teardown (the "GPU before recording" constraint moves intact, as data).
- **Events:** a typed `@OnEvent(EventChannels.RENDER.STATS)` method decorator — auto-subscribe on activation, auto-unsubscribe on dispose, **payload-typed via `EventPayloadMap`** so the `unknown`-narrowing ceremony (PRES-2's readers) dies at the type level. In main this ships with Nest (R3-2); in the renderer it is a thin decorator over the existing `SharedEventBus` — **~60–80 LOC of bespoke code, the one hand-written framework piece in Round 3; flagged, contained, and unit-tested once.**
- **What it deletes:** the subscription harness family (APP-2/PRES-2, orchestrator subscribe blocks, INF-6's tRPC-bridge shells) — declaratively rather than by base-class extraction (Round 1) or by killing the bus (R2-3). The bus *stays* as the decoupling seam the philosophy wants; only its hand-written ceremony goes. EVT-1 (generate the manifest mirrors) remains live and complementary.

### R3-4 AOP method decorators for cross-cutting concerns
- `@LogErrors(label)` (try/log/rethrow-or-return), `@NotifyRenderer(channel)` (the X-3 duplicate), `@Managed(key)` (keyed timers — X-5/INF-9), plus Nest interceptors in main for the router's failure envelopes (MAIN-2) if R3-2 is taken (or R2-9's TRPCError deletion, which composes with everything).
- One small decorator module (~100 LOC once) eliminates the repeated try/send/warn, `_initialized` guards, and keyed-timer ceremony at every site — the Spring `@Transactional`-style move.

### R3-5 The annotation-processor analog: contract-first codegen as standing policy
Spring's annotation processors ≈ build-time generation. Round 1 already contains the instances — EVT-1 (manifest → channels/payload maps), CFG-2 (workspace aliases → all configs), X-4/MAIN-4 aggressive form (one schema source → TS types via `z.infer`). Under Round 3 these stop being individual findings and become the **standing rule: anything hand-kept in two places gets a generator or dies.** Wire `knip` + the generators into CI (CFG-4) as the enforcement layer.

### The three end-states, side by side

| Dimension | **A: Round-1 only** (polish in place) | **B: Minimal composition** (R2 monolith) | **C: Framework-maximal** (R3) |
|---|---|---|---|
| Net LOC | ~−6,500 | ~−9,500 to −11,500 | ~−5,000 to −6,000 (Waves 1-2 + R2-1/7/9 + flat wiring) |
| Hand-written wiring | reduced, still central maps | minimal but *explicit* (compose functions you author) | **near zero** (declared at class sites, framework-absorbed) |
| OOP / decorators / base layer | unchanged | deliberately reduced (composition over inheritance) | **maximized** — DI, lifecycle, events, AOP all declarative |
| Decoupling mechanism | interfaces + DI map + bus | interfaces + module boundaries + direct typed calls | **interfaces + tokens + container + bus, all framework-managed** |
| Bug classes killed | some (Wave 1) | all three (stale-dist, cradle-proxy, declare-field) | stale-dist (via R2-1) + cradle-proxy (real injection); adds a new dependency-surface risk |
| Build complexity | unchanged | reduced | +`unplugin-swc` (+`reflect-metadata`) if autowiring/Nest; none if explicit tokens |
| New runtime deps | 2–3 small | ~0 | Inversify (+ optionally NestJS in main) |
| Fit with stated philosophy (future-first, heavy OOP, strict contracts) | neutral | **in tension** | **aligned** |

### Recommended composition for path C
R3-1 (Inversify 7, explicit tokens first — no build change) + R3-3 + R3-4 + R3-5, **plus** the Round-2 items that compose with it: R2-1 (workspace collapse — do it *first*; one tsconfig/build makes the decorator pipeline safe), R2-7 (pre-commit policy), R2-9 (TRPCError), R2-8 as a separate product menu, and Round-1 Waves 1–2 (deletions + mechanical normalization remain valid under every path). R3-2 (NestJS in main) is the optional capstone. Sequencing: R2-1 → Wave 1 → R3-1 renderer → R3-1 main (or R3-2) → R3-3 → R3-4 → R3-5 generators — one plane at a time, `dev:smoke` between each.

**Mutual exclusions:** R3-1 vs R2-2 (container: adopt vs delete) and R3-3 vs R2-3 (bus: annotate vs remove) are the two forks where B and C genuinely diverge — everything else in this document composes with either choice.
