---
name: architectural-refactor-plan
description: Refactor to enforce thin orchestrators and scoped services
---

# Plan

Implement the refactor to enforce thin orchestrators, scoped services, and explicit bridges, and track all valid architectural assertions (including optional ones).

## Requirements
- Orchestrators only coordinate (events, sequencing, delegation).
- Business logic lives in services.
- Main-process wrappers stay in services/managers; orchestration in a main app orchestrator.
- UI bridges only translate EventBus -> UIController.
- Dependency injection declarations are explicit (no hidden deps); services avoid manual wiring inside other services.
- Error handling does not swallow failures silently; logging is consistent.
- Naming conventions are consistent and enforced across UI/GPU acronyms and file roles.

## Scope
- In: capture pipeline, performance state, animation suppression, UI bridge, renderer/main bootstraps, device/update main process roles, device adapters/profiles, GPU worker pipeline, UI component factory, DI wiring, tests.
- Out: feature changes beyond architectural re-layout.

## Files and entry points
- src/renderer/features/capture/services/capture.orchestrator.js
- src/renderer/features/capture/services/gpu-recording.service.js
- src/renderer/application/performance/performance-state.orchestrator.js
- src/renderer/application/performance/performance-state.service.js
- src/renderer/application/performance/animation-performance.orchestrator.js
- src/renderer/application/performance/animation-performance.service.js
- src/renderer/application/performance/performance-metrics.service.js
- src/renderer/features/streaming/rendering/render-pipeline.service.js
- src/renderer/features/streaming/rendering/canvas-lifecycle.service.js
- src/renderer/features/streaming/rendering/gpu/gpu.renderer.service.js
- src/renderer/features/streaming/rendering/workers/render.worker.js
- src/renderer/features/streaming/audio/audio-warmup.service.js
- src/renderer/features/streaming/services/streaming.service.js
- src/renderer/features/streaming/factories/adapter.factory.js
- src/renderer/features/devices/adapters/chromatic/chromatic.adapter.js
- src/renderer/features/devices/services/device.service.js
- src/renderer/features/devices/services/device-connection.service.js
- src/renderer/features/devices/services/device-storage.service.js
- src/renderer/features/devices/services/device-media.service.js (renamed from media-device.service.js)
- src/renderer/ui/orchestration/ui-event-bridge.js
- src/renderer/ui/orchestration/capture-ui.bridge.js
- src/renderer/ui/controller/component.factory.js
- src/renderer/RendererAppOrchestrator.js
- src/main/MainAppOrchestrator.js
- src/main/IpcHandlers.js
- src/main/TrayManager.js
- src/main/WindowManager.js
- src/main/features/devices/device.service.main.js
- src/main/features/updates/update.service.main.js
- src/renderer/container.js
- src/main/container.js

