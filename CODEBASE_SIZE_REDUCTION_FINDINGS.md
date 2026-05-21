# PrismGB Codebase Size Reduction Findings

Date: 2026-05-18

This report aggressively analyzes PrismGB for long-term codebase-size reduction while retaining full functionality, performance, and current architecture boundaries. The goal is not small cleanup. The goal is to eliminate hand-maintained parallel structures and make the repository increasingly manifest-driven, generated, typed, and mechanically enforced.

## Scope And Method

Five independent analysis slices were delegated and then verified against the local repository:

- Main process, preload, IPC, and cross-process events.
- Renderer presentation components, templates, effects, primitives, and CSS.
- Renderer/main services, device domain, streaming, capture, transcode, and GPU package.
- Repository-wide config, type debt, scripts, docs, and generated artifacts.
- Tests, fixtures, mocks, coverage gates, and E2E helpers.

Baseline observations:

- `git ls-files` reports 638 tracked files.
- Tracked extension counts include 268 `.js`, 230 `.ts`, 38 `.css`, 23 `.svg`, 10 `.json`, 10 `.glsl`, and 8 `.wgsl` files.
- `src/renderer/presentation` has the largest source-file count in `src`: 92 tracked `.js`/`.ts`/`.css` files.
- The architecture scorecard currently reports 0 layer-boundary violations and TS strictness enabled, but still reports 22 `any` occurrences across 15 TS files in `artifacts/architecture-scorecard-summary.md`.
- `tests/coverage/` and `artifacts/` exist locally as ignored generated output. They are not tracked by `git ls-files`, but they still add local workspace noise. `tests/coverage/` contains 196 files and about 5.2 MB.

## Prompt Requirement Coverage

| Requested angle | Where this report addresses it |
| --- | --- |
| Use several subagents | The scope above reflects five delegated analysis slices, then local verification. |
| Reduce codebase size while retaining functionality and performance | Highest-leverage moves and all detailed findings preserve public APIs first, then delete duplicate/runtime-boilerplate internals after parity tests. |
| Interfaces | Typed IPC/event contracts, device manifests, service ports, worker pipeline contracts, and TS migration of shared interface twins. |
| Abstractions | `DisposableBag`, `PresentationComponent`, UI controllers, `RendererEventBridge`, preload subscription factory, typed registry factory, and generated handler descriptors. |
| Code generation | IPC, events, devices, settings, render passes, architecture layers, platform matrix, tests, docs, aliases, preload globals, and handler descriptors. |
| Tags/annotations like Spring | Decorator/static metadata options for services, IPC handlers, subscriptions, and DI registration. |
| Factory patterns | Renderer factory consolidation, device adapter/profile factories, generated pipeline factory descriptors, and canonical test factories. |
| Utilities/handlers for common patterns | Shared script utilities, contract-test helpers, cleanup utilities, listener/subscription helpers, and table-driven UI state handlers. |
| Library/out-of-box recommendations | Dedicated library/tool section with current official docs links. |
| Root `.md` deliverable | This file: `CODEBASE_SIZE_REDUCTION_FINDINGS.md`. |

## Highest-Leverage Moves

| Priority | Target | Recommendation | Impact | Risk |
| --- | --- | --- | --- | --- |
| 1 | IPC/preload/events | Replace split JSON, types, handlers, preload APIs, globals, and tests with one generated contract manifest. | Very high | Medium-high |
| 2 | GPU rendering | Make `@prismgb/gpu` the only rendering backend and expose worker-safe APIs. Delete duplicated renderer worker engines and shader copies. | Very high | Medium-high |
| 3 | Presentation UI | Move components to a lifecycle/base-component model or Lit. Generate refs and actions from template metadata. | High | Medium-high |
| 4 | DI and service registration | Use Awilix or metadata-driven registration for renderer DI instead of repeated dependency lists. | High | Medium |
| 5 | Device/settings/preset manifests | Move device profiles, settings, transcode formats, and presets to validated manifests with generated adapters, registries, tests, and docs. | High | Medium |
| 6 | Tests | Build canonical test support factories, Vitest projects, and generated contract tests. Remove duplicate mocks and regex tests. | High | Medium |
| 7 | Tooling/config | Generate aliases, layer rules, platform matrices, and docs from single manifests. | Medium-high | Medium |

## 1. Generate The IPC, Preload, And Event Contracts

Current repetition:

- Channel names live in `src/shared/ipc/channels.json`.
- Channel values are consumed directly from `src/shared/ipc/channels.json`.
- Payload types live separately in `src/shared/ipc/preload-api.contract.ts`.
- Window globals are hand-maintained in `src/types/preload-api.d.ts`.
- Preload exposes APIs by hand in `src/preload/index.js`.
- Preload runtime validators are hand-maintained in `src/preload/validators.js`, including URL/update/transcode/GPU rules and allowed transcode formats.
- Main IPC handlers are manually registered in `src/main/ipc/ipc-handler.registry.ts`.
- Preload contract tests regex-scan source in `tests/unit/preload/preload-api.contract.test.js`.
- IPC channel data now has one runtime import surface, backed by drift checks against the IPC manifest and main handler descriptors.

This is the most obvious architectural compression target. The current design already wants a contract. It just stops before making that contract authoritative.

Known live drift at the original findings point was resolved during Phase 2: `transcodeAPI.getStatus()` no longer declares or forwards a job id, and the IPC manifest now checks request schemas against main handler descriptors.

Recommended end state:

- Create `src/shared/ipc/ipc.contract.ts` or `contracts/ipc.manifest.ts`.
- Define each endpoint/event as data:
  - namespace and public API name
  - channel
  - direction: invoke, subscribe, forward, emit
  - request schema
  - response schema
  - renderer exposure name
  - main handler dependency token
  - security policy, including URL/file/system access constraints
- Generate:
  - `channels.json`
  - TS payload types
  - preload bridge APIs
  - preload runtime validators
  - `src/types/preload-api.d.ts`
  - main handler descriptor arrays
  - renderer service bridge tests and mocks
  - contract tests

Concrete abstraction:

```ts
defineIpcContract({
  update: {
    checkForUpdates: {
      invoke: 'update:check',
      response: UpdateCheckResponseSchema,
      main: ({ updateService }) => updateService.checkForUpdates()
    },
    onProgress: {
      event: 'update:progress',
      payload: UpdateProgressSchema,
      exposeAs: 'onProgress'
    }
  }
});
```

Library options:

