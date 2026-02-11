# Deep-Dive: Domain Consolidation Analysis

**Date:** 2026-02-11
**Scope:** Exhaustive analysis of all 4 proposed domain consolidations plus additional domains
**Purpose:** Research only - validates design doc assumptions, maps every consumer, identifies risks

---

## 1. Update Domain

### Current Architecture (3 files, ~393 lines)

| File | Lines | Base Class | Responsibility |
|------|-------|------------|----------------|
| `src/renderer/application/orchestrators/update.orchestrator.ts` | 62 | BaseOrchestrator | Pure pass-through facade |
| `src/renderer/infrastructure/services/updates/update.service.ts` | 231 | BaseService | IPC bridge, state machine, update actions |
| `src/renderer/infrastructure/services/updates/update-ui.service.ts` | 88 | BaseService | Event-to-UI translation (badge, status messages) |

### UpdateOrchestrator Consumer Map

**Direct consumers of `updateOrchestrator` (the DI name):**

| Consumer | File | Usage |
|----------|------|-------|
| `AppOrchestrator` | `src/renderer/application/orchestrators/app.orchestrator.ts` | `initialize()` (line 76), `cleanup()` (line 154) |
| `UISetupOrchestrator` | `src/renderer/application/orchestrators/ui-setup.orchestrator.ts` | Passes to `initSettingsMenu()` (line 67) |
| `UpdateSectionComponent` | `src/renderer/presentation/features/updates/update-section.component.js` | Calls `getStatus()`, `checkForUpdates()`, `downloadUpdate()`, `installUpdate()` (lines 100, 280, 286, 289, 292, 302) |
| `register-orchestrators.ts` | `src/renderer/application/di/register-orchestrators.ts` | Registration + dependency in `uiSetupOrchestrator`, `appOrchestrator` |
| `register-ui.ts` | `src/renderer/application/di/register-ui.ts` | Passes to `UpdateSectionComponent` creation (line 130-132) |
| `renderer-container-map.type.ts` | `src/renderer/application/di/renderer-container-map.type.ts` | Type entry (line 70) |

### Pass-Through Confirmation

Every method on `UpdateOrchestrator` is a direct delegation:

```
getStatus()        -> this.updateService.getStatus()
get state()        -> this.updateService.state
get updateInfo()   -> this.updateService.updateInfo
checkForUpdates()  -> this.updateService.checkForUpdates()   (adds only logger.info)
downloadUpdate()   -> this.updateService.downloadUpdate()    (adds only logger.info)
installUpdate()    -> this.updateService.installUpdate()     (adds only logger.info)
```

The 3 logger.info calls in `checkForUpdates()`, `downloadUpdate()`, and `installUpdate()` are the only non-delegation lines. These log statements are redundant because `UpdateService` already logs at the same entry points.

### Merge Strategy

**Step 1: Delete UpdateOrchestrator**
- File: `src/renderer/application/orchestrators/update.orchestrator.ts` (DELETE)

**Step 2: UpdateService gains lifecycle (extends LifecycleService)**
- Add `onInitialize()` / `onDispose()` template method overrides
- Move `initialize()` / `dispose()` logic into those template methods
- Remove hand-rolled `_initialized` flag (LifecycleService provides `isInitialized`)
- Remove hand-rolled `_cleanupFns` (LifecycleService provides `subscribeWithCleanup()` for EventBus; IPC cleanup stays manual)

**Step 3: Move UpdateUiService to bridge**
- Rename: `update-ui.service.ts` -> `presentation/bridges/update-ui.bridge.ts`
- Class name: `UpdateUiService` -> `UpdateUIBridge`
- Extend `LifecycleService` instead of `BaseService`
- Convert hand-rolled `_subscriptions` + `dispose()` to `subscribeWithCleanup()` + automatic cleanup

**Step 4: Update consumers**
- `UpdateSectionComponent`: Change dependency from `updateOrchestrator` to `updateService`
  - **CRITICAL**: The component calls `getStatus()`, `checkForUpdates()`, `downloadUpdate()`, `installUpdate()` -- all of which exist directly on `UpdateService` with identical signatures. No API changes needed.
- `UISetupOrchestrator`: Change `updateOrchestrator` dep to `updateService`
  - Passes through to `initSettingsMenu()` which passes to `UpdateSectionComponent`
- `AppOrchestrator`: Remove `updateOrchestrator` from dependency list
  - Add direct `updateService` + `updateUiBridge` initialization in `onInitialize()`
  - Add direct cleanup in `onCleanup()`
