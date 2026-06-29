# Promotable Generics Analysis — 2026-06-28

## 1. Executive Summary

The codebase carries a modest but real layer of genuinely domain-agnostic code living outside `@prismgb/core`, and it cleanly splits three ways. **One flagship non-UI core primitive** is misplaced today: `TypedRegistryFactory` (`src/shared/registry/typed-registry.factory.ts`) is a zero-import, fully generic id→factory+metadata registry — verified dependency-free — that belongs beside `Container`/`DisposableBag` in `@prismgb/core` and moves with zero logic change across 3 import sites. Beyond it, the highest-value promotions are **consolidations of duplicated primitives**: a value-union/exhaustiveness **type-utils module** (`ValueOf`/`UnionToIntersection`/`LeafValues`/`AssertNever`, ~8 declaration sites), the `isRecord`/`isNumber`/`isString` **type guards** (3 independent reimplementations), and `debounce`/`throttle` **timing utils** (4 hand-inlined copies). The key distinction the report enforces: *non-UI core primitives* (structural, dep-free, Node+browser-safe) vs *ui-base candidates* (domain-agnostic but DOM/`window`/`rAF`-bound — these must NOT enter the Node-consumed core; a coherent accessible-widget toolkit of ~15 files warrants a separate `ui-base` package) vs *false positives* (the majority of `*.utils.ts`/`*.service.ts` files, which read generic by name but encode device/stream/gpu/capture/USB knowledge on inspection). One cross-finder conflict — `SharedEventBus` — resolves to **keep**: it is genuinely domain-agnostic, but its `eventemitter3` runtime dependency (load-bearing for dispatch) would break core's literal dependency-free invariant, its consumer contract (`EventBusLike`) already lives in core, and `@prismgb/events` is its correct dedicated home.

## 2. Promotion Candidates (ranked)