- Keep `joi`, already installed, if runtime validation is the main priority.
- Prefer Zod or TypeBox if type inference, schema-first generation, and contract reuse matter more.
- If Zod/TypeBox is introduced, retire or generate the existing Joi config/test contract layer instead of running two schema systems indefinitely.
- Evaluate `electron-trpc` for typed Electron IPC if adopting an out-of-box RPC layer is acceptable.

Migration:

1. Generate declarations and tests from the manifest while leaving runtime code unchanged.
2. Move low-risk namespaces first: `metricsAPI`, `gpuAPI`, `loginItemAPI`.
3. Move `updateAPI` and `transcodeAPI` after subscription generation is proven.
4. Convert handlers to descriptors and delete hand-written registration code only after parity tests pass.

Expected deletion:

- Most of `src/preload/listener-registry.js`.
- Repeated subscription blocks in `src/preload/apis/*.preload-api.js`.
- Repeated handler try/catch wrappers in `src/main/ipc/handlers/*.handler.ts`.
- Regex contract tests.

## 2. Replace Preload Listener Boilerplate With A Subscription Factory

Current repetition:

- `src/preload/apis/device.preload-api.js`
- `src/preload/apis/window.preload-api.js`
- `src/preload/apis/update.preload-api.js`
- `src/preload/apis/transcode.preload-api.js`
- `src/preload/listener-registry.js`

Every subscription repeats:

- callback validation
- listener limit check
- listener wrapping
- `ipcRenderer.on`
- unsubscribe closure
- listener-set cleanup

Recommended abstraction:

```js
createSubscription({
  api: 'updateAPI.onProgress',
  channel: channels.UPDATE.PROGRESS,
  validate: schemas.updateProgress,
  map: (event, payload) => payload
});
```

Use a `Map<string, Set<listener>>` keyed by channel instead of hard-coded registry fields like `updateProgress`, `transcodeCompleted`, and `enterFullscreen`.

Impact:

- High in preload code.
- Medium in test code.
- Low user-facing risk if public API names stay stable.

## 3. Convert Main IPC Handlers To Declarative Descriptors

Current repetition:

- `src/main/ipc/ipc-handler.registry.ts` manually calls every `register*Handlers` function.
- Each handler module defines local `RegisterHandler` and service interfaces.
- Try/catch, logging, success/error result mapping, and argument shaping repeat across handlers.

This is not only repetition. It is also inconsistent behavior. Update and shell handlers map errors into explicit response shapes, while some window and login-item handlers return directly with no central error mapping or input validation. A descriptor migration must snapshot current IPC response shapes before centralizing validation/error mapping, otherwise size reduction could become a subtle public API change.

Recommended abstraction:

```ts
export const updateHandlers = defineIpcHandlers([
  {
    channel: IPC.UPDATE.CHECK,
    deps: ['updateService'],
    invoke: ({ updateService }) => updateService.checkForUpdates(),
    success: (result) => ({ success: true, ...result })
  }
]);
```

The registry should consume descriptors and own:

- `ipcMain.handle`
- duplicate-channel detection
- disposal
- logging
- schema validation
- error mapping

This preserves the module boundaries while removing hand-written registration plumbing.

## 4. Unify Event Catalogs, Payload Maps, And EventBus Implementations

Current repetition:

- Shared renderer event names are in `src/shared/events/event-channels.ts`.
- Event payload types and the runtime channel list are separately maintained in `src/shared/events/event-payloads.ts`.
- Renderer imports shared event channels directly.
- Main has separate event channels in `src/main/infrastructure/events/event-channels.config.ts`.
- Renderer `EventBus` uses `eventemitter3`; main `EventBus` wraps Node `EventEmitter`.

The shared event payload file already has compile-time exhaustiveness checks, so event-payload drift is better guarded than the preload regex contract. The size-reduction case still stands because the same event graph is manually represented in multiple places.

The generated event manifest must key contracts by scope plus event identity, not only by string value. Main and renderer both use `update:state-changed`, but the main event publishes `{ oldState, newState }` while the renderer event publishes the renderer update status object.

Recommended end state:

- One event manifest with scopes: `renderer`, `main`, `crossProcess`, `ipcForwarded`, `uiCommand`.
- Generate:
  - event channel constants
  - payload map
  - runtime channel list
  - contract tests
  - forwarding descriptors for main-to-renderer IPC events
- Use `eventemitter3` everywhere. It is already installed and already used by the renderer bus.

This also enables a `RendererEventBridge`:

```ts
defineForwardedEvents([
  { domain: MainEvents.UPDATE.STATE_CHANGED, ipc: IPC.UPDATE.STATE_CHANGED },
  { domain: MainEvents.TRANSCODE.PROGRESS, ipc: IPC.TRANSCODE.PROGRESS }
]);
```

Services would publish domain events only. The bridge would forward contract-declared events to windows. Device forwarding already follows this shape through `DeviceBridgeService`; the direct-send gap remains most visible in update and transcode services. The generated bridge should standardize the pattern instead of re-creating what the device path already solved.

## 5. Make `@prismgb/gpu` The Only Rendering Backend

Current repetition:

- Renderer worker WebGPU engine: `src/renderer/infrastructure/rendering/workers/webgpu-renderer.engine.ts`.
- Renderer worker WebGL2 engine: `src/renderer/infrastructure/rendering/workers/webgl2-renderer.engine.ts`.
- Renderer Canvas2D fallback lives in `src/renderer/infrastructure/services/streaming/canvas-renderer.ts` plus `canvas2d-renderer.adapter.ts`, while `@prismgb/gpu` already has a `Canvas2DPipeline`.
- GPU package WebGPU pipeline: `packages/prismgb-gpu/src/infrastructure/webgpu/webgpu-pipeline.ts`.
- GPU package WebGL2 pipeline: `packages/prismgb-gpu/src/infrastructure/webgl2/webgl2-pipeline.ts`.
- Renderer worker utility classes duplicate package helpers, including bind-group caching, uniform tracking, and WebGL shader-program management.
- Identical shader trees exist under both:
  - `packages/prismgb-gpu/src/infrastructure/webgpu/shaders`
  - `src/renderer/infrastructure/rendering/shaders/webgpu`
  - `packages/prismgb-gpu/src/infrastructure/webgl2/shaders`
  - `src/renderer/infrastructure/rendering/shaders/webgl2`

Verification:

- `diff -qr` reports no differences between the WebGPU shader directories.
- `diff -qr` reports no differences between the WebGL2 shader directories.
- The duplicate shader files account for 891 LOC in each tree, 1,782 LOC total across both copies.

