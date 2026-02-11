# Deep Dive: Base Class Hierarchy and Lifecycle Patterns

**Date:** 2026-02-11
**Scope:** Every class extending `BaseService` or `BaseOrchestrator` across the entire `src/` tree
**Purpose:** Exhaustive inventory of lifecycle patterns, subscription management, and consolidation opportunities

---

## 1. Current Base Class Inventory

### `src/shared/base/` Directory (357 lines total)

| File | Lines | Purpose |
|------|-------|---------|
| `service.base.js` | 46 | Dependency validation, assignment, logger creation |
| `orchestrator.base.js` | 150 | Lifecycle template methods, subscription management |
| `validate-deps.utils.js` | 20 | Shared validation function |
| `dom-listener.utils.js` | 101 | Factory for tracked DOM event listener management |
| `service.base.d.ts` | 18 | Type declarations for BaseService |
| `orchestrator.base.d.ts` | 22 | Type declarations for BaseOrchestrator |

### Key Structural Problem

`BaseOrchestrator` does NOT extend `BaseService`. Both independently:
- Import and call `validateDependencies()`
- Loop through `requiredDeps` to assign dependencies to `this`
- Check for `loggerFactory` and create `this.logger`

This is **27 lines of duplicated constructor logic** across the two classes.

---

## 2. Complete Class Inventory

### 2a. Classes Extending `BaseOrchestrator` (13 classes, 1473+184 = 1657 lines)

**Renderer Orchestrators (12 files, 1473 lines)**

| File | Lines | has `onInitialize` | has `onCleanup` | uses `subscribeWithCleanup` | Manual subscription mgmt |
|------|-------|-------------------|-----------------|----------------------------|--------------------------|
| `app.orchestrator.ts` | 174 | Yes | Yes (error-resilient sub-orchestrator cleanup) | Yes | No |
| `streaming.orchestrator.ts` | 296 | Yes | Yes | Yes (3 calls) | No |
| `capture.orchestrator.ts` | 244 | Yes | Yes | Yes | No |
| `device.orchestrator.ts` | 93 | Yes | Yes (manual IPC unsubscribe + flush + dispose) | No | Yes (`_unsubscribeIPC`) |
| `display-mode.orchestrator.ts` | 74 | Yes | Yes (delegates to fullscreenService.dispose) | Yes | No |
| `preferences.orchestrator.ts` | 54 | Yes | No | No | No |
| `ui-setup.orchestrator.ts` | 219 | Yes | Yes (domListeners.removeAll) | Yes | No (uses `createDomListenerManager`) |
| `streaming-audio.orchestrator.ts` | 83 | Yes | No | Yes | No |
| `performance-state.orchestrator.ts` | 76 | Yes | Yes (delegates to service.dispose) | Yes | No |
| `performance-animation.orchestrator.ts` | 56 | Yes | Yes (empty - noop) | Yes | No |
| `performance-metrics.orchestrator.ts` | 42 | Yes | Yes (delegates to service methods) | Yes | No |
| `update.orchestrator.ts` | 62 | Yes | Yes (delegates to service.dispose x2) | No | No |

**Main Process Orchestrator (1 file, 184 lines)**

| File | Lines | has `onInitialize` | has `onCleanup` | uses `subscribeWithCleanup` |
|------|-------|-------------------|-----------------|----------------------------|
| `main/application/app.orchestrator.ts` | 184 | Yes | Yes (uses `safeDisposeAll`) | No |

### 2b. Classes Extending `BaseService` (41 classes)

**Renderer Bridges (3 files, 384 lines) -- ALL have hand-rolled lifecycle**

| File | Lines | has `initialize()` | has `dispose()` | Hand-rolled `_subscriptions` | Candidate for LifecycleService |
|------|-------|-------------------|-----------------|------------------------------|-------------------------------|
| `presentation/bridges/ui-event.bridge.ts` | 170 | Yes | Yes | Yes (15 subscriptions) | **YES** |
| `presentation/bridges/capture-ui.bridge.ts` | 87 | Yes | Yes | Yes (6 subscriptions) | **YES** |
| `presentation/bridges/transcode-ui.bridge.ts` | 127 | Yes | Yes | Yes (5 subscriptions) + toast dispose | **YES** |

**Renderer Services with Lifecycle (9 files, 1465 lines)**