## Data model / API changes
- New shared modules:
  - @shared/features/devices/profiles/chromatic.profile.js (move from renderer)
  - @shared/streaming/acquisition/* (move from renderer to break device/streaming cycle)
- New services:
  - GpuRecordingService (or RecordingPipelineService)
  - PerformanceStateService
  - AnimationPerformanceService
  - Optional: CinematicModeService (if gating grows)
- New main-process bridges:
  - DeviceBridgeService
  - UpdateBridgeService
- New main-process coordinator:
  - DeviceLifecycleCoordinator (or DeviceAutoLaunchCoordinator) to own auto-launch logic.
- New UI infrastructure:
  - `UIComponentRegistry` at composition root - feature modules register UI components by key; factory resolves by key.
- Renames (kebab-case + role suffix):
  - src/main/IpcHandlers.js -> src/main/ipc-handlers.service.js
  - src/main/TrayManager.js -> src/main/tray-manager.service.js
  - src/main/WindowManager.js -> src/main/window-manager.service.js
  - src/main/MainAppOrchestrator.js -> src/main/main-app.orchestrator.js
  - src/renderer/RendererAppOrchestrator.js -> src/renderer/renderer-app.orchestrator.js
  - src/renderer/ui/orchestration/capture-ui.bridge.js (already correct - uses .bridge.js)
  - src/renderer/ui/orchestration/ui-event-bridge.js -> src/renderer/ui/orchestration/ui-event.bridge.js

## Action items
### Phase 1 (Critical boundaries and DI) ✅ COMPLETED
[x] Move `ChromaticProfile` to `@shared/features/devices/profiles/` and update main/renderer imports to preserve process isolation.
    - Moved `chromatic.profile.js` and `chromatic.config.js` to `@shared/features/devices/profiles/chromatic/`
    - Updated imports in `device.service.main.js`, `chromatic.adapter.js`, `adapter.factory.js`, and tests
[x] Break the devices <-> streaming circular dependency (move acquisition primitives to `@shared/streaming/acquisition/` or invert ownership behind shared interfaces).
    - Moved 6 acquisition modules to `@shared/streaming/acquisition/`: `constraint.builder.js`, `acquisition.context.js`, `acquisition.coordinator.js`, `fallback.strategy.js`, `stream.lifecycle.js`, `interfaces.js`
    - Updated 14 files with new import paths
[x] Extend `BaseService` in `DeviceConnectionService`, `DeviceStorageService`, and `DeviceMediaService` to enforce DI validation.
    - All three services now extend BaseService with proper dependency declarations
    - Renamed `MediaDeviceService` → `DeviceMediaService` for naming consistency
[x] Declare optional dependencies in `DeviceService` (storage/media devices) and avoid manual instantiation by registering sub-services in the DI container or a factory.
    - Registered `deviceConnectionService`, `deviceStorageService`, `deviceMediaService` as singletons in container.js
    - DeviceService now receives sub-services via DI injection
[x] Rename `MediaDevicesService` to `BrowserMediaService` for naming clarity.
    - Renamed `media-devices.service.js` → `browser-media.service.js`
    - Updated all references: container.js, adapter.factory.js, device-media.service.js, chromatic.adapter.js
    - Clear distinction from `DeviceMediaService` (feature) vs `BrowserMediaService` (infrastructure)

### Phase 2 (High priority architecture boundaries)
[ ] Extract GPU recording pipeline from `CaptureOrchestrator` into `GpuRecordingService` with API: `start(stream, capabilities)`, `stop()`, `isActive()`, `captureFrame()`.
[ ] Extract idle/visibility/motion/weak-GPU logic from `PerformanceStateOrchestrator` into `PerformanceStateService` with API: `initialize()`, `dispose()`, `getState()`.
[ ] Extract animation suppression and DOM class toggling from `AnimationPerformanceOrchestrator` into `AnimationPerformanceService` with API: `setState({ streaming, performanceState })`.
[ ] Split `RenderPipelineService` into an orchestrator + focused services and decouple it from `uiController` via a view adapter (`StreamViewService`/`StreamElementsProvider`).
[ ] Main process: split `src/main/MainAppOrchestrator.js` into orchestrator + services (Window, Tray, DeviceBridge, UpdateBridge), keeping OS API wrappers in services.
[ ] Main process: move device auto-launch (window show) out of `DeviceServiceMain` into `DeviceLifecycleCoordinator`.
[ ] Split shell/external link handling into a dedicated preload API (avoid bundling `openExternal` under `deviceAPI`) and route UI through that API/service.
[ ] Make UI bridges pure translators: remove DOM/class toggling or file downloads from UI bridges and move to UIController/UIEffects or dedicated UI services.
[ ] Replace hard-coded UI event names with `EventChannels` constants for all UI bridges.
[ ] Remove UI status messaging from `GpuRecordingService`; emit a capture-level warning event that UI translates into status text.
[ ] Remove UI-specific button feedback payloads (element keys/CSS class names) from `CaptureOrchestrator`; let UI effects/bridges own the visuals.
[ ] Move IPC listener wiring out of `DeviceOrchestrator` into a device IPC service/adapter so orchestration stays thin.
[ ] Relocate renderer-only shared modules out of `src/shared` (DOM selectors, CSS class constants, UI timing constants, file download helper, DOM listener manager) into renderer UI/infrastructure.
[ ] Keep infrastructure services generic: move `StorageService` protected key policy into SettingsService or config injection.
[ ] Align media device abstraction usage: `BaseStreamLifecycle` should use injected `BrowserMediaService` instead of `navigator.mediaDevices` directly (or stop injecting unused dependencies).
[ ] Fix cinematic mode flow: UI components should call `DisplayModeOrchestrator`/`CinematicModeService` or publish a settings-level event; avoid UI-level events as the source of truth so AppState stays correct.
[ ] Remove UI-pacing logic from `UpdateService` (rAF/setTimeout) and relocate to UI layer (UpdateSection or Update UI service).
[ ] Move DOM/visibility listeners out of `PerformanceStateService` into a UI/infrastructure adapter so the performance service stays state-only and testable.
[ ] Move body class toggling out of `AnimationPerformanceService` into UI effects/controller (or a `BodyClassManager`) to avoid DOM mutation in application services.
[ ] Replace direct `globalThis.metricsAPI` usage in `PerformanceMetricsService` with an injected metrics client (preload adapter) for clean boundaries.
[ ] Implement `UIComponentRegistry` at composition root: feature modules register their UI components by key during bootstrap; `UIComponentFactory` resolves by key instead of direct imports.

### Phase 3 (Medium priority consistency and error handling)
[ ] Rename main/renderer files to kebab-case + role suffix (see Data model renames) to standardize naming across processes.
[ ] Apply naming conventions:
  - Class names use UI/GPU acronyms (uppercase).
  - File names are kebab-case + role suffix (e.g., `*.bridge.js`, `*.service.js`, `*.orchestrator.js`).
  - Bridges use `*.bridge.js` pattern (e.g., `capture-ui.bridge.js`, `ui-event.bridge.js`).
[ ] Standardize naming for non-orchestrator coordinators/managers/monitors (e.g., `StreamAcquisitionCoordinator`) to fit the agreed role suffix scheme.
[ ] Centralize raw CSS class strings used in components (e.g., update "available"/"highlight") into `CSSClasses` or a component-local constant scheme.
[ ] Add error logging for swallowed errors (AudioContext close in `audio-warmup.service.js`, usb-detection fallback in `device.service.main.js`, and start errors ignored during `StreamingService.stop()`).
[ ] Route renderer console logs in `WindowManager` through the logger (or guard behind debug flag).
[ ] Fix `_readyTimeoutId` cleanup in `GPURendererService._cleanup()` to avoid dangling timeouts.
[ ] Standardize `dispose()` vs `cleanup()` naming (pick one for services/orchestrators).
[ ] Create error class hierarchy for consistent error types and logging context.

### Phase 4 (Low priority performance cleanup)
[ ] Cache uniforms object or reuse typed arrays in `GPURendererService.renderFrame` to avoid per-frame allocations.
[ ] Reduce array allocations in `render.worker.js` uniform updates (avoid per-frame literal arrays).
[ ] Cache the bind group layout for canvas passes in `render.worker.js` to avoid per-frame `getBindGroupLayout(0)` calls.
[ ] Remove the duplicate `_isCrtEnabled` definition in `render.worker.js` and keep a single implementation.

### Cross-cutting
[ ] Update DI wiring in renderer and main containers to register new services, bridges, and coordinators.
[ ] Update tests: new service unit tests; orchestrator tests reduced to wiring/sequence checks.
[ ] Validate runtime flows: streaming start/stop, recording on GPU path, performance mode toggles, UI overlay state, update events.

## Testing and validation
- Unit tests for GpuRecordingService, PerformanceStateService, AnimationPerformanceService.
- Unit tests for device sub-services once they extend BaseService.
- Coverage for StreamingService stop transition logging and AudioWarmupService close logging.
- Orchestrator tests only for event delegation and sequencing.
- Smoke: stream start/stop, recording start/stop, performance mode toggle, app idle/hidden behavior, update notifications.

## Risks and edge cases
- Lifecycle order issues (recording cleanup vs stream stop).
- Performance state out-of-sync if coordinator/service responsibilities blur.
- Renames require careful import/DI updates.
- Moving acquisition primitives to `@shared` may ripple through import paths and DI registrations.

## Resolved decisions
- **Acronym casing**: Use `UI`/`GPU` (uppercase) in class names.
- **Bridge file naming**: Use `*.bridge.js` pattern (e.g., `capture-ui.bridge.js`).
- **Optional deps**: `DeviceService` should declare optional deps explicitly; no BaseService change needed.
- **UI component registry**: Yes - implement registry at composition root; `UIComponentFactory` resolves components by key, not direct imports.

## Valid assertions (including optional)
- ~~Main process imports `ChromaticProfile` from renderer (`src/main/features/devices/device.service.main.js`), violating process boundaries.~~ ✅ RESOLVED: Moved to `@shared/features/devices/profiles/chromatic/`
- ~~Circular dependency exists between devices and streaming (`chromatic.adapter.js` <-> `adapter.factory.js`).~~ ✅ RESOLVED: Moved acquisition primitives to `@shared/streaming/acquisition/`
- ~~`DeviceConnectionService`, `DeviceStorageService`, and `MediaDeviceService` do not extend `BaseService`.~~ ✅ RESOLVED: All now extend BaseService; MediaDeviceService renamed to DeviceMediaService
- ~~`DeviceService` uses optional deps (`storageService`, `mediaDevicesService`) without DI declaration and manually instantiates sub-services.~~ ✅ RESOLVED: Sub-services registered in container.js and injected via DI
- CaptureOrchestrator is monolithic: owns GPU recording pipeline, scaling math, RAF loop, dropped-frame policy -> should move to a service. (Valid)
- PerformanceStateOrchestrator is logic-heavy: visibility, idle timers, reduced-motion tracking, weak-GPU detection -> should move to a service. (Valid)
- AnimationPerformanceOrchestrator mixes policy + DOM side effects -> split into a service. (Valid, included)
- src/main/MainAppOrchestrator.js and src/renderer/RendererAppOrchestrator.js function as orchestrators/bootstraps -> rename for clarity. (Valid, included)
- src/main/features/devices/device.service.main.js and src/main/features/updates/update.service.main.js function as service-level orchestration -> split or clarify roles. (Valid, included)
- UI event bridge is effectively a UI translation layer -> ensure narrow responsibilities and bridge naming. (Valid, included)
- Device auto-launch belongs in a coordinator, not in DeviceServiceMain (Valid).
- Consistent UI/GPU acronym casing and kebab-case + role suffix file naming reduce drift and ease discovery (Valid).
- deviceAPI currently exposes `openExternal` (shell concern) and is used by UI; should be split into a shell/external link API or service (Valid).
- UI bridges currently own DOM/class toggles or side effects (downloads); per requirements they should only translate EventBus -> UIController (Valid).
- UIEventBridge uses string event names; should use `EventChannels` for consistency (Valid).
- DeviceOrchestrator wiring IPC listeners directly to `window.deviceAPI` is a responsibility leak; use a dedicated IPC service/adapter (Valid).
- Renderer-only modules live in `src/shared` (DOM selectors, CSS classes, UI timing, file download, DOM listener manager); they should be moved to renderer scope (Valid).
- `StorageService` includes app-specific protected keys, which couples infra to settings policy; move that policy to SettingsService/config (Valid).
- `BaseStreamLifecycle` bypasses `BrowserMediaService` and uses `navigator.mediaDevices` directly, undermining testability and consistent abstraction (Valid).
- Cinematic mode is driven by UI events (shader selector) without updating AppState; requires a settings-level source of truth via orchestrator/service (Valid).
- `UpdateService` contains UI rendering delays; UI pacing should live in UI layer, not the update service (Valid).
- `RenderPipelineService` and `CanvasLifecycleService` depend on `uiController` and touch DOM elements; they should consume a view adapter and avoid mutating UI controller internals (Valid).
- `CanvasLifecycleService` writes to `uiController.elements.streamCanvas`, which crosses layer boundaries and bypasses the UI facade (Valid).
- `GpuRecordingService` emits `EventChannels.UI.STATUS_MESSAGE`, mixing capture pipeline concerns with UI messaging (Valid).
- `CaptureOrchestrator` publishes UI-specific feedback payloads (element keys, CSS classes), coupling orchestration to UI details (Valid).
- `PerformanceMetricsService` reads `globalThis.metricsAPI` directly instead of using an injected metrics client, which hides dependencies and reduces testability (Valid).
- `PerformanceStateService` and `AnimationPerformanceService` attach DOM listeners or toggle body classes directly -> move to UI/infrastructure adapters. (Valid, included)
- `RenderPipelineService` is 380 lines and mixes orchestration with rendering decisions; split into a coordinator + service(s). (Valid)
- `UIComponentFactory` imports feature UI components directly -> implement registry pattern. (Valid, included)
- `AudioWarmupService` swallows `AudioContext.close()` errors without logging. (Valid)
- `device.service.main.js` has a silent catch around usb-detection fallback in `_scanAlreadyConnectedDevices()`. (Valid)
- `StreamingService.stop()` ignores start errors during a stop transition without logging. (Valid)
- `WindowManager` forwards renderer console messages with `console.log` instead of the logger. (Valid)
- `GPURendererService._cleanup()` does not clear `_readyTimeoutId`. (Valid)
- `render.worker.js` defines `_isCrtEnabled` twice. (Valid)
- `GPURendererService.renderFrame()` allocates uniforms per frame (hot loop). (Valid)
- `render.worker.js` uniform updates allocate arrays per frame. (Valid)
- `render.worker.js` requests bind group layout per frame for canvas pass; cache is possible. (Valid)
- Main process filenames are PascalCase (`IpcHandlers.js`, `TrayManager.js`, `WindowManager.js`), inconsistent with kebab-case conventions. (Valid)
- Mixed `dispose()` vs `cleanup()` naming exists across renderer services. (Valid)
- No custom error class hierarchy exists -> create error class hierarchy. (Valid, included)

## Unvalidated assertions from code-review-report.md
- `gpu.renderer.service.js` ImageBitmap leak in error path (not confirmed; existing catch closes ImageBitmap).
- `gpu-recording.service.js` RAF closure per frame (not confirmed; loop reuses a single closure).
- Render pipeline startup uses sequential awaits that could be parallelized (not confirmed).
- "Only 7 TODO comments" (repo currently contains a single TODO in `gpu.renderer.service.js`).