| Priority | Candidate | Location | Target | Domain-agnostic? | Consumers | Risk | Effort |
|---|---|---|---|---|---|---|---|
| P1 | **TypedRegistryFactory** (+`RegistryFactory`, `RegistryEntry`) | `src/shared/registry/typed-registry.factory.ts:1-71` | core-primitive | yes | 2 prod (streaming-adapter/renderer factories) + 1 test = 3 import sites | low | low |
| P2 | **Type-utils module** — `ValueOf`/`Values`, `UnionToIntersection`, `LeafValues`, `AssertNever` | `component.registry.ts:36-41`; `event-payloads.ts:56-62`; `main-event-channels.ts:49` + 5 inline `T[keyof T]` | core-type | yes | ~8 declaration sites across renderer + events/config/transcode | low | medium |
| P2 | **`isRecord`/`isNumber`/`isString`** (+`isImageBitmapLike`) guards | `worker-protocol.config.ts:204-226`; dup `streaming-contracts.ts:59`; dup `render-passes-helpers.ts:283` | core-util | yes | 3 reimplementation sites | low | low |
| P2 | **`debounce`/`throttle`** timing fns | inlined: `device-change-debounce.adapter.ts:62-79`; `viewport.service.ts:161-181`; `user-activity.adapter.ts:16-22`; `performance-state.service.ts:169-175` | core-util | yes | 4 inlined copies (2 debounce, 2 throttle) | low | low |
| P3 | **ConsoleLoggerFactory** (was `RendererLogger`) | `logger.factory.ts:1-30` | core-primitive | yes | 2 prod + 1 test | low | low |
| P3 | **`replaceTimeout`/`replaceAnimationFrame`** → lift onto core `DisposableBag`/`BaseOrchestrator` | `presentation-component.base.ts:99-124` | core-primitive | yes | 3 prod (notes-editor, notes-panel, game-autocomplete) | medium | medium |
| P3 | **`createDeferred`** (`Promise.withResolvers` shape) | `capture.service.ts:19-22, 282-312` | core-util | yes | 1 prod | low | low |
| P3 | **`SubscriptionGroup`** / fold into `DisposableBag` (was `createTrpcEventBridge`) | `trpc-event-bridge.factory.ts:26-71` | core-primitive | yes | 4 prod | low | low-med |
| P4 | **`delay(ms, signal)`** abortable | `audio-pipeline.service.ts:480-498` | core-util | yes | 1 prod (kernel re-rolled elsewhere) | low | low |
| P4 | **`waitForEvent`** (event→promise, abort+timeout, settle-once) | `audio-pipeline.service.ts:322, 374, 480` | core-util | yes | 3 in-file copies | medium | medium |
| P4 | **`singleFlight(fn)`** in-flight dedupe | `device-media.service.ts:264-282`; echo `gpu-recording.service.ts:154-169` | core-util | yes | 2-3 copies | medium | medium |
| P4 | **`fnv1a32`** + `ContentChangeTracker` | `uniform-tracker.ts:10-42` | core-util | yes | 1 prod (GPU) | low | low |
| P4 | **timestamp formatter** (`FilenameGenerator.timestamp()`) | `filename-generator.utils.ts:5-15` | core-util | yes (method) | internal only | low | low |
| P4 | **`mapRange`** (NET-NEW; `brightness.utils` delegates) | new code; evidence `brightness.utils.ts:10-16` | core-util | yes | 1 would-be | low | low |
| P5 | **`Registry<TKey,TValue>`-with-default** (net-new base; consolidate 3 registries) | `preset-registry.ts:18-95`; `device-profile.registry.ts:33-234`; `device.registry.ts:83-147` | core-primitive | yes (mechanism) | 3 domain registries | medium | high |
| UI | **PresentationComponent** (ui-base anchor) | `presentation-component.base.ts:26-148` | ui-base | yes | 29 subclasses | medium | med-high |
| UI | **UIComponentRegistry** (+`UIComponent*` contracts) | `component.registry.ts:109-211` | ui-base | yes | 3 prod | medium | medium |
| UI | **DisclosureController** | `disclosure.class.ts:178-362` | ui-base | yes (partial: CSSClasses default) | 4 prod | low | low |
| UI | **calculateAnchoredDisclosureLayout** (borderline core-util) | `disclosure.class.ts:104-176` | ui-base | yes | 1 prod | low | low |
| UI | **ListboxDropdownController** | `listbox-dropdown.class.ts:38-309` | ui-base | yes (partial: CSSClasses) | 2 prod | low | low-med |
| UI | **ComboboxListboxController** | `combobox-listbox.class.ts:40-244` | ui-base | yes (partial: CSSClasses) | 1 prod | medium | medium |
| UI | **ActivityAutoHideController** | `activity-auto-hide.controller.ts:47-166` | ui-base | yes | 4 prod | low | low |
| UI | **listbox.utils** (`renderListboxOptions`/`updateListboxActiveState`) | `listbox.utils.ts:24-58` | ui-base | yes (partial: CSSClasses) | 2 prod | low | low |
| UI | **Template ref/action binding helpers** (generic subset) | `template-ref.utils.ts:88-158` | ui-base | yes (partial: needs file split) | 2 prod | medium | medium |
| UI | **downloadFile** | `file-download.utils.ts:1-27` | ui-base | yes | 2 prod | medium | low (+ no home) |
| UI | **BrowserStorageAdapter** (`StorageServiceLike` impl) | `browser-storage.adapter.ts:31-99` | ui-base | yes | 1 prod | low | low |
| UI | **BrowserMediaAdapter** | `browser-media.adapter.ts:10-75` | ui-base | yes | 2-3 prod | low | low |
| UI | **VisibilityAdapter** | `visibility.adapter.ts:3-24` | ui-base | yes | 1 prod | low | low |
| UI | **ReducedMotionAdapter** | `reduced-motion.adapter.ts:3-33` | ui-base | yes | 1 prod | low | low |
| UI | **UserActivityAdapter** | `user-activity.adapter.ts:8-40` | ui-base | yes | 1 prod | low | low |

## 3. Core Primitives (structural, non-UI) — promote to `@prismgb/core`