| File | Lines | has `initialize()` | has `dispose()` | Subscription pattern | Candidate for LifecycleService |
|------|-------|-------------------|-----------------|---------------------|-------------------------------|
| `services/updates/update.service.ts` | 231 | Yes | Yes | `_cleanupFns[]` (5 IPC listeners) + `_initialized` guard | **YES** |
| `services/updates/update-ui.service.ts` | 88 | Yes | Yes | `_subscriptions[]` (5 EventBus) | **YES** |
| `services/transcode/transcode.service.ts` | 229 | Yes | Yes | `_cleanupFns[]` (4 IPC listeners) + `_initialized` guard | **YES** |
| `services/settings/fullscreen.service.ts` | 144 | Yes | Yes | 3 individual `_unsubscribe*` variables + DOM listener | **YES** |
| `services/performance/performance-state.service.ts` | 207 | Yes | Yes | 3 individual `_*Cleanup` variables (adapter callbacks) | **YES** |
| `services/streaming/streaming.service.ts` | 444 | No | Yes (`dispose()` calls `stop()`) | Track monitoring handlers | No (state machine, not pure lifecycle) |
| `services/streaming/render-pipeline.service.ts` | 482 | Yes (thin) | Yes (`cleanup()`) | No subscriptions | Marginal |
| `services/streaming/audio-pipeline.service.ts` | 396 | No | Yes (`cleanup()`) | 1 EventBus sub in constructor + timers | Partial |
| `services/streaming/health.service.ts` | 206 | No | Yes (`cleanup()`/`dispose()`) | No subscriptions, manages RVFC/timeouts | No |

**Renderer Services without Lifecycle (14 files)**

| File | Lines | Notes |
|------|-------|-------|
| `services/devices/device.service.ts` | 77 | Facade, delegates `dispose()` |
| `services/devices/device-connection.service.ts` | 43 | Pure state, no lifecycle |
| `services/devices/device-storage.service.ts` | 48 | Pure storage, no lifecycle |
| `services/devices/device-media.service.ts` | 270 | Has `dispose()` but no `initialize()` |
| `services/devices/device-operation-sequencer.service.ts` | 141 | Has `flush()` but no lifecycle |
| `services/settings/settings.service.ts` | 263 | Pure getter/setter, no lifecycle |
| `services/settings/cinematic-mode.service.ts` | 24 | Single method, no lifecycle |
| `services/settings/presentation-mode.service.ts` | 61 | Stateful but no lifecycle |
| `services/capture/capture.service.ts` | 314 | Has `dispose()`, state machine |
| `services/capture/capture-save.service.ts` | 146 | Noop `dispose()` |
| `services/capture/gpu-recording.service.ts` | 289 | Has `dispose()`, manages RAF loop |
| `services/streaming/viewport.service.ts` | 230 | Has `initialize()`/`cleanup()`/`dispose()` |
| `services/streaming/canvas-lifecycle.service.ts` | 101 | Has `initialize()`/`cleanup()` |
| `services/streaming/gpu-render-loop.service.ts` | 61 | Has `start()`/`stop()`/`cleanup()` |
| `services/streaming/streaming-view.service.ts` | 136 | Pure DOM accessor, no lifecycle |
| `services/streaming/gpu-renderer.service.ts` | ~460 | Has complex lifecycle, manages worker |
| `services/notes/notes.service.ts` | 331 | Pure CRUD, no lifecycle |

**Main Process Services (7 files)**

| File | Lines | has `initialize()` | has `dispose()` | Hand-rolled subscriptions |
|------|-------|-------------------|-----------------|---------------------------|
| `main/infrastructure/devices/device.service.ts` | ~280 | No (uses `startUSBMonitoring()`) | Yes (`stopUSBMonitoring()`) | USB callbacks |
| `main/infrastructure/devices/device-bridge.service.ts` | 81 | Yes | Yes | `_unsubscribe` (1 EventBus sub) |
| `main/infrastructure/devices/device-lifecycle.service.ts` | 104 | Yes | Yes | `_unsubscribe` (1 EventBus sub) + timeout |
| `main/infrastructure/updates/update.bridge.ts` | 51 | Yes | Yes | Delegates to updateService |
| `main/infrastructure/updates/update.service.ts` | ~400 | Yes | Yes | `_initialized` guard + auto-updater listeners |
| `main/infrastructure/transcode/transcode.service.ts` | ~280 | Yes | Yes | Process cleanup |
| `main/infrastructure/tray/tray.service.ts` | ~140 | No (uses `createTray()`) | Yes (`destroy()`) | No subscriptions |
| `main/infrastructure/window/window.service.ts` | ~240 | No (uses `createWindow()`) | Yes (`dispose()`) | Listener cleanup |
| `main/ipc/ipc-handler.registry.ts` | 145 | No (uses `registerHandlers()`) | Yes | `_registeredChannels[]` |