- DI registrations: Remove `updateOrchestrator` registration, update `uiSetupOrchestrator` and `appOrchestrator` deps

### Files Changed

| File | Action |
|------|--------|
| `update.orchestrator.ts` | DELETE |
| `update-ui.service.ts` | MOVE + RENAME to `presentation/bridges/update-ui.bridge.ts` |
| `update.service.ts` | MODIFY (extend LifecycleService) |
| `register-orchestrators.ts` | MODIFY (remove UpdateOrchestrator registration, update appOrchestrator/uiSetupOrchestrator deps) |
| `register-ui.ts` | MODIFY (register UpdateUIBridge, update UpdateSectionComponent dep) |
| `renderer-container-map.type.ts` | MODIFY (remove updateOrchestrator, add updateUiBridge) |
| `update-section.component.js` | MODIFY (rename updateOrchestrator -> updateService) |
| `ui-setup.orchestrator.ts` | MODIFY (rename updateOrchestrator -> updateService) |
| `app.orchestrator.ts` | MODIFY (replace updateOrchestrator with updateService + updateUiBridge) |
| `renderer-app.orchestrator.ts` | MODIFY (initialize UpdateService here instead of through orchestrator) |

### Test Files Affected

| Test | Action |
|------|--------|
| `tests/unit/features/updates/services/update.orchestrator.test.js` | DELETE (tests deleted class) |
| `tests/unit/features/updates/services/update.service.test.js` | MODIFY (test lifecycle methods if changed) |
| `tests/unit/features/updates/ui/update-section.component.test.js` | MODIFY (rename mock from updateOrchestrator to updateService) |

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| `UpdateSectionComponent` depends on orchestrator interface | LOW | API is identical on `UpdateService` |
| `renderer-app.orchestrator.ts` already initializes TranscodeService directly | NONE | Same pattern for UpdateService |
| Losing the 3 logger.info calls from the orchestrator | NONE | UpdateService already logs at same points |

---

## 2. Settings Domain

### Current Architecture (5 files)

| File | Lines | Base Class | Responsibility |
|------|-------|------------|----------------|
| `cinematic-mode.service.ts` | 24 | BaseService | Single method: toggle cinematic mode |
| `fullscreen.service.ts` | 144 | BaseService | Fullscreen event handling, IPC bridge |
| `presentation-mode.service.ts` | 60 | BaseService | Visual state coordination (fullscreen + cinematic + minimalist) |
| `settings.service.ts` | 263 | BaseService | LocalStorage getter/setter for all preferences |
| `display-mode.orchestrator.ts` | 74 | BaseOrchestrator | Coordinates fullscreen + cinematic services |

### CinematicModeService Consumer Map

**Only consumer: `SettingsDisplayModeOrchestrator`**

| Consumer | File | Usage |
|----------|------|-------|
| `SettingsDisplayModeOrchestrator` | `display-mode.orchestrator.ts` | `this.cinematicModeService.toggleCinematicMode()` (line 72) |
| `register-orchestrators.ts` | DI registration (line 108-113) + dependency of displayModeOrchestrator (line 117-126) |
| `renderer-container-map.type.ts` | Type entry (line 68) |

No other file in the codebase imports or references `cinematicModeService` or `SettingsCinematicModeService`.

### CinematicModeService Logic (Complete)

```typescript
toggleCinematicMode() {
  const newMode = !this.appState.isCinematicModeEnabled;
  this.appState.setCinematicMode(newMode);
  this.eventBus.publish(EventChannels.SETTINGS.CINEMATIC_MODE_CHANGED, { enabled: newMode });
}
```

This is 3 lines of logic. The orchestrator already has `appState` and `eventBus` as dependencies.

### Merge Strategy

**Step 1: Absorb into DisplayModeOrchestrator**
- Add `appState` to DisplayModeOrchestrator dependencies (currently has: fullscreenService, cinematicModeService, settingsService, eventBus, loggerFactory)
- Inline the 3 lines of `toggleCinematicMode()` directly in the orchestrator's existing `toggleCinematicMode()` method
- Remove `cinematicModeService` from dependencies

**Step 2: Delete CinematicModeService**
- File: `src/renderer/infrastructure/services/settings/cinematic-mode.service.ts` (DELETE)

### Files Changed