### 3.1 TypedRegistryFactory — the flagship move (P1)
**What:** Generic keyed creational registry `TypedRegistryFactory<TValue, TMetadata, TArgs>` backed by two `Map`s (id→factory, id→metadata): `register`/`registerValue`/`registerMany`/`create(...args)`/`has`/`getMetadata`/`listIds`/`unregister`/`clear`, plus the `RegistryFactory<TValue,TArgs>` function type and `RegistryEntry` interface.
**Evidence of domain-agnosticism:** I read the whole file — zero imports (the only `import` token is inside a throw-string at `:23`), zero domain vocabulary, operates purely on `string` ids + generic type params + `Map`. It is structurally the same category as core's existing `primitives/container.ts` and `primitives/disposable-bag.ts`, and core has no registry primitive today.
**What promotion buys:** Fills a genuine gap in core's primitive set; consolidates `src/shared` (a known-to-be-dissolved directory) onto the package layer.
**Extraction needed:** None — pure relocation into `packages/prismgb-core/src/primitives/`, add to the core barrel, retarget 3 `@shared/registry/...` imports to `@prismgb/core`. No logic change. **This is the single cleanest, highest-confidence promotion in the report.**

> **Note — do NOT conflate with the Registry-with-default base (§3.6).** `TypedRegistryFactory` has no `setDefault`/`getDefault`; it is a lazy-factory map, not a keyed-store-with-default. They are distinct primitives.

### 3.2 ConsoleLoggerFactory (was RendererLogger) (P3)
**What:** A class implementing core's existing `LoggerFactoryLike`; `create(name)` returns a `console`-backed logger with `[name]` prefix and Error-aware formatting (`logger.factory.ts:1-30`).
**Domain-agnostic:** Zero domain knowledge, zero workspace dependency, uses only the `console` global (present in both Node main and browser renderer). Core already defines the contract (`interfaces/logger.ts`; `service.base.ts:17-18` `LoggerFactoryLike`) but ships **no** concrete implementation — a generic console logger is the natural completion of that seam.
**Extraction:** Rename to `ConsoleLoggerFactory` on promotion; move file, re-export from core, repoint 2 prod imports.

### 3.3 replaceTimeout / replaceAnimationFrame — lift onto core DisposableBag (P3)
**What:** Disposable-managed timer helpers: schedule a `setTimeout`/`requestAnimationFrame`, register its cancel under a `DisposableKey` via `replaceManaged`, return a disposer (`presentation-component.base.ts:99-124`). This is the codebase's de-facto debounce primitive.
**Domain-agnostic:** Body is only `setTimeout`/`clearTimeout` (and rAF/cAF) + `DisposableBag` bookkeeping — no UI/DOM domain beyond browser timer APIs that core's `DisposableBag` *already* references (`disposable-bag.ts:119-129` `addTimeout`/`addAnimationFrame`). Its base (`replaceManaged`/`cancelManaged`) already exists on core's `BaseOrchestrator` (`orchestrator.base.ts:101-109`), so **only the timer wrappers are core-missing**.
**What promotion buys:** Orchestrators (Node-side) gain the managed-timer wrappers; `viewport.service.ts:168-228` and `DeviceChangeDebounceAdapter` (both hand-roll the identical `disposables.replace + setTimeout` debounce) become thin consumers.
**Extraction:** Add `replaceTimeout`/`replaceAnimationFrame` to core `DisposableBag` (and surface on `BaseOrchestrator`); the UI-side `PresentationComponent` then inherits rather than redefines them.

