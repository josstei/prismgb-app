# Codebase Decomposition Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce ~3,020 source LOC (11.5%) and ~2,940 test LOC through abstraction, interfaces, and proper OOP — retaining 100% functionality.

**Architecture:** 8 phases organized into 6 execution stages based on dependency graph. Foundation changes enable bridge/component/service abstractions. Independent adapter/main refactors run in parallel. Large file consolidation runs last.

**Tech Stack:** TypeScript, Vitest, Electron (main/renderer/preload), custom DI (ServiceContainer), EventBus (eventemitter3), @prismgb/core base classes.

**Design Reference:** `docs/plans/2026-02-12-codebase-decomposition-design.md`

**Test Baseline:** 128 test files, 2731 tests. Run `npm run test:run` — all must pass after every task.

---

## Execution Overview

```
Stage 1: Phase 1 (Foundation)                     ← everything depends on this
Stage 2: Phase 2 (Bridges) + Phase 3 (Components) ← parallel after Stage 1
Stage 3: Phase 4 (Orchestrators)                   ← after Phase 2
Stage 4: Phase 5 (Service Abstractions)            ← after Phase 1
Stage 5: Phase 6 (Adapters) + Phase 7 (Main)       ← independent, anytime
Stage 6: Phase 8 (Large File Internal)             ← last, depends on all above
```

### Agent Allocation

| Stage | Phases | Execution | Agent | Model |
|-------|--------|-----------|-------|-------|
| 1 | 1A-1E | Sequential (ME) | — | — |
| 2 | 2A-2B, 6A-6B, 3 | Parallel batch | Coder x2 | sonnet |
| 3 | 4A-4D | Sequential (ME) | — | — |
| 4 | 5A-5C, 6C-6E | Sequential (ME) | — | — |
| 5 | 6 + 7 | Parallel batch | Coder x2 | sonnet |
| 6 | 8 (9A-9F) | Sequential (ME) | — | — |

---

## Stage 1: Foundation (Phase 1)

### Task 1: Event Channel Import Consolidation (Phase 1D)

**Files:**
- Modify: 14 files importing from `@renderer/infrastructure/events/event-channels.config.js`
- Delete: `src/renderer/infrastructure/events/event-channels.config.js`

**Step 1: Update all imports from compat shim to canonical source**

Replace in each of these 14 files:
```typescript
// FROM:
import { EventChannels } from '@renderer/infrastructure/events/event-channels.config.js';
// TO:
import { EventChannels } from '@renderer/common/config/event-channels';
```

Files to update:
- `src/renderer/infrastructure/services/updates/update.service.ts`
- `src/renderer/infrastructure/services/devices/device-media.service.ts`
- `src/renderer/infrastructure/services/capture/gpu-recording.service.ts`
- `src/renderer/infrastructure/services/capture/capture.service.ts`
- `src/renderer/infrastructure/services/capture/capture-save.service.ts`
- `src/renderer/infrastructure/services/settings/fullscreen.service.ts`
- `src/renderer/infrastructure/services/settings/settings.service.ts`
- `src/renderer/infrastructure/services/notes/notes.service.ts`
- `src/renderer/infrastructure/services/streaming/streaming.service.ts`
- `src/renderer/infrastructure/services/transcode/transcode.service.ts`
- `src/renderer/infrastructure/services/streaming/render-pipeline.service.ts`
- `src/renderer/infrastructure/services/streaming/canvas-lifecycle.service.ts`
- `src/renderer/infrastructure/services/streaming/gpu-renderer.service.ts`
- `src/renderer/infrastructure/services/streaming/audio-pipeline.service.ts`

**Step 2: Delete the compatibility shim**

Delete: `src/renderer/infrastructure/events/event-channels.config.js`

**Step 3: Run tests**

Run: `npm run test:run`
Expected: All 2731 tests pass.

**Step 4: Commit**

```bash
git add -A && git commit -m "refactor: consolidate event-channels imports to canonical source"
```

---

### Task 2: LifecycleService Cleanup Tracking (Phase 1E)

**Files:**
- Modify: `packages/prismgb-core/src/base/lifecycle-service.base.ts` (90 LOC)
- Test: `packages/prismgb-core/tests/` (create if needed)

**Step 1: Add `addCleanup(fn)` to LifecycleService**

In `packages/prismgb-core/src/base/lifecycle-service.base.ts`, add to the class:

```typescript
private _cleanups: (() => void | Promise<void>)[] = [];

addCleanup(fn: () => void | Promise<void>): void {
  this._cleanups.push(fn);
}
```

Update `dispose()` to run cleanups:

```typescript
async dispose(): Promise<void> {
  if (this._isDisposed) return;
  this._isDisposed = true;

  // Run registered cleanups
  for (const cleanup of this._cleanups) {
    try {
      await cleanup();
    } catch (error) {
      this.logger?.error?.(`Cleanup error in ${this._serviceName}:`, error);
    }
  }
  this._cleanups = [];

  // Run subscriptions cleanup
  for (const unsub of this._subscriptions) {
    try { unsub(); } catch { /* swallow */ }
  }
  this._subscriptions = [];

  await this.onDispose();
}
```

**Step 2: Export addCleanup in package index**

Verify `packages/prismgb-core/src/index.ts` exports `LifecycleService` (should already).

**Step 3: Run tests**

Run: `npm run test:run`
Expected: All tests pass.

**Step 4: Commit**

```bash
git add packages/prismgb-core/ && git commit -m "feat(core): add cleanup tracking to LifecycleService"
```

---

### Task 3: LifecycleService Migration — 5 Services (Phase 1A)

**Files:**
- Modify: `src/renderer/infrastructure/services/streaming/streaming.service.ts` (458 LOC)
- Modify: `src/renderer/infrastructure/services/capture/capture.service.ts` (315 LOC)
- Modify: `src/renderer/infrastructure/services/streaming/audio-pipeline.service.ts` (464 LOC)
- Modify: `src/renderer/infrastructure/services/performance/performance-state.service.ts` (213 LOC)
- Modify: `src/renderer/infrastructure/services/performance/performance-metrics.service.ts` (99 LOC)

For each service, the migration pattern is:

**Step 1: Change base class from BaseService to LifecycleService**

```typescript
// FROM:
import { BaseService } from '@prismgb/core';
class MyService extends BaseService {
// TO:
import { LifecycleService } from '@prismgb/core';
class MyService extends LifecycleService {
```

**Step 2: Wrap existing `start()`/`initialize()` into `onInitialize()`**

Only if the service has explicit init logic. Many just need the base class swap.

**Step 3: Rename `cleanup()` to `dispose()` in AudioPipelineService**

In `audio-pipeline.service.ts` line 254: rename `cleanup()` to `async onDispose()`. Update the orchestrator consumer (`streaming-audio.orchestrator.ts`) if it calls `cleanup()` directly.

**Step 4: Run tests per-service**

Run: `npx vitest run tests/unit/features/streaming/services/streaming.service.test.js`
Run: `npx vitest run tests/unit/features/capture/services/capture.service.test.js`
Run: `npx vitest run tests/unit/app/renderer/application/performance/`

**Step 5: Run full test suite**

Run: `npm run test:run`
Expected: All 2731 tests pass.

**Step 6: Commit**

```bash
git add src/renderer/infrastructure/services/ && git commit -m "refactor: migrate 5 services to LifecycleService base class"
```

---

### Task 4: Typed Event Payloads (Phase 1B)

**Files:**
- Modify: `src/renderer/common/config/event-channels.ts` (123 LOC)
- Modify: `packages/prismgb-core/src/base/lifecycle-service.base.ts`

**Step 1: Create EventPayloadMap type**

Add to `src/renderer/common/config/event-channels.ts`:

```typescript
export type EventPayloadMap = {
  [EventChannels.DEVICE.STATUS_CHANGED]: { connected: boolean; deviceName?: string };
  [EventChannels.DEVICE.SUPPORTED_DEVICE_AVAILABLE]: { deviceId: string; label: string };
  [EventChannels.DEVICE.ENUMERATION_FAILED]: { error: string };
  [EventChannels.DEVICE.DISCONNECTED_DURING_SESSION]: void;
  [EventChannels.STREAM.STARTED]: { stream: MediaStream };
  [EventChannels.STREAM.STOPPED]: void;
  [EventChannels.STREAM.ERROR]: { error: unknown };
  [EventChannels.STREAM.HEALTH_OK]: void;
  [EventChannels.STREAM.HEALTH_TIMEOUT]: void;
  // ... remaining ~65 entries (audit each publisher for payload shape)
};
```

NOTE: This is a type-only addition. No runtime behavior changes. Audit each `eventBus.publish()` call to determine payload types.

**Step 2: Enhance subscribeWithCleanup for type inference (optional, low priority)**

This is a progressive enhancement. Can be added incrementally as services are touched.

**Step 3: Run tests**

Run: `npm run test:run`
Expected: All tests pass (type-only change, no runtime impact).

**Step 4: Commit**

```bash
git add src/renderer/common/config/event-channels.ts && git commit -m "feat: add typed EventPayloadMap for event channels"
```

---

### Task 5: Selective Interface Contracts (Phase 1C)

**Files:**
- Create: `src/renderer/infrastructure/interfaces/ipc-bridge.interface.ts`
- Create: `src/renderer/infrastructure/interfaces/storage-backend.interface.ts`
- Create: `src/renderer/infrastructure/interfaces/event-bridge.interface.ts`