| File | Action |
|------|--------|
| `cinematic-mode.service.ts` | DELETE |
| `display-mode.orchestrator.ts` | MODIFY (inline logic, add appState dep, remove cinematicModeService dep) |
| `register-orchestrators.ts` | MODIFY (remove cinematicModeService registration, update displayModeOrchestrator deps) |
| `renderer-container-map.type.ts` | MODIFY (remove cinematicModeService entry) |
| `settings/index.ts` | MODIFY (remove SettingsCinematicModeService export) |

### Test Files Affected

| Test | Action |
|------|--------|
| `tests/unit/features/settings/services/cinematic-mode.service.test.js` | DELETE (tests deleted class) |
| DisplayModeOrchestrator test (if exists) | MODIFY (update mock deps, add test for inlined toggle logic) |

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| AppState.setCinematicMode() dependency | NONE | AppState is already widely available |
| UIEventBridge subscribes to CINEMATIC_MODE_CHANGED | NONE | Event channel unchanged, emitter just moves |
| Loss of service-level testing | LOW | Logic is trivial (3 lines), tested via orchestrator |

---

## 3. Performance Domain

### Current Architecture (6 files, ~502 lines)

| File | Lines | Base Class | Responsibility |
|------|-------|------------|----------------|
| `performance-state.orchestrator.ts` | 76 | BaseOrchestrator | Event fan-out: settings/capabilities/stream -> PerformanceStateService |
| `performance-animation.orchestrator.ts` | 56 | BaseOrchestrator | Event fan-out: stream/performance -> PerformanceAnimationService -> BodyClassManager |
| `performance-metrics.orchestrator.ts` | 42 | BaseOrchestrator | Memory snapshot event -> PerformanceMetricsService |
| `performance-state.service.ts` | 207 | BaseService | Visibility/idle/motion/capability state tracking |
| `performance-animation.service.ts` | 98 | BaseService | Animation suppression computation |
| `performance-metrics.service.ts` | 98 | BaseService | Process metrics snapshot scheduling |

### Event Subscription Map (All 3 Orchestrators)

**PerformanceStateOrchestrator subscriptions:**
```
SETTINGS.PERFORMANCE_MODE_CHANGED -> performanceStateService.setPerformanceModeEnabled()
RENDER.CAPABILITY_DETECTED        -> performanceStateService.setCapabilities()
STREAM.STARTED                    -> performanceStateService.setStreaming(true)
STREAM.STOPPED                    -> performanceStateService.setStreaming(false)
```

Also initializes `performanceStateService.initialize({ onStateChange })` with callback that:
1. Publishes `PERFORMANCE.STATE_CHANGED`
2. Publishes `PERFORMANCE.UI_MODE_CHANGED` (with dedup via `_lastUiMode`)

**PerformanceAnimationOrchestrator subscriptions:**
```
STREAM.STARTED            -> animationPerformanceService.setStreaming(true) -> bodyClassManager
STREAM.STOPPED            -> animationPerformanceService.setStreaming(false) -> bodyClassManager
PERFORMANCE.STATE_CHANGED -> animationPerformanceService.setPerformanceState() -> bodyClassManager
```

**PerformanceMetricsOrchestrator subscriptions:**
```
PERFORMANCE.MEMORY_SNAPSHOT_REQUESTED -> performanceMetricsService.requestSnapshot()
```
Also: `performanceMetricsService.startPeriodicSnapshots()` in DEV mode.

### Ordering Dependencies Analysis

**Critical ordering: PerformanceStateOrchestrator MUST initialize before PerformanceAnimationOrchestrator**

The animation orchestrator subscribes to `PERFORMANCE.STATE_CHANGED`, which is published by the state orchestrator's `_handleStateChanged` callback. If animation subscribes before state is initialized, it will miss the initial state emission from `performanceStateService.initialize()` -> `_emitState()`.

Current initialization order in `AppOrchestrator.onInitialize()`:
```
line 71: await this.performanceStateOrchestrator.initialize();   // FIRST
line 72: await this.animationPerformanceOrchestrator.initialize(); // SECOND
line 73: await this.performanceMetricsOrchestrator.initialize();  // THIRD (independent)
```

**This ordering MUST be preserved in the merged orchestrator.** The merged orchestrator should:
1. Initialize `performanceStateService` (with callback) FIRST
2. Subscribe to state events for animation SECOND
3. Subscribe to metrics events and start periodic snapshots THIRD

### Duplicate Event Subscriptions