Recommended end state:

- `@prismgb/gpu` exposes worker-safe pipeline construction:
  - `createWorkerPipeline({ canvas, api, nativeSize, outputSize, preset })`
  - `render(imageBitmap, uniforms)`
  - `resize(...)`
  - `captureFrame()`
  - `getStats()`
  - `dispose()`
- Renderer worker remains only an IPC/protocol adapter.
- Canvas2D fallback policy also flows through the package pipeline factory instead of a separate renderer-only implementation path.
- Shader imports and shader pass definitions live exclusively in `@prismgb/gpu`.
- Renderer-specific telemetry stays in renderer services, not in rendering engines.
- Shared GPU utility ownership, telemetry boundaries, and WebGPU/WebGL2 implementation coverage live with the package so worker engines do not grow a second private GPU toolkit.

Aggressive next step:

- Move worker protocol into the GPU package or generate it from the same pipeline contract. `src/renderer/infrastructure/rendering/workers/worker-protocol.config.ts` already has a typed protocol but also contains hand-written validators and constructors.

Risk:

- Medium-high. GPU rendering is core functionality, and OffscreenCanvas transfer behavior is fragile.

Migration:

1. Export shader raw strings from `@prismgb/gpu`.
2. Make renderer worker import package shaders first.
3. Finish the OffscreenCanvas-safe public contract in `@prismgb/gpu`. `BasePipelineConfig` already accepts `OffscreenCanvas`, but the public pipeline config and backend implementations still narrow/cast toward `HTMLCanvasElement`.
4. Keep the current worker protocol stable while swapping internals.
5. Delete renderer shader folders and duplicate engines after frame, stats, capture, resize, and device-loss tests pass.

## 6. Data-Drive Shader Passes And Uniform Layouts

Current repetition:

- WebGPU pass setup repeats `pixelUpscale`, `unsharpMask`, `colorElevation`, `crtLcd` in shader modules, pipelines, uniform buffers, render pass calls, and uploads.
- WebGL2 repeats the same pass sequence with separate uniform calls.
- Preset and uniform logic is manually coordinated between package and worker code.
- Worker protocol accepts package `PipelineUniforms`, but worker engines still import a separate partial `RenderUniforms` type. A pass manifest should delete the duplicate worker-only uniform shape.

Recommended abstraction:

```ts
const ShaderPasses = [
  {
    id: 'pixelUpscale',
    shader: 'pixel-upscale',
    enabled: () => true,
    sampler: 'nearest',
    uniforms: upscaleUniformLayout
  },
  {
    id: 'unsharpMask',
    shader: 'unsharp-mask',
    enabled: ({ preset, uniforms }) => preset.unsharp.enabled && uniforms.unsharp.strength > 0,
    sampler: 'linear',
    uniforms: unsharpUniformLayout
  }
];
```

Generate WebGPU buffers, WebGL setters, pass execution, and uniform upload arrays from the same pass manifest.

This is an aggressive but appropriate reduction because the rendering chain is fixed-format and duplicated across APIs.

## 7. Replace Renderer DI Boilerplate With Awilix Or Metadata Registration

Current repetition:

- `src/renderer/application/di/register-orchestrators.ts` repeats each dependency three times: function params, object construction, dependency array.
- `src/renderer/application/di/register-infrastructure.ts` repeats the same pattern for infrastructure.
- `src/renderer/infrastructure/di/service-container.factory.ts` is a custom DI container even though `awilix` is already installed and used in `src/main/application/container.ts`.
- The custom renderer container also blurs constructor and factory semantics: registrations can pass factory functions, but resolution constructs registered values with `new constructor(...resolvedDeps)`. A long-term fix should make factory-vs-class registration explicit, not just shorten dependency arrays.
- Renderer bootstrap wires six registration modules, and `renderer-container-map.type.ts` separately enumerates the token surface. Registration metadata should derive both runtime registrations and the token map.

Recommended end state:

- Use Awilix in renderer too, through a small boundary module if needed.
- Only adopt renderer Awilix if it deletes the local `ServiceContainer` and registration adapter; using both would add abstraction rather than reduce code.
- Or generate registrations from static service metadata:

```ts
registerService({
  token: 'streamingOrchestrator',
  class: StreamingOrchestrator,
  deps: [
    'streamingService',
    'appState',
    'streamViewService',
    'renderPipelineService',
    'gpuRecordingService',
    'settingsService',
    'eventBus',
    'loggerFactory'
  ]
});
```

More aggressive option:

- Add decorators or static metadata:

```ts
@Service('streamingOrchestrator', {
  deps: ['streamingService', 'appState', 'renderPipelineService']
})
export class StreamingOrchestrator {}
```

Impact:

- High for renderer application/container code.
- Medium for tests, because container tests are large and would need a new registration contract.

## 8. Promote `BaseService` Into A Real Lifecycle Base

Current state:

- `BaseService` only validates dependencies, assigns required dependency fields, and creates a logger.
- `BaseOrchestrator` has subscription cleanup, but services often implement their own cleanup arrays and timer disposal.
- Examples include renderer update/transcode services, performance services, device lifecycle services, and streaming services.
- Lifecycle drift also exists outside plain DOM listeners: `SettingsDisplayModeOrchestrator` adds a `visibilitychange` listener without tracking removal, and main `TranscodeService` registers an Electron `before-quit` listener that is not removed by its `dispose()` method.

Recommended abstraction:

```ts
class DisposableBag {
  add(fn: () => void): void;
  addEvent(target, event, handler, options?): void;
  addTimeout(id): void;
  addInterval(id): void;
  clear(): void;
}
```

Add to `BaseService`:

- `this.disposables`
- `this.subscribe(event, handler)`
- `this.listen(target, event, handler)`
- `this.timeout(fn, ms)`
- `dispose()` template method

Use `AbortController` for DOM/event listeners where practical.

Make disposal async-aware. The renderer container currently calls `dispose()` without awaiting returned promises, while services such as `StreamingService` expose async cleanup. The lifecycle contract should be `dispose(): void | Promise<void>` and container cleanup should await promises.

This is low-risk and should be foundational before larger codegen refactors.

## 9. Generate Device Profiles, Adapter Metadata, Mocks, And Docs From A Device Manifest

Current repetition:

- Built-in device identity lives in `src/shared/features/devices/device.registry.js`.
- Chromatic constants live in `src/shared/features/devices/profiles/chromatic/device-chromatic.config.js`.
- `DeviceChromaticProfile` reconstructs config into a profile shape.
- `DeviceChromaticAdapter` reconstructs a reduced renderer-side `deviceProfile` and separately recomposes capabilities instead of consuming the full shared profile directly.
- Renderer GPU services also consume device metadata indirectly, including hard-coded native `160x144` render dimensions that should come from the device manifest.
- Presentation CSS also consumes device shape indirectly: the stream canvas hard-codes `aspect-ratio: 160 / 144`.
- Tests and E2E mocks repeat VID/PID, native resolution, labels, and device capabilities.

Recommended end state:

- One device manifest:

```ts
defineDevice({
  id: 'chromatic-mod-retro',
  name: 'Mod Retro Chromatic',
  usb: { vendorId: 0x374e, productId: 0x0101 },
  display: { nativeWidth: 160, nativeHeight: 144 },
  media: { ... },
  rendering: { ... },
  capabilities: [...]
});
```

Generate:

- `DeviceRegistry` entries
- main process profile class or profile factory
- renderer adapter metadata
- media constraints
- CSS custom properties for device aspect ratio/native dimensions
- test fixtures
- E2E mock payloads
- docs feature-map device section

This is the correct long-term path for adding more devices without multiplying files.

## 10. Convert Settings To A Definition Map

Current repetition:

- `src/renderer/infrastructure/services/settings/settings.service.ts` repeats `getX`, `setX`, storage key, default, parse, clamp/validate, logging, and event publishing for each setting.
- Recording-format allowed values now live in `src/shared/features/settings/settings.definitions.json`; `src/shared/features/transcode/transcode.config.js` still owns transcode implementation metadata.
- Storage keys and protected-key policy originally repeated settings in shared config; Phase 2 now derives settings storage keys from the settings manifest.
- Recording-format UI options are hard-coded in the settings template.
- `loadAllPreferences()` returns only a subset of defaults, so aggregate settings reads can drift from setting definitions.

Recommended end state:

```ts
const SettingsDefinitions = {
  volume: {
    storageKey: 'gameVolume',
    default: 70,
    type: 'number',
    min: 0,
    max: 100,
    event: EventChannels.SETTINGS.VOLUME_CHANGED
  },
  recordingFormat: {
    storageKey: 'recordingFormat',
    default: 'webm',
    allowed: Object.keys(TRANSCODE_CONFIG.formats),
    event: EventChannels.SETTINGS.RECORDING_FORMAT_CHANGED
  }
};
```

Preserve current behavior during this migration: settings default recording format is `webm` so direct-save capture avoids transcode by default, while `TRANSCODE_CONFIG.defaultFormat` is currently `mp4`. A generated definition map should share allowed format metadata without silently changing that default.

Generate:

- `getSetting(name)`
- `setSetting(name, value)`
- settings UI options
- storage/protected-key metadata
- settings tests

Impact is medium, but this prevents future setting growth from becoming another boilerplate field.

## 11. Convert Presets To Data And Bulk Registration

Current repetition:

- Each preset module in `packages/prismgb-gpu/src/domain/presets/presets/*.preset.ts` repeats imports, object shape, and self-registration.
- `packages/prismgb-gpu/src/index.ts` manually imports each preset to trigger registration.
- Default-preset policy is split: the package registry default is `true-color`, while renderer bootstrap/settings default to `vibrant`.
- UI availability policy is also split: the shader preset list pulls registry presets and then hard-codes hiding the `performance` preset.

Recommended end state:

- `presets.config.ts` exports a validated array.
- `PresetRegistry.registerMany(presets)`.
- Default-preset selection lives in the same preset config and is generated into package and renderer defaults.
- UI visibility/availability lives in the same preset config.
- Optionally generate named exports for stable public package APIs.

Impact:

- Low-medium for current LOC.
- High leverage if shader/preset combinations grow.

## 12. Replace Presentation Lifecycle Boilerplate With A Component Base Or Lit

Current repetition:

- Components manually track subscriptions, listener arrays, initialized flags, refs, and disposal.
- Examples include notes panel, shader slider controls, update section, settings menu, and nested notes components.
- `createDomListenerManager()` already centralizes some listener cleanup and is used in several components, so the missing abstraction is broader lifecycle ownership: subscriptions, timers, refs, initialized state, and disposal.
- Lifecycle ownership should also cover `requestAnimationFrame`, `MutationObserver`, and `ResizeObserver`, which are currently managed ad hoc in presentation effects and notes components.
- UI primitives exist but are only partially adopted.

Recommended option A, local:

```js
class PresentationComponent {
  listen(target, event, handler, options) {}
  subscribe(unsubscribe) {}
  timeout(fn, ms) {}
  animationFrame(fn) {}
  observe(observer) {}
  ref(name, selector) {}
  dispose() {}
}
```

Recommended option B, stronger:

- Move dynamic components to Lit only if the migration deletes enough imperative lifecycle/rendering code to justify adding a new dependency. Lit, Shoelace/Web Awesome, and Floating UI are not current app dependencies, so the conservative path is local lifecycle/render helpers first.
- Use Lit reactive properties, lifecycle callbacks, and controllers for reusable behavior.
- Use Lit first for dynamic list/render-heavy surfaces:
  - notes list
  - game autocomplete
  - update section
  - shader preset list

Risk:

- Medium-high if converting all UI at once.
- Medium if a base class is introduced first and Lit migration proceeds component by component.

## 13. Generate DOM Refs, Actions, And Template Bindings

Current repetition:

- IDs live in templates.
- Selector constants live in `src/renderer/presentation/config/dom-selectors.config.ts`.
- `createDomBindings()` consumes selector maps.
- Components separately define refs and initialize shapes.
- `src/renderer/application/di/register-ui.ts` manually wires component IDs, stages, constructors, and element dependency slices even though `UIComponentRegistry` already consumes component definitions generically.

Recommended end state:

- Use `data-ref` and `data-action`.
- Generate refs from template manifests.
- Centralize command descriptors that can publish EventBus events, call settings/domain services, or invoke preload-backed commands such as shell/external links:

```html
<button data-action="capture.screenshot" data-ref="screenshotButton">
```

```ts
const Actions = {
  'capture.screenshot': EventChannels.UI.SCREENSHOT_REQUESTED,
  'stream.toggle': ({ state }) => state.isStreaming
    ? EventChannels.UI.STREAM_STOP_REQUESTED
    : EventChannels.UI.STREAM_START_REQUESTED
};
```

