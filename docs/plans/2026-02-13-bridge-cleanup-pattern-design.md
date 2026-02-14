# Bridge & IPC Cleanup Pattern Redesign

**Date**: 2026-02-13
**Branch**: `codex/gpu-package-consolidation-v2`
**Context**: Replaces reverted Tasks 6 (IPCBridgeBase) and 7 (EventBridgeBase) from the codebase decomposition plan.

## Problem Statement

The original Tasks 6 and 7 attempted to extract base classes (`IPCBridgeBase`, `EventBridgeBase`) to reduce boilerplate. Both were reverted because:

1. **IPCBridgeBase** grew code (+95 LOC net) instead of reducing it. The 3 target services are 90% business logic with only ~15 lines of IPC bridging each.
2. **EventBridgeBase** grew code (+25 LOC net). The bridges already use `subscribeWithCleanup()` which IS the right abstraction.

The base class approach was wrong. But two real architectural issues remain:

### Issue 1: `_subscriptions` semantic overloading

IPC services push Window API unsubscribe functions into `_subscriptions`, which was designed for EventBus subscriptions. The field works (both return `() => void`), but the semantic mismatch is a maintenance hazard — future developers may not realize IPC cleanup is buried in the EventBus subscription array.

### Issue 2: Dual cleanup in IPC services

IPC services track individual unsubscribes in `_subscriptions` AND call `api.removeListeners()` in `onDispose()`. Both accomplish the same thing. This redundancy suggests the cleanup contract is unclear.

### Issue 3: Empty `onDispose()` overrides

Five bridges/services override `onDispose()` solely to log "X disposed". The base `dispose()` already logs "Disposing X" before cleanup runs. The override adds no value.

## Design

### Approach: Use `addCleanup()` for non-EventBus cleanup

`LifecycleService.addCleanup()` (added in Task 2) is the purpose-built API for registering arbitrary cleanup functions. Use it for:

- IPC listener blanket cleanup (`api.removeListeners()`)
- DOM listener removal (`document.removeEventListener(...)`)
- Component disposal (`this._toast?.dispose()`)

This establishes a clear convention: `_subscriptions` = EventBus only, `addCleanup()` = everything else.

### Changes

#### IPC Services (3 files)

**TranscodeService** (`infrastructure/services/transcode/transcode.service.ts`):
- `onInitialize()`: Call IPC methods directly without tracking return values. Add `this.addCleanup(() => window.transcodeAPI?.removeListeners?.())`
- `onDispose()`: Remove `window.transcodeAPI?.removeListeners?.()` line. Keep state reset.

**UpdateService** (`infrastructure/services/updates/update.service.ts`):
- Same pattern. `addCleanup(() => window.updateAPI?.removeListeners?.())` in init, remove from dispose.

**FullscreenService** (`infrastructure/services/settings/fullscreen.service.ts`):
- `onInitialize()`: Call IPC methods directly, `addCleanup(() => window.windowAPI?.removeListeners?.())`. Co-locate DOM listener with its cleanup via `addCleanup()`.
- Remove `_boundHandleFullscreenChange` constructor field.
- Remove empty `onDispose()`.

#### Event Bridges (4 files)

**CaptureUIBridge, UpdateUIBridge, UIEventBridge**: Remove log-only `onDispose()` overrides.

**TranscodeUIBridge**: Move `this._toast?.dispose()` to `this.addCleanup(() => this._toast?.dispose())` in `onInitialize()`. Remove `onDispose()`.

### What We're NOT Doing

- No base classes (IPCBridgeBase, EventBridgeBase) — the existing patterns are already clean
- No changes to handler methods or business logic
- No changes to `subscribeWithCleanup()` usage in bridges

### Impact

- ~15-20 lines removed across 7 files
- Cleanup semantics clarified: `_subscriptions` reserved for EventBus, `addCleanup()` for everything else
- Redundant dual-cleanup eliminated in IPC services
- Convention established for future IPC/DOM service patterns
