# Codebase Consolidation: Final Summary

**Date:** 2026-02-11
**Branch:** From `codex/gpu-package-consolidation-v2`
**Sources:** Design document + 4 deep-dive analyses (base classes, DI, domain consolidations, presentation layer)

---

## 1. Executive Summary

### Total Impact

| Metric | Value |
|--------|-------|
| Net lines eliminated | ~820-870 |
| Files deleted | 12 (7 source + 5 dead code/re-exports) |
| Files created | 3 (LifecycleService, interfaces, merged orchestrator) |
| Test files deleted | 5-6 |
| Test files created | 1 |
| Test lines removable (container test) | ~400-500 |
| Registrations auto-wired | 54 of 65 (83%) |

### Key Architectural Wins

1. **Unified lifecycle hierarchy**: `BaseService` -> `LifecycleService` -> `BaseOrchestrator` eliminates 27 lines of constructor duplication and gives all lifecycle-aware classes `subscribeWithCleanup()` and `isInitialized`/`isDisposed` tracking for free.
2. **DI auto-wiring**: `autoRegister()` reduces 54 mechanical registration blocks from ~5-16 lines each to 1 line each, netting ~403 lines.
3. **Domain consolidations**: 4 domains lose unnecessary orchestrators/facades/services, eliminating ~280 net lines and 6 files.
4. **Bridge standardization**: All 4 bridges extend `LifecycleService`, removing ~39 lines of hand-rolled subscription boilerplate.
5. **Dead code removal**: 5 files with zero consumers deleted.

### Breakdown by Category

| Category | Files Removed | Lines Saved (net) |
|----------|--------------|-------------------|
| Base class dedup + LifecycleService | 0 (3 added) | ~50 |
| DI auto-wiring | 0 | ~403 |
| Update domain | 1 | ~62 |
| Settings domain | 1 | ~24 |
| Performance domain | 2 (3 deleted, 1 created) | ~74 |
| Device domain | 2 | ~120 |
| Bridge boilerplate (LifecycleService cascade) | 0 | ~39 |
| Tier-1 service LifecycleService migration | 0 | ~96 |
| `_initialized` guard elimination | 0 | ~32 |
| Dead code / re-export cleanup | 5 | ~9 |
| **Total** | **~12** | **~820-870** (conservative) |

---

## 2. Base Class Hierarchy

### 2a. Current Problem

`BaseOrchestrator` does NOT extend `BaseService`. Both independently:
- Import and call `validateDependencies()`
- Loop through `requiredDeps` to assign dependencies to `this`
- Check for `loggerFactory` and create `this.logger`

This is **27 lines of duplicated constructor logic**. Additionally, 10+ files hand-roll `_subscriptions` arrays, `_initialized` guards, and dispose patterns that should be inherited.

### 2b. Final Class Hierarchy

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
    _subscriptions tracking (internalized from hand-rolled patterns)

    BaseOrchestrator                (class, extends LifecycleService)
      Ordered sub-orchestrator initialization
      Error-resilient cleanup (continue on failure)
      Semantic distinction: orchestrators coordinate, services own logic
```

### 2c. New Files

| File | Action | Lines |
|------|--------|-------|
| `src/shared/interfaces/lifecycle.interface.ts` | CREATE | ~10 |
| `src/shared/interfaces/event-subscriber.interface.ts` | CREATE | ~8 |
| `src/shared/base/lifecycle-service.base.ts` | CREATE | ~60 |
| `src/shared/base/orchestrator.base.js` | MODIFY (extend LifecycleService, remove duplicated constructor logic) | -27 |
| `src/shared/base/service.base.js` | MODIFY (add static `dependencies` support) | +5 |

### 2d. LifecycleService Migration Candidates

#### Tier 1: Direct Candidates (hand-rolled `_subscriptions` + `initialize`/`dispose`)

| Class | File | Subscriptions | Boilerplate Saved |
|-------|------|--------------|-------------------|
| `UIEventBridge` | `src/renderer/presentation/bridges/ui-event.bridge.ts` | 15 EventBus | ~15 lines |
| `CaptureUIBridge` | `src/renderer/presentation/bridges/capture-ui.bridge.ts` | 6 EventBus | ~12 lines |
| `TranscodeUIBridge` | `src/renderer/presentation/bridges/transcode-ui.bridge.ts` | 5 EventBus | ~12 lines |
| `UpdateUiService` (becomes `UpdateUIBridge`) | `src/renderer/infrastructure/services/updates/update-ui.service.ts` | 5 EventBus | ~12 lines |
| `UpdateService` (renderer) | `src/renderer/infrastructure/services/updates/update.service.ts` | 5 IPC via `_cleanupFns` + `_initialized` | ~15 lines |
| `TranscodeService` (renderer) | `src/renderer/infrastructure/services/transcode/transcode.service.ts` | 4 IPC via `_cleanupFns` + `_initialized` | ~15 lines |
| `SettingsFullscreenService` | `src/renderer/infrastructure/services/settings/fullscreen.service.ts` | 3 IPC + 1 DOM | ~15 lines |
| **Subtotal** | | | **~96 lines** |

#### Tier 2: Partial Candidates (lower priority)

| Class | File | Notes |
|-------|------|-------|
| `PerformanceStateService` | `src/renderer/infrastructure/services/performance/performance-state.service.ts` | 3 adapter cleanup callbacks, not EventBus subscriptions |
| `DeviceBridgeService` (main) | `src/main/infrastructure/devices/device-bridge.service.ts` | 1 EventBus sub via individual `_unsubscribe` |
| `DeviceLifecycleService` (main) | `src/main/infrastructure/devices/device-lifecycle.service.ts` | 1 EventBus sub + timeout cleanup |
| `AppState` | `src/renderer/application/state/app-state.ts` | 2 EventBus subs; not a service (different semantics) |

#### NOT Candidates

| Class | Reason |
|-------|--------|
| `StreamingService` | State machine with `start()`/`stop()`, not standard lifecycle |
| `CaptureService` | Specialized `dispose()` (MediaRecorder cleanup) |
| `NotesService` | Pure CRUD, no lifecycle |
| `SettingsService` | Pure getter/setter, no lifecycle |
| All main process services | Awilix-managed, different DI pattern (lower priority) |

### 2e. Patterns Eliminated by LifecycleService

| Pattern | Occurrences | Lines per occurrence | Total eliminated |
|---------|------------|---------------------|-----------------|
| Hand-rolled `_subscriptions[]` array + push + forEach dispose | 6 files | ~8-12 | ~60-70 |
| Hand-rolled `_cleanupFns[]` array (same as above, different name) | 2 files | ~8-12 | ~16-24 |
| Individual `_unsubscribe*` variables | 4 files | ~8-18 | ~42 |
| `_initialized` guard (constructor + check + set + clear) | 4 files | ~8 | ~32 |
| `typeof unsubscribe === 'function'` safety check | 10 files | ~3 | ~30 (internalized once) |

### 2f. Patterns NOT Absorbed

| Pattern | Reason |
|---------|--------|
| `createDomListenerManager` | 15/16 consumers are NOT `BaseService` subclasses; belongs in presentation toolbox |
| Error publishing to EventBus | Each call has unique message/context; no meaningful abstraction |
| Subscription utility for UI components | Only ~25 lines savings across 5 files; low ROI |
| `AppState` lifecycle | AppState is a state container, not a service |

---

## 3. DI Auto-Wiring

### 3a. `autoRegister()` Design

New method on `ServiceContainer`:

```ts
autoRegister<K extends keyof TServices & string>(
  name: K,
  Class: { readonly dependencies: readonly string[]; new (deps: Record<string, unknown>): TServices[K] }
): ServiceContainer<TServices> {
  const deps = [...Class.dependencies];
  this.registerSingleton(
    name,
    function (...resolvedDeps: unknown[]) {
      const depsObj: Record<string, unknown> = {};
      for (let i = 0; i < deps.length; i++) {
        depsObj[deps[i]] = resolvedDeps[i];
      }
      return new Class(depsObj);
    } as unknown as ServiceFactory<TServices[K]>,
    deps
  );
  return this;
}
```

All classes gain a static `dependencies` property:

```ts
class StreamingOrchestrator extends BaseOrchestrator {
  static readonly dependencies = [
    'streamingService', 'appState', 'streamViewService', 'renderPipelineService',
    'gpuRecordingService', 'settingsService', 'eventBus', 'loggerFactory'
  ] as const;