**Step 1: Create IIPCBridge interface**

```typescript
// src/renderer/infrastructure/interfaces/ipc-bridge.interface.ts
import type { EventBusLike } from '@prismgb/core';

export interface IIPCBridge {
  readonly eventBus: EventBusLike;
  initialize(): Promise<void>;
  dispose(): Promise<void>;
}
```

**Step 2: Create IStorageBackend interface**

```typescript
// src/renderer/infrastructure/interfaces/storage-backend.interface.ts
export interface IStorageBackend<TData> {
  load(): TData;
  save(data: Partial<TData>): void;
  get<K extends keyof TData>(key: K): TData[K];
  set<K extends keyof TData>(key: K, value: TData[K]): void;
}
```

**Step 3: Create IEventBridge interface**

```typescript
// src/renderer/infrastructure/interfaces/event-bridge.interface.ts
export interface IEventBridge {
  initialize(): Promise<void>;
  dispose(): Promise<void>;
}
```

**Step 4: Run tests**

Run: `npm run test:run`
Expected: All tests pass (new files only, no consumers yet).

**Step 5: Commit**

```bash
git add src/renderer/infrastructure/interfaces/ && git commit -m "feat: add interface contracts for bridges and storage"
```

---

## Stage 2: Bridges & Components (Phases 2 + 3)

### Task 6: IPC Bridge Base Class (Phase 2A) — ~250 LOC saved

**Files:**
- Create: `src/renderer/infrastructure/bridges/ipc-bridge.base.ts`
- Modify: `src/renderer/infrastructure/services/transcode/transcode.service.ts` (216 LOC → ~120 LOC)
- Modify: `src/renderer/infrastructure/services/updates/update.service.ts` (218 LOC → ~130 LOC)
- Modify: `src/renderer/infrastructure/services/settings/fullscreen.service.ts` (131 LOC → ~80 LOC)
- Test: existing tests for these 3 services

**Step 1: Create IPCBridgeBase**

```typescript
// src/renderer/infrastructure/bridges/ipc-bridge.base.ts
import { LifecycleService } from '@prismgb/core';

type IPCMapping = {
  apiMethod: string;
  eventChannel: string;
  transform?: (data: unknown) => unknown;
};

export abstract class IPCBridgeBase extends LifecycleService {
  protected abstract getIPCApi(): Record<string, (...args: unknown[]) => void>;
  protected abstract getMappings(): IPCMapping[];

  async onInitialize(): Promise<void> {
    const api = this.getIPCApi();
    for (const mapping of this.getMappings()) {
      const handler = (data: unknown) => {
        const payload = mapping.transform ? mapping.transform(data) : data;
        this.eventBus.publish(mapping.eventChannel, payload);
      };
      if (typeof api[mapping.apiMethod] === 'function') {
        api[mapping.apiMethod](handler);
      }
    }
  }

  async onDispose(): Promise<void> {
    const api = this.getIPCApi();
    if (typeof (api as any).removeListeners === 'function') {
      (api as any).removeListeners();
    }
  }
}
```

**Step 2: Refactor TranscodeService (renderer) to extend IPCBridgeBase**

Reduce to declarative mappings only, keeping custom state management.

**Step 3: Refactor UpdateService (renderer) to extend IPCBridgeBase**

**Step 4: Refactor FullscreenService to extend IPCBridgeBase** (partial — fullscreen has DOM listeners too)

**Step 5: Run tests**

Run: `npx vitest run tests/unit/features/transcode/transcode.service.test.js`
Run: `npx vitest run tests/unit/features/updates/services/update.service.test.js`
Run: `npx vitest run tests/unit/features/settings/services/fullscreen.service.test.js`
Run: `npm run test:run`

**Step 6: Commit**

```bash
git add src/renderer/infrastructure/ && git commit -m "refactor: extract IPCBridgeBase, reduce IPC bridge boilerplate"
```

---

### Task 7: Event Bridge Base Class (Phase 2B) — ~100 LOC saved

**Files:**
- Create: `src/renderer/presentation/bridges/event-bridge.base.ts`
- Modify: `src/renderer/presentation/bridges/capture-ui.bridge.ts` (81 LOC → ~30 LOC)
- Modify: `src/renderer/presentation/bridges/update-ui.bridge.ts` (82 LOC → ~30 LOC)
- Keep: `src/renderer/presentation/bridges/transcode-ui.bridge.ts` (has custom toast logic — extends base with overrides)

**Step 1: Create EventBridgeBase**