### 3.4 SubscriptionGroup — promote or fold into DisposableBag (P3)
**What:** `createTrpcEventBridge` (`trpc-event-bridge.factory.ts:26-71`) eagerly invokes an ordered array of starter fns, collects `{unsubscribe()}` handles, returns one disposable that tears them down in reverse order with per-handle error isolation, and **rolls back already-started handles if a later starter throws**.
**Domain-agnostic:** Despite the `Trpc` name it imports nothing from tRPC — it requires only objects exposing `unsubscribe()` (`:15-17`).
**Caveat / overlap (be honest):** Core's `DisposableBag` already does reverse-order, error-isolated teardown and accepts `unsubscribe()` handles. The *only* novel behavior is **rollback-on-partial-start** (`:50-57`). **Recommendation:** fold into core as a `DisposableBag.startAll()` / `SubscriptionGroup` helper rather than shipping a parallel primitive; rename off `Trpc`; migrate 4 callers. (Note `device-ipc.adapter.ts` already nests it inside a `DisposableBag` — redundant layering today.)

### 3.5 createDeferred (P3) — see §4 (filed as a core-util, listed here for the primitive-cluster cross-reference)

### 3.6 Registry<TKey,TValue>-with-default — net-new abstraction + consolidation (P5)
**What:** Three registries independently re-implement the same `Map<id,value>` skeleton with tracked-default semantics: `register`/`get`/`getAll`/`clear` + `setDefault`/`getDefault` (with "first registered wins" fallback) — `preset-registry.ts:18-95`, `device-profile.registry.ts:33-234`, `device.registry.ts:83-147`.
**Domain-agnostic:** The keyed-store-with-default *mechanism* carries no domain knowledge. Each registry's domain extras stay in the subclass: USB VID/PID index + `detectDevice` (device-profile), UI-visibility map + `getForUI` (preset), frozen entries + manifest seeding (device).
**Why P5 (deferred):** This is **net-new core code + a 3-site consolidation across packages**, not a relocation — higher risk and effort than the flagship move. Recommended approach: promote a `Registry<TKey,TValue>` base, then back each domain registry's `Map` with it while keeping the domain index/detection on the subclass. `DeviceProfileRegistry` hand-rolling this shape is the evidence the abstraction is owed.

## 4. Core Utilities & Type Helpers

### Type helpers → a new `@prismgb/core` type-utils module (none exists today)
The value-union helper is the largest type-level duplication in the repo:
- **`ValueOf<T>` / `Values<T>` = `T[keyof T]`** — named twice (`main-event-channels.ts:49` as `ValueOf`; `component.registry.ts:36` as `Values`) **plus 5 inline `typeof X[keyof typeof X]` copies** (`worker-protocol.config.ts:14,27`; `streaming.service.ts:36`; `template-ref.utils.ts:23`; `update-state.config.ts:11`; `transcode.config.ts:54`). ~8 declaration sites collapse to one core-type.
- **`UnionToIntersection<TUnion>`** (`component.registry.ts:38-41`) — textbook contravariance/`infer` idiom.
- **`LeafValues<T>`** (`event-payloads.ts:56-60`) — recursive deep string-leaf extraction; the deep counterpart to `ValueOf`.
- **`AssertNever<T extends never>`** (`event-payloads.ts:62`) — universal exhaustiveness assertion.

All four are textbook domain-agnostic type-utils, verified by read (`component.registry.ts:36-41`, `event-payloads.ts:56-62`). Consolidating into `packages/prismgb-core/src/types/type-utils.ts` gives both the UI registry and the events package one source.