Both `PerformanceStateOrchestrator` and `PerformanceAnimationOrchestrator` subscribe to:
- `STREAM.STARTED`
- `STREAM.STOPPED`

In the merged orchestrator, these can be combined into single handlers that call both services.

### Consumer Map (Who references these orchestrators?)

| Consumer | References |
|----------|------------|
| `AppOrchestrator` | `performanceMetricsOrchestrator`, `performanceStateOrchestrator`, `animationPerformanceOrchestrator` |
| `register-orchestrators.ts` | All 3 orchestrator registrations + 3 service registrations |
| `renderer-container-map.type.ts` | 6 entries (3 orchestrators + 3 services) |

No other file references any of the 3 performance orchestrators directly. They are only consumed by `AppOrchestrator`.

### Merge Strategy

**Step 1: Create `PerformanceOrchestrator`**
- New file: `src/renderer/application/orchestrators/performance.orchestrator.ts`
- Dependencies: `eventBus`, `loggerFactory`, `performanceStateService`, `animationPerformanceService`, `performanceMetricsService`, `bodyClassManager`
- Merge all event subscriptions from 3 orchestrators
- Preserve initialization order (state -> animation -> metrics)
- Combine duplicate STREAM.STARTED/STOPPED handlers

**Step 2: Delete 3 old orchestrators**
- `performance-state.orchestrator.ts` (DELETE)
- `performance-animation.orchestrator.ts` (DELETE)
- `performance-metrics.orchestrator.ts` (DELETE)

### Merged Orchestrator Event Map

```typescript
async onInitialize() {
  // Phase 1: State service (MUST be first - emits initial state)
  this.performanceStateService.initialize({
    onStateChange: (state) => this._handleStateChanged(state)
  });

  // Phase 2: Subscribe to all events
  this.subscribeWithCleanup({
    // State orchestrator events
    [EventChannels.SETTINGS.PERFORMANCE_MODE_CHANGED]: (enabled) => this._handlePerformanceModeChanged(enabled),
    [EventChannels.RENDER.CAPABILITY_DETECTED]: (caps) => this.performanceStateService.setCapabilities(caps),

    // Shared stream events (combined handler)
    [EventChannels.STREAM.STARTED]: () => this._handleStreamStarted(),
    [EventChannels.STREAM.STOPPED]: () => this._handleStreamStopped(),

    // Animation orchestrator events
    [EventChannels.PERFORMANCE.STATE_CHANGED]: (state) => this._handlePerformanceStateForAnimation(state),

    // Metrics orchestrator events
    [EventChannels.PERFORMANCE.MEMORY_SNAPSHOT_REQUESTED]: (payload) => this.performanceMetricsService.requestSnapshot(payload)
  });

  // Phase 3: Start periodic snapshots in DEV
  if (import.meta.env.DEV) {
    this.performanceMetricsService.startPeriodicSnapshots();
  }
}
```

### Files Changed

| File | Action |
|------|--------|
| `performance-state.orchestrator.ts` | DELETE |
| `performance-animation.orchestrator.ts` | DELETE |
| `performance-metrics.orchestrator.ts` | DELETE |
| NEW: `performance.orchestrator.ts` | CREATE (merged) |
| `register-orchestrators.ts` | MODIFY (remove 3 registrations, add 1, update appOrchestrator deps) |
| `renderer-container-map.type.ts` | MODIFY (remove 3 entries, add 1 `performanceOrchestrator`) |
| `app.orchestrator.ts` | MODIFY (replace 3 deps with 1 `performanceOrchestrator`) |

### Test Files Affected

| Test | Action |
|------|--------|
| `tests/unit/app/renderer/application/performance/performance-metrics.orchestrator.test.js` | DELETE or MERGE |
| `tests/unit/app/renderer/application/performance/performance-state.orchestrator.test.js` | DELETE or MERGE |
| `tests/unit/ui/animation-performance.orchestrator.test.js` | DELETE or MERGE |
| NEW: `tests/unit/app/renderer/application/performance/performance.orchestrator.test.js` | CREATE (merged tests) |

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Initialization order regression | HIGH | Explicit phase comments + test that verifies state service initialized before event subscriptions |
| Duplicate STREAM.STARTED/STOPPED merge | MEDIUM | Both call different services; combined handler must call both |
| `_lastUiMode` dedup from state orchestrator | LOW | Move directly into merged orchestrator |
| `PERFORMANCE.STATE_CHANGED` is both published and consumed | MEDIUM | Must not create infinite loop: state service callback publishes event, animation handler consumes it. This is safe because the event flows one direction (state -> animation) |