  constructor(deps) {
    super(deps, StreamingOrchestrator.dependencies, 'StreamingOrchestrator');
  }
}
```

### 3b. Eligibility per Registration File

| File | Total Registrations | autoRegister Eligible | Custom Factory Required | Current Lines | Est. Post-Conversion Lines | Lines Saved |
|------|--------------------|-----------------------|------------------------|--------------|---------------------------|-------------|
| `register-orchestrators.ts` | 17 | 17 | 0 | 288 | ~48 | **~240** |
| `register-infrastructure.ts` | 23 | 15 | 8 | 214 | ~105 | **~109** |
| `register-ui.ts` | 14 | 12 | 2 | 220 | ~123 | **~97** |
| `register-devices.ts` | 6 | 5 | 1 | 68 | ~23 | **~45** |
| `register-capture.ts` | 4 | 4 | 0 | 40 | ~12 | **~28** |
| `register-streaming.ts` | 1 | 1 | 0 | 13 | ~6 | **~7** |
| **Total** | **65** | **54** | **11** | **843** | **~317** | **~526** |

### 3c. The 11 Custom Factory Registrations

These cannot use `autoRegister()` and retain `registerSingleton()`:

| # | Name | File | Reason |
|---|------|------|--------|
| 1 | `storageService` | register-infrastructure | Passes `{ protectedKeys: PROTECTED_STORAGE_KEYS }` config, not a container dependency |
| 2 | `deviceIpcAdapter` | register-infrastructure | Pre-creates `logger` from `loggerFactory.create()`, passes `{ logger }` |
| 3 | `deviceChangeDebounceAdapter` | register-infrastructure | Pre-creates `logger`, renames dependency |
| 4 | `canvasRenderer` | register-infrastructure | Positional constructor args, pre-creates logger |
| 5 | `streamingRendererFactory` | register-infrastructure | Positional args, constructs `Map` of renderer classes, calls `initialize()` |
| 6 | `ipcClient` | register-infrastructure | Runtime guard for `window.deviceAPI`, returns external global |
| 7 | `deviceStatusProvider` | register-infrastructure | Positional constructor arg, extends abstract class |
| 8 | `adapterFactory` | register-devices | Positional args, constructs `Map`, calls `initialize()` |
| 9 | `uiComponentRegistry` | register-ui | Complex factory with 7 inline component definitions, closures |
| 10 | `uiEffects` | register-ui | Passes hardcoded `elements: null` value |
| 11 | (total: 8 infra + 1 devices + 2 ui) | | |

### 3d. Net Line Reduction

| Source | Lines |
|--------|-------|
| Lines eliminated from registration files | ~526 |
| Lines added for `autoRegister()` implementation | ~15 |
| Lines added across 54 classes for `static dependencies` | ~108 (2 lines per class) |
| **Net reduction** | **~403** |

The design doc estimate of "~500 lines" was slightly optimistic; the precise net is **~403 lines** when accounting for static dependency declarations added to each class.

### 3e. Container Test Impact

**File:** `tests/unit/app/renderer/container.test.js` (971 lines)

| Test Category | Current | After Migration |
|---------------|---------|-----------------|
| Per-registration verification tests | ~20 tests | Remove for autoRegistered services |
| Key set completeness test | 1 test | Keep (merge `registerSingleton` + `autoRegister` mock calls) |
| Factory invocation tests | ~20 tests | Remove for autoRegistered; keep 11 for custom factories |
| New integration test | 0 | Add 1 (real container, resolve appOrchestrator) |
| **Net test impact** | 971 lines | ~450-550 lines (**~400-500 lines removable**) |

### 3f. Misplaced Registrations (to fix during migration)

**Services in `register-orchestrators.ts` that belong elsewhere:**

| Name | Class | Should Be In |
|------|-------|-------------|
| `fullscreenService` | `SettingsFullscreenService` | `register-ui.ts` |
| `cinematicModeService` | `SettingsCinematicModeService` | `register-ui.ts` (removed by Settings consolidation) |
| `performanceMetricsService` | `PerformanceMetricsService` | `register-infrastructure.ts` |
| `performanceStateService` | `PerformanceStateService` | `register-infrastructure.ts` |
| `animationPerformanceService` | `PerformanceAnimationService` | `register-infrastructure.ts` |

**Services in `register-ui.ts` that arguably belong elsewhere:**

| Name | Class | Better Home |
|------|-------|-------------|
| `streamingAudioPipelineService` | `StreamingAudioPipelineService` | `register-infrastructure.ts` (audio pipeline is infrastructure) |
| `appState` | `AppState` | `register-infrastructure.ts` or its own file |

### 3g. Type Updates Required

| File | Change |
|------|--------|
| `src/renderer/application/di/registrable-container.type.ts` | Add `autoRegister` method signature |
| `src/renderer/application/di/renderer-container-map.type.ts` | Remove deleted entries, add new entries |

### 3h. Additional Notes

- The main process uses **Awilix** (already has built-in auto-wiring via `InjectionMode.PROXY`). The auto-wiring effort is **renderer-only**.
- No circular dependencies exist in the current dependency graph. `autoRegister` does not change the dependency graph.
- Registration order does not matter for correctness (lazy resolution), only readability.

---

## 4. Domain Consolidations

### 4a. Update Domain

**Before:** 3 files, ~393 lines (UpdateOrchestrator + UpdateService + UpdateUiService)
**After:** 2 files, ~319 lines (UpdateService + UpdateUIBridge)

#### Pass-Through Confirmation

Every method on `UpdateOrchestrator` is a direct delegation to `UpdateService`:

```
getStatus()        -> this.updateService.getStatus()
get state()        -> this.updateService.state
get updateInfo()   -> this.updateService.updateInfo
checkForUpdates()  -> this.updateService.checkForUpdates()   (adds only redundant logger.info)
downloadUpdate()   -> this.updateService.downloadUpdate()    (adds only redundant logger.info)
installUpdate()    -> this.updateService.installUpdate()     (adds only redundant logger.info)
```

#### Consumer Map

| Consumer | File | Usage |
|----------|------|-------|
| `AppOrchestrator` | `src/renderer/application/orchestrators/app.orchestrator.ts` | `initialize()` (line 76), `cleanup()` (line 154) |
| `UISetupOrchestrator` | `src/renderer/application/orchestrators/ui-setup.orchestrator.ts` | Passes to `initSettingsMenu()` (line 67) |
| `UpdateSectionComponent` | `src/renderer/presentation/features/updates/update-section.component.js` | Calls `getStatus()`, `checkForUpdates()`, `downloadUpdate()`, `installUpdate()` (lines 100, 280, 286, 289, 292, 302) |
| `register-orchestrators.ts` | DI registration | Registration + dependency |
| `register-ui.ts` | DI registration | Passes to UpdateSectionComponent creation |
| `renderer-container-map.type.ts` | Type map | Type entry (line 70) |

#### Strategy

1. DELETE `update.orchestrator.ts`
2. MODIFY `UpdateService` to extend `LifecycleService` (gains lifecycle template methods, loses hand-rolled `_initialized` and `_cleanupFns`)
3. MOVE+RENAME `update-ui.service.ts` to `presentation/bridges/update-ui.bridge.ts` as `UpdateUIBridge` (extends `LifecycleService`)
4. UPDATE consumers: `UpdateSectionComponent`, `UISetupOrchestrator`, `AppOrchestrator` reference `updateService` directly

#### Files Changed

| File | Action |
|------|--------|
| `src/renderer/application/orchestrators/update.orchestrator.ts` | DELETE |
| `src/renderer/infrastructure/services/updates/update-ui.service.ts` | MOVE+RENAME to `presentation/bridges/update-ui.bridge.ts` |
| `src/renderer/infrastructure/services/updates/update.service.ts` | MODIFY (extend LifecycleService) |
| `src/renderer/application/orchestrators/app.orchestrator.ts` | MODIFY (replace updateOrchestrator with updateService + updateUiBridge) |
| `src/renderer/application/orchestrators/ui-setup.orchestrator.ts` | MODIFY (rename updateOrchestrator -> updateService) |
| `src/renderer/presentation/features/updates/update-section.component.js` | MODIFY (rename updateOrchestrator -> updateService) |
| `src/renderer/application/di/register-orchestrators.ts` | MODIFY (remove registration, update deps) |
| `src/renderer/application/di/register-ui.ts` | MODIFY (register UpdateUIBridge, update deps) |
| `src/renderer/application/di/renderer-container-map.type.ts` | MODIFY (remove updateOrchestrator, add updateUiBridge) |
| `src/renderer/renderer-app.orchestrator.ts` | MODIFY (initialize UpdateService directly) |

#### Test Impact

| Test | Action |
|------|--------|
| `tests/unit/features/updates/services/update.orchestrator.test.js` | DELETE |
| `tests/unit/features/updates/services/update.service.test.js` | MODIFY (test lifecycle methods) |
| `tests/unit/features/updates/ui/update-section.component.test.js` | MODIFY (rename mock) |

#### Risk: LOW

- API is identical on `UpdateService` (no consumer changes beyond renaming)
- 3 redundant logger.info calls harmlessly dropped
- Same initialization pattern already used by `TranscodeService`

---

### 4b. Settings Domain

**Before:** 5 files (CinematicModeService + FullscreenService + PresentationModeService + SettingsService + DisplayModeOrchestrator)
**After:** 4 files (FullscreenService + PresentationModeService + SettingsService + DisplayModeOrchestrator)

#### CinematicModeService Logic (Complete)

```typescript
toggleCinematicMode() {
  const newMode = !this.appState.isCinematicModeEnabled;
  this.appState.setCinematicMode(newMode);
  this.eventBus.publish(EventChannels.SETTINGS.CINEMATIC_MODE_CHANGED, { enabled: newMode });
}
```

3 lines of logic. The orchestrator already has `appState` and `eventBus` as dependencies.

#### Consumer Map

**Only consumer:** `SettingsDisplayModeOrchestrator` (calls `this.cinematicModeService.toggleCinematicMode()` at line 72).

No other file in the codebase imports or references `cinematicModeService` or `SettingsCinematicModeService`.

#### Strategy

1. DELETE `cinematic-mode.service.ts`
2. MODIFY `DisplayModeOrchestrator`: add `appState` dependency, inline 3 lines of toggle logic
3. Update DI registrations

#### Files Changed

| File | Action |
|------|--------|
| `src/renderer/infrastructure/services/settings/cinematic-mode.service.ts` | DELETE |
| `src/renderer/application/orchestrators/display-mode.orchestrator.ts` | MODIFY (inline logic, add appState dep) |
| `src/renderer/application/di/register-orchestrators.ts` | MODIFY (remove registration, update deps) |
| `src/renderer/application/di/renderer-container-map.type.ts` | MODIFY (remove entry) |
| `src/renderer/infrastructure/services/settings/index.ts` | MODIFY (remove export) |

#### Test Impact

| Test | Action |
|------|--------|
| `tests/unit/features/settings/services/cinematic-mode.service.test.js` | DELETE |
| DisplayModeOrchestrator test | MODIFY (update mock deps, test inlined logic) |

#### Risk: LOW

- Single consumer, trivial logic, event channel unchanged

---

### 4c. Performance Domain

**Before:** 6 files, ~502 lines (3 orchestrators + 3 services)
**After:** 4 files, ~428 lines (1 merged orchestrator + 3 services)

#### Initialization Order Requirement (CRITICAL)

The merged orchestrator MUST preserve this initialization order from `AppOrchestrator.onInitialize()`:

```
1. performanceStateService.initialize()   // FIRST - emits initial state
2. Subscribe to animation events          // SECOND - consumes PERFORMANCE.STATE_CHANGED
3. Start periodic metrics snapshots       // THIRD - independent
```

If animation subscribes before state is initialized, it will miss the initial state emission.

#### Duplicate Event Subscriptions

Both `PerformanceStateOrchestrator` and `PerformanceAnimationOrchestrator` subscribe to `STREAM.STARTED` and `STREAM.STOPPED`. The merged orchestrator combines these into single handlers that call both services.

#### Consumer Map

Only `AppOrchestrator` references the 3 performance orchestrators. No other file.

#### Merged Orchestrator Event Map

```typescript
async onInitialize() {
  // Phase 1: State service (MUST be first - emits initial state)
  this.performanceStateService.initialize({
    onStateChange: (state) => this._handleStateChanged(state)
  });

  // Phase 2: Subscribe to all events
  this.subscribeWithCleanup({
    [EventChannels.SETTINGS.PERFORMANCE_MODE_CHANGED]: (enabled) =>
      this._handlePerformanceModeChanged(enabled),
    [EventChannels.RENDER.CAPABILITY_DETECTED]: (caps) =>
      this.performanceStateService.setCapabilities(caps),
    [EventChannels.STREAM.STARTED]: () => this._handleStreamStarted(),
    [EventChannels.STREAM.STOPPED]: () => this._handleStreamStopped(),
    [EventChannels.PERFORMANCE.STATE_CHANGED]: (state) =>
      this._handlePerformanceStateForAnimation(state),
    [EventChannels.PERFORMANCE.MEMORY_SNAPSHOT_REQUESTED]: (payload) =>
      this.performanceMetricsService.requestSnapshot(payload)
  });

  // Phase 3: Start periodic snapshots in DEV
  if (import.meta.env.DEV) {
    this.performanceMetricsService.startPeriodicSnapshots();
  }
}
```

#### Files Changed

| File | Action |
|------|--------|
| `src/renderer/application/orchestrators/performance-state.orchestrator.ts` | DELETE (76 lines) |
| `src/renderer/application/orchestrators/performance-animation.orchestrator.ts` | DELETE (56 lines) |
| `src/renderer/application/orchestrators/performance-metrics.orchestrator.ts` | DELETE (42 lines) |
| `src/renderer/application/orchestrators/performance.orchestrator.ts` | CREATE (~100 lines) |
| `src/renderer/application/orchestrators/app.orchestrator.ts` | MODIFY (replace 3 deps with 1) |
| `src/renderer/application/di/register-orchestrators.ts` | MODIFY (remove 3 registrations, add 1) |
| `src/renderer/application/di/renderer-container-map.type.ts` | MODIFY (remove 3 entries, add 1) |

#### Test Impact

| Test | Action |
|------|--------|
| `tests/unit/app/renderer/application/performance/performance-metrics.orchestrator.test.js` | DELETE or MERGE |
| `tests/unit/app/renderer/application/performance/performance-state.orchestrator.test.js` | DELETE or MERGE |
| `tests/unit/ui/animation-performance.orchestrator.test.js` | DELETE or MERGE |
| `tests/unit/app/renderer/application/performance/performance.orchestrator.test.js` | CREATE |

#### Risk: MEDIUM

- Initialization order regression (mitigated by explicit phase comments + test)
- `PERFORMANCE.STATE_CHANGED` is both published and consumed (safe: one-direction flow state -> animation)
- `_lastUiMode` dedup logic from state orchestrator must be preserved

---

### 4d. Device Domain (Revised Strategy)

**Before:** 6 files, ~523 lines (DeviceService facade + DeviceConnectionService + DeviceMediaService + DeviceStorageService + DeviceOperationSequencer + DeviceOrchestrator)
**After:** 4 files, ~443 lines (DeviceMediaService + DeviceStorageService + DeviceOperationSequencer + DeviceOrchestrator)

#### REVISED from Design Doc

The design doc proposed absorbing connection logic into the orchestrator. The deep-dive identified a **layering violation**: `DeviceMediaService` directly calls `deviceConnectionService.updateConnectionStatus()` in its `enumerateDevices()` and `discoverSupportedDevice()` methods. Moving connection logic to the orchestrator would require infrastructure depending on the application layer.

**Revised approach: Absorb `DeviceConnectionService` into `DeviceMediaService`** (not the orchestrator).

Rationale:
1. `DeviceMediaService` already depends on `deviceConnectionService` for `updateConnectionStatus()` calls
2. Connection state is just `{ connected: boolean }` -- trivially owned
3. Eliminates the cross-concern dependency entirely
4. Keeps infrastructure layer self-contained

#### Facade Method Analysis

| Facade Method | Delegates To | Added Logic |
|---------------|-------------|-------------|
| `get isConnected` | `deviceConnectionService.isConnected` | NONE |
| `updateDeviceStatus()` | `deviceConnectionService.updateConnectionStatus()` | Invalidates media cache on status change |
| `isDeviceConnected()` | `deviceConnectionService.isConnected` | NONE (redundant duplicate of getter) |
| `enumerateDevices()` | `deviceMediaService.enumerateDevices()` | NONE |
| `getRegisteredStoredDeviceIds()` | `deviceStorageService.getRegisteredStoredDeviceIds()` | NONE |
| `getSelectedDeviceId()` | `deviceMediaService.getSelectedDeviceId()` | NONE |
| `discoverSupportedDevice()` | `deviceMediaService.discoverSupportedDevice()` | NONE |
| `registerSupportedDevice(device)` | `deviceMediaService.registerSupportedDevice(device)` | NONE |
| `setupDeviceChangeListener()` | `deviceMediaService.setupDeviceChangeListener()` | Passes callback |
| `dispose()` | `deviceMediaService.dispose()` | NONE |

Only `updateDeviceStatus()` has non-trivial cross-service coordination (cache invalidation on connection change). After absorbing connection into `DeviceMediaService`, this becomes internal.

#### Consumer Rewiring Map

| Consumer | Current Dep | New Deps | Methods To Update |
|----------|-------------|----------|-------------------|
| `DeviceOrchestrator` | `deviceService` | `deviceMediaService`, `deviceStorageService` | `setupDeviceChangeListener()`, `isDeviceConnected()` -> `isConnected`, `dispose()` |
| `DeviceOperationSequencerService` | `deviceService` | `deviceMediaService` | `updateDeviceStatus()` -> `updateConnectionStatus()`, `enumerateDevices()` |
| `StreamingService` | `deviceService` | `deviceMediaService`, `deviceStorageService` | `registerSupportedDevice()`, `enumerateDevices()`, `getRegisteredStoredDeviceIds()`, `discoverSupportedDevice()` |
| `AppState` | `deviceService` | `deviceMediaService` | `isConnected` getter |

#### Files Changed

| File | Action |
|------|--------|
| `src/renderer/infrastructure/services/devices/device.service.ts` | DELETE (77 lines) |
| `src/renderer/infrastructure/services/devices/device-connection.service.ts` | DELETE (43 lines) |
| `src/renderer/infrastructure/services/devices/device-media.service.ts` | MODIFY (absorb connection tracking: +~30 lines, -dependency) |
| `src/renderer/application/orchestrators/device.orchestrator.ts` | MODIFY (replace deviceService with sub-services) |
| `src/renderer/infrastructure/services/devices/device-operation-sequencer.service.ts` | MODIFY (replace deviceService with deviceMediaService) |
| `src/renderer/infrastructure/services/streaming/streaming.service.ts` | MODIFY (replace deviceService with deviceMediaService + deviceStorageService) |
| `src/renderer/application/state/app-state.ts` | MODIFY (replace deviceService with deviceMediaService) |
| `src/renderer/application/di/register-devices.ts` | MODIFY (remove facade + connection registrations) |
| `src/renderer/application/di/register-streaming.ts` | MODIFY (update StreamingService deps) |
| `src/renderer/application/di/register-ui.ts` | MODIFY (update AppState deps) |
| `src/renderer/application/di/register-orchestrators.ts` | MODIFY (update DeviceOrchestrator deps) |
| `src/renderer/application/di/renderer-container-map.type.ts` | MODIFY (remove deviceService, deviceConnectionService) |

#### Test Impact

| Test | Action |
|------|--------|
| `tests/unit/features/devices/services/device.service.test.js` | DELETE |
| `tests/unit/features/devices/services/device-connection.service.test.js` | DELETE or MERGE into media service tests |
| `tests/unit/features/devices/services/device.orchestrator.test.js` | MODIFY (update mock deps) |
| `tests/unit/features/devices/services/device-operation-sequencer.service.test.js` | MODIFY (update mock deps) |

#### Risk: HIGH

- 5 consumers of facade require rewiring
- `updateDeviceStatus()` cross-service coordination must be correctly internalized
- `setupDeviceChangeListener()` callback pattern must be absorbed
- Recommended: execute last among domain consolidations

---

## 5. Presentation Layer

### 5a. Dead Code to Remove

| File | Lines | Status | Consumers |
|------|-------|--------|-----------|
| `src/renderer/presentation/config/storage-keys.config.ts` | 5 | DEAD (zero consumers) | All consumers import directly from `@shared/config/storage-keys.config` |
| `src/renderer/presentation/lib/filename-generator.utils.ts` | 1 | DEAD (zero consumers) | None |
| **Total** | **6 lines, 2 files** | | |

### 5b. Re-Export Files to Remove

| File | Lines | Content | Consumers | Action |
|------|-------|---------|-----------|--------|
| `src/renderer/presentation/config/constants.config.ts` | 1 | Re-exports `TIMING` from `@shared/config/timing.config` | 5 files | DELETE; update 5 imports to point to `@shared/config/timing.config` |
| `src/renderer/presentation/config/update-state.config.ts` | 1 | Re-exports `UpdateState` from `@shared/config/update-state.config` | 1 file | DELETE; update 1 import |
| `src/renderer/presentation/lib/file-download.utils.ts` | 1 | Re-exports `downloadFile` from `@shared/lib/file-download.utils` | 1 file (`ui.controller.js`) | DELETE; update 1 import |
| **Total** | **3 lines, 3 files** | | **7 import updates** | |

### 5c. Bridge LifecycleService Migration Savings

All 3 existing bridges + the new UpdateUIBridge (moved from services/) extend `LifecycleService`:

| Bridge | Boilerplate Eliminated |
|--------|----------------------|
| `UIEventBridge` | ~15 lines (constructor `_subscriptions`, dispose loop) |
| `CaptureUIBridge` | ~12 lines |
| `TranscodeUIBridge` | ~12 lines |
| `UpdateUIBridge` (new, from services/) | ~12 lines |
| **Total** | **~51 lines across 4 bridges** |

TranscodeUIBridge has additional dispose logic (`this._toast?.dispose()`) that remains in its `onDispose()` override.

### 5d. Component Subscription Pattern Duplication

The identical event subscription cleanup block appears in 5 feature components (beyond the 3 bridges):

```javascript
this._eventSubscriptions.forEach(unsubscribe => {
  if (typeof unsubscribe === 'function') unsubscribe();
});
this._eventSubscriptions = [];
```

**Files:** `ShaderPresetListComponent`, `ShaderSliderControlsComponent`, `CinematicToggleComponent`, `NotesPanelComponent`, `UpdateSectionComponent`

These are NOT `BaseService` subclasses, so they would not extend `LifecycleService`. A mixin or utility could help, but the savings (~35 lines across 5 files) are low priority.

### 5e. Follow-Up Opportunities (Not In Scope)

| Opportunity | Files | Lines Saved | Risk |
|------------|-------|-------------|------|
| Auto-hide effect base class (CursorAutoHide, ToolbarAutoHide, ControlsAutoHide) | 3 effects + 1 new base | ~75-90 | MEDIUM |
| Feature component subscription cleanup via utility/mixin | 5 components | ~35 | MEDIUM |
| Remove explicit null assignments in dispose methods | 13 components | ~60-70 | LOW |
| Migrate auto-hide effects to use `createDomListenerManager` | 3 files | ~20 (net) | LOW |

### 5f. Architecture Preservations (Do NOT Change)

| Item | Reason to Keep |
|------|---------------|
| UIController | Central DOM reference holder + stable public API between DI-managed world and DOM-managed world |
| UIComponentRegistry | Component lifecycle management + factory pattern; well-utilized |
| CaptureUIBridge | All 6 handlers contain meaningful domain-to-UI translation logic |
| TranscodeUIBridge | State management + multi-event coordination |
| DisclosureController | Well-utilized by 4 consumers |
| Notes sub-component decomposition (8 files) | Appropriate for the complexity (CRUD, search, autocomplete, resize, autosave) |
| `createDomListenerManager` pattern | Widely adopted in 15 files; prevents memory leaks |
| UIEventBridge | Although 15/16 handlers are pass-through, centralizes the complete event-to-UI mapping for debuggability |

---

## 6. Dead Code Summary

All dead code found across all analyses, with exact file paths:

### Truly Dead (Zero Consumers)

| File | Lines | Source Analysis |
|------|-------|----------------|
| `src/renderer/presentation/config/storage-keys.config.ts` | 5 | Presentation deep-dive |
| `src/renderer/presentation/lib/filename-generator.utils.ts` | 1 | Presentation deep-dive |
| `DeviceOrchestrator.isDeviceConnected()` method | ~3 lines at `src/renderer/application/orchestrators/device.orchestrator.ts:49-51` | Domain deep-dive |

### Redundant (Has Simpler Alternative)

| Item | Location | Redundancy |
|------|----------|-----------|
| `DeviceService.isDeviceConnected()` method | `src/renderer/infrastructure/services/devices/device.service.ts:44` | Duplicate of `get isConnected` on same class |
| `presentation/config/constants.config.ts` | 1-line re-export | 5 consumers can import `@shared/config/timing.config` directly |
| `presentation/config/update-state.config.ts` | 1-line re-export | 1 consumer can import `@shared/config/update-state.config` directly |
| `presentation/lib/file-download.utils.ts` | 1-line re-export | 1 consumer can import `@shared/lib/file-download.utils` directly |

---

## 7. Implementation Phases

### Phase 1: Foundation (BLOCKING -- must complete first)

**Risk:** LOW
**Estimated effort:** ~200 lines changed

1. Create `ILifecycle` interface (`src/shared/interfaces/lifecycle.interface.ts`)
2. Create `IEventSubscriber` interface (`src/shared/interfaces/event-subscriber.interface.ts`)
3. Create `LifecycleService` class (`src/shared/base/lifecycle-service.base.ts`)
4. Refactor `BaseOrchestrator` to extend `LifecycleService` (remove 27 lines of duplicated constructor logic)
5. Add static `dependencies` support to `BaseService`
6. Add `autoRegister()` to `ServiceContainer` (~15 lines)
7. Update `RegistrableContainer` type to include `autoRegister` signature
8. Validate: `npm run test:run` (all tests pass, no behavioral changes)

**Dependency graph:**
```
Phase 1 -> Phase 2 (all sub-phases)
Phase 1 -> Phase 3
Phase 1 -> Phase 4
```

### Phase 2: Domain Consolidations (can parallelize sub-phases)

All 4 sub-phases are independent of each other. Recommended execution order: 2b -> 2a -> 2c -> 2d.

#### Phase 2a: Update Domain
- **Risk:** LOW
- **Prerequisites:** Phase 1 (LifecycleService)
- **Files deleted:** 1
- **Lines saved:** ~62
- Validate: `npm run test:run`

#### Phase 2b: Settings Domain
- **Risk:** LOW
- **Prerequisites:** None beyond Phase 1
- **Files deleted:** 1
- **Lines saved:** ~24
- Validate: `npm run test:run`

#### Phase 2c: Performance Domain
- **Risk:** MEDIUM (initialization order sensitivity)
- **Prerequisites:** None beyond Phase 1
- **Files deleted:** 3 (replaced by 1)
- **Lines saved:** ~74
- Validate: `npm run test:run` + specific test for initialization order

#### Phase 2d: Device Domain
- **Risk:** HIGH (5 consumers of facade, cross-service coordination)
- **Prerequisites:** None beyond Phase 1
- **Files deleted:** 2
- **Lines saved:** ~120
- Validate: `npm run test:run` (execute last, with extra validation)

### Phase 3: Auto-Wiring Migration (can parallelize across files)

Each registration file is independent. Recommended order (cleanest to most complex):

1. `register-orchestrators.ts` (17/17 eligible, **~240 lines saved**)
2. `register-capture.ts` (4/4 eligible, **~28 lines saved**)
3. `register-streaming.ts` (1/1 eligible, **~7 lines saved**)
4. `register-devices.ts` (5/6 eligible, **~45 lines saved**)
5. `register-ui.ts` (12/14 eligible, **~97 lines saved**)
6. `register-infrastructure.ts` (15/23 eligible, **~109 lines saved**)
7. Update container test (`container.test.js`)

- **Risk:** MEDIUM (test mock pattern changes)
- **Prerequisites:** Phase 1 (autoRegister exists, static dependencies on all classes)
- **Total lines saved:** ~403 net
- Validate: `npm run test:run` + `npm run lint` after each file

### Phase 4: Bridge + Service LifecycleService Migration

- Convert 3 existing bridges to extend `LifecycleService`
- Move `UpdateUiService` to `presentation/bridges/update-ui.bridge.ts` as `UpdateUIBridge` (extends `LifecycleService`)
- Convert Tier-1 services (`UpdateService`, `TranscodeService`, `FullscreenService`) to extend `LifecycleService`
- **Risk:** MEDIUM
- **Prerequisites:** Phase 1
- **Lines saved:** ~96 (Tier-1 services) + ~51 (bridges) = ~147
- Validate: `npm run test:run`

### Phase 5: Dead Code Cleanup

- Delete 2 dead files + 3 re-export files
- Update 7 import paths
- Remove `DeviceOrchestrator.isDeviceConnected()` dead method
- **Risk:** LOW
- **Prerequisites:** None
- **Lines saved:** ~9
- Validate: `npm run test:run` + `npm run lint`

### Dependency Graph

```
Phase 1 (Foundation)
  |
  +---> Phase 2a (Update)
  +---> Phase 2b (Settings)
  +---> Phase 2c (Performance)
  +---> Phase 2d (Device)         [execute last among 2x]
  |
  +---> Phase 3 (Auto-Wiring)
  |
  +---> Phase 4 (Bridge/Service LifecycleService Migration)