### Pure-function utilities
- **`isRecord` / `isNumber` / `isString` (+`isImageBitmapLike`)** type guards — **3 independent reimplementations** (`worker-protocol.config.ts:204-226`, `streaming-contracts.ts:59`, `render-passes-helpers.ts:283`). Promote the primitives only; the domain guards in the same files (`isFramePayload`/`isPresetPayload`/manifest accessors) stay. Strong DRY signal, low effort.
- **`debounce(fn, ms)` / `throttle(fn, ms)`** — **4 hand-inlined copies** (trailing-debounce at `device-change-debounce.adapter.ts:62-79`, `viewport.service.ts:161-181`; time-throttle at `user-activity.adapter.ts:16-22`, `performance-state.service.ts:169-175`). No standalone util exists. Extract the two bare functions; the host services stay domain-coupled (extraction sites, not promotables).
- **`createDeferred<T>()`** — `capture.service.ts:19-22, 282-312` hand-rolls `{ promise, resolve, reject }` captured out of the executor: exactly the native `Promise.withResolvers()` contract; the timeout/settle wiring around it is the only domain part. One-line core-util (or adopt native `withResolvers`).
- **`delay(ms, signal)`** abortable — `audio-pipeline.service.ts:480-498`; body is only `setTimeout` + `AbortSignal` + cleanup. Textbook cancellable delay.
- **`waitForEvent(target, type, {signal, timeoutMs})`** — the settle-once + `{once:true}` + abort + timeout kernel is **triplicated** in `audio-pipeline.service.ts` (`:322`, `:374`, `:480`); only the result payloads are domain. Medium effort (de-triplicate).
- **`singleFlight(fn)`** — in-flight promise coalescing (`if (this._x) return this._x; … .finally(()=>this._x=null)`) hand-written twice in `device-media.service.ts` (`:264-282` clean; `:105-180` tangled with a cooldown cache) and echoed at `gpu-recording.service.ts:154-169`. **Scope to the dedupe kernel only** — the cooldown cache is `PerformanceCache` territory (already in core) and must not be folded in.
- **`fnv1a32(view)` + `ContentChangeTracker`** — `uniform-tracker.ts:10-42`; pure FNV-1a byte hash + per-key content-change detector. Honest caveat: single GPU consumer today, so this is "clean reusable primitive," not deduplication. Widen the `Float32Array` param to `ArrayBufferView` and drop the "uniform" name on promotion.
- **timestamp formatter** — `FilenameGenerator.timestamp()` (`filename-generator.utils.ts:5-15`) is pure `Date`→`YYYYMMDD-HHMMSS-mmm`. Lowest-value (a single small helper). Lift to a free function; `FilenameGenerator` delegates. The coupling lives in its siblings, not here (see §6).
- **`mapRange(value, inMin, inMax, outMin, outMax)`** — **NET-NEW, not a move.** `brightness.utils.ts:10-16` is a domain wrapper (the `[0.5,1.5]` shader range is baked in). Recommendation: add a generic `mapRange` to core and rewrite `sliderToBrightness`/`brightnessToSlider` as thin wrappers; do not promote the brightness functions as-is.

## 5. UI-Base Candidates (domain-agnostic but UI/DOM-specific) — NOT for the non-UI core

**These must not enter `@prismgb/core`.** Core is consumed by the Node main process (`BaseService`/`BaseOrchestrator`/`Container`); every item below references `window`/`document`/`requestAnimationFrame`/`matchMedia`/`localStorage`/`Blob`, which are undefined in Node. A dedicated **`ui-base` package is warranted** and is dependency-clean: these files import **only** `@prismgb/core` (`DisposableBag`/`Disposable` types) + browser globals, and nothing in `main/`/`preload/` imports any of them (renderer-only, verified by the finders). So `ui-base → @prismgb/core` is acyclic. `packages/` today has core/config/devices/events/gpu/ipc/notes/transcode/updates — **no UI package exists**, which is the one prerequisite.

**The cohesive accessible-widget toolkit that would seed it:**
- **PresentationComponent** (`presentation-component.base.ts:26-148`) — the anchor: a browser disposable-component lifecycle base (`listen`/`timeout`/`interval`/`animationFrame`/`observe`/`track`/`replaceManaged`). Imports only `@prismgb/core`; the cleanest member. 29 subclasses = an import sweep + a focused unit test to add (no direct test today).
- **UIComponentRegistry** (`component.registry.ts:109-211`) — catalog-parameterized component registry (stage-gated init, reverse-order async dispose with per-component error isolation). Generic over a `TCatalog` contract; the concrete `RendererUiComponent` catalog stays in presentation.
- **DisclosureController** (`disclosure.class.ts:178-362`), **ListboxDropdownController** (`listbox-dropdown.class.ts:38-309`), **ComboboxListboxController** (`combobox-listbox.class.ts:40-244`), **ActivityAutoHideController** (`activity-auto-hide.controller.ts:47-166`), **listbox.utils** (`listbox.utils.ts:24-58`) — generic ARIA widgets/helpers.
- **calculateAnchoredDisclosureLayout** (`disclosure.class.ts:104-176`) — the one borderline: pure rect/number arithmetic, no DOM, no domain → by the letter it satisfies **core-util**, but it is semantically UI-layout geometry; recommended to ui-base for cohesion with its disclosure widget (state the duality).
- **Template ref/action binding helpers** (`template-ref.utils.ts:88-158`) — generic `data-ref`/`data-action` micro-framework with **zero domain imports**; requires first splitting the file from its domain `UIAction*` block (see §6).