---

## 4. Device Domain

### Current Architecture (6 files, ~523 lines)

| File | Lines | Base Class | Responsibility |
|------|-------|------------|----------------|
| `device.service.ts` (facade) | 77 | BaseService | Pure delegation facade over 3 sub-services |
| `device-connection.service.ts` | 43 | BaseService | USB connection status tracking |
| `device-media.service.ts` | 270 | BaseService | Media device enumeration, caching, permission probing |
| `device-storage.service.ts` | 48 | BaseService | Device ID persistence in localStorage |
| `device-operation-sequencer.service.ts` | 140 | BaseService | Sequential queue for device operations |
| `device.orchestrator.ts` | 93 | BaseOrchestrator | IPC events, sequencer coordination |

### DeviceService (Facade) Consumer Map

**Every consumer of `deviceService`:**

| Consumer | File | Methods Used |
|----------|------|-------------|
| `DeviceOrchestrator` | `device.orchestrator.ts` | `setupDeviceChangeListener()`, `isDeviceConnected()`, `dispose()` |
| `DeviceOperationSequencerService` | `device-operation-sequencer.service.ts` | `updateDeviceStatus()`, `enumerateDevices()` |
| `StreamingService` | `streaming.service.ts` | `registerSupportedDevice()`, `enumerateDevices()`, `getRegisteredStoredDeviceIds()`, `discoverSupportedDevice()` |
| `AppState` | `app-state.ts` | `isConnected` (getter, derived state) |
| `register-streaming.ts` | DI registration | Dependency of `streamingService` |
| `register-ui.ts` | DI registration | Dependency of `appState` |
| `register-devices.ts` | DI registration | Creates + depends on sub-services |
| `register-orchestrators.ts` | DI registration | Dependency of `deviceOrchestrator` |

### DeviceService Facade Analysis (Method-by-Method)

| Facade Method | Delegates To | Added Logic |
|---------------|-------------|-------------|
| `get isConnected` | `deviceConnectionService.isConnected` | NONE |
| `updateDeviceStatus()` | `deviceConnectionService.updateConnectionStatus()` | Invalidates media cache on status change |
| `isDeviceConnected()` | `deviceConnectionService.isConnected` | NONE (duplicate of `get isConnected`) |
| `enumerateDevices()` | `deviceMediaService.enumerateDevices()` | NONE |
| `getRegisteredStoredDeviceIds()` | `deviceStorageService.getRegisteredStoredDeviceIds()` | NONE |
| `getSelectedDeviceId()` | `deviceMediaService.getSelectedDeviceId()` | NONE |
| `discoverSupportedDevice()` | `deviceMediaService.discoverSupportedDevice()` | NONE |
| `registerSupportedDevice(device)` | `deviceMediaService.registerSupportedDevice(device)` | NONE |
| `setupDeviceChangeListener()` | `deviceMediaService.setupDeviceChangeListener(() => this.updateDeviceStatus())` | Passes callback |
| `dispose()` | `deviceMediaService.dispose()` | NONE |

**Key observation:** `updateDeviceStatus()` has non-trivial logic -- it calls `deviceConnectionService.updateConnectionStatus()` and conditionally calls `deviceMediaService.invalidateEnumerationCache()`. This is cross-service coordination.

### DeviceConnectionService Consumer Map

| Consumer | File | Methods Used |
|----------|------|-------------|
| `DeviceService` (facade) | `device.service.ts` | `isConnected`, `updateConnectionStatus()` |
| `DeviceMediaService` | `device-media.service.ts` | `updateConnectionStatus()` (lines 55, 122) |
| `register-devices.ts` | DI registration | Dependency of deviceMediaService, deviceService |

**IMPORTANT:** `DeviceMediaService` directly calls `deviceConnectionService.updateConnectionStatus()` in its `enumerateDevices()` and `discoverSupportedDevice()` methods. This means `DeviceMediaService` does NOT go through the facade for connection status checks.

### Merge Strategy (Revised from Design Doc)

The design doc proposes deleting both `DeviceService` (facade) and `DeviceConnectionService`, absorbing connection tracking into the orchestrator. After analysis, I find this is **mostly correct but needs refinement**:

**Problem with absorbing connection into orchestrator:**
- `DeviceMediaService` directly depends on `deviceConnectionService` for `updateConnectionStatus()` calls
- If we move connection logic to the orchestrator, `DeviceMediaService` would need to depend on an orchestrator (violates layering: infrastructure should not depend on application layer)

**Revised approach:**

**Option A: Keep DeviceConnectionService, delete only the facade**
- DeviceService (facade) deleted
- Consumers that used facade methods get the sub-service they actually need
- `StreamingService` gets `deviceMediaService` + `deviceStorageService` directly
- `DeviceOrchestrator` gets `deviceMediaService` + `deviceConnectionService` directly
- `AppState` gets `deviceConnectionService` for `isConnected`
- `DeviceOperationSequencerService` gets `deviceConnectionService` + `deviceMediaService`

**Option B (design doc approach): Absorb DeviceConnectionService into DeviceMediaService**
- `DeviceMediaService` already depends on `deviceConnectionService` anyway
- Inline the 43-line connection tracking into DeviceMediaService
- This keeps the infrastructure layer self-contained
- DeviceMediaService gains an `isConnected` getter and `updateConnectionStatus()` method

**Recommendation: Option B** is cleaner because:
1. DeviceMediaService already owns the call to `updateConnectionStatus()` in its `enumerateDevices()`
2. Connection state is just `{ connected: boolean }` - trivially owned by any service
3. Eliminates a circular concern (media service needs connection, connection is separate)

### Files Changed (Option B)

| File | Action |
|------|--------|
| `device.service.ts` | DELETE |
| `device-connection.service.ts` | DELETE |
| `device-media.service.ts` | MODIFY (absorb connection tracking) |
| `device.orchestrator.ts` | MODIFY (replace `deviceService` with `deviceMediaService` + `deviceStorageService`) |
| `device-operation-sequencer.service.ts` | MODIFY (replace `deviceService` with `deviceMediaService`) |
| `streaming.service.ts` | MODIFY (replace `deviceService` with `deviceMediaService` + `deviceStorageService`) |
| `app-state.ts` | MODIFY (replace `deviceService` with `deviceMediaService` for `isConnected`) |
| `register-devices.ts` | MODIFY (remove facade + connection registrations) |
| `register-streaming.ts` | MODIFY (update StreamingService deps) |
| `register-ui.ts` | MODIFY (update AppState deps) |
| `register-orchestrators.ts` | MODIFY (update DeviceOrchestrator deps) |
| `renderer-container-map.type.ts` | MODIFY (remove deviceService, deviceConnectionService) |

### The `updateDeviceStatus()` Cross-Service Coordination

Currently in the facade:
```typescript
async updateDeviceStatus() {
  const { status, changed } = await this.deviceConnectionService.updateConnectionStatus();
  if (changed) {
    this.deviceMediaService.invalidateEnumerationCache();
  }
  return status;
}
```

After absorbing connection into DeviceMediaService, this becomes internal:
```typescript
async updateConnectionStatus() {
  const status = await this.deviceStatusProvider.getDeviceStatus();
  const connected = status.connected;
  const changed = this._isConnected !== connected;
  this._isConnected = connected;
  if (changed) {
    this.invalidateEnumerationCache();
    this.eventBus.publish(EventChannels.DEVICE.STATUS_CHANGED, status);
  }
  return { status, changed };
}
```

### Test Files Affected

| Test | Action |
|------|--------|
| `tests/unit/features/devices/services/device.service.test.js` | DELETE (tests facade) |
| `tests/unit/features/devices/services/device-connection.service.test.js` | DELETE or MERGE into media service tests |
| `tests/unit/features/devices/services/device.orchestrator.test.js` | MODIFY (update mock deps) |
| `tests/unit/features/devices/services/device-operation-sequencer.service.test.js` | MODIFY (update mock deps) |

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| `StreamingService` uses 5 facade methods | HIGH | Must verify all methods exist on sub-services; `enumerateDevices`, `discoverSupportedDevice`, `registerSupportedDevice` are on DeviceMediaService; `getRegisteredStoredDeviceIds` is on DeviceStorageService |
| `setupDeviceChangeListener()` passes callback | MEDIUM | This callback calls `updateDeviceStatus()` which is cross-service coordination; must be absorbed into DeviceMediaService |
| `AppState.isConnected` derivation | LOW | Simple getter swap |
| DeviceMediaService already depends on DeviceConnectionService | LOW | Absorbing eliminates the dependency entirely |
| `DeviceOperationSequencerService` calls `deviceService.updateDeviceStatus()` + `deviceService.enumerateDevices()` | MEDIUM | Both become methods on DeviceMediaService after absorption |