---

## 3. Repeated Patterns Analysis

### Pattern 1: Hand-Rolled `_subscriptions` Array (10 occurrences)

**The pattern:**
```ts
// In constructor:
this._subscriptions = [];

// In initialize():
this._subscriptions.push(
  this.eventBus.subscribe(EventChannels.X.Y, handler)
);

// In dispose():
this._subscriptions.forEach(unsubscribe => {
  if (typeof unsubscribe === 'function') {
    unsubscribe();
  }
});
this._subscriptions = [];
```

**Files with this exact pattern (renderer):**
1. `presentation/bridges/ui-event.bridge.ts` (lines 21, 73, 162-167) - 15 subscriptions
2. `presentation/bridges/capture-ui.bridge.ts` (lines 15, 19-26, 32-37) - 6 subscriptions
3. `presentation/bridges/transcode-ui.bridge.ts` (lines 15, 29-35, 41-46) - 5 subscriptions
4. `infrastructure/services/updates/update-ui.service.ts` (lines 14, 18-24, 30-35) - 5 subscriptions
5. `application/state/app-state.ts` (lines 61, 79-85, 139-145) - 2 subscriptions
6. `presentation/features/updates/update-section.component.js` (lines 19, 78-96, 313-318) - 4 subscriptions

**Estimated boilerplate per occurrence:** ~8-12 lines (constructor init + dispose logic)
**Total eliminable boilerplate:** ~60-70 lines across these 6 files

### Pattern 2: Hand-Rolled `_cleanupFns` Array (2 occurrences)

**Files:**
1. `infrastructure/services/updates/update.service.ts` (lines 41, 60-66, 215-218) - 5 IPC listeners
2. `infrastructure/services/transcode/transcode.service.ts` (lines 35, 58-63, 215-218) - 4 IPC listeners

**Identical to `_subscriptions` pattern** but named differently. Same dispose logic.

### Pattern 3: Individual `_unsubscribe*` Variables (4 occurrences)

**The pattern:**
```ts
// In constructor:
this._unsubscribeX = null;

// In initialize():
this._unsubscribeX = this.eventBus.subscribe(...);

// In dispose():
if (this._unsubscribeX) {
  this._unsubscribeX();
  this._unsubscribeX = null;
}
```

**Files:**
1. `services/settings/fullscreen.service.ts` - 3 variables: `_unsubscribeEnterFullscreen`, `_unsubscribeLeaveFullscreen`, `_unsubscribeResized` (lines 17-19, 26-33, 44-56) - ~18 lines of boilerplate
2. `main/infrastructure/devices/device-bridge.service.ts` - 1 variable: `_unsubscribe` (lines 48, 56-59, 72-76) - ~8 lines
3. `main/infrastructure/devices/device-lifecycle.service.ts` - 1 variable: `_unsubscribe` (lines 42, 48-51, 95-98) - ~8 lines
4. `renderer/application/orchestrators/device.orchestrator.ts` - 1 variable: `_unsubscribeIPC` (lines 26, 37-39, 79-82) - ~8 lines

**Total boilerplate:** ~42 lines

### Pattern 4: `_initialized` Guard (4 occurrences)

**The pattern:**
```ts
// In constructor:
this._initialized = false;

// In initialize():
if (this._initialized) {
  this.logger.warn('Already initialized');
  return;
}
// ...
this._initialized = true;

// In dispose():
this._initialized = false;
```

**Files:**
1. `services/updates/update.service.ts` (lines 42, 46-48, 68, 226)
2. `services/transcode/transcode.service.ts` (lines 36, 43-45, 65, 224)
3. `presentation/features/updates/update-section.component.js` (lines 21, 38-40, 48, 328)
4. `infrastructure/factories/streaming-renderer.factory.ts` (lines 50, 58-59, 68, 195)

**This is exactly what `BaseOrchestrator.isInitialized` already provides** but `BaseService` subclasses must hand-roll it. Adding this to `LifecycleService` eliminates ~8 lines per occurrence = ~32 lines.

### Pattern 5: `createDomListenerManager` Usage (16 occurrences)

