# Deep Dive: DI Container, Registration Files, and Auto-Wiring Feasibility

**Date:** 2026-02-11
**Branch:** `codex/gpu-package-consolidation-v2`
**Context:** Research for codebase consolidation design (Section 2: DI Auto-Wiring)

---

## 1. File Inventory and Line Counts

### Source Files

| File | Lines | Purpose |
|------|-------|---------|
| `src/renderer/infrastructure/di/service-container.factory.ts` | 169 | ServiceContainer implementation |
| `src/renderer/application/container.ts` | 69 | Composition shell (calls all 6 register functions) |
| `src/renderer/application/di/register-infrastructure.ts` | 214 | Infrastructure registrations (22 services) |
| `src/renderer/application/di/register-devices.ts` | 68 | Device registrations (6 services) |
| `src/renderer/application/di/register-streaming.ts` | 13 | Streaming registration (1 service) |
| `src/renderer/application/di/register-capture.ts` | 40 | Capture registrations (4 services) |
| `src/renderer/application/di/register-ui.ts` | 220 | UI registrations (14 services) |
| `src/renderer/application/di/register-orchestrators.ts` | 288 | Orchestrator registrations (17 services) |
| `src/renderer/application/di/renderer-container-map.type.ts` | 80 | Type map for all container keys |
| `src/renderer/application/di/registrable-container.type.ts` | 9 | Narrow type for registration functions |
| **Subtotal (source)** | **1180** | |

### Test Files

| File | Lines | Purpose |
|------|-------|---------|
| `tests/unit/app/renderer/container.test.js` | 971 | Container registration verification |

### Grand Total: 2151 lines across 11 files

---

## 2. ServiceContainer Implementation Analysis

**File:** `src/renderer/infrastructure/di/service-container.factory.ts` (169 lines)

### Architecture

The container is a custom, lightweight DI container with three capabilities:

1. **`registerSingleton(name, ClassOrValue, dependencies[])`** -- Registers a factory function or class with a dependency list. The `isClass` flag is set to `true` for any `typeof === 'function'`, meaning ALL registrations (including factory functions passed as lambdas) are treated as constructable. This is a **critical behavioral detail**: the container calls `new factory(...resolvedDeps)` on everything, including plain functions.

2. **`register(services: Record<string, Factory | ValueRegistration>)`** -- Batch registration. ValueRegistrations bypass lazy resolution and go directly into `_instances`. Non-value entries delegate to `registerSingleton` with no dependencies.

3. **`resolve(name)`** -- Lazy singleton resolution with circular dependency detection via `_resolutionStack`. Dependencies are resolved positionally and passed as constructor/function arguments.

### Key Design Decisions

- **Positional argument resolution**: Dependencies are resolved to an array and spread into the constructor. This is why every registration file wraps the call in a factory function that converts positional args to a dependency object.
- **No auto-wiring**: The container has no knowledge of class metadata. It relies entirely on the explicit `dependencies[]` array.
- **Circular dependency detection**: Tracks `_resolutionStack` as a simple array. If `name` appears in the stack during resolution, it throws with the full cycle path.
- **Singleton-only**: No transient or scoped lifetimes. Every resolved instance is cached in `_instances`.
- **Dispose**: Iterates all cached instances, calling `dispose()` if present. No ordering guarantees.

### The `isClass` Problem

Lines 57-58: `const isClass = typeof ClassOrValue === 'function';`

This means **every** factory function passed to `registerSingleton` is invoked with `new`, not as a plain function call. This actually works because:
- Calling `new` on a regular function returns the function's return value if it returns an object (JavaScript specification behavior).
- Every registration currently passes a factory function that returns `new SomeClass(...)`, so `new factoryFn(...deps)` returns the inner object, not a wrapper.

However, this is fragile. The proposed `autoRegister()` method should use `new Class(depsObj)` directly rather than going through this `isClass` path, to avoid the double-`new` issue.

---

## 3. Registration File Analysis: Complete Inventory

### 3a. `register-infrastructure.ts` (214 lines, 22 registrations)