---

## 5. Other Domains Analysis

### 5a. TranscodeService

**Location:** `src/renderer/infrastructure/services/transcode/transcode.service.ts` (229 lines)

**Assessment: NOT thin. Keep as-is.**

TranscodeService is a full IPC bridge with:
- State tracking (`_isTranscoding`, `_activeJobId`)
- IPC listener lifecycle management (5 listeners)
- Blob-to-ArrayBuffer conversion
- Error handling with state rollback
- Called by `CaptureSaveService` and `CaptureOrchestrator`
- Initialized directly in `RendererAppOrchestrator._initializeUIEventBridge()`

This is a proper service with real logic, not a thin wrapper.

### 5b. StreamingViewService

**Location:** `src/renderer/infrastructure/services/streaming/streaming-view.service.ts` (136 lines)

**Assessment: Legitimate abstraction. Keep as-is.**

StreamingViewService wraps `uiController.elements.streamVideo` and `uiController.elements.streamCanvas` with null-checking, logging, and muting logic. It is consumed by:

| Consumer | Methods Used |
|----------|-------------|
| `StreamingOrchestrator` | `attachMutedStream()`, `clearStream()` |
| `StreamingAudioOrchestrator` | `setMuted()` |
| `CaptureOrchestrator` | `getCanvas()`, `getVideo()` |
| `StreamingRenderPipelineService` | `getVideo()`, `getCanvas()`, `getCanvasContainer()`, `getCanvasSection()`, `setCanvas()` |
| `StreamingCanvasLifecycleService` | `getCanvas()`, `getCanvasContainer()`, `getCanvasSection()`, `setCanvas()` |

It is used by 5 different consumers accessing 8 different methods. This is not a thin facade -- it provides a consistent, null-safe abstraction over DOM elements that prevents every consumer from independently checking for null elements. It also provides the `setCanvas()` method for canvas recreation (WebGPU context loss recovery).

### 5c. CaptureSaveService

**Location:** `src/renderer/infrastructure/services/capture/capture-save.service.ts` (146 lines)

**Assessment: Legitimate service. Keep as-is.**

CaptureSaveService has real business logic:
- Determines save strategy based on user's recording format preference
- Routes to direct download (webm) vs transcode pipeline (mp4/mov)
- Adds FFmpeg error-recovery flags (`-fflags +genpts -err_detect ignore_err`) for interrupted recordings
- Coordinates between SettingsService and TranscodeService

This is not a thin wrapper. It owns the "should we transcode?" decision and the format-specific FFmpeg configuration.

### 5d. Notes Domain

**Location:** `src/renderer/infrastructure/services/notes/notes.service.ts` (331 lines)

**Assessment: Self-contained. No consolidation needed.**

NotesService is a single, well-scoped service with:
- CRUD operations with localStorage persistence
- In-memory cache with invalidation
- Fuzzy search with scoring
- Game-based grouping

No orchestrator wraps it. No facade delegates to it. Clean.

### 5e. Streaming Domain

**Assessment: No consolidation candidates.**

The streaming domain has 13 service files but each owns distinct GPU/rendering/health/viewport/audio concerns. The services interact via well-defined interfaces:

- `StreamingService` - stream acquisition state machine
- `StreamingRenderPipelineService` - renderer strategy selection (341 lines)
- `StreamingGpuRendererService` - WebGPU/WebGL2 rendering (heavy)
- `StreamingCanvasRenderer` - Canvas2D fallback
- `StreamingGpuRenderLoopService` - RAF/RVFC frame scheduling
- `StreamingHealthService` - frame delivery verification
- `StreamingViewportService` - resize/scale calculations
- `StreamingCanvasLifecycleService` - canvas recreation for WebGPU
- `StreamingAudioPipelineService` - Web Audio API pipeline
- `GpuFrameBuffer` - GPU frame buffer management
- `GpuWorkerManager` - OffscreenCanvas worker lifecycle

All substantive with distinct responsibilities.

### 5f. Capture Domain

**Assessment: No consolidation candidates.**

- `CaptureService` - MediaRecorder management, screenshot via canvas
- `CaptureGpuRecordingService` - GPU-based recording pipeline with frame loop
- `CaptureSaveService` - Save coordination with optional transcode

Three services, three distinct responsibilities.

---