**The pattern:**
```js
import { createDomListenerManager } from '@shared/base/dom-listener.utils.js';

// In constructor:
this._domListeners = createDomListenerManager({ logger: this.logger });

// In dispose/cleanup:
this._domListeners.removeAll();
```

**Files using this pattern:**
1. `application/orchestrators/ui-setup.orchestrator.ts` (line 28) - **BaseOrchestrator subclass**
2. `presentation/controller/ui.controller.js` (line 31) - Not a BaseService subclass
3. `presentation/primitives/disclosure.class.js` (line 41) - Not a BaseService subclass
4. `presentation/primitives/listbox-dropdown.class.js` (line 32) - Not a BaseService subclass
5. `presentation/features/settings/settings-menu.component.js` (line 25) - Not a BaseService subclass
6. `presentation/features/toolbar/components/shader-preset-list.component.js` (line 24) - Not a BaseService subclass
7. `presentation/features/toolbar/components/cinematic-toggle.component.js` (line 19) - Not a BaseService subclass
8. `presentation/features/toolbar/components/shader-slider-controls.component.js` (line 29) - Not a BaseService subclass
9. `presentation/features/notes/notes-panel.component.js` (line 39) - Not a BaseService subclass
10. `presentation/features/notes/components/notes-list-view.component.js` (line 26) - Not a BaseService subclass
11. `presentation/features/notes/components/notes-panel-layout.component.js` (line 14) - Not a BaseService subclass
12. `presentation/features/notes/components/game-autocomplete.component.js` (line 34) - Not a BaseService subclass
13. `presentation/features/notes/components/game-filter.component.js` (line 27) - Not a BaseService subclass
14. `presentation/features/notes/components/notes-resize-handler.component.js` (line 39) - Not a BaseService subclass
15. `presentation/features/notes/components/notes-search.component.js` (line 26) - Not a BaseService subclass
16. `presentation/features/notes/components/notes-editor-view.component.js` (line 30) - Not a BaseService subclass

**Note:** Only 1 of these 16 is a `BaseService`/`BaseOrchestrator` subclass. The other 15 are plain UI component classes. The `dom-listener.utils.js` utility serves a different audience than the base class hierarchy -- it belongs in the presentation layer toolbox, NOT absorbed into `LifecycleService`. Absorbing it would force UI components to extend `LifecycleService` which is incorrect.

### Pattern 6: `typeof unsubscribe === 'function'` Safety Check (10 occurrences)

Every manual subscription cleanup does this defensive check:
```ts
if (typeof unsubscribe === 'function') {
  unsubscribe();
}
```

Files: `orchestrator.base.js`, `app-state.ts`, `update-section.component.js`, `shader-slider-controls.component.js`, `cinematic-toggle.component.js`, `transcode-ui.bridge.ts`, `shader-preset-list.component.js`, `capture-ui.bridge.ts`, `ui-event.bridge.ts`, `update-ui.service.ts`

This check would be internalized once inside `LifecycleService._cleanupSubscriptions()`.

### Pattern 7: Error Publishing to EventBus (30+ occurrences)

`EventChannels.UI.STATUS_MESSAGE` is published from 15+ different files for error/warning/success feedback. This is NOT a base class concern -- it is application-level event-driven communication working as designed. Each call has different message content and context, so there is no meaningful abstraction to extract.

**Files with status message publishing (renderer only):**
- `app.orchestrator.ts` (3 calls)
- `streaming.orchestrator.ts` (5 calls)
- `capture.orchestrator.ts` (5 calls)
- `capture-ui.bridge.ts` (4 calls)
- `capture-save.service.ts` (2 calls)
- `fullscreen.service.ts` (3 calls)
- `update-ui.service.ts` (4 calls)
- `update-section.component.js` (1 call)

**Verdict:** Not a base class concern. No action needed.

---

## 4. `BaseOrchestrator` vs `BaseService` Duplication Detail

### Lines duplicated between the two constructors:

**BaseService constructor (lines 28-45):**
```js
constructor(dependencies, requiredDeps = [], serviceName = null) {
  const name = serviceName || this.constructor.name;
  validateDependencies(dependencies, requiredDeps, name);
  for (const dep of requiredDeps) {
    this[dep] = dependencies[dep];
  }
  if (dependencies.loggerFactory) {
    this.logger = dependencies.loggerFactory.create(name);
  }
  this._serviceName = name;
}
```