| # | Name | Class | Constructor Pattern | autoRegister? | Reason |
|---|------|-------|-------------------|---------------|--------|
| 1 | `eventBus` | `EventBus` | `{ loggerFactory }` dep-object | YES | Standard dep-object constructor |
| 2 | `loggerFactory` | `RendererLogger` | No-arg constructor | YES (trivial) | Zero-dep, but still fits pattern |
| 3 | `storageService` | `BrowserStorageAdapter` | `{ protectedKeys }` options-object | **NO** | Custom config: `PROTECTED_STORAGE_KEYS` injected as `protectedKeys`, not a container key |
| 4 | `browserMediaService` | `BrowserMediaAdapter` | No-arg constructor | YES (trivial) | Zero-dep |
| 5 | `visibilityAdapter` | `VisibilityAdapter` | No-arg constructor | YES (trivial) | Zero-dep |
| 6 | `userActivityAdapter` | `UserActivityAdapter` | No-arg constructor | YES (trivial) | Zero-dep |
| 7 | `reducedMotionAdapter` | `ReducedMotionAdapter` | No-arg constructor | YES (trivial) | Zero-dep |
| 8 | `metricsAdapter` | `MetricsAdapter` | No-arg constructor | YES (trivial) | Zero-dep |
| 9 | `deviceIpcAdapter` | `DeviceIpcAdapter` | `{ logger }` (pre-created logger) | **NO** | Calls `loggerFactory.create('DeviceIpcAdapter')` and passes the result as `logger`, not `loggerFactory` |
| 10 | `deviceChangeDebounceAdapter` | `DeviceChangeDebounceAdapter` | `{ browserMediaService, logger }` | **NO** | Same issue: pre-creates logger via `loggerFactory.create(...)`, also renames the dependency |
| 11 | `animationCache` | `AnimationCache` | No-arg constructor | YES (trivial) | Zero-dep |
| 12 | `canvasRenderer` | `StreamingCanvasRenderer` | Positional: `(logger, animationCache)` | **NO** | Uses **positional** args, not dep-object. Also pre-creates `logger` |
| 13 | `viewportService` | `StreamingViewportService` | `{ loggerFactory }` dep-object | YES | Standard dep-object via BaseService |
| 14 | `canvasLifecycleService` | `StreamingCanvasLifecycleService` | `{ streamViewService, canvasRenderer, ... }` dep-object | YES | Standard dep-object via BaseService |
| 15 | `gpuRenderLoopService` | `StreamingGpuRenderLoopService` | `{ loggerFactory }` dep-object | YES | Standard dep-object via BaseService |
| 16 | `streamHealthService` | `StreamingHealthService` | `{ loggerFactory }` dep-object | YES | Standard dep-object via BaseService |
| 17 | `gpuFrameBuffer` | `GpuFrameBuffer` | `{ loggerFactory }` dep-object | YES | Standard dep-object via BaseService |
| 18 | `gpuWorkerManager` | `GpuWorkerManager` | `{ loggerFactory, eventBus }` dep-object | YES | Standard dep-object via BaseService |
| 19 | `gpuRendererService` | `StreamingGpuRendererService` | `{ eventBus, loggerFactory, settingsService, ... }` dep-object | YES | Extends BaseService, standard pattern |
| 20 | `streamingRendererFactory` | `StreamingRendererFactory` | Positional: `(eventBus, loggerFactory, rendererClasses)` + `.initialize()` | **NO** | Positional args, constructs `Map` of renderer classes, calls `initialize()` post-construction |
| 21 | `renderPipelineService` | `StreamingRenderPipelineService` | `{ appState, streamViewService, ... }` dep-object | YES | Standard dep-object via BaseService |
| 22 | `ipcClient` | `window.deviceAPI` | N/A (raw value) | **NO** | Runtime guard (`if (!window.deviceAPI) throw`), returns external global |
| 23 | `deviceStatusProvider` | `DeviceIpcStatusAdapter` | Positional: `(ipcClient)` | **NO** | Extends abstract class `IDeviceStatusProvider`, positional constructor arg |

**autoRegister candidates:** 15 of 23
**Custom factory required:** 8 of 23

### 3b. `register-devices.ts` (68 lines, 6 registrations)

| # | Name | Class | Constructor Pattern | autoRegister? | Reason |
|---|------|-------|-------------------|---------------|--------|
| 1 | `adapterFactory` | `StreamingAdapterFactory` | Positional: `(eventBus, loggerFactory, browserMediaService, adapterClasses)` + `.initialize()` | **NO** | Positional args, constructs `Map` of adapter classes, calls `initialize()` post-construction |
| 2 | `deviceStorageService` | `DeviceStorageService` | `{ storageService, loggerFactory }` dep-object | YES | Standard dep-object via BaseService |
| 3 | `deviceConnectionService` | `DeviceConnectionService` | `{ eventBus, loggerFactory, deviceStatusProvider }` dep-object | YES | Standard dep-object via BaseService |
| 4 | `deviceMediaService` | `DeviceMediaService` | `{ eventBus, loggerFactory, ... }` dep-object | YES | Standard dep-object via BaseService |
| 5 | `deviceService` | `DeviceService` | `{ eventBus, loggerFactory, ... }` dep-object | YES | Standard dep-object via BaseService |
| 6 | `deviceOperationSequencer` | `DeviceOperationSequencerService` | `{ deviceService, eventBus, loggerFactory }` dep-object | YES | Standard dep-object via BaseService |

**autoRegister candidates:** 5 of 6
**Custom factory required:** 1 of 6

### 3c. `register-streaming.ts` (13 lines, 1 registration)

| # | Name | Class | Constructor Pattern | autoRegister? | Reason |
|---|------|-------|-------------------|---------------|--------|
| 1 | `streamingService` | `StreamingService` | `{ deviceService, eventBus, loggerFactory, ... }` dep-object | YES | Standard dep-object via BaseService |

**autoRegister candidates:** 1 of 1

### 3d. `register-capture.ts` (40 lines, 4 registrations)