**Browser-API adapters that would also live here:**
- **BrowserStorageAdapter** (`browser-storage.adapter.ts:31-99`) — quota-resilient KV over `localStorage`, implementing core's `StorageServiceLike` (contract stays in core, impl is UI-layer).
- **BrowserMediaAdapter** (`browser-media.adapter.ts:10-75`) — raw `navigator.mediaDevices` wrapper with **zero** chromatic/USB/profile logic; structurally identical to the `document`/`matchMedia` adapters. The device *domain* begins one layer up at `BaseDeviceAdapter` (see §6). DOM-bound → ui-base.
- **VisibilityAdapter** (`visibility.adapter.ts:3-24`), **ReducedMotionAdapter** (`reduced-motion.adapter.ts:3-33`), **UserActivityAdapter** (`user-activity.adapter.ts:8-40`) — Page Visibility / `matchMedia` / DOM-activity wrappers.

> **Conflict resolution (UserActivityAdapter):** one finder labeled this `keep` ("ui-base at most"), conflating "not core" with "keep." Per the task rubric, *domain-agnostic + DOM-coupled = ui-base*, consistent with how Visibility/ReducedMotion adapters are classified. It is **ui-base**, not keep. (Its inline throttle gate is also an extraction site for the `throttle` core-util.)

- **downloadFile** (`file-download.utils.ts:1-27`) — operates on a generic `Blob` + filename (no capture knowledge) but is intrinsically `window.URL`/`document.createElement`/`appendChild`-bound. ui-base.

## 6. False Positives — looks generic, actually domain-coupled (keep in place)

**Special case — domain-agnostic but disqualified (NOT domain-coupled):**
- **SharedEventBus** (`packages/prismgb-events/src/event-bus.ts`) — the mechanism is genuinely generic (string events + `unknown` payloads). It stays **keep / already-correctly-placed** for two grounded reasons, not domain coupling: (1) it imports `eventemitter3` (line 1), which is **load-bearing** for dispatch (`this.emitter` drives `emit`/`on`/`off`/`listeners` at `:20,27,34,43,51`) — a "promotion" would mean reimplementing a battle-tested emitter, i.e. net-new code with regression risk, since core's `package.json` has **zero runtime dependencies** (verified: only `typescript`/`vite`/`vitest`/`happy-dom` devDeps); (2) the consumer-facing contract `EventBusLike` already lives in core, and `@prismgb/events` is the correct dedicated home co-located with separable domain channels/payloads. The seam is already drawn correctly.