## 6. Cross-Domain: Dead Code / Unused Registrations

### Findings

**1. `deviceService.isDeviceConnected()` vs `deviceService.isConnected` (getter)**

`DeviceService` has both:
- `get isConnected` (line 32) - used by `AppState`
- `isDeviceConnected()` (line 44) - used by `DeviceOrchestrator`

Both delegate to `deviceConnectionService.isConnected`. The method `isDeviceConnected()` is redundant and should be consolidated to just the getter when the facade is removed.

**2. `DeviceOrchestrator.isDeviceConnected()` is never called externally**

The `isDeviceConnected()` method on `DeviceOrchestrator` (line 49-51) delegates to `deviceService.isDeviceConnected()`. Searching the codebase:

```
Grep: DeviceOrchestrator.*isDeviceConnected -> only the definition itself
```

This method appears to be dead code on the orchestrator level. No other file calls `deviceOrchestrator.isDeviceConnected()`.

**3. `animationCache` registration**

`animationCache` is registered in `register-infrastructure.ts` (line 83-85) as `new AnimationCache()`. It is injected into `canvasRenderer`. This is a live dependency, not dead.

**4. All bridge registrations are live**

`uiEventBridge`, `captureUiBridge`, `transcodeUiBridge` are all resolved and initialized in `RendererAppOrchestrator._initializeUIEventBridge()`.

**5. `uiEffects` registration**

`uiEffects` is registered and resolved in `RendererAppOrchestrator._initializeUI()` (line 190). Its `elements` property is assigned afterward. Live dependency.

### Summary: Dead/Redundant Code Found

| Item | Location | Status |
|------|----------|--------|
| `DeviceService.isDeviceConnected()` method | `device.service.ts:44` | Redundant (same as `get isConnected`) |
| `DeviceOrchestrator.isDeviceConnected()` | `device.orchestrator.ts:49` | Likely dead (never called externally) |
| Hand-rolled `_subscriptions` + `dispose()` in 4 bridges | All bridge files | Will be eliminated by LifecycleService migration |

---

## 7. Summary: Consolidation Impact

### Files Deleted

| Domain | Files | Total Lines Removed |
|--------|-------|-------------------|
| Update | 1 (`update.orchestrator.ts`) | ~62 |
| Settings | 1 (`cinematic-mode.service.ts`) | ~24 |
| Performance | 3 (3 orchestrators) | ~174 |
| Device | 2 (`device.service.ts`, `device-connection.service.ts`) | ~120 |
| **Total** | **7 files** | **~380 lines** |

### Files Created

| Domain | Files | Est. Lines |
|--------|-------|-----------|
| Performance | 1 (`performance.orchestrator.ts`) | ~100 |

### Net Change: -6 files, ~280 lines saved

### Test Impact

| Action | Count |
|--------|-------|
| Test files to DELETE | 4-5 (orchestrator tests for deleted orchestrators) |
| Test files to CREATE | 1 (merged performance orchestrator tests) |
| Test files to MODIFY | 6-8 (consumer tests that reference deleted services) |

### Cross-Cutting: DI Registration Reduction

Every deleted file removes 5-10 lines from DI registration files (import + registration block). With 7 files deleted and auto-wiring applied:
- `register-orchestrators.ts`: ~40 lines saved (3 orchestrator registrations removed + deps updated)
- `register-devices.ts`: ~15 lines saved (2 registrations removed)
- `register-ui.ts`: ~5 lines saved (rename)
- `renderer-container-map.type.ts`: ~5 lines saved (entries removed)

---

## 8. Dependency/Phase Ordering for Implementation

### Phase 2a (Update Domain)
**Prerequisites:** Phase 1 (LifecycleService exists)
**Blocking:** None
**Risk:** LOW

### Phase 2b (Settings Domain)
**Prerequisites:** None
**Blocking:** None
**Risk:** LOW

### Phase 2c (Performance Domain)
**Prerequisites:** None
**Blocking:** None
**Risk:** MEDIUM (initialization order sensitivity)

### Phase 2d (Device Domain)
**Prerequisites:** None
**Blocking:** None (no cross-domain dependency on facade)
**Risk:** HIGH (5 consumers of facade, 2 consumers of connection service, cross-service coordination logic)

**Recommended execution order:** 2b (simplest) -> 2a -> 2c -> 2d (most complex)

All four phases are independent of each other and can theoretically run in parallel, but the device domain has the most consumer rewiring and should be done last or with extra validation.
