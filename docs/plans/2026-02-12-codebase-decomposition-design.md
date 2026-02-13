# PrismGB Codebase Decomposition Design

**Date**: 2026-02-12
**Branch**: `codex/gpu-package-consolidation-v2`
**Goal**: Maximum code reduction through abstraction, interfaces, and proper OOP — retaining 100% functionality.

## Baseline Metrics

| Layer | LOC | Files |
|-------|-----|-------|
| Renderer infrastructure | 9,751 | 58 |
| Renderer presentation | 7,829 | 52 |
| Main process | 4,871 | 42 |
| Renderer application | 2,175 | 20 |
| Other (preload, etc.) | 1,678 | 10 |
| **Total src/** | **26,304** | **182** |
| Packages (@prismgb/*) | 8,084 | — |

## Estimated Impact (Post-Codex Review)

- **Source reduction**: ~3,020 LOC (11.5%)
- **Test reduction**: ~2,700 LOC
- **Total repo reduction**: ~5,720 LOC
- **Files deleted**: ~15-20
- **DI registrations eliminated**: ~12-15

---

## Phase 1: Foundation (Structural, No LOC Reduction)

### 1A. LifecycleService Migration

Migrate 5 services that ALREADY have explicit lifecycle methods to `LifecycleService`:

| Service | LOC | Current Lifecycle Methods |
|---------|-----|-------------------------|
| StreamingService | 458 | `start()` / `stop()` / `dispose()` |
| CaptureService | 315 | `startRecording()` / `stopRecording()` / `dispose()` |
| AudioPipelineService | 464 | `start()` / `stop()` / `cleanup()` (rename to `dispose()`) |
| PerformanceStateService | 213 | `initialize()` / `dispose()` |
| PerformanceMetricsService | 99 | `startPeriodicSnapshots()` / `stopPeriodicSnapshots()` |

**DO NOT migrate**: SettingsService, NotesService, DeviceMediaService (constructor-ready, no lifecycle).
**DO NOT migrate**: PerformanceAnimationService (stateless computation, no lifecycle pair).

**Codex correction**: `StreamingAudioPipelineService.cleanup()` must be renamed to `dispose()` for container consistency.

### 1B. Typed Event Payloads

Create `EventPayloadMap` type alongside `EventChannels`:
- File: `src/renderer/common/config/event-channels.ts`
- Maps each event channel to its payload type
- Enhances `subscribeWithCleanup()` for type inference
- ~80 entries covering all event channels

### 1C. Selective Interface Contracts

Only where there's a concrete reason:
- `IIPCBridge` — shared contract for IPC bridge services (enables 2A)
- `IStorageBackend` — enables abstract storage service (enables 5A)
- `IEventBridge` — shared contract for presentation bridges (enables 2B)

### 1D. Event Channel Import Consolidation

Migrate 14 files still importing from compatibility re-export (`@renderer/infrastructure/events/event-channels.config.js`) to canonical source (`@renderer/common/config/event-channels`). Then delete the compatibility shim file.

### 1E. LifecycleService Cleanup Tracking (Revised per Codex)

Add `addCleanup(fn)` to `LifecycleService` only (NOT BaseService):
- Prevents container's `disposeAll()` from calling `dispose()` on stateless BaseService instances
- `LifecycleService.dispose()` runs all registered cleanups
- `subscribeWithCleanup()` uses this internally
- Services extending BaseService that need cleanup must upgrade to LifecycleService

---

## Phase 2: Bridge & Event Flow (~550 LOC)

### 2A. IPC Bridge Base Class (~250 LOC saved, revised per Codex)

**Current**: TranscodeService (216), UpdateService (218), FullscreenService (131) = 565 LOC
**After**: ~315 LOC total (Codex noted shared code is mostly subscription boilerplate)

Abstract base captures IPC→EventBus pattern:
- Subclasses declare mappings declaratively
- Base handles subscription lifecycle, error handling, cleanup

### 2B. Event Bridge Base Class (~100 LOC saved)

**Current**: CaptureUIBridge (82), UpdateUIBridge (83) = 165 LOC
**After**: ~65 LOC total

Declarative event-to-event mapping. TranscodeUIBridge has custom logic (toast access) — extends base with overrides.

### 6A. UIController Delegation Trim (~100 LOC saved, revised per Codex)

**Current**: UIController (365 LOC)
**After**: ~265 LOC

Eliminate pure pass-through methods only (Codex verified some "pass-throughs" are coordination):
- 11 methods that just call `uiEffects.sameMethod(sameArgs)` — SAFE to remove
- 7 registry delegation methods — PARTIALLY safe (some involve coordination)
- Bridges inject `uiEffects` directly for effect calls
- **Keep**: `setStreamingMode()` (coordination, NOT delegation), element management, component lifecycle
- **Keep**: Any method that calls multiple subsystems

### 6B. Collapse 3-Hop Event Chains (~100 LOC saved)

**Current chains** (4 identified):
```
Service → CaptureUIBridge → UI.RECORD_BUTTON_POP → UIEventBridge → uiController → uiEffects
```

**After**:
```
Service → Bridge → uiEffects (direct call)
```

Intermediate UI event channels become dead code. UIEventBridge shrinks from 146 → ~80 LOC.

**CRITICAL**: Must audit subscribers per-channel before deletion. If any channel has consumers beyond UIEventBridge, keep it.

---

## Phase 3: UI Component Base Class (~280 LOC)

### 3. BaseComponent

Thin base handling lifecycle boilerplate across 15+ components:

```typescript
abstract class BaseComponent {
  protected subscribe(channel, handler) → auto-tracked
  protected addDomListener(target, event, handler) → auto-tracked
  dispose() → cleans up all tracked subscriptions + DOM listeners
}
```

Applicable components: ShaderPresetList, ShaderSliderControls, CinematicToggle, ShaderSelector, StreamingControls, SettingsMenu, NotesPanel, NotesEditorView, NotesListView, GameFilter, GameAutocomplete, TranscodeToast, UpdateSection, FullscreenControls.

Ultra-simple components (StatusNotification at 33 LOC) stay as-is.

---

## Phase 4: Orchestrator Consolidation (~215 LOC)

### 4A. Merge Settings Orchestrators (~40 LOC)

SettingsPreferencesOrchestrator (60) + SettingsDisplayModeOrchestrator (83) → SettingsOrchestrator (~100).
6 combined unique dependencies.

### 4B. Move UI Setup to Components (~150 LOC)

UISetupOrchestrator (228) → ~80 LOC. Move `initializeSettingsMenu()`, `initializeShaderSelector()`, `initializeNotesPanel()`, `setupUIEventListeners()`, `setupOverlayClickHandlers()` into UIComponentRegistry or the components themselves.

Keep: Thin lifecycle wrapper for the one event subscription (RENDER.CANVAS_RECREATED), or move that to StreamingOrchestrator.

### 4C. Eliminate Pass-Through Methods (~15 LOC)

DisplayModeOrchestrator: `toggleFullscreen()`, `enterFullscreen()`, `exitFullscreen()` are 1:1 delegations. Replace with event-driven pattern or direct service injection.

### 4D. Fix DeviceOrchestrator Pattern (~10 LOC)

Convert manual `deviceIpcAdapter.subscribe()` to EventBus subscription via `subscribeWithCleanup()`.

---

## Phase 5: Service Abstractions (~520 LOC)

### 5A. Abstract Storage Service (~120 LOC)

Extract shared localStorage CRUD pattern from SettingsService + NotesService:
- Declarative schema (parse/normalize/serialize)
- In-memory caching
- Auto event publishing on write
- Type-safe accessors

### 5B. Operation Queue Utility (~80 LOC)

Composition utility for serialized async operations:
- Used by StreamingService, DeviceOperationSequencerService
- Tracks queue depth, provides `idle` state
- Not inheritance — services compose it

### 5C. Auto-Hide Effect Consolidation (~30 LOC)

ControlsAutoHide uses HideTimer instead of its own `_startHideTimer()`/`_clearHideTimer()`.

### 6C. Merge Streaming Display Services (~130 LOC)

ViewportService (232) + StreamingViewService (138) + CanvasLifecycleService (110) = 480 LOC → StreamingCanvasService (~350 LOC).

Fixes layering violation (RenderPipelineService calling both facade and underlying services). Phased approach: dual-register during migration.

### 6D. Merge Tiny Services (~112 LOC, revised per Codex)

- DeviceStorageService (49) → into DeviceMediaService
  - **Codex correction**: StreamingService ALSO consumes DeviceStorageService (line 35, 390)
  - Must update StreamingService dependency: `deviceStorageService` → `deviceMediaService`
  - Storage methods become part of DeviceMediaService's public API
- GpuRenderLoopService (63) → into GpuRendererService (GPU-specific, single consumer)

### 6E. Remove Redundant Error Patterns (~105 LOC)

- 11 try-catch-log-rethrow instances (log + immediately throw = ceremony if caller handles)
- ~50 defensive null guards on required dependencies / post-init state

---

## Phase 6: Adapter & Factory Layer (~380 LOC)

### 7A. Eliminate Thin Wrapper Adapters (~150 LOC)

Replace 6 class adapters with inline DI factory registrations:
- VisibilityAdapter (49), UserActivityAdapter (57), ReducedMotionAdapter (65)
- MetricsAdapter (44), DeviceIpcStatusAdapter (21), DeviceIpcAdapter (79)

Services keep the same API. Just eliminates class boilerplate.

### 7B. Delete StreamingRendererFactory (~150 LOC net)

Move selection logic to RenderPipelineService. Register renderer creation as DI factory functions (NOT singletons — renderers are recreated mid-stream):

```typescript
container.registerFactory('createGpuRenderer', (deps) => {
  return (context) => new StreamingGpuRendererAdapter({ ...deps, ...context });
}, [...]);
```

Original: 197 LOC factory. New: ~50 LOC of DI registration + selection in service.

### 7C. Slim StreamingAdapterFactory (~80 LOC)

Remove duplicate internal registry (DeviceRegistry already stores adapters). Remove metadata registry (use static device config). 298 → ~218 LOC.

### 7D. Relocate DeviceChangeDebounceAdapter (0 LOC, architecture fix)

Move from `adapters/devices/` to `infrastructure/utils/`. It's a decorator, not an adapter.

---

## Phase 7: Main Process (~435 LOC)

### 8A. FFmpeg Path Deduplication (~90 LOC)

`getFfmpegPath()` and `getFfprobePath()` share identical 4-step fallback chain. Extract `_resolveBinary(config)`. 224 → ~134 LOC.

### 8B. TranscodeService + TranscodeProcess Merge (~70 LOC)

TranscodeProcess is only instantiated by TranscodeService. Merge as private inner concern.

### 8C. DeviceBridgeService + DeviceLifecycleService Merge (~80 LOC)

Both subscribe to `DEVICE.CONNECTION_CHANGED`. Combined into single `DeviceEventHandler`.

### 8D. Eliminate UpdateBridge (~51 LOC)

Move `updateService.initialize()` and `startAutoCheck()` directly into AppOrchestrator.

### ~~8E. IPC Handler Base Class~~ (DROPPED per Codex)

Codex found that `handler-wrapper.utils.ts` already provides centralized `registerWrappedHandler` abstraction. Creating a `BaseIpcHandler` class would duplicate existing work. No savings here.

### 8F. DeviceService Internal Refactoring (~70 LOC)

Extract shared `_findAllConnectedDevices()` from duplicate scan methods. Simplify mutex pattern.

### 8G. Transcode Temp Utils Cleanup (~45 LOC)

Extract shared `_cleanupPath()` from repeated try-catch patterns.

### 8H. Window Service Listener Management (~30 LOC)

Replace 5 individual listener references with tracked Map pattern.

---

## Phase 8: Large File Internal Consolidation (~640 LOC)

### 9A. Render Pipeline Service (~155 LOC)

- Generic `_switchRenderer(from, to)` (40 LOC)
- Extract `_tryInitializeGpuWithRetry()` (25 LOC)
- Extract `_ensureFreshCanvas()` (35 LOC)
- Consolidate visibility handling (10 LOC)
- Consolidate preset caching (15 LOC)

484 → ~330 LOC.

### 9B. GPU Renderer Service (~140 LOC)

- CaptureRequest value object (30 LOC)
- Consolidate message handler registration (50 LOC)
- Extract backpressure handling (25 LOC)
- Reduce verbose state init (15 LOC)

580 → ~440 LOC.

### 9C. Streaming Service (~80 LOC, conservative)

- Generic state transition helper (35 LOC, reduced from 45 due to different error paths)
- Device selection strategy chain (25 LOC)
- Consolidate track monitoring (15 LOC)

458 → ~378 LOC.

### 9D. Notes Panel Component (~150 LOC)

- Loop-based sub-component init (30 LOC)
- Consolidate thin handlers (20 LOC)
- Panel visibility helper (15 LOC)
- Simplify disposal (20 LOC)
- Event subscription helper (15 LOC)
- Compounds with BaseComponent (Section 3)

510 → ~360 LOC.

### 9E. Audio Pipeline Service (~50 LOC)

- `_disconnectNode()` helper (15 LOC)
- Timer cleanup consolidation (5 LOC)
- Config-injected warmup timings (10 LOC)

464 → ~415 LOC.

### 9F. Renderer Base Class (~25 LOC net)

Extract shared canvas lifecycle + HiDPI state from GPU renderer (580) and Canvas renderer (325). ~90 LOC base class, removes ~115 LOC from both renderers combined. (Reduced from 50 per Codex — weak overlap of responsibilities limits shared code.)

---

## Execution Strategy

### Dependency Graph

```
Phase 1 (Foundation) ──→ Phase 2 (Bridges)
                    ──→ Phase 3 (Components)
                    ──→ Phase 5 (Service Abstractions)
Phase 2 ──→ Phase 4 (Orchestrators, depends on bridge changes)
Phase 3 ──→ Phase 8.9D (Notes panel, depends on BaseComponent)
Phase 5 ──→ Phase 8.9A-9C (Large files, depends on abstractions)
Phase 6 (Adapters) ── independent
Phase 7 (Main) ── independent
```

### Parallelization

- Phase 6 (Adapters) + Phase 7 (Main) can run in parallel with everything else
- Phase 2 + Phase 3 can run in parallel after Phase 1
- Phase 8 runs last (depends on abstractions from earlier phases)

### Risk Classification

| Phase | Risk | Rationale |
|-------|------|-----------|
| 1 | LOW | Structural, no behavior changes |
| 2 | LOW-MED | Event flow changes need consumer audits |
| 3 | LOW | Thin base class, no behavior changes |
| 4 | LOW-MED | Orchestrator merges, initialization order matters |
| 5 | LOW | New abstractions, existing code moves |
| 6 | LOW | DI registration changes, same runtime behavior |
| 7 | LOW-MED | Main process refactors, need IPC testing |
| 8 | HIGH | Internal refactors of complex, stateful files |

---

## Validation Notes

1. **6B (Event chain collapse)**: Must grep for subscribers per-channel before deletion
2. **7B (Renderer factory deletion)**: Renderers are recreated mid-stream — need factory functions in DI, not singletons
3. **9C (Streaming state machine)**: Start/stop have different error paths — generic helper needs flexibility

---

## Summary (Post-Codex Review)

| Phase | Description | Source LOC | Test LOC | Notes |
|-------|-------------|-----------|----------|-------|
| 1 | Foundation | 0 | 0 | 5 services (not 6), cleanup in LifecycleService only |
| 2 | Bridges & Event Flow | 550 | 300 | 2A: 250, 6A: 100 (revised down) |
| 3 | Component Base Class | 280 | 0 | Stale inventory corrected |
| 4 | Orchestrator Consolidation | 215 | 130 | |
| 5 | Service Abstractions | 520 | 1,700 | 6D: DeviceStorage has 2 consumers |
| 6 | Adapter & Factory | 380 | 500 | Some adapters already factory-registered |
| 7 | Main Process | 435 | 310 | 8E dropped (already abstracted) |
| 8 | Large File Internal | 640 | 0 | Risk upgraded to HIGH, 9F: 25 |
| **Total** | | **~3,020** | **~2,940** | |
| **Grand Total** | | | **~5,960** | |

## Codex Review Corrections Applied

1. **PerformanceAnimationService removed** from Phase 1A (no lifecycle pair)
2. **BaseService.addCleanup() moved to LifecycleService only** (prevents container cleanup conflicts)
3. **StreamingAudioPipelineService.cleanup() → dispose()** rename required
4. **8E (IPC handler base) dropped** (existing `registerWrappedHandler` already covers this)
5. **DeviceStorageService multi-consumer** noted (StreamingService also depends on it)
6. **LOC estimates reduced** for 2A (-100), 6A (-60), Phase 3 (-95), 9F (-25)
7. **Phase 8 risk upgraded** from MED to HIGH
8. **Event channel compatibility re-export** (`event-channels.config.js`) added as cleanup item