**BaseOrchestrator constructor (lines 23-45):**
```js
constructor(dependencies, requiredDeps, name) {
  const orchestratorName = name || this.constructor.name;
  validateDependencies(dependencies, requiredDeps, orchestratorName);
  for (const dep of requiredDeps) {
    this[dep] = dependencies[dep];
  }
  if (dependencies.loggerFactory) {
    this.logger = dependencies.loggerFactory.create(orchestratorName);
  }
  this.isInitialized = false;
  this._isCleanedUp = false;
  this._orchestratorName = orchestratorName;
  this._subscriptions = [];
}
```

**Identical logic (7 lines):**
- `validateDependencies()` call
- `for (const dep of requiredDeps)` loop
- `if (dependencies.loggerFactory)` logger creation

**Additional in BaseOrchestrator (4 lines):**
- `isInitialized`, `_isCleanedUp`, `_orchestratorName`, `_subscriptions`

If `BaseOrchestrator` extended `BaseService`, the constructor would be:
```js
constructor(dependencies, requiredDeps, name) {
  super(dependencies, requiredDeps, name);
  this.isInitialized = false;
  this._isCleanedUp = false;
  this._subscriptions = [];
}
```
Saving ~7 lines and eliminating the duplication.

---

## 5. Lifecycle Method Naming Inconsistency

### Current naming across the codebase:

| Method | Used by | Files |
|--------|---------|-------|
| `initialize()` | BaseOrchestrator (template), services, bridges | 20+ files |
| `onInitialize()` | BaseOrchestrator (override point) | 12 orchestrators |
| `cleanup()` | BaseOrchestrator (template), some services | 12 orchestrators + 5 services |
| `onCleanup()` | BaseOrchestrator (override point) | 12 orchestrators |
| `dispose()` | Services, bridges (manual) | 18 files |
| `stop()` | Some services | 3 files |

**Problem:** Services use `dispose()` for cleanup, but orchestrators use `cleanup()`. The design doc proposes standardizing on `dispose()` for the public API and `onDispose()` for the override point, matching the more common convention in the ecosystem.

---

## 6. Classes that Would Benefit from LifecycleService

### Tier 1: Direct candidates (hand-rolled `_subscriptions` + `initialize`/`dispose`)

These would see the largest boilerplate reduction:

| Class | File | Subscriptions | Boilerplate saved (est.) |
|-------|------|--------------|--------------------------|
| `UIEventBridge` | `presentation/bridges/ui-event.bridge.ts` | 15 EventBus | ~15 lines |
| `CaptureUIBridge` | `presentation/bridges/capture-ui.bridge.ts` | 6 EventBus | ~12 lines |
| `TranscodeUIBridge` | `presentation/bridges/transcode-ui.bridge.ts` | 5 EventBus | ~12 lines |
| `UpdateUiService` | `services/updates/update-ui.service.ts` | 5 EventBus | ~12 lines |
| `UpdateService` (renderer) | `services/updates/update.service.ts` | 5 IPC via `_cleanupFns` + `_initialized` | ~15 lines |
| `TranscodeService` (renderer) | `services/transcode/transcode.service.ts` | 4 IPC via `_cleanupFns` + `_initialized` | ~15 lines |
| `SettingsFullscreenService` | `services/settings/fullscreen.service.ts` | 3 IPC + 1 DOM | ~15 lines |

**Subtotal: ~96 lines of boilerplate eliminated from 7 files**

### Tier 2: Partial candidates (have initialize/dispose but subscription pattern differs)

| Class | File | Notes |
|-------|------|-------|
| `PerformanceStateService` | `services/performance/performance-state.service.ts` | 3 adapter cleanup callbacks, not EventBus subscriptions |
| `DeviceBridgeService` (main) | `main/devices/device-bridge.service.ts` | 1 EventBus sub via individual `_unsubscribe` |
| `DeviceLifecycleService` (main) | `main/devices/device-lifecycle.service.ts` | 1 EventBus sub + timeout cleanup |
| `AppState` | `application/state/app-state.ts` | 2 EventBus subs, not a service (no BaseService) |

### Tier 3: Not candidates (no lifecycle or unique patterns)