| # | Name | Class | Constructor Pattern | autoRegister? | Reason |
|---|------|-------|-------------------|---------------|--------|
| 1 | `captureService` | `CaptureService` | `{ eventBus, loggerFactory }` dep-object | YES | Standard dep-object via BaseService |
| 2 | `gpuRecordingService` | `CaptureGpuRecordingService` | `{ gpuRendererService, eventBus, loggerFactory }` dep-object | YES | Standard dep-object via BaseService |
| 3 | `transcodeService` | `TranscodeService` | `{ eventBus, loggerFactory }` dep-object | YES | Standard dep-object via BaseService |
| 4 | `captureSaveService` | `CaptureSaveService` | `{ eventBus, settingsService, transcodeService, loggerFactory }` dep-object | YES | Standard dep-object via BaseService |

**autoRegister candidates:** 4 of 4

### 3e. `register-ui.ts` (220 lines, 14 registrations)

| # | Name | Class | Constructor Pattern | autoRegister? | Reason |
|---|------|-------|-------------------|---------------|--------|
| 1 | `settingsService` | `SettingsService` | `{ eventBus, loggerFactory, storageService }` dep-object | YES | Standard dep-object via BaseService |
| 2 | `notesService` | `NotesService` | `{ eventBus, loggerFactory, storageService }` dep-object | YES | Standard dep-object via BaseService |
| 3 | `updateService` | `UpdateService` | `{ eventBus, loggerFactory }` dep-object | YES | Standard dep-object via BaseService |
| 4 | `updateUiService` | `UpdateUiService` | `{ eventBus, loggerFactory }` dep-object | YES | Standard dep-object via BaseService |
| 5 | `streamViewService` | `StreamingViewService` | `{ uiController, loggerFactory }` dep-object | YES | Standard dep-object via BaseService |
| 6 | `streamingAudioPipelineService` | `StreamingAudioPipelineService` | `{ eventBus, loggerFactory, settingsService }` dep-object | YES | Standard dep-object via BaseService |
| 7 | `appState` | `AppState` | `{ streamingService, deviceService, eventBus }` dep-object | YES | Direct dep-object (no BaseService, but compatible pattern) |
| 8 | `uiComponentRegistry` | `UIComponentRegistry` | `{ componentDefinitions, loggerFactory }` | **NO** | Complex factory: builds 7 inline component definitions with closures over element/dependency maps. Cannot be expressed as static deps |
| 9 | `uiEffects` | `UIEffects` | `{ elements, bodyClassManager }` | **NO** | Passes `elements: null` as a hardcoded value (not a container key) |
| 10 | `bodyClassManager` | `BodyClassManager` | No-arg constructor | YES (trivial) | Zero-dep |
| 11 | `uiEventBridge` | `UIEventBridge` | `{ eventBus, uiController, presentationModeService, loggerFactory }` dep-object | YES | Standard dep-object via BaseService |
| 12 | `presentationModeService` | `PresentationModeService` | `{ uiController, appState, loggerFactory }` dep-object | YES | Standard dep-object via BaseService |
| 13 | `captureUiBridge` | `CaptureUIBridge` | `{ eventBus, uiController, loggerFactory }` dep-object | YES | Standard dep-object via BaseService |
| 14 | `transcodeUiBridge` | `TranscodeUIBridge` | `{ eventBus, uiController, loggerFactory }` dep-object | YES | Standard dep-object via BaseService |

**autoRegister candidates:** 12 of 14
**Custom factory required:** 2 of 14

### 3f. `register-orchestrators.ts` (288 lines, 17 registrations)

| # | Name | Class | Constructor Pattern | autoRegister? | Reason |
|---|------|-------|-------------------|---------------|--------|
| 1 | `deviceOrchestrator` | `DeviceOrchestrator` | dep-object via BaseOrchestrator | YES | Standard pattern |
| 2 | `streamingAudioOrchestrator` | `StreamingAudioOrchestrator` | dep-object via BaseOrchestrator | YES | Standard pattern |
| 3 | `streamingOrchestrator` | `StreamingOrchestrator` | dep-object via BaseOrchestrator | YES | Standard pattern |
| 4 | `captureOrchestrator` | `CaptureOrchestrator` | dep-object via BaseOrchestrator | YES | Standard pattern |
| 5 | `preferencesOrchestrator` | `SettingsPreferencesOrchestrator` | dep-object via BaseOrchestrator | YES | Standard pattern |
| 6 | `fullscreenService` | `SettingsFullscreenService` | `{ eventBus, loggerFactory }` dep-object | YES | Standard dep-object via BaseService |
| 7 | `cinematicModeService` | `SettingsCinematicModeService` | `{ appState, eventBus, loggerFactory }` dep-object | YES | Standard dep-object via BaseService |
| 8 | `displayModeOrchestrator` | `SettingsDisplayModeOrchestrator` | dep-object via BaseOrchestrator | YES | Standard pattern |
| 9 | `updateOrchestrator` | `UpdateOrchestrator` | dep-object via BaseOrchestrator | YES | Standard pattern |
| 10 | `performanceStateOrchestrator` | `PerformanceStateOrchestrator` | dep-object via BaseOrchestrator | YES | Standard pattern |
| 11 | `animationPerformanceOrchestrator` | `PerformanceAnimationOrchestrator` | dep-object via BaseOrchestrator | YES | Standard pattern |
| 12 | `performanceMetricsService` | `PerformanceMetricsService` | `{ loggerFactory, metricsAdapter }` dep-object | YES | Standard dep-object via BaseService |
| 13 | `performanceStateService` | `PerformanceStateService` | `{ loggerFactory, ... }` dep-object | YES | Standard dep-object via BaseService |
| 14 | `animationPerformanceService` | `PerformanceAnimationService` | `{ loggerFactory }` dep-object | YES | Standard dep-object via BaseService |
| 15 | `performanceMetricsOrchestrator` | `PerformanceMetricsOrchestrator` | dep-object via BaseOrchestrator | YES | Standard pattern |
| 16 | `uiSetupOrchestrator` | `UISetupOrchestrator` | dep-object via BaseOrchestrator | YES | Standard pattern |
| 17 | `appOrchestrator` | `AppOrchestrator` | dep-object via BaseOrchestrator | YES | Standard pattern |

