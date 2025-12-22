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

## Scope
- In: capture pipeline, performance state, animation suppression, UI bridge, renderer/main bootstraps, device/update main process roles, DI wiring, tests.
- Out: feature changes beyond architectural re-layout.

## Files and entry points
- src/features/capture/services/capture.orchestrator.js
- src/app/renderer/application/performance/performance-state.orchestrator.js
- src/app/renderer/application/performance/animation-performance.orchestrator.js
- src/ui/orchestration/event-handler.js
- src/app/renderer/Application.js
- src/app/main/Application.js
- src/features/devices/main/device.manager.js
- src/features/updates/main/update.manager.js
- src/app/renderer/container.js
- src/app/main/container.js

## Data model / API changes
- New services:
  - GpuRecordingService (or RecordingPipelineService)
  - PerformanceStateService
  - AnimationPerformanceService
  - Optional: CinematicModeService (if gating grows)
- New main-process bridges:
  - DeviceBridgeService
  - UpdateBridgeService
- Optional renames for clarity:
  - main Application.js -> MainAppOrchestrator
  - renderer Application.js -> RendererAppOrchestrator
  - event-handler.js -> UIEventBridge
  - device.manager.js -> DeviceServiceMain
  - update.manager.js -> UpdateServiceMain

## Action items
[ ] Extract GPU recording pipeline from CaptureOrchestrator into GpuRecordingService with API: start(stream, capabilities), stop(), isActive(), captureFrame(). Orchestrator delegates capture/record lifecycle only.
[ ] Extract idle/visibility/motion/weak-GPU logic from PerformanceStateOrchestrator into PerformanceStateService with API: initialize(), dispose(), getState(). Coordinator only publishes state events.
[ ] Extract animation suppression and DOM class toggling from AnimationPerformanceOrchestrator into AnimationPerformanceService with API: setState({ streaming, performanceState }). Orchestrator only passes inputs.
[ ] Rename src/ui/orchestration/event-handler.js to UIEventBridge and keep logic limited to UI translation; optional CinematicModeService if gating grows.
[ ] Main process: split src/app/main/Application.js into MainAppOrchestrator + services (WindowService, TrayService, DeviceBridgeService, UpdateBridgeService), keeping OS API wrappers in services.
[ ] Main process: reclassify device.manager.js/update.manager.js as DeviceServiceMain/UpdateServiceMain (or retain names and remove orchestration side effects).
[ ] Update DI wiring in renderer and main containers to register new services and bridges.
[ ] Update tests: new service unit tests; orchestrator tests reduced to wiring/sequence checks.
[ ] Validate runtime flows: streaming start/stop, recording on GPU path, performance mode toggles, UI overlay state, update events.

## Testing and validation
- Unit tests for GpuRecordingService, PerformanceStateService, AnimationPerformanceService.
- Orchestrator tests only for event delegation and sequencing.
- Smoke: stream start/stop, recording start/stop, performance mode toggle, app idle/hidden behavior, update notifications.

## Risks and edge cases
- Lifecycle order issues (recording cleanup vs stream stop).
- Performance state out-of-sync if coordinator/service responsibilities blur.
- Renames require careful import/DI updates.

## Open questions
- None.

## Valid assertions (including optional)
- CaptureOrchestrator is monolithic: owns GPU recording pipeline, scaling math, RAF loop, dropped-frame policy -> should move to a service. (Valid)
- PerformanceStateOrchestrator is logic-heavy: visibility, idle timers, reduced-motion tracking, weak-GPU detection -> should move to a service. (Valid)
- AnimationPerformanceOrchestrator mixes policy + DOM side effects -> can be split into a service, though optional. (Valid, optional)
- src/app/main/Application.js and src/app/renderer/Application.js function as orchestrators/bootstraps and renaming is a clarity improvement, not required. (Valid, optional)
- device.manager.js and update.manager.js function as service-level orchestration and could be renamed or split; change is optional but clarifies roles. (Valid, optional)
- UIEventHandler is effectively a bridge/orchestrator and renaming improves clarity. (Valid, optional)