| Class | File | Reason |
|-------|------|--------|
| `StreamingService` | `services/streaming/streaming.service.ts` | State machine with `start()`/`stop()`, not standard lifecycle |
| `CaptureService` | `services/capture/capture.service.ts` | `dispose()` is specialized (MediaRecorder cleanup) |
| `StreamingRenderPipelineService` | `services/streaming/render-pipeline.service.ts` | `cleanup()` delegates to sub-services |
| `StreamingAudioPipelineService` | `services/streaming/audio-pipeline.service.ts` | Single constructor subscription, `stop()`/`cleanup()` pattern |
| `NotesService` | `services/notes/notes.service.ts` | Pure CRUD, no lifecycle |
| `SettingsService` | `services/settings/settings.service.ts` | Pure getter/setter, no lifecycle |
| `DeviceStorageService` | `services/devices/device-storage.service.ts` | Pure storage, no lifecycle |
| All main services | `main/infrastructure/*` | Awilix-managed, different DI pattern |

---

## 7. `_subscriptions` Pattern in Non-BaseService Classes

The following classes are NOT BaseService subclasses but use the same `_subscriptions`/`_eventSubscriptions` pattern:

| Class | File | Subscriptions | Notes |
|-------|------|--------------|-------|
| `AppState` | `application/state/app-state.ts` | 2 EventBus | Custom class, not a service |
| `UpdateSectionComponent` | `presentation/features/updates/update-section.component.js` | 4 EventBus + DOM | Plain UI component |
| `ShaderPresetListComponent` | `presentation/features/toolbar/components/shader-preset-list.component.js` | EventBus | Plain UI component |
| `ShaderSliderControlsComponent` | `presentation/features/toolbar/components/shader-slider-controls.component.js` | EventBus | Plain UI component |
| `CinematicToggleComponent` | `presentation/features/toolbar/components/cinematic-toggle.component.js` | EventBus | Plain UI component |

These would NOT extend `LifecycleService` (wrong abstraction), but the pattern could be extracted as a **mixin** or **standalone utility** similar to `createDomListenerManager`:

```ts
const subs = createSubscriptionManager(eventBus);
subs.add(EventChannels.X.Y, handler);
subs.disposeAll();
```

However, this is a minor optimization (5 files, ~5 lines each = ~25 lines). Not high priority.

---

## 8. Additional Utilities in `src/shared/base/`

### `dom-listener.utils.js` (101 lines)

**Current API:**
- `createDomListenerManager({ logger })` returns `{ add, removeAll, removeByTarget, count }`
- Used by 16 files (15 UI components + 1 orchestrator)

**Should it be integrated into LifecycleService?** No. The DOM listener utility serves the presentation layer (UI components that do NOT extend BaseService). Absorbing it into LifecycleService would either:
- Force UI components to extend LifecycleService (incorrect coupling), or
- Require maintaining both the standalone utility AND the integrated version (duplication)

**Recommendation:** Keep `dom-listener.utils.js` as a standalone utility. It belongs in the presentation/primitives toolbox, not in the base class hierarchy. Its current location in `shared/base/` is slightly misleading -- it could be moved to `presentation/primitives/` or `shared/utils/`, but this is cosmetic.

---

## 9. Constructor Pattern Analysis

### Dependency Declaration Verbosity

Every class currently declares dependencies in three places:

1. **Constructor parameter list** (in DI registration factory function)
2. **`super()` call** (required deps array)
3. **String name** (for error messages)

Example from `StreamingOrchestrator`:
```ts
constructor(dependencies) {
  super(
    dependencies,
    ['streamingService', 'appState', 'streamViewService', 'renderPipelineService',
     'gpuRecordingService', 'settingsService', 'eventBus', 'loggerFactory'],
    'StreamingOrchestrator'
  );
}
```

The design doc's `static dependencies` proposal would reduce this to:
```ts
static readonly dependencies = [
  'streamingService', 'appState', 'streamViewService', 'renderPipelineService',
  'gpuRecordingService', 'settingsService', 'eventBus', 'loggerFactory'
] as const;

constructor(deps) {
  super(deps, StreamingOrchestrator.dependencies, 'StreamingOrchestrator');
}
```

While the constructor does not shrink much, the DI registration goes from ~5 lines to 1 line per class (see design doc Section 2).

---

## 10. Cleanup Method Patterns Across All Orchestrators

### `onCleanup()` implementations:

| Orchestrator | Cleanup behavior |
|-------------|-----------------|
| `AppOrchestrator` | Iterates sub-orchestrators with error-resilient try/catch per orchestrator |
| `StreamingOrchestrator` | Calls `renderPipelineService.cleanup()`, conditionally stops stream |
| `CaptureOrchestrator` | Conditionally stops recording, stops GPU recording |
| `DeviceOrchestrator` | Unsubscribes IPC, flushes sequencer, disposes deviceService |
| `DisplayModeOrchestrator` | Disposes fullscreenService |
| `PreferencesOrchestrator` | None (no `onCleanup` override) |
| `UISetupOrchestrator` | Removes all DOM listeners |
| `StreamingAudioOrchestrator` | None (no `onCleanup` override) |
| `PerformanceStateOrchestrator` | Disposes performanceStateService |
| `PerformanceAnimationOrchestrator` | Empty override (noop comment) |
| `PerformanceMetricsOrchestrator` | Stops periodic snapshots, clears pending |
| `UpdateOrchestrator` | Disposes updateService and updateUiService |

**Pattern: "delegate dispose to owned service"** appears in 4 orchestrators:
- `DisplayModeOrchestrator` -> `fullscreenService.dispose()`
- `PerformanceStateOrchestrator` -> `performanceStateService.dispose()`
- `PerformanceMetricsOrchestrator` -> `performanceMetricsService.stop*()` + `clear*()`
- `UpdateOrchestrator` -> `updateService.dispose()` + `updateUiService.dispose()`

If these services extended `LifecycleService`, the orchestrators could leverage a uniform dispose pattern, but the orchestrators would still need to call `dispose()` on each owned service. The benefit is consistency, not line count reduction.

---

## 11. Summary of Opportunities

### Confirmed by this analysis (aligns with design doc):

| Opportunity | Files affected | Lines saved | Confidence |
|------------|---------------|-------------|-----------|
| BaseOrchestrator extends LifecycleService extends BaseService | 2 base files + all subclasses | ~27 lines dedup + cascading | High |
| Bridges extend LifecycleService (eliminate hand-rolled subscriptions) | 3 bridges | ~39 lines | High |
| UpdateUiService extends LifecycleService | 1 file | ~12 lines | High |
| UpdateService (renderer) extends LifecycleService | 1 file | ~15 lines | High |
| TranscodeService (renderer) extends LifecycleService | 1 file | ~15 lines | High |
| FullscreenService extends LifecycleService | 1 file | ~15 lines | High |
| `_initialized` guard absorbed into LifecycleService | 4 files | ~32 lines | High |
| Static `dependencies` + autoRegister DI | All 54 classes | ~500 lines in registration files | High |

### NOT recommended (analysis contradicts or defers):

| Idea | Reason to skip |
|------|---------------|
| Absorb `dom-listener.utils.js` into LifecycleService | 15/16 consumers are NOT BaseService subclasses |
| Create subscription utility for UI components | Only ~25 lines savings across 5 files; low ROI |
| Abstract error-publishing pattern | Each call has unique message/context; no meaningful abstraction |
| Merge `_cleanupFns` pattern with `_subscriptions` pattern | Already planned in LifecycleService design (both become `subscribeWithCleanup`) |
| Move `dom-listener.utils.js` out of `shared/base/` | Cosmetic; low priority |
| Make AppState extend LifecycleService | AppState is not a service -- it is a state container with different semantics |

### Grand total estimated savings from base class hierarchy changes:

- **Base class dedup + LifecycleService creation:** ~50 lines net (add LifecycleService, remove duplication)
- **Migration of 7 Tier-1 classes to LifecycleService:** ~96 lines
- **`_initialized` guard elimination:** ~32 lines
- **Total from base class hierarchy alone:** ~178 lines

Combined with DI auto-wiring (~500 lines) and domain consolidations (~248 lines from design doc), the full consolidation effort targets ~926 lines.

---

## 12. Main Process vs Renderer Process Considerations

The main process uses Awilix for DI (not the custom `ServiceContainer`). Main process services (`DeviceBridgeService`, `DeviceLifecycleService`, `UpdateBridge`) also extend `BaseService` and have lifecycle patterns.

**Key difference:** Main process services are managed by Awilix `dispose()` hooks. The `LifecycleService` base class should work for both processes since it only adds template methods and subscription tracking -- it does not depend on the renderer's `ServiceContainer`.

**Main process candidates for LifecycleService:**
- `DeviceBridgeService` (1 EventBus sub + dispose)
- `DeviceLifecycleService` (1 EventBus sub + timeout + dispose)

These are lower priority since main process has fewer services and the boilerplate savings are smaller (~16 lines total).