**autoRegister candidates:** 17 of 17
**Custom factory required:** 0 of 17

---

## 4. Summary: autoRegister Eligibility

| File | Total Registrations | autoRegister Eligible | Custom Factory Required |
|------|--------------------|-----------------------|------------------------|
| `register-infrastructure.ts` | 23 | 15 | 8 |
| `register-devices.ts` | 6 | 5 | 1 |
| `register-streaming.ts` | 1 | 1 | 0 |
| `register-capture.ts` | 4 | 4 | 0 |
| `register-ui.ts` | 14 | 12 | 2 |
| `register-orchestrators.ts` | 17 | 17 | 0 |
| **Total** | **65** | **54** | **11** |

### The 11 Custom Factory Registrations

These cannot use `autoRegister()` due to non-standard constructor patterns or custom factory logic:

| # | Name | File | Reason |
|---|------|------|--------|
| 1 | `storageService` | infrastructure | Passes `{ protectedKeys: PROTECTED_STORAGE_KEYS }` config, not a container dependency |
| 2 | `deviceIpcAdapter` | infrastructure | Pre-creates `logger` from `loggerFactory.create()`, passes `{ logger }` instead of `{ loggerFactory }` |
| 3 | `deviceChangeDebounceAdapter` | infrastructure | Pre-creates `logger` from `loggerFactory.create()`, passes `{ browserMediaService, logger }` |
| 4 | `canvasRenderer` | infrastructure | Positional constructor args `(logger, animationCache)`, pre-creates logger |
| 5 | `streamingRendererFactory` | infrastructure | Positional args, constructs `Map` of renderer classes, calls `initialize()` after construction |
| 6 | `ipcClient` | infrastructure | Runtime guard for `window.deviceAPI`, returns external global (not a class) |
| 7 | `deviceStatusProvider` | infrastructure | Positional constructor arg `(ipcClient)`, extends abstract base class |
| 8 | `adapterFactory` | devices | Positional args, constructs `Map` of adapter classes, calls `initialize()` after construction |
| 9 | `uiComponentRegistry` | ui | Complex factory with 7 inline component definitions, closures, conditional logic |
| 10 | `uiEffects` | ui | Passes hardcoded `elements: null` value alongside container dependency |
| 11 | Total: 8 in infrastructure, 1 in devices, 2 in ui | | |

### Common Non-Standard Patterns

1. **Pre-created logger** (3 registrations: `deviceIpcAdapter`, `deviceChangeDebounceAdapter`, `canvasRenderer`): These classes accept a `logger` instance, not a `loggerFactory`. The factory calls `loggerFactory.create('ClassName')` and passes the result. This pattern exists because these classes are **not** BaseService subclasses and do not auto-create their own logger.

2. **Positional constructor args** (4 registrations: `canvasRenderer`, `streamingRendererFactory`, `deviceStatusProvider`, `adapterFactory`): These classes use traditional positional args instead of the dependency-object pattern. `autoRegister()` assumes all classes accept `new Class(depsObject)`.

3. **Post-construction initialization** (2 registrations: `streamingRendererFactory`, `adapterFactory`): Both call `.initialize()` after `new`. This could be handled by an `autoRegisterWithInit()` variant, but is probably cleaner kept as custom factories.

4. **Injected class maps** (2 registrations: `streamingRendererFactory`, `adapterFactory`): Both construct a `Map<string, Class>` of strategy classes. This is a strategy pattern configured at boot time.

5. **Runtime environment guard** (1 registration: `ipcClient`): Checks `window.deviceAPI` existence at resolution time.

6. **Complex factory with inline definitions** (1 registration: `uiComponentRegistry`): Builds 7 component definitions with closures over DOM elements and service dependencies. This is inherently complex and cannot be simplified.

---

## 5. Line Elimination Estimate

### Method: Per-Registration Savings

A typical `registerSingleton` block for an autoRegister-eligible service looks like:

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

This is 9 lines. It would become: `container.autoRegister('streamingOrchestrator', StreamingOrchestrator);` (1 line).

**Savings per registration:**
- Large registrations (5+ deps, multi-line): 6-12 lines saved, avg ~8
- Medium registrations (2-4 deps): 4-6 lines saved, avg ~5
- Small/zero-dep registrations: 2-4 lines saved, avg ~3

