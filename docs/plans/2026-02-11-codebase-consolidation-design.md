# Codebase Consolidation Design

**Date:** 2026-02-11
**Branch:** TBD (from `codex/gpu-package-consolidation-v2`)
**Goal:** Maximum code reduction through proper OOP abstractions while retaining 100% functionality and maximizing long-term extensibility.

---

## 1. Base Class Hierarchy Redesign

### Problem

`BaseOrchestrator` duplicates `BaseService` instead of extending it. Services that need lifecycle management (bridges, UpdateService, etc.) hand-roll their own `initialize()`/`dispose()` patterns. Subscription cleanup logic is duplicated across 10+ files.

### Design

```
ILifecycle                          (interface)
  initialize(): Promise<void>
  dispose(): Promise<void>

IEventSubscriber                    (interface)
  subscribeWithCleanup(eventMap): void

BaseService                         (class)
  Dependency validation + assignment
  Logger creation from loggerFactory
  Static `dependencies` declaration for DI auto-wiring

  LifecycleService                  (class, extends BaseService, implements ILifecycle + IEventSubscriber)
    initialize() / dispose() template methods
    onInitialize() / onDispose() override points
    isInitialized / isDisposed tracking
    subscribeWithCleanup() with auto-cleanup on dispose
    _subscriptions tracking (moved from hand-rolled patterns)

    BaseOrchestrator                (class, extends LifecycleService)
      Ordered sub-orchestrator initialization
      Error-resilient cleanup (continue on failure)
      Semantic distinction: orchestrators coordinate, services own logic
```

### Migration

| Current class | New base class | Reason |
|---------------|---------------|--------|
| Pure services (DeviceStorageService, NotesService) | BaseService | No lifecycle needed |
| Services with init/dispose (UpdateService, FullscreenService) | LifecycleService | Need lifecycle management |
| All bridges (UIEventBridge, CaptureUIBridge, etc.) | LifecycleService | Need subscription cleanup |
| All orchestrators | BaseOrchestrator (unchanged) | Coordinate services |

### Static Dependencies Declaration

All classes gain a static `dependencies` property:

```ts
class StreamingOrchestrator extends BaseOrchestrator {
  static readonly dependencies = [
    'streamingService', 'appState', 'streamViewService',
    'renderPipelineService', 'gpuRecordingService', 'settingsService',
    'eventBus', 'loggerFactory'
  ] as const;

  constructor(deps) {
    super(deps, StreamingOrchestrator.dependencies, 'StreamingOrchestrator');
  }
}
```

### Files Changed

| File | Action |
|------|--------|
| `src/shared/base/service.base.js` | Add static `dependencies` support |
| NEW: `src/shared/base/lifecycle-service.base.ts` | New class |
| NEW: `src/shared/interfaces/lifecycle.interface.ts` | ILifecycle interface |
| NEW: `src/shared/interfaces/event-subscriber.interface.ts` | IEventSubscriber interface |
| `src/shared/base/orchestrator.base.js` | Extend LifecycleService, remove duplicated code |

---

## 2. DI Auto-Wiring

### Problem

6 registration files totaling ~700+ lines of mechanical wiring where every dependency name appears 3 times (function params, constructor object, dependency array).

### Design

New `autoRegister()` method on `ServiceContainer`:

```ts
autoRegister<K extends keyof TMap>(
  name: K,
  Class: { dependencies: readonly string[]; new(deps: any): any }
): void {
  this.registerSingleton(name, (...resolvedDeps) => {
    const depsObj = Object.fromEntries(
      Class.dependencies.map((dep, i) => [dep, resolvedDeps[i]])
    );
    return new Class(depsObj);
  }, [...Class.dependencies]);
}
```

### Registration Before/After

**Before** (per registration):
```ts
container.registerSingleton(
  'streamingOrchestrator',
  function (streamingService, appState, streamViewService, renderPipelineService, gpuRecordingService, settingsService, eventBus, loggerFactory) {
    return new StreamingOrchestrator({
      streamingService, appState, streamViewService, renderPipelineService, gpuRecordingService, settingsService, eventBus, loggerFactory
    });
  },
  ['streamingService', 'appState', 'streamViewService', 'renderPipelineService', 'gpuRecordingService', 'settingsService', 'eventBus', 'loggerFactory']
);
```