This can delete manual DOM-originated event wiring in settings, toolbar, and controller code. Renderer bridge classes that subscribe to EventBus or preload channels need a different compression path: descriptor-based bridge subscriptions plus shared disposal.

Also generate UI component definitions and element dependency slices from the same ref/action metadata. That connects template IDs, selector constants, component registration, and controller wiring instead of leaving `register-ui.ts` as another hand-maintained manifest.

Typed ref generation should also fix the current binding root ambiguity: `createDomBindings()` is documented as accepting `Document | Element`, but `bindById()` calls `getElementById()`, which is a `Document` API. Generated refs should either narrow roots to `Document` or use typed `querySelector` against component roots.

## 14. Promote Headless UI Controllers For Disclosure, Listbox, Combobox, And Auto-Hide

Current repetition:

- `ListboxDropdownController` exists, but notes filter and game autocomplete still implement related menu/listbox behavior by hand.
- Cursor, toolbar, and fullscreen controls repeat enabled/listener/show-hide/pause-condition patterns, but the timer/RAF details are split rather than identically duplicated: `UIEffects` centralizes some cursor/toolbar hiding, cursor auto-hide owns RAF throttling, and fullscreen controls own a separate timer.

Recommended abstractions:

- `ComboboxController`
- `ListboxController`
- `DisclosureController`
- `ActivityAutoHideController`

Library options:

- Use Floating UI for dropdown/popover positioning.
- Use Shoelace/Web Awesome for standard web components where behavior and accessibility can be adopted without full framework migration and the dependency cost is offset by deleted local UI code.

Migration:

1. Upgrade the existing listbox controller to cover keyboard navigation and dynamic option rendering before moving notes filter onto it.
2. Fold game autocomplete into a combobox controller.
3. Replace cursor, toolbar, and fullscreen auto-hide internals behind the existing `UIEffects` boundary.

Add the notes panel placement logic to the Floating UI candidate list. It currently hand-rolls anchor measurement, viewport clamping, and CSS variable placement.

## 15. Consolidate CSS Into Semantic Tokens And Utilities

Current repetition:

- Raw `rgba(255,255,255,...)` values.
- Popover shells.
- Gradient borders.
- Dropdown option rows.
- Pills/tags.
- Thin scrollbar styles.
- Repeated feature-level CSS shells in settings, notes, toolbar, and shader panel styles.

Recommended end state:

- Reuse existing tokens first.
- Extract duplicated vertical range styles and option/menu shells before broader visual refactors.
- Expand `tokens.css` into semantic tokens.
- Add utilities:
  - `.ui-popover`
  - `.ui-option`
  - `.ui-field`
  - `.ui-pill`
  - `.ui-scrollbar-thin`
  - `.ui-gradient-border`
  - `.range-control`
- Keep feature CSS only for layout and feature-specific variants.

Risk is low if classes are introduced and migrated gradually.

## 16. Replace Icon Registry Maintenance With `import.meta.glob`

Current repetition:

- `src/renderer/presentation/icons/icon.utils.js` manually imports and maps SVGs, but icon assets can still drift from the registry. For example, an asset can exist without a mapped key.

Recommended abstraction:

```js
const iconModules = import.meta.glob('@renderer/assets/icons/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true
});
```

Keep `getIconSvg()` stable and swap internals. This is a low-risk deletion.

Also prune or flag unused/unregistered assets as part of the generated icon manifest.

## 17. Collapse Renderer Bridge Services Into A Generic Preload Event Bridge

Current repetition:

- Renderer update service subscribes to preload API events, maps them to EventBus channels, stores state, and cleans up.
- Renderer transcode service follows the same broad pattern.
- Device and window/fullscreen code also subscribe to preload-backed `window.*API` events and should be in scope for the same bridge pattern.

Recommended abstraction:

```ts
createPreloadEventBridge({
  api: () => window.updateAPI,
  subscriptions: [
    { on: 'onAvailable', event: EventChannels.UPDATE.AVAILABLE, state: UpdateState.AVAILABLE },
    { on: 'onProgress', event: EventChannels.UPDATE.PROGRESS }
  ]
});
```

Keep command methods domain-specific. Extract only event subscription/state reset boilerplate.

Generated disposal should prefer the per-subscription unsubscribe closures returned by preload APIs. Namespace-wide teardown methods that call `ipcRenderer.removeAllListeners()` can remove listeners owned by other consumers if shared APIs expand.

## 18. Consolidate Generic Registry And Factory Code

Current repetition:

- `src/renderer/infrastructure/factories/streaming-adapter.factory.ts`
- `src/renderer/infrastructure/factories/streaming-renderer.factory.ts`
- Similar registry lifecycle code also exists in `DeviceProfileRegistry` and `UIComponentRegistry`.

Both manage class maps, metadata maps, initialization, lookup, creation, unregister, and clear behavior.

Recommended abstraction:

```ts
class TypedRegistryFactory<TInstance, TMetadata> {
  register(id, type, metadata) {}
  create(id, deps) {}
  getMetadata(id) {}
  unregister(id) {}
  clear() {}
}
```

Device adapter and renderer factory policy should remain separate. The map/metadata lifecycle should not.

## 19. Migrate JS Plus `.d.ts` Twins To TypeScript

Current repetition:

- `src/shared/base/service.base.js` mirrors `src/shared/base/service.base.d.ts`.
- `src/shared/interfaces/device-adapter.interface.js` mirrors `src/shared/interfaces/device-adapter.interface.d.ts`.
- Similar patterns exist in shared base/interfaces.
- Presentation remains heavily runtime-JS as well: `src/renderer/presentation` contains 35 `.js`, 19 `.ts`, and 38 `.css` files, and several components depend on broad element maps instead of generated typed refs.
- Current app typechecking does not enforce presentation JS: `tsconfig.app.json` has `allowJs: true` but `checkJs: false`, and its include list targets TS plus declarations.

Recommended end state:

- Convert shared base and interface modules to `.ts`.
- Convert presentation templates/components toward typed ref/action contracts as section 13 is introduced.
- Rely on declaration emit rather than hand-authored twin files.
- Stop adding new `.js` plus `.d.ts` pairs.

Migration:

1. Convert shared base modules first.
2. Update imports to extension strategy compatible with Vite/Electron build.
3. Delete hand-written declarations when typecheck and tests pass.

This reduces code size and removes type drift.

## 20. Hoist Official WebGPU Types

Current repetition:

- `src/types/webgpu-worker.d.ts` manually declares many WebGPU interfaces.
- `packages/prismgb-gpu/package.json` already depends on `@webgpu/types`.