### Detailed Calculation

**register-orchestrators.ts** (17 registrations, all eligible):
- `appOrchestrator`: 13 deps, ~16 lines -> 1 line = **15 saved**
- `streamingOrchestrator`: 8 deps, ~10 lines -> 1 = **9**
- `captureOrchestrator`: 10 deps, ~11 lines -> 1 = **10**
- `uiSetupOrchestrator`: 7 deps, ~12 lines -> 1 = **11**
- `displayModeOrchestrator`: 5 deps, ~8 lines -> 1 = **7**
- `deviceOrchestrator`: 5 deps, ~8 lines -> 1 = **7**
- `streamingAudioOrchestrator`: 5 deps, ~8 lines -> 1 = **7**
- `preferencesOrchestrator`: 4 deps, ~7 lines -> 1 = **6**
- `updateOrchestrator`: 3 deps, ~7 lines -> 1 = **6**
- `performanceStateOrchestrator`: 3 deps, ~7 lines -> 1 = **6**
- `animationPerformanceOrchestrator`: 4 deps, ~7 lines -> 1 = **6**
- `performanceMetricsOrchestrator`: 3 deps, ~7 lines -> 1 = **6**
- `fullscreenService`: 2 deps, ~5 lines -> 1 = **4**
- `cinematicModeService`: 3 deps, ~5 lines -> 1 = **4**
- `performanceMetricsService`: 2 deps, ~5 lines -> 1 = **4**
- `performanceStateService`: 4 deps, ~7 lines -> 1 = **6**
- `animationPerformanceService`: 1 dep, ~5 lines -> 1 = **4**
- **Subtotal: ~116 lines saved** (file goes from 288 to ~172; but also loses 16 import statements that become shared, offset by autoRegister still needing the class imports)

Actually, imports stay regardless -- they are needed for the class reference. Let me recalculate more precisely by counting only the function body savings (removing the function wrapper, dep array duplication, and dep-object construction).

**Precise line-by-line count across all 6 files:**

| File | Current Lines | Eligible Registrations | Lines in Custom Factories | Est. Post-Conversion Lines | Lines Saved |
|------|--------------|----------------------|--------------------------|---------------------------|-------------|
| `register-infrastructure.ts` | 214 | 15 | ~72 (8 custom factories stay) | ~105 | **~109** |
| `register-devices.ts` | 68 | 5 | ~12 (1 custom factory stays) | ~23 | **~45** |
| `register-streaming.ts` | 13 | 1 | 0 | ~6 | **~7** |
| `register-capture.ts` | 40 | 4 | 0 | ~12 | **~28** |
| `register-ui.ts` | 220 | 12 | ~95 (2 custom factories stay) | ~123 | **~97** |
| `register-orchestrators.ts` | 288 | 17 | 0 | ~48 | **~240** |
| **Total** | **843** | **54** | **~179** | **~317** | **~526** |

### Summary

- **Estimated lines eliminated from registration files: ~526**
- **Lines added to ServiceContainer for `autoRegister()`: ~15**
- **Lines added across 54 classes for `static dependencies`: ~108** (2 lines per class: declaration + `as const`)
- **Net reduction: ~526 - 15 - 108 = ~403 lines**

The design doc estimate of "~500 lines" is close but slightly optimistic. The precise net is closer to **~400 lines** when accounting for the static `dependencies` declarations that must be added to each class.

---

## 6. ServiceContainer: `autoRegister()` Implementation Notes

### Required Signature

```ts
autoRegister<K extends keyof TMap>(
  name: K,
  Class: { readonly dependencies: readonly string[]; new (deps: Record<string, unknown>): TMap[K] }
): ServiceContainer<TServices>
```

### Key Implementation Details

1. **Must NOT go through the `isClass` path for the factory.** The current `registerSingleton` treats all functions as `isClass: true`, which would double-`new` the class. `autoRegister` should register a **factory function** (not the class itself) so the container calls `factory(...resolvedDeps)` and the factory does the single `new Class(depsObj)`.

2. **Dependency object construction**: Map from `Class.dependencies` array to resolved values, building the `{ depName: resolvedValue }` object that BaseService/BaseOrchestrator constructors expect.

3. **`RegistrableContainer` type needs updating**: Currently only exposes `registerSingleton`. Must also expose `autoRegister` for the registration functions to call it.

### Proposed Implementation