**After:**
```ts
container.autoRegister('streamingOrchestrator', StreamingOrchestrator);
```

### Fallback

`registerSingleton()` remains available for edge cases requiring custom factory logic (e.g., `StreamingRendererFactory` with its renderer class map, or registrations needing config objects).

### Estimated Reduction

~500 lines across 6 registration files.

---

## 3. Domain Consolidations

### 3a. Update Domain

**Before:** UpdateOrchestrator + UpdateService + UpdateUiService (3 files, ~382 lines)
**After:** UpdateService + UpdateUIBridge (2 files, ~320 lines)

| Action | Detail |
|--------|--------|
| DELETE | `src/renderer/application/orchestrators/update.orchestrator.ts` (62 lines) |
| MODIFY | `UpdateService` extends `LifecycleService` instead of `BaseService` |
| MOVE + RENAME | `UpdateUiService` → `presentation/bridges/update-ui.bridge.ts` as `UpdateUIBridge` |
| MODIFY | `AppOrchestrator` initializes `UpdateService` + `UpdateUIBridge` directly |
| MODIFY | `register-orchestrators.ts` removes UpdateOrchestrator registration |
| MODIFY | `register-ui.ts` or `register-streaming.ts` adds UpdateUIBridge registration |

**Rationale:** UpdateOrchestrator is pure pass-through (every method delegates to UpdateService with no added logic). UpdateUiService is architecturally a bridge (translates domain events → UI actions).

### 3b. Settings Domain

**Before:** CinematicModeService + FullscreenService + PresentationModeService + SettingsService + DisplayModeOrchestrator (5 files)
**After:** FullscreenService + PresentationModeService + SettingsService + DisplayModeOrchestrator (4 files)

| Action | Detail |
|--------|--------|
| DELETE | `src/renderer/infrastructure/services/settings/cinematic-mode.service.ts` (24 lines) |
| MODIFY | `SettingsDisplayModeOrchestrator` absorbs `toggleCinematicMode()` logic |
| MODIFY | DI registration removes cinematicModeService, orchestrator deps updated |

**Rationale:** CinematicModeService is 24 lines with 1 method that flips a boolean and publishes an event. That's coordination logic belonging in the orchestrator.

### 3c. Performance Domain

**Before:** 3 orchestrators + 3 services (6 files, ~502 lines)
**After:** 1 orchestrator + 3 services (4 files, ~420 lines)

| Action | Detail |
|--------|--------|
| DELETE | `performance-state.orchestrator.ts` (76 lines) |
| DELETE | `performance-animation.orchestrator.ts` (56 lines) |
| DELETE | `performance-metrics.orchestrator.ts` (42 lines) |
| NEW | `performance.orchestrator.ts` - merged orchestrator |
| KEEP | `PerformanceStateService`, `PerformanceAnimationService`, `PerformanceMetricsService` |

**Merged orchestrator** combines all event subscriptions from the 3 former orchestrators and delegates to the appropriate service. Services stay separate (distinct concerns: state tracking, CSS computation, metrics logging).

### 3d. Device Domain

**Before:** DeviceService (facade) + DeviceConnectionService + DeviceMediaService + DeviceStorageService + DeviceOperationSequencer + DeviceOrchestrator (6 files, ~523 lines)
**After:** DeviceMediaService + DeviceStorageService + DeviceOperationSequencer + DeviceOrchestrator (4 files, ~443 lines)

| Action | Detail |
|--------|--------|
| DELETE | `src/renderer/infrastructure/services/devices/device.service.ts` (77 lines, pure facade) |
| DELETE | `src/renderer/infrastructure/services/devices/device-connection.service.ts` (43 lines) |
| MODIFY | `DeviceOrchestrator` absorbs connection status tracking from DeviceConnectionService |
| MODIFY | `DeviceOrchestrator` depends directly on sub-services (no facade) |
| MODIFY | DI registration updated |

**Rationale:** DeviceService facade adds zero logic (every method is 1-line delegation). DeviceConnectionService is 43 lines of state tracking that belongs in the orchestrator.

---

## 4. Bridge Cleanup

All bridges extend `LifecycleService` (new base class), gaining `subscribeWithCleanup()` and automatic disposal for free.