Recommended end state:

- Hoist `@webgpu/types` into the root/workspace type environment.
- Keep only actual worker/offscreen augmentations in app code.
- Replace loose manual worker declarations such as string sampler filters, string texture formats, numeric usage flags, and string compilation-message types with official WebGPU types where available.

Risk:

- Medium. DOM and worker libs can conflict if configured carelessly.

Migration:

1. Add official types to root type environment.
2. Run `npm run typecheck`.
3. Shrink `webgpu-worker.d.ts` to only project-specific augmentations.
4. Keep `@webgpu/types` ownership consistent: it is currently only in the GPU package type environment, not the root `tsconfig.base.json` types list.

## 21. Generate Aliases And Architecture Rules From One Manifest

Current repetition:

- Aliases repeat in `tsconfig.base.json`, `tsconfig.app.json`, `vite.config.js`, and `vitest.config.js`.
- ESLint has manual layer restrictions.
- `scripts/check-layer-boundaries.js` redefines layers, forbidden maps, path classifiers, and import scanners.
- The scanner still recognizes retired `@core/` imports even though docs say `src/core` is removed and `@core` is not configured in Vite/Vitest.
- Alias generation needs environment-specific outputs: `@prismgb/gpu` resolves to source in base/Vite/Vitest but to built declarations in `tsconfig.app.json`, and Vite also has a renderer-only `url` polyfill.

Recommended end state:

- `architecture.layers.json` or `tooling/architecture.manifest.ts` defines layers and aliases once.
- Generate:
  - TS `paths`
  - Vite/Vitest aliases
  - ESLint `no-restricted-imports` or boundaries config
  - layer-boundary tests
  - architecture diagrams
  - retired-alias failures for removed aliases such as `@core`

Library options:

- `vite-tsconfig-paths` to reduce Vite alias duplication where source-vs-dist and polyfill differences are explicitly modeled.
- `eslint-plugin-boundaries` for ESLint-native layer enforcement.
- `dependency-cruiser` for validation and diagrams.

Migration:

1. Add manifest and generate config snapshots.
2. Run current custom scanner and generated rules in parallel.
3. Delete custom regex import scanner only after generated enforcement reaches parity.

## 22. Consolidate Tooling Scripts Around Shared Script Utilities

Current repetition:

- `scripts/type-debt-report.js`
- `scripts/typecheck-app.js`
- `scripts/architecture-scorecard.js`
- `scripts/check-layer-boundaries.js`
- `scripts/ci/build-matrix.mjs`

Several scripts repeat or nearly repeat:

- CLI parsing
- path normalization
- JSON read/write
- TypeScript diagnostic parsing
- recursive file walking
- summary output formatting

This is not uniform across every listed script: `architecture-scorecard.js` already reuses exports from `check-layer-boundaries.js`, while `build-matrix.mjs` is mostly CLI parsing plus matrix JSON. The long-term move is to extract the existing shared pieces into `scripts/lib/*` rather than implying every script has the same duplication.

Recommended end state:

- `scripts/lib/cli.js`
- `scripts/lib/files.js`
- `scripts/lib/ts-diagnostics.js`
- `scripts/lib/json-report.js`
- `scripts/lib/architecture.js`

Or move scripts to TypeScript and use `ts-morph` for TypeScript-aware transforms and diagnostics rather than regex.

## 23. Make Type Debt A Ratchet, Not A Permanent Side System

Current state:

- Strict flags are enabled.
- `tsconfig.app.json` still relaxes important checks: `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, and `exactOptionalPropertyTypes`.
- `scripts/type-debt-allowlist.json` is large.
- `artifacts/type-debt-current.json` is generated and ignored locally, but can become outdated.
- `npm run typecheck:app:allowlist` uses the script default expiry date, which is already in the past as of 2026-05-18. The writer path requires an explicit future `--default-expires-on` or a policy-driven expiry.

Recommended end state:

- Ratchet by directory:
  - `src/shared`
  - `packages/prismgb-gpu`
  - `src/main`
  - `src/renderer/application`
  - `src/renderer/infrastructure`
  - `src/renderer/presentation`
- Convert hot JS areas to TS in the same pass as manifest generation.
- Fail CI if generated debt artifacts are outdated when explicitly requested.
- Do not allow new files to use JS plus hand-authored declarations.

Aggressive policy:

- No new runtime `.js` in `src` unless it is generated or there is a documented build reason.
- Enforce that policy with lint/scorecard baselines, not typecheck alone, because current app typecheck does not check runtime JS.

## 24. Build Canonical Test Support Factories

Current repetition:

- `tests/factories/event-bus.factory.js` has a rich EventBus mock.
- `tests/mocks/index.js` has another EventBus mock, logger factory, app state, UI controller, and service mocks.
- Many tests define inline logger/eventBus/appState mocks.
- Preload/global `window.*API` mocks are also duplicated inline across adapter/service tests.
- The existing `tests/factories/index.js#createMockDependencies()` is not a stable canonical path yet because it uses CommonJS `require(...)` inside an ESM package. `tests/mocks/index.js` also keeps a separate dependency factory.

Recommended end state:

- `tests/support/dependencies.ts`:
  - `createLogger()`
  - `createLoggerFactory()`
  - `createEventBus({ record, replay })`
  - `createAppState(overrides)`
  - `createIpcApiMock(manifest)`
- `createIpcApiMock(manifest)` should generate preload/global API mocks from the IPC contract instead of each test hand-authoring `window.deviceAPI`, `window.transcodeAPI`, or `window.windowAPI`.
- Tests import support factories only. Inline logger/EventBus/preload API mocks are banned by lint rule or review policy.

Library option:

- `vitest-mock-extended` if tests move to TS and strongly typed mocks are desired.

Impact:

- High. Many large tests spend significant LOC recreating the same collaborators.

## 25. Split Vitest Into Projects

Current state:

- `vitest.config.js` uses one `happy-dom` environment.
- Coverage excludes `src/main/**` and `src/preload/**` even though main/preload tests exist.
- Coverage also excludes update services, workers, GPU rendering paths, audio, canvas lifecycle, templates, interfaces, declarations, and JSON. Some excluded areas already have tests, so the issue is hidden coverage accounting rather than simply untestable code.
- Coverage output goes to `tests/coverage`, which is ignored but noisy inside the test tree.
- `packages/prismgb-gpu` already has its own Vitest config, but root test scripts do not run the package tests, and the package coverage config excludes WebGPU/WebGL2 implementation directories.
- Performance benchmark tests are included by the default root `tests/**/*` pattern even though they contain timing thresholds and large iteration loops.