```typescript
// src/renderer/presentation/bridges/event-bridge.base.ts
import { LifecycleService } from '@prismgb/core';

type EventMapping = {
  source: string;
  handler: (data?: unknown) => void;
};

export abstract class EventBridgeBase extends LifecycleService {
  protected abstract getMappings(): EventMapping[];

  async onInitialize(): Promise<void> {
    const eventMap: Record<string, (...args: unknown[]) => void> = {};
    for (const mapping of this.getMappings()) {
      eventMap[mapping.source] = mapping.handler;
    }
    this.subscribeWithCleanup(eventMap);
  }
}
```

**Step 2: Refactor CaptureUIBridge and UpdateUIBridge to extend EventBridgeBase**

**Step 3: Run tests**

Run: `npx vitest run tests/unit/ui/orchestration/capture-ui.bridge.test.js`
Run: `npm run test:run`

**Step 4: Commit**

```bash
git add src/renderer/presentation/bridges/ && git commit -m "refactor: extract EventBridgeBase, reduce event bridge boilerplate"
```

---

### Task 8: UIController Delegation Trim (Phase 6A) — ~100 LOC saved

**Files:**
- Modify: `src/renderer/presentation/controller/ui.controller.js` (365 LOC → ~265 LOC)
- Modify: bridge consumers to inject `uiEffects` directly
- Test: `tests/unit/ui/ui.controller.test.js` (483 LOC)

**Step 1: Identify pure pass-through methods**

These methods in `ui.controller.js` just call `this.effects?.sameMethod(sameArgs)` — safe to remove:
- `triggerShutterFlash()`
- `triggerRecordButtonPop()`
- `triggerRecordButtonPress()`
- `triggerButtonFeedback()`
- `setRecordingButtonState()`
- `setFullscreenMode()`
- `setCinematicMode()`
- `setMinimalistFullscreen()`
- `enableControlsAutoHide()`
- `disableControlsAutoHide()`
- `enableToolbarAutoHide()` / `disableCursorAutoHide()` (part of `setStreamingMode` — KEEP `setStreamingMode`)

**Step 2: Update bridges to inject uiEffects directly**

In `register-ui.ts`, ensure bridges can access `uiEffects` via DI.

**Step 3: Remove pass-through methods and update bridge callers**

**Step 4: Run tests**

Run: `npx vitest run tests/unit/ui/ui.controller.test.js`
Run: `npm run test:run`

**Step 5: Commit**

```bash
git add src/renderer/presentation/ && git commit -m "refactor: eliminate UIController pass-through methods"
```

---

### Task 9: Collapse 3-Hop Event Chains (Phase 6B) — ~100 LOC saved

**Files:**
- Modify: `src/renderer/presentation/bridges/ui-event.bridge.ts` (146 LOC → ~80 LOC)
- Modify: bridge callers

**CRITICAL**: Before removing any event channel, grep for ALL subscribers:
```bash
npx vitest run # run full suite first
```

For each UI event channel being collapsed, verify single consumer (UIEventBridge):
- `UI.SHUTTER_FLASH`
- `UI.RECORD_BUTTON_POP`
- `UI.RECORD_BUTTON_PRESS`
- `UI.BUTTON_FEEDBACK`

**Step 1: Audit each channel for subscribers**

Run grep for each channel. Only collapse if UIEventBridge is the sole subscriber.

**Step 2: Update bridges to call uiEffects directly instead of publishing intermediate events**

**Step 3: Remove dead event handlers from UIEventBridge**

**Step 4: Run tests**

Run: `npm run test:run`

**Step 5: Commit**

```bash
git add src/renderer/presentation/ && git commit -m "refactor: collapse 3-hop event chains to direct bridge→effects calls"
```

---

### Task 10: UI BaseComponent (Phase 3) — ~280 LOC saved

**Files:**
- Create: `src/renderer/presentation/base/base-component.class.ts`
- Modify: 14 component files (see list below)

**Step 1: Create BaseComponent**

```typescript
// src/renderer/presentation/base/base-component.class.ts
import type { EventBusLike, LoggerLike } from '@prismgb/core';
import { createDomListenerManager } from '@renderer/presentation/primitives/dom-listener.utils.js';

export abstract class BaseComponent {
  protected logger: LoggerLike | null;
  protected eventBus: EventBusLike | null;
  private _domListeners: ReturnType<typeof createDomListenerManager>;
  private _eventSubscriptions: (() => void)[] = [];

  constructor(deps: { eventBus?: EventBusLike; logger?: LoggerLike }) {
    this.eventBus = deps.eventBus ?? null;
    this.logger = deps.logger ?? null;
    this._domListeners = createDomListenerManager({ logger: this.logger });
  }

  protected addDomListener(target: EventTarget, event: string, handler: EventListener): void {
    this._domListeners.add(target, event, handler);
  }

  protected subscribe(channel: string, handler: (...args: unknown[]) => void): void {
    if (!this.eventBus) return;
    const unsub = this.eventBus.subscribe(channel, handler);
    this._eventSubscriptions.push(unsub);
  }

  dispose(): void {
    this._domListeners.removeAll();
    for (const unsub of this._eventSubscriptions) {
      try { unsub(); } catch { /* swallow */ }
    }
    this._eventSubscriptions = [];
  }
}
```