Phase 5 (Dead Code) -- independent, can run anytime
```

### Validation Checkpoints

| After | Command | Gate |
|-------|---------|------|
| Phase 1 | `npm run test:run` | All 2789 tests pass |
| Each Phase 2 sub-task | `npm run test:run` | All tests pass |
| After Phase 2d | `npm run test:run` (extra attention to device/streaming tests) | All tests pass |
| Each Phase 3 file conversion | `npm run test:run` | All tests pass |
| Phase 4 | `npm run test:run` | All tests pass |
| Phase 5 | `npm run test:run` + `npm run lint` | All tests pass, zero lint errors |

---

## 8. Complete File Change Manifest

### DELETE (12 files)

| File | Lines | Phase | Reason |
|------|-------|-------|--------|
| `src/renderer/application/orchestrators/update.orchestrator.ts` | 62 | 2a | Pure pass-through facade |
| `src/renderer/infrastructure/services/settings/cinematic-mode.service.ts` | 24 | 2b | 3-line service absorbed into orchestrator |
| `src/renderer/application/orchestrators/performance-state.orchestrator.ts` | 76 | 2c | Merged into unified orchestrator |
| `src/renderer/application/orchestrators/performance-animation.orchestrator.ts` | 56 | 2c | Merged into unified orchestrator |
| `src/renderer/application/orchestrators/performance-metrics.orchestrator.ts` | 42 | 2c | Merged into unified orchestrator |
| `src/renderer/infrastructure/services/devices/device.service.ts` | 77 | 2d | Pure delegation facade |
| `src/renderer/infrastructure/services/devices/device-connection.service.ts` | 43 | 2d | Absorbed into DeviceMediaService |
| `src/renderer/presentation/config/storage-keys.config.ts` | 5 | 5 | Dead code (zero consumers) |
| `src/renderer/presentation/config/constants.config.ts` | 1 | 5 | Re-export; consumers updated |
| `src/renderer/presentation/config/update-state.config.ts` | 1 | 5 | Re-export; consumers updated |
| `src/renderer/presentation/lib/filename-generator.utils.ts` | 1 | 5 | Dead code (zero consumers) |
| `src/renderer/presentation/lib/file-download.utils.ts` | 1 | 5 | Re-export; consumers updated |
| **Total deleted** | **389 lines** | | |

### CREATE (3 files)

| File | Est. Lines | Phase | Purpose |
|------|-----------|-------|---------|
| `src/shared/interfaces/lifecycle.interface.ts` | ~10 | 1 | ILifecycle interface |
| `src/shared/interfaces/event-subscriber.interface.ts` | ~8 | 1 | IEventSubscriber interface |
| `src/shared/base/lifecycle-service.base.ts` | ~60 | 1 | LifecycleService class |
| `src/renderer/application/orchestrators/performance.orchestrator.ts` | ~100 | 2c | Merged performance orchestrator |
| **Total created** | **~178 lines** | | |

### MOVE+RENAME (1 file)

| From | To | Phase |
|------|----|-------|
| `src/renderer/infrastructure/services/updates/update-ui.service.ts` | `src/renderer/presentation/bridges/update-ui.bridge.ts` | 2a |

### MODIFY (source files)

| File | Phase | Est. Line Change | Change Description |
|------|-------|-----------------|-------------------|
| `src/shared/base/service.base.js` | 1 | +5 | Add static `dependencies` support |
| `src/shared/base/orchestrator.base.js` | 1 | -27 | Extend LifecycleService, remove duplicated constructor logic |
| `src/renderer/infrastructure/di/service-container.factory.ts` | 1 | +15 | Add `autoRegister()` method |
| `src/renderer/application/di/registrable-container.type.ts` | 1 | +5 | Add `autoRegister` type signature |
| `src/renderer/application/orchestrators/app.orchestrator.ts` | 2a, 2c | -15 | Replace updateOrchestrator + 3 perf orchestrators with direct deps |
| `src/renderer/application/orchestrators/ui-setup.orchestrator.ts` | 2a | -2 | Rename updateOrchestrator -> updateService |
| `src/renderer/presentation/features/updates/update-section.component.js` | 2a | -2 | Rename updateOrchestrator -> updateService |
| `src/renderer/renderer-app.orchestrator.ts` | 2a | +5 | Initialize UpdateService directly |
| `src/renderer/infrastructure/services/updates/update.service.ts` | 2a, 4 | -15 | Extend LifecycleService, remove hand-rolled lifecycle |
| `src/renderer/application/orchestrators/display-mode.orchestrator.ts` | 2b | +3 | Inline cinematic toggle, add appState dep |
| `src/renderer/infrastructure/services/devices/device-media.service.ts` | 2d | +30 | Absorb connection tracking from DeviceConnectionService |
| `src/renderer/application/orchestrators/device.orchestrator.ts` | 2d | -10 | Replace deviceService with sub-services, remove dead method |
| `src/renderer/infrastructure/services/devices/device-operation-sequencer.service.ts` | 2d | -5 | Replace deviceService with deviceMediaService |
| `src/renderer/infrastructure/services/streaming/streaming.service.ts` | 2d | -5 | Replace deviceService with deviceMediaService + deviceStorageService |
| `src/renderer/application/state/app-state.ts` | 2d | -2 | Replace deviceService with deviceMediaService for isConnected |
| `src/renderer/application/di/register-orchestrators.ts` | 2a-d, 3 | -240 | Remove deleted registrations, convert to autoRegister |
| `src/renderer/application/di/register-infrastructure.ts` | 3 | -109 | Convert 15 registrations to autoRegister |
| `src/renderer/application/di/register-ui.ts` | 2a, 3 | -97 | Register UpdateUIBridge, convert 12 to autoRegister |
| `src/renderer/application/di/register-devices.ts` | 2d, 3 | -45 | Remove 2 registrations, convert 5 to autoRegister |
| `src/renderer/application/di/register-capture.ts` | 3 | -28 | Convert 4 to autoRegister |
| `src/renderer/application/di/register-streaming.ts` | 2d, 3 | -7 | Update deps, convert 1 to autoRegister |
| `src/renderer/application/di/renderer-container-map.type.ts` | 2a-d | -10 | Remove deleted entries, add new entries |
| `src/renderer/infrastructure/services/settings/index.ts` | 2b | -1 | Remove CinematicModeService export |
| `src/renderer/presentation/bridges/ui-event.bridge.ts` | 4 | -15 | Extend LifecycleService, remove hand-rolled subscriptions |
| `src/renderer/presentation/bridges/capture-ui.bridge.ts` | 4 | -12 | Extend LifecycleService |
| `src/renderer/presentation/bridges/transcode-ui.bridge.ts` | 4 | -12 | Extend LifecycleService |
| `src/renderer/infrastructure/services/transcode/transcode.service.ts` | 4 | -15 | Extend LifecycleService |
| `src/renderer/infrastructure/services/settings/fullscreen.service.ts` | 4 | -15 | Extend LifecycleService |
| `src/renderer/presentation/effects/body-class.class.ts` | 5 | -1 | Update TIMING import path |
| `src/renderer/presentation/effects/button-feedback.effect.ts` | 5 | -1 | Update TIMING import path |
| `src/renderer/presentation/effects/controls-auto-hide.effect.ts` | 5 | -1 | Update TIMING import path |
| `src/renderer/presentation/bridges/capture-ui.bridge.ts` | 5 | -1 | Update TIMING import path |
| `src/renderer/presentation/primitives/hide-timer.class.js` | 5 | -1 | Update TIMING import path |
| `src/renderer/presentation/controller/ui.controller.js` | 5 | -1 | Update file-download import path |
| **54 static `dependencies` declarations** across all eligible classes | 3 | +108 total | 2 lines per class |

### MODIFY (test files)

| File | Phase | Change |
|------|-------|--------|
| `tests/unit/app/renderer/container.test.js` | 3 | Major rewrite (~400-500 lines removable) |
| `tests/unit/features/updates/services/update.service.test.js` | 2a | Test lifecycle methods |
| `tests/unit/features/updates/ui/update-section.component.test.js` | 2a | Rename mock updateOrchestrator -> updateService |
| DisplayModeOrchestrator test | 2b | Update mock deps, test inlined toggle |
| `tests/unit/features/devices/services/device.orchestrator.test.js` | 2d | Update mock deps |
| `tests/unit/features/devices/services/device-operation-sequencer.service.test.js` | 2d | Update mock deps |

### DELETE (test files)

| File | Phase | Reason |
|------|-------|--------|
| `tests/unit/features/updates/services/update.orchestrator.test.js` | 2a | Tests deleted class |
| `tests/unit/features/settings/services/cinematic-mode.service.test.js` | 2b | Tests deleted class |
| `tests/unit/app/renderer/application/performance/performance-metrics.orchestrator.test.js` | 2c | Tests deleted class |
| `tests/unit/app/renderer/application/performance/performance-state.orchestrator.test.js` | 2c | Tests deleted class |
| `tests/unit/ui/animation-performance.orchestrator.test.js` | 2c | Tests deleted class |
| `tests/unit/features/devices/services/device.service.test.js` | 2d | Tests deleted facade |
| `tests/unit/features/devices/services/device-connection.service.test.js` | 2d | Tests class absorbed into DeviceMediaService |

### CREATE (test files)

| File | Phase | Purpose |
|------|-------|---------|
| `tests/unit/app/renderer/application/performance/performance.orchestrator.test.js` | 2c | Tests merged orchestrator |

---

## Appendix: Follow-Up Opportunities (Not In Scope)

These were identified during analysis but deferred to keep scope focused:

| Opportunity | Source | Est. Savings | Risk |
|------------|--------|-------------|------|
| Auto-hide effect base class (CursorAutoHide, ToolbarAutoHide, ControlsAutoHide) | Design doc, Presentation deep-dive | ~75-90 lines | MEDIUM |
| Feature component subscription cleanup via utility/mixin | Presentation deep-dive | ~35 lines | MEDIUM |
| Remove explicit null assignments in dispose methods (13 components) | Presentation deep-dive | ~60-70 lines | LOW |
| Migrate auto-hide effects to `createDomListenerManager` | Presentation deep-dive | ~20 lines | LOW |
| SettingsService getter/setter metadata-driven generation | Design doc | TBD | MEDIUM |
| IPC handler try-catch-log-return wrapper utility | Design doc | TBD | LOW |
| State machine duplication (UpdateService, CaptureService, StreamingService) | Design doc | TBD | HIGH |
| Browser adapter consolidation (4 tiny adapters -> 1 PlatformAdapter) | Design doc | TBD | LOW |
| Registration file reorganization by domain (6 files -> 9 domain-specific files) | DI deep-dive | 0 (structural) | LOW |
| `RendererContainerMap` type strengthening (68 of 80 entries typed as `unknown`) | DI deep-dive | 0 (type safety) | LOW |