Recommended end state:

- Vitest projects:
  - `shared`: node
  - `renderer`: happy-dom
  - `main`: node plus Electron mocks
  - `preload`: node/happy-dom plus `contextBridge` and `ipcRenderer` mocks
  - `gpu`: package-specific config wired into the root quality gate
  - `performance`: explicit opt-in project, or exclude benchmark files from default root runs
- Move coverage output to `artifacts/coverage/`, or update `.gitignore` before using root `coverage/`.
- Start main/preload coverage as report-only, then ratchet thresholds.

This turns hidden exclusions into visible quality gates.

## 26. Replace Global Test Mocks With Explicit Installers

Current repetition:

- `tests/setup.js` eagerly stubs RAF, mediaDevices, MediaStream, tracks, video callbacks, and canvas.
- `tests/utils/lazy-mocks.js` reimplements lazy versions of the same mocks.
- `tests/utils/global-sandbox.js` reimplements global restore logic.
- `ResizeObserver` is used by production viewport/notes layout code and hand-rolled inline in multiple tests.

Recommended end state:

- Minimal global setup.
- Explicit installers:
  - `installMediaMocks()`
  - `installCanvasMocks()`
  - `installVideoFrameMocks()`
  - `installResizeObserverMock()`
- Use `vi.stubGlobal`, `vi.unstubAllGlobals`, and fake timers.

Risk:

- Medium, because some tests may implicitly rely on eager defaults.

Migration:

1. Add installers without deleting current setup.
2. Convert a test directory at a time.
3. Remove eager setup once imports are explicit.

## 27. Standardize DOM Tests Around Testing Library

Current repetition:

- Testing Library is configured, but many component tests manually append DOM, query selectors, and clear DOM.
- `tests/utils/render-component.js` exists but appears unused outside its own exports and is not re-exported from `tests/utils/index.js`.
- The unused DOM selector helper was deleted after `rg` found no consumers.

Recommended end state:

- One `renderComponent()` helper.
- Prefer `screen`, `within`, `fireEvent` or `userEvent`.
- Add `@testing-library/jest-dom` matchers if accepted.
- Delete unused helpers after verifying no dynamic imports.

Impact:

- Medium-high in tests.
- Low runtime risk.

## 28. Generate Contract Tests Instead Of Regex-Scanning Source

Current repetition:

- Flattening channel trees is duplicated across IPC and event contract tests.
- Preload tests parse `src/preload/index.js` with regex.
- Preload shape is hand-maintained in three places: implementation exposure, declaration interfaces, and the hard-coded expected API map in the regex test.
- The preload channel-reference test scans only `src/preload/index.js` and matches only `IPC_CHANNELS.X.Y`, so it misses delegated channel usage in `src/preload/apis/*.preload-api.js` factories.
- A hand-authored Joi event contract helper under `tests/contracts` duplicates typed event payloads but is not included by the current Vitest `*.test|*.spec` pattern and has already drifted from production payloads.
- Main IPC registry tests assert only a small slice of registered invoke channels and response shapes.

Recommended end state:

- Shared `flattenStringLeaves()`.
- Generated tests from IPC/event manifests.
- Factory-level preload tests instantiate generated API modules with mocked `ipcRenderer`.
- Generated tests should assert every registered invoke channel, request schema, response shape, preload exposure name, and preload factory channel reference.
- Retire or generate the Joi event contract layer to avoid maintaining a third event schema system.
- Keep one black-box exposure test only if it catches bundling mistakes.

## 29. Centralize Chromatic Test Mocks From The Production Device Manifest

Current repetition:

- Device specs repeat across unit mocks, fixtures, E2E helpers, and browser-injected mocks.
- VID/PID, native resolution, device labels, stream settings, and media constraints appear in multiple files.
- The stale `tests/e2e/helpers/ipc-mock.js` helper is retired; active E2E Chromatic helpers derive USB IDs from shared Chromatic E2E specs and no longer call obsolete device callback names.
- `mock-chromatic.helper.js` now restores media-device event listener patches during cleanup, matching its stored original method set.

Recommended end state:

- Device manifest generates:
  - unit media device fixtures
  - Playwright serialized fixture data
  - mock Chromatic device helpers
  - mock stream settings

E2E browser context cannot directly import Node modules, so serialize manifest data and pass it to page-evaluated functions.

## 30. Add Playwright Page Objects And Fixtures

Current repetition:

- E2E specs repeat settings popup opening, toggle flows, selectors, waits, and assertions.
- `npm run test:e2e` launches Playwright without first building, while the Electron fixture starts `dist/main/index.js` and Playwright has no active global build setup.
- A Playwright `test.extend` Electron fixture already exists, so the gap is domain page objects/domain fixtures rather than fixture infrastructure in general.

Recommended end state:

- `tests/e2e/pages/settings.page.ts`
- `tests/e2e/pages/stream.page.ts`
- `test.extend({ settingsMenu, chromaticDevice })`
- Table-driven tests from settings/device manifests.
- A deterministic E2E gate that builds Vite/Electron output or verifies a fresh build artifact before launching `dist/main/index.js`.

Library option:

- Use Playwright's built-in fixtures and `test.extend`.

## 31. Generate Architecture Docs And Feature Maps

Current repetition:

- `docs/architecture-diagrams.md` and onboarding diagrams overlap.
- `docs/feature-map.md` should be generated or drift-checked against current settings and architecture manifests.

Recommended end state:

- Generate diagrams from architecture manifests or `dependency-cruiser` output.
- Keep hand-authored narrative sections, but generate dependency diagrams and path tables between marked blocks.

This prevents docs from becoming another hand-maintained duplicate graph.

## 32. Generate Platform Build Matrix And Packaging Config From One Manifest

Current repetition:

- `package.json` scripts encode build targets.
- `package.json` electron-builder config encodes target/platform packaging.
- `scripts/ci/build-matrix.mjs` encodes CI platform matrix.
- `scripts/smoke-test.js` encodes artifact discovery assumptions.
- GitHub workflow input choices and CI test OS matrices encode additional platform surfaces.
- Release upload, publish, and checksum globs encode artifact policy separately from smoke-test discovery.

Recommended end state:

- `build.platforms.json` or `tooling/platforms.ts` defines platforms once.
- Generate:
  - npm scripts or script args
  - CI matrix
  - workflow dispatch choices and reusable workflow matrix snippets
  - electron-builder target fragments
  - smoke-test artifact discovery
  - release artifact upload/publish/checksum globs