```ts
autoRegister<K extends keyof TServices & string>(
  name: K,
  Class: AutoRegistrable<TServices[K]>
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

**Warning**: Because `registerSingleton` sets `isClass: true` for functions, the factory wrapper will be called with `new`. This works (the returned object from the inner `new Class(depsObj)` overrides the outer `new`), but it is semantically wrong. A cleaner fix would be to add an `isClass: false` override or a separate internal registration path.

---

## 7. Container Test Impact Analysis

**File:** `tests/unit/app/renderer/container.test.js` (971 lines)

### Current Test Strategy

The test file uses a **mock ServiceContainer** (lines 8-19) where `registerSingleton` is a `vi.fn()`. Tests verify:

1. **Registration verification** (lines 377-585): Assert that `registerSingleton` was called with the correct `(name, factory, deps)` tuples. 20+ individual `it()` blocks check specific registrations.

2. **Key set completeness** (lines 587-660): One comprehensive test checks that the **set of all registered keys** matches an expected set of 56 keys. This is the most valuable test.

3. **Factory invocation tests** (lines 765-970): Extract individual factory functions from mock calls and invoke them with mock dependencies to verify they produce defined instances.

### How autoRegister Changes Tests

**Registration verification tests (20+ tests):**
- Tests that check `container.registerSingleton.toHaveBeenCalledWith('name', fn, ['dep1', ...'])` would need to change.
- If `autoRegister` is added to `ServiceContainer`, tests should verify `container.autoRegister.toHaveBeenCalledWith('name', ClassName)` instead.
- The mock container must expose an `autoRegister` mock: `this.autoRegister = vi.fn();`
- Alternatively, if `autoRegister` delegates to `registerSingleton` internally, the existing `registerSingleton` spy still captures calls -- but the deps array and factory function shape will differ.

**Key set completeness test:**
- This test extracts names from `registerSingleton.mock.calls`. If some registrations use `autoRegister`, both mock call arrays must be merged: `[...registerSingleton.mock.calls, ...autoRegister.mock.calls].map(([name]) => name)`.
- This is the **highest-value** test and must be preserved.

**Factory invocation tests:**
- These directly call `factoryFn(mockDep1, mockDep2)` extracted from `registerSingleton.mock.calls`. For autoRegistered services, there is no user-written factory function to test -- the factory is generated internally. These tests would either be removed (the auto-wiring is tested once at the `ServiceContainer` level) or replaced with integration-style tests that call `container.resolve('name')`.

### Recommended Test Migration

1. **Keep the key set completeness test**, adapted to merge `registerSingleton` and `autoRegister` calls.
2. **Remove per-registration verification tests** for autoRegistered services (the verification is now that `static dependencies` on the class is correct, which is tested by the class's own unit tests).
3. **Keep factory invocation tests** only for the 11 custom factory registrations.
4. **Add one integration-style test** that uses a real `ServiceContainer`, registers all services, and resolves `appOrchestrator` to verify the full dependency graph resolves without circular dependency errors.

### Estimated Test Impact

- ~20 per-registration verification tests can be simplified or removed
- ~20 factory invocation tests for autoRegistered services can be removed
- ~40 tests removable, ~15 retained (custom factories + key set + integration)
- **Estimated test file reduction: ~400-500 lines** (from 971 to ~450-550)

---

## 8. Main Process DI Container

**File:** `src/main/application/container.ts` (135 lines)

### Architecture

The main process uses **Awilix** (`InjectionMode.PROXY`), a mature, feature-complete DI container. Key differences from the renderer:

| Aspect | Renderer (custom ServiceContainer) | Main (Awilix) |
|--------|-----------------------------------|---------------|
| Library | Custom, 169 lines | Awilix (npm package) |
| Injection mode | Positional args | PROXY (property access) |
| Auto-wiring | None | Built-in via PROXY mode |
| Registration | `registerSingleton(name, factory, deps[])` | `asClass(X).singleton()` or `asValue(x)` |
| Async support | None | None (manual workaround for async init) |
| Scope support | Singletons only | Singleton, transient, scoped |

### Awilix's Built-In Auto-Wiring

With `InjectionMode.PROXY`, Awilix already does what the design doc proposes for the renderer. Example:

```ts
container.register({
  windowService: asClass(WindowService).singleton(),  // No deps list needed
  trayService: asClass(TrayService).singleton(),
});
```

Awilix resolves dependencies by property name at resolution time. The class constructor receives a proxy object where `proxy.eventBus` triggers lazy resolution of the `eventBus` registration.

### Implications for Consolidation

The main process already has auto-wiring. The consolidation effort is **renderer-only**. There is no shared DI container between processes (which is correct -- Electron processes are isolated).

One design consideration: if the renderer's `autoRegister()` approach works well, a future effort could replace Awilix with the custom ServiceContainer in the main process too, eliminating the Awilix dependency entirely. But that is out of scope.

---

## 9. Circular Dependency Risk Analysis

### Current Resolution Order

The container uses **lazy resolution** -- services are only instantiated when `resolve()` is called. Registration order does not matter for correctness, only for readability.

However, the registration files are called in a specific order:

```ts
registerInfrastructure(container);  // 1st: eventBus, loggerFactory, adapters, renderers
registerDevices(container);          // 2nd: device services
registerStreaming(container);        // 3rd: streamingService
registerCapture(container);          // 4th: capture services
registerUi(container);               // 5th: UI services, bridges, appState
registerOrchestrators(container);    // 6th: all orchestrators
```

### Cross-File Dependencies

Services in later files depend on services in earlier files. Let me trace the dependency graph for circular risk:

**Forward dependencies (correct):**
- `register-devices` depends on `register-infrastructure` (eventBus, loggerFactory, browserMediaService, deviceStatusProvider)
- `register-streaming` depends on `register-devices` (deviceService, adapterFactory)
- `register-capture` depends on `register-infrastructure` (eventBus, gpuRendererService) and `register-ui` (settingsService)
- `register-ui` depends on `register-infrastructure` (eventBus, loggerFactory, storageService), `register-streaming` (streamingService), and `register-devices` (deviceService)
- `register-orchestrators` depends on all of the above

**Backward dependency (potential risk):**
- `register-infrastructure` registers `canvasLifecycleService` which depends on `streamViewService`, but `streamViewService` is registered in `register-ui`. This is a **backward reference** (infrastructure depends on UI).
- `register-infrastructure` registers `renderPipelineService` which depends on `appState` and `streamViewService`, both registered in `register-ui`.
- `register-infrastructure` registers `gpuRendererService` which depends on `settingsService`, registered in `register-ui`.

These backward references work because of **lazy resolution** -- the dependency is not resolved at registration time, only when someone calls `container.resolve('canvasLifecycleService')`. By that point, `registerUi` has already run.

### Circular Dependency Check

I traced the full dependency graph and found **no circular dependencies**. The container's circular detection (`_resolutionStack`) has never triggered in production.

However, there is one **near-circular** chain worth noting:

```
appOrchestrator -> streamingOrchestrator -> streamingService -> deviceService
appOrchestrator -> deviceOrchestrator -> deviceService (same instance, no cycle)
```

And:

```
renderPipelineService -> streamingRendererFactory -> (no back-reference)
renderPipelineService -> canvasLifecycleService -> streamViewService (no back-reference)
```

No actual cycles exist.

---

## 10. Misplaced Registrations

### Services in `register-orchestrators.ts`

**File:** `src/renderer/application/di/register-orchestrators.ts`

This file registers 17 items, but **5 of them are services, not orchestrators**:

| Name | Class | Should Be In |
|------|-------|-------------|
| `fullscreenService` | `SettingsFullscreenService` | `register-ui.ts` (settings domain services) |
| `cinematicModeService` | `SettingsCinematicModeService` | `register-ui.ts` (settings domain services) |
| `performanceMetricsService` | `PerformanceMetricsService` | `register-infrastructure.ts` (infrastructure service) |
| `performanceStateService` | `PerformanceStateService` | `register-infrastructure.ts` (infrastructure service) |
| `animationPerformanceService` | `PerformanceAnimationService` | `register-infrastructure.ts` (infrastructure service) |

These services are placed alongside their orchestrator consumers for reading convenience, but this violates the file's stated purpose ("register-orchestrators").

### Services in `register-ui.ts` That Arguably Belong Elsewhere

| Name | Class | Current File | Better Home |
|------|-------|-------------|-------------|
| `settingsService` | `SettingsService` | `register-ui.ts` | Fine -- settings are a UI concern |
| `notesService` | `NotesService` | `register-ui.ts` | Fine -- notes are a UI feature |
| `updateService` | `UpdateService` | `register-ui.ts` | Debatable -- could be `register-infrastructure.ts` |
| `updateUiService` | `UpdateUiService` | `register-ui.ts` | Fine -- UI bridge |
| `streamViewService` | `StreamingViewService` | `register-ui.ts` | Debatable -- "streaming view" straddles streaming and UI |
| `streamingAudioPipelineService` | `StreamingAudioPipelineService` | `register-ui.ts` | **Wrong** -- audio pipeline is infrastructure, not UI |
| `appState` | `AppState` | `register-ui.ts` | **Wrong** -- application state should be in `register-infrastructure.ts` or its own file |

### `register-infrastructure.ts` Scope Creep

This file registers 23 items, many of which are domain-specific streaming services:

| Name | Class | Concern |
|------|-------|---------|
| `canvasRenderer` | `StreamingCanvasRenderer` | Streaming infrastructure |
| `viewportService` | `StreamingViewportService` | Streaming infrastructure |
| `canvasLifecycleService` | `StreamingCanvasLifecycleService` | Streaming infrastructure |
| `gpuRenderLoopService` | `StreamingGpuRenderLoopService` | Streaming infrastructure |
| `streamHealthService` | `StreamingHealthService` | Streaming infrastructure |
| `gpuRendererService` | `StreamingGpuRendererService` | Streaming infrastructure |
| `gpuFrameBuffer` | `GpuFrameBuffer` | Streaming infrastructure |
| `gpuWorkerManager` | `GpuWorkerManager` | Streaming infrastructure |
| `streamingRendererFactory` | `StreamingRendererFactory` | Streaming infrastructure |
| `renderPipelineService` | `StreamingRenderPipelineService` | Streaming infrastructure |

10 out of 23 registrations in `register-infrastructure.ts` are streaming-specific. Meanwhile, `register-streaming.ts` has only 1 registration. These streaming services should arguably be in `register-streaming.ts`.

### Suggested File Reorganization (Out of Scope, But Noted)

If registration files were reorganized by domain:

| File | Registrations | Content |
|------|--------------|---------|
| `register-core.ts` | ~10 | eventBus, loggerFactory, storageService, browserMediaService, adapters, animationCache |
| `register-devices.ts` | ~6 | All device services (unchanged) |
| `register-streaming.ts` | ~12 | StreamingService + all streaming infrastructure (canvas, GPU, pipeline, health, viewport, factories) |
| `register-capture.ts` | ~4 | Capture services (unchanged) |
| `register-settings.ts` | ~6 | SettingsService, fullscreen, cinematic, presentationMode, displayMode orchestrator, preferences orchestrator |
| `register-performance.ts` | ~6 | All 3 performance services + 3 performance orchestrators |
| `register-updates.ts` | ~4 | UpdateService, UpdateUiService, UpdateOrchestrator |
| `register-ui.ts` | ~8 | AppState, uiComponentRegistry, uiEffects, bodyClassManager, bridges, uiSetupOrchestrator |
| `register-app.ts` | ~2 | AppOrchestrator, streaming orchestrators (top-level coordinators) |

This would be 9 files vs the current 6, but each file would have clear domain ownership. This is follow-up work, not part of the auto-wiring migration.

---

## 11. The `RegistrableContainer` Type Gap

**File:** `src/renderer/application/di/registrable-container.type.ts` (9 lines)

```ts
export type RegistrableContainer<TMap extends object> = {
  registerSingleton<TKey extends ContainerKey<TMap>>(
    name: TKey,
    factory: (...args: any[]) => TMap[TKey],
    deps: string[]
  ): void;
};
```

This type only exposes `registerSingleton`. After adding `autoRegister()` to `ServiceContainer`, this type must be extended:

```ts
export type RegistrableContainer<TMap extends object> = {
  registerSingleton<TKey extends ContainerKey<TMap>>(
    name: TKey,
    factory: (...args: any[]) => TMap[TKey],
    deps: string[]
  ): void;

  autoRegister<TKey extends ContainerKey<TMap>>(
    name: TKey,
    Class: { readonly dependencies: readonly string[]; new (deps: Record<string, unknown>): TMap[TKey] }
  ): void;
};
```

---

## 12. The `RendererContainerMap` Type Weakness

**File:** `src/renderer/application/di/renderer-container-map.type.ts` (80 lines)

Of the 80 entries in `RendererContainerMap`, **68 are typed as `unknown`**. Only 12 have concrete types:

- `loggerFactory: RendererLogger`
- `transcodeService: TranscodeService`
- `appState: AppState`
- `uiComponentRegistry: UIComponentRegistry`
- `uiEffects: UIEffects`
- `bodyClassManager: BodyClassManager`
- `uiEventBridge: UIEventBridge`
- `captureUiBridge: CaptureUIBridge`
- `transcodeUiBridge: TranscodeUIBridge`
- `appOrchestrator: AppOrchestrator`
- `uiController: UIController`

This means `container.resolve('streamingService')` returns `unknown`, providing no type safety at the call site. The type map exists primarily for **key validation** (ensuring registered names match expected names), not for value type safety.

If `autoRegister()` accepts a typed class constructor, the type map entries could be automatically inferred from the class type. This is a potential follow-up improvement but requires non-trivial TypeScript generics work.

---

## 13. Summary of Findings

### Key Metrics

| Metric | Value |
|--------|-------|
| Total registration lines across 6 files | 843 |
| Total registrations (services + orchestrators) | 65 |
| autoRegister-eligible registrations | 54 (83%) |
| Custom factory registrations | 11 (17%) |
| Estimated registration lines eliminated | ~526 |
| Lines added for static dependencies (54 classes) | ~108 |
| Lines added for autoRegister() implementation | ~15 |
| **Net line reduction** | **~403** |
| Container test lines | 971 |
| Estimated test lines removable | ~400-500 |
| Misplaced registrations (services in orchestrators file) | 5 |
| Misplaced registrations (wrong domain file) | 2-3 |

### Risk Assessment

| Risk | Level | Mitigation |
|------|-------|-----------|
| `isClass` double-`new` in autoRegister | LOW | Factory wrapper returns object, overrides outer `new` |
| Circular dependency introduction | NONE | No existing cycles; autoRegister does not change dependency graph |
| Test breakage from mock pattern change | MEDIUM | Tests must update mock container to include `autoRegister` spy |
| Static dependencies out of sync with constructor | LOW | BaseService `validateDependencies` will throw at resolution time |
| Registration order matters for readability | LOW | Lazy resolution means order is aesthetic only |

### Recommended Execution Order

1. Add `autoRegister()` to `ServiceContainer` (and update `RegistrableContainer` type)
2. Add `static dependencies` to all 54 eligible classes (can be parallelized across domains)
3. Convert `register-orchestrators.ts` first (17/17 eligible, cleanest win)
4. Convert `register-capture.ts` second (4/4 eligible)
5. Convert `register-streaming.ts` third (1/1 eligible)
6. Convert `register-devices.ts` fourth (5/6 eligible)
7. Convert `register-ui.ts` fifth (12/14 eligible, 2 custom factories remain)
8. Convert `register-infrastructure.ts` last (15/23 eligible, 8 custom factories remain -- highest complexity)
9. Update container test to handle `autoRegister` mock pattern
10. Run full test suite after each file conversion