**Step 2: Migrate components incrementally**

Priority order (largest savings first):
1. `NotesPanelComponent` (510 LOC) — manual `_domListeners` + `_eventSubscriptions`
2. `SettingsMenuComponent` (381 LOC) — manual `_domListeners`
3. `ShaderSelectorComponent` — manual listeners
4. `StreamingControlsComponent`
5. `NotesEditorViewComponent` (370 LOC)
6. `NotesListViewComponent`
7. `GameFilterComponent`
8. `GameAutocompleteComponent` (389 LOC)
9. `ShaderPresetListComponent`
10. `ShaderSliderControlsComponent`
11. `CinematicToggleComponent`
12. `TranscodeToastComponent`
13. `UpdateSectionComponent`
14. `FullscreenControls` (template — assess if applicable)

For each: replace manual `createDomListenerManager()` + `_eventSubscriptions` array + `cleanupCallbacks()` with `BaseComponent` methods.

**Step 3: Run tests after each batch of 3-4 components**

Run: `npm run test:run`

**Step 4: Commit per batch**

```bash
git commit -m "refactor: migrate notes components to BaseComponent"
git commit -m "refactor: migrate settings/toolbar components to BaseComponent"
git commit -m "refactor: migrate remaining components to BaseComponent"
```

---

## Stage 3: Orchestrator Consolidation (Phase 4)

### Task 11: Merge Settings Orchestrators (Phase 4A) — ~40 LOC saved

**Files:**
- Merge: `src/renderer/application/orchestrators/preferences.orchestrator.ts` (60 LOC) + `src/renderer/application/orchestrators/display-mode.orchestrator.ts` (83 LOC)
- Create: `src/renderer/application/orchestrators/settings.orchestrator.ts` (~100 LOC)
- Modify: `src/renderer/application/orchestrators/app.orchestrator.ts` (references both)
- Modify: `src/renderer/application/di/register-orchestrators.ts`
- Modify: `src/renderer/application/di/renderer-container-map.type.ts`

**Step 1: Create merged SettingsOrchestrator**

Combine dependencies: `settingsService`, `appState`, `fullscreenService`, `eventBus`, `loggerFactory`.
Merge `onInitialize()` from both. Merge `onCleanup()` from both.

**Step 2: Update DI registration and container map**

Replace `preferencesOrchestrator` + `displayModeOrchestrator` with single `settingsOrchestrator`.

**Step 3: Update AppOrchestrator references**

**Step 4: Delete old files**

**Step 5: Run tests**

Run: `npm run test:run`

**Step 6: Commit**

```bash
git add src/renderer/application/ && git commit -m "refactor: merge settings orchestrators into SettingsOrchestrator"
```

---

### Task 12: Move UI Setup to Components (Phase 4B) — ~150 LOC saved

**Files:**
- Modify: `src/renderer/application/orchestrators/ui-setup.orchestrator.ts` (228 LOC → ~80 LOC)
- Modify: `src/renderer/presentation/controller/component.registry.js`

**Step 1: Move initialization methods into UIComponentRegistry or components**

Move `initializeSettingsMenu()`, `initializeShaderSelector()`, `initializeNotesPanel()` into the component registry's deferred initialization.

**Step 2: Move `setupUIEventListeners()` and `setupOverlayClickHandlers()` inline or into AppOrchestrator**

**Step 3: Keep canvas recreation listener in UISetupOrchestrator (or move to StreamingOrchestrator)**

**Step 4: Run tests**

Run: `npm run test:run`

**Step 5: Commit**

```bash
git add src/renderer/ && git commit -m "refactor: move UI setup logic to component registry"
```

---

### Task 13: Fix DeviceOrchestrator Pattern + Eliminate Pass-Throughs (Phase 4C-4D) — ~25 LOC saved

**Files:**
- Modify: `src/renderer/application/orchestrators/device.orchestrator.ts` (95 LOC)
- Modify: `src/renderer/application/orchestrators/display-mode.orchestrator.ts` (if not already deleted by Task 11)

**Step 1: Note — DeviceOrchestrator uses `deviceIpcAdapter.subscribe()` not EventBus**

The adapter's `subscribe()` returns an unsubscribe function. This is intentional since IPC events come from the preload bridge, not the EventBus. Keep this pattern but register the unsubscribe via `addCleanup()`:

```typescript
async onInitialize() {
  // ...existing code...
  this._unsubscribeIPC = this.deviceIpcAdapter.subscribe(...);
  this.addCleanup(() => {
    this._unsubscribeIPC?.();
    this._unsubscribeIPC = null;
  });
}
```

**Step 2: Run tests**

Run: `npm run test:run`

**Step 3: Commit**

```bash
git add src/renderer/application/orchestrators/ && git commit -m "refactor: use addCleanup for DeviceOrchestrator IPC lifecycle"
```

---

## Stage 4: Service Abstractions (Phase 5)

### Task 14: Abstract Storage Service (Phase 5A) — ~120 LOC saved

**Files:**
- Create: `src/renderer/infrastructure/services/storage/abstract-storage.service.ts`
- Modify: `src/renderer/infrastructure/services/settings/settings.service.ts` (306 LOC)
- Modify: `src/renderer/infrastructure/services/notes/notes.service.ts` (310 LOC)

**Step 1: Extract shared localStorage CRUD pattern**

Both SettingsService and NotesService share: localStorage read/write, in-memory caching, event publishing on mutation, parse/normalize/serialize.

**Step 2: Refactor SettingsService and NotesService to compose or extend AbstractStorageService**

**Step 3: Run tests**

Run: `npx vitest run tests/unit/features/settings/services/settings.service.test.js`
Run: `npx vitest run tests/unit/features/notes/services/notes.service.test.js`
Run: `npm run test:run`

**Step 4: Commit**

```bash
git add src/renderer/infrastructure/services/ && git commit -m "refactor: extract AbstractStorageService from Settings and Notes"
```

---

### Task 15: Operation Queue Utility (Phase 5B) — ~80 LOC saved

**Files:**
- Create: `src/renderer/infrastructure/utils/operation-queue.ts`
- Modify: `src/renderer/infrastructure/services/streaming/streaming.service.ts`
- Modify: `src/renderer/infrastructure/services/devices/device-operation-sequencer.service.ts`

**Step 1: Create OperationQueue composition utility**

```typescript
export class OperationQueue {
  private _queue: Promise<void> = Promise.resolve();
  private _depth = 0;

  get isIdle(): boolean { return this._depth === 0; }

  async enqueue(fn: () => Promise<void>): Promise<void> {
    this._depth++;
    this._queue = this._queue.then(fn).finally(() => this._depth--);
    return this._queue;
  }

  async flush(): Promise<void> {
    await this._queue;
  }
}
```

**Step 2: Refactor services to compose OperationQueue**

**Step 3: Run tests + commit**

---

### Task 16: Merge Streaming Display Services (Phase 6C) — ~130 LOC saved

**Files:**
- Merge: `viewport.service.ts` (232) + `streaming-view.service.ts` (138) + `canvas-lifecycle.service.ts` (110) = 480 LOC
- Create: `src/renderer/infrastructure/services/streaming/streaming-canvas.service.ts` (~350 LOC)
- Modify: DI registrations, container map, all consumers

**IMPORTANT:** This has 7 consumers across orchestrators and services. Use dual-registration during migration:
- Register `streamingCanvasService` AND keep old names as aliases temporarily
- Remove aliases after all consumers updated

**Step 1: Create StreamingCanvasService merging all three**

**Step 2: Update DI registrations with dual-register**

**Step 3: Update all consumers**

Consumers: `StreamingOrchestrator`, `StreamingAudioOrchestrator`, `CaptureOrchestrator`, `RenderPipelineService`, `CanvasLifecycleService` references in `RenderPipelineService`

**Step 4: Remove old files and dual-registrations**

**Step 5: Run tests + commit**

---

### Task 17: Merge Tiny Services (Phase 6D) — ~112 LOC saved

**Files:**
- Merge: `device-storage.service.ts` (49 LOC) → into `device-media.service.ts`
- Merge: `gpu-render-loop.service.ts` (63 LOC) → into `gpu-renderer.service.ts`
- Update: `StreamingService` dependency from `deviceStorageService` → `deviceMediaService`

**CRITICAL**: StreamingService ALSO consumes DeviceStorageService. Must update its dependency.

**Step 1-5: Standard merge pattern with DI updates + consumer updates + tests**

---

### Task 18: Remove Redundant Error Patterns (Phase 6E) — ~105 LOC saved

**Files:** 11+ files with try-catch-log-rethrow + ~50 defensive null guards

**Step 1: Identify and remove try-catch-log-rethrow blocks**

Pattern to remove: `try { ... } catch (e) { this.logger.error(...); throw e; }` where the caller already handles the error.

**Step 2: Remove defensive null guards on required dependencies**

After service is constructed via DI with validated required deps, null checks on those deps are redundant.

**Step 3: Run tests + commit**

---

## Stage 5: Adapters & Main Process (Phases 6 + 7) — Run in Parallel