Risk:

- Medium around release packaging. Snapshot generated outputs before replacing config.

## 33. Local Generated Artifact Policy

Verified state:

- `tests/coverage/` and `artifacts/` are ignored by `.gitignore`.
- They are present locally and add workspace noise.
- `vitest.config.js` writes coverage under `tests/coverage`.

Recommendation:

- Move coverage output to `artifacts/coverage/`. If root `coverage/` is preferred, add it to `.gitignore` first; today only `tests/coverage/`, `.vitest/`, and `artifacts/` are ignored.
- Keep generated scorecards and type-debt reports under `artifacts/`, ignored by default.
- CI should upload artifacts rather than relying on local files.
- Add a cleanup script:

```sh
npm run clean:generated
```

to remove `coverage/`, `artifacts/`, Playwright outputs, and `.vitest/`.

## Recommended Library And Tooling Choices

Use these selectively. The goal is fewer local abstractions, not more dependencies for their own sake.

- IPC/schema: Zod, TypeBox, or existing Joi. Prefer Zod/TypeBox if TS inference and generation are priorities. Prefer Joi only if staying close to current dependencies is more important.
- Electron IPC: evaluate `electron-trpc` if full RPC replacement is acceptable.
- UI components: Lit for reactive vanilla-web-component architecture; Shoelace/Web Awesome for prebuilt framework-agnostic controls after validating dependency cost against actual deleted UI code.
- Floating UI: dropdown/popover positioning and collision handling.
- DI: Awilix, already installed and used in main. Renderer adoption should replace the local container path rather than coexist with it.
- Architecture rules: `eslint-plugin-boundaries` or `dependency-cruiser`.
- Alias drift: `vite-tsconfig-paths`.
- Codemods/codegen: `ts-morph` for TypeScript-aware transformations; jscodeshift for import rewrites.
- Testing: Vitest projects, Playwright fixtures, Testing Library plus `jest-dom`.

Sources checked for current tool recommendations:

- electron-trpc: https://electron-trpc.dev/
- Zod: https://zod.dev/packages/zod
- TypeBox: https://github.com/sinclairzx81/typebox
- Lit lifecycle/controllers: https://lit.dev/docs/components/lifecycle/
- Shoelace/Web Awesome: https://shoelace.style/
- Floating UI: https://floating-ui.com/docs/getting-started
- vite-tsconfig-paths: https://github.com/aleclarson/vite-tsconfig-paths
- Vitest projects: https://vitest.dev/guide/projects.html
- Playwright fixtures: https://playwright.dev/docs/test-fixtures
- Testing Library queries: https://testing-library.com/docs/queries/about
- jest-dom: https://testing-library.com/docs/ecosystem-jest-dom/
- eslint-plugin-boundaries: https://github.com/javierbrea/eslint-plugin-boundaries
- dependency-cruiser: https://github.com/sverweij/dependency-cruiser
- eventemitter3: https://github.com/primus/eventemitter3
- Awilix: https://www.npmjs.com/package/awilix
- ts-morph: https://ts-morph.com/details/index

## Aggressive Target Architecture

The long-term target is a manifest-driven architecture:

```text
contracts/
  ipc.contract.ts
  events.contract.ts
  devices.contract.ts
  settings.contract.ts
  render-passes.contract.ts
  architecture.layers.ts
  platforms.contract.ts

generated/
  ipc channels, preload APIs, global declarations, handler descriptors
  event payload maps, event constants, forwarding bridges
  device profiles, adapter metadata, fixtures
  settings methods, UI options, tests
  shader pass runners and uniform upload code
  aliases, layer rules, diagrams, CI matrix
```

Manual code should contain behavior. Contracts, registrations, selectors, payload maps, test fixtures, platform matrices, and repetitive state/render wiring should be generated or table-driven.

## Enforcement Policies

Adopt these rules to prevent regression:

- No new IPC channel without contract manifest entry.
- No new preload API hand-written directly in `src/preload/index.js`.
- No new event channel without payload schema or explicit `void` marker.
- No new renderer rendering backend outside `@prismgb/gpu`.
- No duplicate shader files outside the GPU package.
- No new UI component without `PresentationComponent` or Lit lifecycle management.
- No new setting outside `SettingsDefinitions`.
- No new device metadata outside the device manifest.
- No new JS plus hand-written `.d.ts` twin.
- No new test-local logger/EventBus/preload API mocks outside canonical support factories.
- No new architecture alias/layer rule outside the architecture manifest.

## Suggested Migration Sequence

1. Add measurement gates:
   - LOC/file-count report by area.
   - duplicate shader check.
   - contract drift checks.
   - generated artifact cleanup script.

2. Build small foundations:
   - `DisposableBag`.
   - preload subscription factory.
   - shared contract-test helpers.
   - canonical test dependency factories.

3. Introduce manifests in report-only mode:
   - IPC manifest generates declarations/tests first.
   - event manifest generates payload/runtime channel list.
   - settings manifest generates generic accessors and table-driven tests.
   - device manifest generates test fixtures.

4. Collapse high-duplication runtime code:
   - move shader ownership fully to `@prismgb/gpu`.
   - expose worker-safe GPU package pipeline.
   - swap renderer worker internals behind current protocol.

5. Consolidate UI:
   - introduce `PresentationComponent`.
   - migrate auto-hide effects to `ActivityAutoHideController`.
   - migrate listbox/combobox behaviors.
   - introduce `data-action` delegation.
   - evaluate Lit for dynamic components.

6. Unify tooling:
   - architecture manifest.
   - generated aliases.
   - generated layer rules.
   - dependency-cruiser diagrams.
   - platform manifest.

7. Ratchet type and test gates:
   - Vitest projects.
   - main/preload coverage reporting.
   - JS-to-TS conversion by layer.
   - stricter `tsconfig.app.json` options per directory.

## Expected Biggest Reductions

The largest deletions should come from:

- Renderer worker/GPU duplication and duplicated shader trees.
- Preload listener and IPC handler boilerplate.
- Renderer DI registration files.
- Presentation component lifecycle/event wiring.
- CSS shell/option/pill/range repetition.
- Test mocks and global setup duplication.
- JS plus `.d.ts` twin files.
- Architecture/tooling config duplication.

The main rule is simple: every repeated contract becomes a manifest; every repeated lifecycle becomes a base utility; every repeated registry becomes a generic factory; every repeated UI behavior becomes a controller or component primitive.