**Genuinely domain-coupled:**
- **DeviceChangeDebounceAdapter** (`device-change-debounce.adapter.ts:21-113`) — **conflict resolved to keep.** The *class* is device glue: hard-wired to the literal `'devicechange'` event (`:81,94`), throws on missing `browserMediaService` (`:31-33`), default delay from `@prismgb/config` `TIMING.DEVICE_CHANGE_DEBOUNCE_MS` (`:3`). Its trailing-debounce + suppressed-count *mechanism* is already captured by the `debounce`/`throttle` core-util and `replaceTimeout` primitive above; the adapter becomes a thin wrapper that composes them. (A fully generic `DebouncedEventSubscription<TEvent>` is the more aggressive, anti-YAGNI-defensible read, but with one consumer it is deliberately **not** emitted as a separate primitive — the bare util is the core-missing piece.)
- **EventBus** (renderer wrapper, `event-bus.class.ts:7-20`) — app glue binding `EventChannels.SYSTEM.HANDLER_ERROR`; depends on `@prismgb/events` so cannot enter core; the generic primitive is already extracted (`SharedEventBus`).
- **FilenameGenerator** (class as a whole) — `forScreenshot()` hard-codes `'prismgb-screenshot-…png'` (`:18`), `forRecording()` `'prismgb-recording-…webm'` (`:22`): prismgb branding + capture-domain semantics + container formats. Only `timestamp()` is extractable (§4).
- **SettingsDefinitions** (`settings.definitions.ts:1-176` + `.json`) — imports `getEventManifestScopeEvents` from `@prismgb/events` (`:2`), hard-codes transcode formats `['webm','mp4','mov']` (`:17`) and preset default `'vibrant'` (`:20`).
- **storage-keys.config.ts** — `NotesStorageKeys` is notes data; `SETTINGS_STORAGE_KEYS`/`PROTECTED_STORAGE_KEYS` derive from the settings domain.
- **UIAction descriptors** (`template-ref.utils.ts:7-86`) — imports `EventChannels` from `@prismgb/events`; encodes STREAM/SCREENSHOT/RECORDING/SHADER/NOTES actions + prismgb-branded external URLs. (Must be split *away from* the generic ref helpers in §5.)
- **createDomBindings / Dom*Bindings** (`dom-bindings.utils.ts:1-101`) and **template-dom.contract** (`template-dom.contract.ts:1-20`) — the app's concrete DOM identity / UI manifest (`streamVideo`/`screenshotBtn`/`notesSearchInput`/feature element factories). The generic engine they ride (`bindTemplateRefs`) is the §5 candidate.
- **brightness.utils** (`brightness.utils.ts:10-16`) — baked `[0.5,1.5]` shader-brightness mapping; genuine essence is the net-new `mapRange` util (§4), not a move.
- **getIconSvg** (`icon.utils.ts:7-38`) — `import.meta.glob('../../assets/icons/*.svg', …)` resolves relative to the file and depends on the Vite bundler + app asset layout; not portable.
- **BaseDeviceAdapter** (`device-base.adapter.ts:33-116`) — `extends IDeviceAdapter`, builds `MediaStreamConstraints` from `AcquisitionContext`; this is where the device/stream domain line actually sits.
- **StreamingViewportService** (`viewport.service.ts`) — pixel-perfect integer scaling from `nativeResolution`, canvas/container DOM topology. **StreamingHealthService** (`health.service.ts`) — `HTMLVideoElement` frame-delivery liveness. **DeviceChromaticAdapter** — chromatic config/profile/audio-input matching. **Performance services** — weak-GPU detection (webgpu/webgl2/maxTextureSize), reduced-motion/performance-mode reasons, `ProcessMetricPayload` parsing. **MetricsAdapter / capability-detector / trpc-client / device-ipc adapters / worker-protocol payloads** — transport or GPU coupling (`@prismgb/gpu`, `AppRouter`/electron-trpc, `@prismgb/ipc`, `PipelineUniforms`/`IPreset`).
- **forEachDeviceWithModule** (`device-iterator.utils.ts:17-37`) — imports `DeviceRegistry`; filters on `device.enabled`/`device[moduleType]`. **transcode-temp.utils** — bound to `TRANSCODE_CONFIG.tempPrefix`, Node `fs`/`crypto`, `app.getPath('temp')`. **config-loader.utils** — concrete app config DATA + zod runtime dep. **device-info.formatter** — USB `vendorId`/`productId`/`deviceClass` semantics. **event.manifest.ts** — lookup-or-throw reader over domain manifest data. **BindGroupCache** — hardwired to WebGPU types (`GPUDevice`/`GPURenderPipeline`/…); a versioned keyed cache could be generic, but GPU types belong to a ui/gpu layer, never the non-UI core.
- **AppState** (`app-state.ts`) — hard-coded to streaming/device/cinematic + `EventChannels.STREAM`. **BaseStreamLifecycle** — typed against `MediaStream`/`MediaStreamConstraints`/`getUserMedia`. **DeviceProfile** — USB ids, resolution/constraint maps. **BasePipeline** — `IPreset`/`PipelineUniforms`/brightness/`renderFrame`. **DeviceProfileRegistry** — USB VID:PID index + `detectDevice` (consolidate its `Map` onto the §3.6 base later; the USB index stays domain-side).