### Task 19: Eliminate Thin Wrapper Adapters (Phase 7A) — ~150 LOC saved

**Files:**
- Delete: `src/renderer/infrastructure/adapters/visibility.adapter.js` (49 LOC)
- Delete: `src/renderer/infrastructure/adapters/user-activity.adapter.js` (57 LOC)
- Delete: `src/renderer/infrastructure/adapters/reduced-motion.adapter.js` (65 LOC)
- Delete: `src/renderer/infrastructure/adapters/platform/metrics.adapter.ts` (44 LOC)
- Delete: `src/renderer/infrastructure/adapters/devices/device-ipc-status.adapter.ts` (21 LOC)
- Delete: `src/renderer/infrastructure/adapters/devices/device-ipc.adapter.ts` (79 LOC)
- Modify: `src/renderer/application/di/register-infrastructure.ts` (replace class registration with inline factories)

**Step 1: For each adapter, move its logic into a DI factory registration**

Example for VisibilityAdapter:
```typescript
// FROM: container.registerFactory('visibilityAdapter', () => new VisibilityAdapter(), []);
// TO: container.registerFactory('visibilityAdapter', () => ({
//   isHidden: () => document.hidden,
//   onChange: (cb) => { document.addEventListener('visibilitychange', cb); return () => document.removeEventListener('visibilitychange', cb); }
// }), []);
```

**Step 2: Update container map types**

**Step 3: Run tests + commit**

---

### Task 20: Delete StreamingRendererFactory (Phase 7B) — ~150 LOC saved

**Files:**
- Delete: `src/renderer/infrastructure/factories/streaming-renderer.factory.ts` (197 LOC)
- Modify: `src/renderer/infrastructure/services/streaming/render-pipeline.service.ts`
- Modify: `src/renderer/application/di/register-infrastructure.ts`

**Step 1: Move selection logic to RenderPipelineService**

Move `selectRendererType()` inline into RenderPipelineService.

**Step 2: Register renderer creation as DI factory functions**

```typescript
container.registerFactory('createGpuRenderer', (deps) => {
  return (context) => new StreamingGpuRendererAdapter({ ...deps, ...context });
}, ['gpuRendererService', 'gpuRenderLoopService', 'loggerFactory']);
```

**IMPORTANT:** Renderers are recreated mid-stream. Factory functions, NOT singletons.

**Step 3: Run tests + commit**

---

### Task 21: Slim StreamingAdapterFactory (Phase 7C) — ~80 LOC saved

**Files:**
- Modify: `src/renderer/infrastructure/factories/streaming-adapter.factory.ts` (298 LOC → ~218 LOC)

**Step 1: Remove duplicate internal registry (DeviceRegistry already stores adapters)**

**Step 2: Remove metadata registry (use static device config)**

**Step 3: Run tests + commit**

---

### Task 22: FFmpeg Path Deduplication (Phase 8A) — ~90 LOC saved

**Files:**
- Modify: `src/main/infrastructure/transcode/ffmpeg-path.utils.ts` (224 LOC → ~134 LOC)

**Step 1: Extract `_resolveBinary(config)` generic function**

Both `getFfmpegPath()` and `getFfprobePath()` share identical 4-step fallback logic.

**Step 2: Run tests + commit**

---

### Task 23: TranscodeService + TranscodeProcess Merge (Phase 8B) — ~70 LOC saved

**Files:**
- Merge: `src/main/infrastructure/transcode/transcode-process.ts` (316 LOC) → into `transcode.service.ts`
- TranscodeProcess is only instantiated by TranscodeService (confirmed: single `new TranscodeProcess()` at line 194)

---

### Task 24: DeviceBridgeService + DeviceLifecycleService Merge (Phase 8C) — ~80 LOC saved

**Files:**
- Merge: `device-bridge.service.ts` (81 LOC) + `device-lifecycle.service.ts` (104 LOC) → `device-event-handler.service.ts`

Both subscribe to `DEVICE.CONNECTION_CHANGED`. Merge into single `DeviceEventHandler`.

---

### Task 25: Eliminate UpdateBridge (Phase 8D) — ~51 LOC saved

**Files:**
- Delete: `src/main/infrastructure/updates/update.bridge.ts` (51 LOC)
- Modify: `src/main/application/app.orchestrator.ts`
- Modify: `src/main/application/container.ts`

Move `updateService.initialize()` and `startAutoCheck()` directly into AppOrchestrator.

---

### Task 26: Main Process Internal Refactors (Phase 8F-8H) — ~145 LOC saved

- **8F**: Extract `_findAllConnectedDevices()` from DeviceService (531 LOC) — dedup scan methods
- **8G**: Extract `_cleanupPath()` from `transcode-temp.utils.ts` — dedup try-catch cleanup
- **8H**: Replace 5 individual listener references in WindowService (293 LOC) with tracked Map