### Before (every bridge):
```ts
constructor(deps) {
  super(deps, [...], 'BridgeName');
  this._subscriptions = [];          // hand-rolled
}

initialize() {
  this._subscriptions.push(           // hand-rolled
    this.eventBus.subscribe(...)
  );
}

dispose() {
  this._subscriptions.forEach(fn => { // hand-rolled
    if (typeof fn === 'function') fn();
  });
  this._subscriptions = [];
}
```

### After:
```ts
constructor(deps) {
  super(deps, BridgeName.dependencies, 'BridgeName');
}

async onInitialize() {
  this.subscribeWithCleanup({         // from LifecycleService
    [EventChannels.X.Y]: (data) => this._handleY(data),
  });
}

// No dispose() override needed - LifecycleService handles subscription cleanup
```

### Bridges List (post-consolidation)

| Bridge | Location | Status |
|--------|----------|--------|
| `UIEventBridge` | `presentation/bridges/` | KEEP (extends LifecycleService) |
| `CaptureUIBridge` | `presentation/bridges/` | KEEP (extends LifecycleService) |
| `TranscodeUIBridge` | `presentation/bridges/` | KEEP (extends LifecycleService) |
| `UpdateUIBridge` | `presentation/bridges/` | NEW (moved from services/updates/) |

---

## 5. Estimated Impact

| Category | Files Removed | Lines Saved (est.) |
|----------|--------------|-------------------|
| Base class dedup | 0 (1 added) | ~50 |
| DI auto-wiring | 0 | ~500 |
| Update domain | 1 | ~62 |
| Settings domain | 1 | ~24 |
| Performance domain | 2 | ~82 |
| Device domain | 2 | ~80 |
| Bridge boilerplate (cascade) | 0 | ~150-200 |
| **Total** | **~6-7 files** | **~950-1000 lines** |

Plus: every future service/orchestrator/bridge written against the new base classes will be 10-20 lines shorter due to eliminated boilerplate.

---

## 6. Migration Strategy

### Phase 1: Foundation (blocking - must complete first)
1. Create `ILifecycle`, `IEventSubscriber` interfaces
2. Create `LifecycleService` class
3. Refactor `BaseOrchestrator` to extend `LifecycleService`
4. Add `autoRegister()` to `ServiceContainer`
5. Add static `dependencies` to `BaseService`
6. Validate: all existing tests pass (no behavioral changes)

### Phase 2: Domain Consolidations (can parallelize)
- 2a. Update domain (delete orchestrator, move UI service to bridge)
- 2b. Settings domain (absorb cinematic mode)
- 2c. Performance domain (merge 3 orchestrators)
- 2d. Device domain (remove facade, absorb connection)

### Phase 3: Auto-Wiring Migration (can parallelize)
- Convert all 6 registration files to use `autoRegister()` where applicable
- Add static `dependencies` to all service/orchestrator classes
- Each registration file is independent

### Phase 4: Bridge Migration
- Convert all bridges to extend `LifecycleService`
- Remove hand-rolled subscription/dispose boilerplate

### Validation Checkpoints
- After Phase 1: `npm run test:run` (all 2789 tests pass)
- After each Phase 2 sub-task: `npm run test:run`
- After Phase 3: `npm run test:run` + `npm run lint`
- After Phase 4: `npm run test:run` (final)

---

## 7. Follow-Up Opportunities (Not In Scope)

These were identified during analysis but deferred to keep scope focused:

- **SettingsService getter/setter pattern**: 6 settings repeat identical get/set/publish boilerplate. Could use metadata-driven generation.
- **Auto-hide effects duplication**: 3 DOM effect classes (ControlsAutoHide, CursorAutoHide, ToolbarAutoHide) share RAF throttling and timer patterns. Could extract base class.
- **IPC handler boilerplate**: 7 handlers repeat identical try-catch-log-return pattern. Could use wrapper utility.
- **State machine duplication**: UpdateService, CaptureService, StreamingService all implement similar state tracking. Could extract abstract StateMachine.
- **Browser adapter consolidation**: 4 tiny adapters (Visibility, UserActivity, ReducedMotion, Metrics) could consolidate into single PlatformAdapter.