> Two of these keeps double as **un-consolidated-pattern evidence** for promotions above: `AppState` hand-rolls `_subscriptions: Array<()=>void>` + dispose loop instead of core's `DisposableBag`; `DeviceProfileRegistry` hand-rolls the keyed-store-with-default shape instead of a shared registry base.

## 7. Recommended Sequence

**Wave 1 — promote now (lowest risk, highest reuse, pure moves/extractions; no new package needed):**
1. **TypedRegistryFactory → `@prismgb/core/primitives`** (P1). Pure relocation, 3 import sites, zero logic change. The flagship; do this first.
2. **Type-utils module** (`ValueOf`/`UnionToIntersection`/`LeafValues`/`AssertNever`) → new `packages/prismgb-core/src/types/type-utils.ts` (P2). Collapses ~8 declaration sites; compile-time only, so zero runtime risk.
3. **`isRecord`/`isNumber`/`isString` guards** + **`debounce`/`throttle`** → core-util (P2). 3× and 4× deduplication respectively; migrate call sites incrementally.
4. **ConsoleLoggerFactory** + **`createDeferred`** (P3) — small, complete existing core seams.

**Wave 2 — promote with modest extraction/decision:**
5. **`replaceTimeout`/`replaceAnimationFrame`** onto core `DisposableBag`/`BaseOrchestrator` (P3) — then retire the hand-rolled debounces in `viewport.service.ts` and `DeviceChangeDebounceAdapter`.
6. **`SubscriptionGroup`** — decide fold-vs-promote (recommend fold rollback-on-partial-start into `DisposableBag.startAll()`), rename off `Trpc`, migrate 4 callers (P3).
7. **`delay`/`waitForEvent`/`singleFlight`/`fnv1a32`/timestamp** core-utils (P4) — de-triplicate `audio-pipeline.service.ts`, de-dup `device-media.service.ts`. Add `mapRange` and rewrite `brightness.utils` as a wrapper.

**Wave 3 — defer (needs a net-new home or net-new abstraction):**
8. **Stand up a `ui-base` package** (prerequisite: none exists). Seed it with **PresentationComponent** (anchor) + the accessible-widget toolkit + browser-API adapters from §5. Before moving the widgets, (a) split `template-ref.utils.ts` into generic-helpers vs domain-`UIAction*`, and (b) replace the `CSSClasses.VISIBLE`/`ACTIVE` defaults with string literals or injected defaults (trivial `'visible'`/`'active'`). Add a `ComboboxListboxController` unit test (none today). This is the largest effort (29-consumer import sweep for `PresentationComponent`) and should follow the `ui-base → @prismgb/core` dependency direction (verified acyclic, renderer-only).
9. **Registry-with-default base** (`Registry<TKey,TValue>`) (P5) — net-new core primitive + 3-registry consolidation (`preset`/`device-profile`/`device`). Highest effort; do after the flagship `TypedRegistryFactory` lands, and decide whether to *extend* `TypedRegistryFactory` to absorb default-tracking rather than ship a second registry primitive.

**Prerequisite / entanglement to track:** `TypedRegistryFactory` and `downloadFile` live under `src/shared/` and `src/renderer/lib/`, both routed via the `@shared`/`@renderer` aliases — the already-planned `src/shared` dissolution should land these moves rather than re-aliasing. Promotions that touch package source must be exercised with `npm run dev:smoke` (the runtime DI/boot gate), since `npm run test:run` + `typecheck` use source aliasing and will not catch boot regressions.