---

## Stage 6: Large File Internal Consolidation (Phase 8)

### Task 27: Render Pipeline Service Consolidation (Phase 9A) — ~155 LOC saved

**Files:**
- Modify: `src/renderer/infrastructure/services/streaming/render-pipeline.service.ts` (484 LOC → ~330 LOC)

Extractions:
- `_switchRenderer(from, to)` (40 LOC) — generic for GPU↔Canvas2D
- `_tryInitializeGpuWithRetry()` (25 LOC)
- `_ensureFreshCanvas()` (35 LOC) — dedup 5 recreateCanvas+setupCanvasSize sequences
- Consolidate visibility handling (10 LOC)
- Consolidate preset caching (15 LOC)

---

### Task 28: GPU Renderer Service Consolidation (Phase 9B) — ~140 LOC saved

**Files:**
- Modify: `src/renderer/infrastructure/services/streaming/gpu-renderer.service.ts` (580 LOC → ~440 LOC)

---

### Task 29: Streaming Service Consolidation (Phase 9C) — ~80 LOC saved

**Files:**
- Modify: `src/renderer/infrastructure/services/streaming/streaming.service.ts` (458 LOC → ~378 LOC)

---

### Task 30: Notes Panel Component Consolidation (Phase 9D) — ~150 LOC saved

**Files:**
- Modify: `src/renderer/presentation/features/notes/notes-panel.component.js` (510 LOC → ~360 LOC)

Compounds with BaseComponent from Task 10.

---

### Task 31: Audio Pipeline Service Consolidation (Phase 9E) — ~50 LOC saved

**Files:**
- Modify: `src/renderer/infrastructure/services/streaming/audio-pipeline.service.ts` (464 LOC → ~415 LOC)

---

### Task 32: Renderer Base Class (Phase 9F) — ~25 LOC saved

**Files:**
- Create: `src/renderer/infrastructure/rendering/renderer.base.ts`
- Modify: `gpu-renderer.service.ts` and `canvas-renderer.ts`

Extract shared canvas lifecycle + HiDPI state. Limited overlap — only 25 LOC net.

---

## Validation Checkpoints

After each stage:

1. `npm run test:run` — all 2731 tests pass
2. `npm run lint` — no lint errors
3. `npm run build` — clean build
4. Manual smoke test: `npm run dev` → connect device → verify streaming

After all stages:
- Run full LOC count and compare to baseline (26,304 → ~23,284 target)
- Run `npm run test:coverage` to verify no coverage regression

---

## Key Test Files Reference

| Source File | Test File | Test LOC |
|-------------|-----------|----------|
| streaming.service.ts | tests/unit/features/streaming/services/streaming.service.test.js | 439 |
| capture.service.ts | tests/unit/features/capture/services/capture.service.test.js | 416 |
| performance-state.service.ts | tests/unit/app/renderer/application/performance/performance-state.service.test.js | 269 |
| performance-metrics.service.ts | tests/unit/app/renderer/application/performance/performance-metrics.service.test.js | 325 |
| transcode.service.ts (renderer) | tests/unit/features/transcode/transcode.service.test.js | 539 |
| update.service.ts (renderer) | tests/unit/features/updates/services/update.service.test.js | 415 |
| fullscreen.service.ts | tests/unit/features/settings/services/fullscreen.service.test.js | 610 |
| capture-ui.bridge.ts | tests/unit/ui/orchestration/capture-ui.bridge.test.js | 627 |
| transcode-ui.bridge.ts | tests/unit/ui/orchestration/transcode-ui.bridge.test.js | 559 |
| ui-event.bridge.ts | tests/unit/ui/ui-event-bridge.test.js | 293 |
| ui.controller.js | tests/unit/ui/ui.controller.test.js | 483 |
| settings.service.ts | tests/unit/features/settings/services/settings.service.test.js | 324 |
| notes.service.ts | tests/unit/features/notes/services/notes.service.test.js | 585 |
| viewport.service.ts | tests/unit/features/streaming/rendering/viewport.service.test.js | 383 |
| canvas-lifecycle.service.ts | tests/unit/features/streaming/rendering/streaming-canvas-lifecycle.service.test.js | 487 |
| gpu-renderer.service.ts | tests/unit/features/streaming/rendering/gpu/gpu-renderer.service.test.js | 777 |
| render-pipeline.service.ts | tests/unit/features/streaming/rendering/render-pipeline.service.test.js | 633 |
| notes-panel.component.js | tests/unit/features/notes/ui/notes-panel.component.test.js | 945 |
| settings-menu.component.js | tests/unit/features/settings/ui/settings-menu.test.js | 391 |
| container.ts | tests/unit/app/renderer/container.test.js | 145 |
