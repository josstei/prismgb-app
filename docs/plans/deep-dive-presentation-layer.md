# Deep Dive: Presentation Layer Analysis

**Date:** 2026-02-11
**Scope:** `src/renderer/presentation/` (entire directory)
**Context:** Codebase consolidation research (companion to `2026-02-11-codebase-consolidation-design.md`)

---

## Table of Contents

1. [Layer Overview](#1-layer-overview)
2. [Bridges Analysis](#2-bridges-analysis)
3. [Effects Analysis](#3-effects-analysis)
4. [Controller Analysis](#4-controller-analysis)
5. [Feature Components Analysis](#5-feature-components-analysis)
6. [Primitives Analysis](#6-primitives-analysis)
7. [Shared Components Analysis](#7-shared-components-analysis)
8. [Config Files Analysis](#8-config-files-analysis)
9. [Lib Re-Exports Analysis](#9-lib-re-exports-analysis)
10. [Cross-Cutting Patterns](#10-cross-cutting-patterns)
11. [Architectural Assessment](#11-architectural-assessment)
12. [Consolidation Opportunities](#12-consolidation-opportunities)

---

## 1. Layer Overview

**Total source files:** 47 (excluding CSS and templates)
**Total source lines:** 7,438

### File Count by Subdirectory

| Directory | Files (JS/TS) | Lines | Purpose |
|-----------|--------------|-------|---------|
| `bridges/` | 3 | 384 | Event-to-UI translation |
| `effects/` | 6 | 1,197 | Visual effects (auto-hide, feedback, body classes) |
| `controller/` | 2 | 489 | UIController + ComponentRegistry |
| `config/` | 6 | 212 | CSS classes, DOM selectors, timing, config |
| `primitives/` | 5 | 523 | Reusable DOM utilities (disclosure, listbox, timer) |
| `shared/` | 2 | 123 | DeviceStatus, StatusNotification components |
| `features/streaming/` | 1 | 143 | StreamingControlsComponent |
| `features/settings/` | 1 | 381 | SettingsMenuComponent |
| `features/toolbar/` | 4 | 647 | ShaderSelector, PresetList, SliderControls, CinematicToggle |
| `features/transcode/` | 1 | 161 | TranscodeToastComponent |
| `features/updates/` | 1 | 333 | UpdateSectionComponent |
| `features/notes/` | 8 | 2,443 | NotesPanelComponent + 7 sub-components |
| `lib/` | 3 | 28 | Brightness utils + 2 re-exports |
| `icons/` | 1 | 101 | SVG icon registry |

Templates and CSS files are excluded from the analysis as they are content/styling only.

---

## 2. Bridges Analysis

### 2a. UIEventBridge

**File:** `presentation/bridges/ui-event.bridge.ts` (170 lines)
**Extends:** `BaseService`
**Dependencies:** `eventBus`, `uiController`, `presentationModeService`, `loggerFactory`
**Subscriptions:** 16 event channels

#### Event Subscription Map

| Event | Handler | Classification | Delegated To |
|-------|---------|---------------|-------------|
| `UI.STATUS_MESSAGE` | `_handleStatusMessage` | PASS-THROUGH (destructure + delegate) | `uiController.updateStatusMessage` |
| `UI.DEVICE_STATUS` | `_handleDeviceStatus` | PASS-THROUGH (destructure + delegate) | `uiController.updateDeviceStatus` |
| `UI.OVERLAY_MESSAGE` | `_handleOverlayMessage` | PASS-THROUGH (destructure + delegate) | `uiController.updateOverlayMessage` |
| `UI.OVERLAY_VISIBLE` | `_handleOverlayVisible` | PASS-THROUGH (property access) | `uiController.deviceStatus?.setOverlayVisible` |
| `UI.OVERLAY_ERROR` | `_handleOverlayError` | PASS-THROUGH (destructure + delegate) | `uiController.showErrorOverlay` |
| `UI.STREAMING_MODE` | `_handleStreamingMode` | PASS-THROUGH (destructure + delegate) | `presentationModeService.handleStreamingMode` |
| `UI.STREAM_INFO` | `_handleStreamInfo` | PASS-THROUGH (destructure + delegate) | `uiController.updateStreamInfo` |
| `UI.SHUTTER_FLASH` | `_handleShutterFlash` | PASS-THROUGH (direct delegate) | `uiController.triggerShutterFlash` |
| `UI.RECORD_BUTTON_POP` | `_handleRecordButtonPop` | PASS-THROUGH (direct delegate) | `uiController.triggerRecordButtonPop` |
| `UI.RECORD_BUTTON_PRESS` | `_handleRecordButtonPress` | PASS-THROUGH (direct delegate) | `uiController.triggerRecordButtonPress` |
| `UI.BUTTON_FEEDBACK` | `_handleButtonFeedback` | PASS-THROUGH (destructure + delegate) | `uiController.triggerButtonFeedback` |
| `UI.RECORDING_STATE` | `_handleRecordingState` | PASS-THROUGH (destructure + delegate) | `uiController.updateRecordingButtonState` |
| `UI.RECORD_BUTTON_DISABLED` | `_handleRecordButtonDisabled` | PASS-THROUGH (direct delegate) | `uiController.setRecordButtonDisabled(true)` |
| `UI.RECORD_BUTTON_ENABLED` | `_handleRecordButtonEnabled` | PASS-THROUGH (direct delegate) | `uiController.setRecordButtonDisabled(false)` |
| `SETTINGS.CINEMATIC_MODE_CHANGED` | `_handleCinematicMode` | HAS LOGIC (2 calls + string interpolation) | `presentationModeService` + `uiController` |
| `SETTINGS.MINIMALIST_FULLSCREEN_CHANGED` | `_handleMinimalistFullscreenChanged` | PASS-THROUGH (direct delegate) | `presentationModeService.handleMinimalistFullscreenChanged` |
| `UI.FULLSCREEN_STATE` | `_handleFullscreenState` | PASS-THROUGH (destructure + delegate) | `presentationModeService.handleFullscreenState` |

**Analysis:**
- 15 of 16 handlers are pure pass-through (destructure event data, delegate to a single method call)
- 1 handler (`_handleCinematicMode`) has mild logic: delegates to two services + constructs a status message
- Boilerplate: constructor (5 lines for `_subscriptions`), `_subscribeToEvents` loop (4 lines), `dispose` (7 lines) = **16 lines of boilerplate**

### 2b. CaptureUIBridge

**File:** `presentation/bridges/capture-ui.bridge.ts` (87 lines)
**Extends:** `BaseService`
**Dependencies:** `eventBus`, `uiController`, `loggerFactory`
**Subscriptions:** 6 event channels

#### Event Subscription Map

| Event | Handler | Classification | Logic |
|-------|---------|---------------|-------|
| `CAPTURE.SCREENSHOT_TRIGGERED` | `_handleScreenshotTriggered` | HAS LOGIC | Publishes `UI.BUTTON_FEEDBACK` with constructed data object |
| `CAPTURE.SCREENSHOT_READY` | `_handleScreenshotReady` | HAS LOGIC | Calls `uiController.triggerDownload` + publishes status message |
| `CAPTURE.RECORDING_STARTED` | `_handleRecordingStarted` | HAS LOGIC | Publishes 3 separate events |
| `CAPTURE.RECORDING_STOPPED` | `_handleRecordingStopped` | HAS LOGIC | Publishes 2 events |
| `CAPTURE.RECORDING_ERROR` | `_handleRecordingError` | HAS LOGIC | Logs, publishes recording state + error status message |
| `CAPTURE.RECORDING_DEGRADED` | `_handleRecordingDegraded` | HAS LOGIC | Constructs reason string, logs, publishes warning |

**Analysis:**
- All 6 handlers contain meaningful logic (multi-event publishing, data transformation, logging)
- This bridge genuinely earns its existence by translating domain events into UI feedback sequences
- Boilerplate: constructor (4 lines), `dispose` (7 lines) = **11 lines of boilerplate**

### 2c. TranscodeUIBridge

**File:** `presentation/bridges/transcode-ui.bridge.ts` (127 lines)
**Extends:** `BaseService`
**Dependencies:** `eventBus`, `uiController`, `loggerFactory`
**Subscriptions:** 5 event channels
**Additional state:** `_currentFormat` (tracks active transcode format)

#### Event Subscription Map

| Event | Handler | Classification | Logic |
|-------|---------|---------------|-------|
| `TRANSCODE.STARTED` | `_handleStarted` | HAS LOGIC | Logs, sets state, publishes disable event, delegates to toast |
| `TRANSCODE.PROGRESS` | `_handleProgress` | PASS-THROUGH-ISH | Delegates with null coalescing |
| `TRANSCODE.COMPLETED` | `_handleCompleted` | HAS LOGIC | Logs, publishes enable event, delegates to toast, clears state |
| `TRANSCODE.ERROR` | `_handleError` | HAS LOGIC | Logs, publishes enable event, extracts error message, delegates |
| `TRANSCODE.CANCELLED` | `_handleCancelled` | HAS LOGIC | Logs, publishes enable event, delegates to toast, clears state |

**Analysis:**
- 4 of 5 handlers contain meaningful logic (logging, state management, multi-event coordination)
- Has additional dispose logic (`this._toast?.dispose()`) beyond subscription cleanup
- Boilerplate: constructor (4 lines), `dispose` (8 lines) = **12 lines of boilerplate**
- Accesses toast via deep reach: `this.uiController?.registry?.get('transcodeToastComponent')` -- this is a code smell suggesting the toast should be a direct dependency

### 2d. Bridge Boilerplate Summary

All 3 bridges share identical boilerplate patterns:

```typescript
// PATTERN 1: Constructor subscription tracking (every bridge)
this._subscriptions = [];

// PATTERN 2: Initialize push pattern (every bridge)
this._subscriptions.push(
  this.eventBus.subscribe(EventChannels.X.Y, (data) => this._handleY(data)),
  // ...
);

// PATTERN 3: Dispose cleanup (every bridge)
dispose() {
  this._subscriptions.forEach(unsubscribe => {
    if (typeof unsubscribe === 'function') {
      unsubscribe();
    }
  });
  this._subscriptions = [];
  this.logger.info('BridgeName disposed');
}
```

**Total boilerplate across 3 bridges: ~39 lines**

With `LifecycleService` migration (per design doc), each bridge saves:
- Constructor `_subscriptions = []` line: -1 line
- `initialize()` method wrapper: -3 lines (replaced by `onInitialize()`)
- Entire `dispose()` method: -7 lines (automatic cleanup)
- **Per-bridge savings: ~11 lines**
- **Total savings across 3 bridges: ~33 lines**

The remaining savings (~117-167 lines from the design doc estimate of 150-200) would come from converting the 4th bridge (`UpdateUIBridge`, moved from services/) plus the same pattern elimination in feature components and services that also hand-roll subscription tracking (see Section 10).

---

## 3. Effects Analysis

### 3a. Auto-Hide Effect Classes

Three classes share a nearly identical structural pattern:

| File | Lines | RAF Throttling | Timer Management | DOM Listeners | Dispose Pattern |
|------|-------|---------------|-----------------|---------------|----------------|
| `cursor-auto-hide.effect.ts` | 113 | Yes (`_mouseMoveFramePending` + `_rafId`) | No (delegates to unified timer) | `document.addEventListener/removeEventListener` | `this.disable()` |
| `toolbar-auto-hide.effect.ts` | 249 | No (uses `_panelObserver` instead) | No (delegates to unified timer) | `element.addEventListener/removeEventListener` | `this.disable()` |
| `controls-auto-hide.effect.ts` | 233 | Yes (`_mouseMoveFramePending` + `_rafId`) | Yes (internal `_hideTimer` + `setTimeout`) | `document.addEventListener/removeEventListener` | `this.disable()` |

#### Shared Pattern: RAF Throttling

`CursorAutoHide._handleMouseMove()` (lines 80-90):
```typescript
_handleMouseMove() {
  if (this._mouseMoveFramePending) return;
  this._mouseMoveFramePending = true;
  this._rafId = requestAnimationFrame(() => {
    this._mouseMoveFramePending = false;
    this._rafId = null;
    this.show();
    this._onActivity();
  });
}
```

`ControlsAutoHide._handleMouseMove()` (lines 134-144):
```typescript
_handleMouseMove() {
  if (this._mouseMoveFramePending) return;
  this._mouseMoveFramePending = true;
  this._rafId = requestAnimationFrame(() => {
    this._mouseMoveFramePending = false;
    this._rafId = null;
    this._show();
    this._onShowAll();
    this._startHideTimer();
  });
}
```

The structural code is identical; only the callback body differs.

#### Shared Pattern: Enable/Disable Guard + Listener Add/Remove

All three classes follow this exact pattern:
```typescript
enable(element?) {
  if (this._enabled) return;
  this._enabled = true;
  // Add listeners
}

disable() {
  if (!this._enabled) return;
  this._enabled = false;
  // Remove listeners
  // Cancel RAF if pending
  this.show(); // Reset visual state
  this._element = null;
}

dispose() {
  this.disable();
}
```

#### Shared Pattern: Bound Handler Storage

All three store pre-bound handlers for listener removal:
```typescript
this._boundHandleMouseMove = this._handleMouseMove.bind(this);
// ... in enable():
document.addEventListener('mousemove', this._boundHandleMouseMove);
// ... in disable():
document.removeEventListener('mousemove', this._boundHandleMouseMove);
```

None of them use `createDomListenerManager`, despite it being available -- they manually track listeners. This is inconsistent with every other component in the presentation layer.

#### Base Class Opportunity

An `AutoHideEffect` base class could encapsulate:
1. `_enabled` flag + guard checks (6 lines per class)
2. RAF throttle infrastructure (`_mouseMoveFramePending`, `_rafId`, cancel logic) (8 lines per class)
3. `enable()`/`disable()`/`dispose()` lifecycle template (15 lines per class)
4. DOM listener add/remove tracking

**Estimated savings: 25-30 lines per class, ~75-90 lines total across 3 classes.**

However, this is explicitly noted as a follow-up opportunity in the design doc (Section 7). The classes are well-tested and functional. A base class would be a clean win but is lower priority than the LifecycleService migration.

### 3b. UIEffects Facade

**File:** `presentation/effects/ui-effects.class.ts` (336 lines)
**Role:** Facade that composes 5 effect sub-classes + HideTimer + BodyClassManager

#### Delegation Methods

| UIEffects Method | Delegates To | Pure Delegation? |
|-----------------|-------------|-----------------|
| `triggerShutterFlash()` | `_captureEffects.triggerShutterFlash()` | Yes |
| `triggerRecordButtonPop()` | `_buttonFeedback.triggerRecordButtonPop()` | Yes |
| `triggerRecordButtonPress()` | `_buttonFeedback.triggerRecordButtonPress()` | Yes |
| `triggerButtonFeedback(...)` | `_buttonFeedback.triggerButtonFeedback(...)` | Yes |
| `setRecordingButtonState(...)` | `_buttonFeedback.setRecordingButtonState(...)` | Yes |
| `enableCursorAutoHide()` | `_cursor.enable()` | Yes |
| `disableCursorAutoHide()` | `_cursor.disable()` + conditional timer clear | No (2 lines) |
| `enableToolbarAutoHide(el)` | `_toolbar.enable(el)` | Yes |
| `disableToolbarAutoHide()` | `_toolbar.disable()` + conditional timer clear | No (2 lines) |
| `invalidateToolbarPanelCache()` | `_toolbar.invalidatePanelCache()` | Yes |
| `enableControlsAutoHide(el)` | `_controls.enable(el)` | Yes |
| `disableControlsAutoHide()` | `_controls.disable()` | Yes |
| `setCinematicMode(active)` | `_bodyClassManager?.setCinematicMode(active)` | Yes |
| `setMinimalistFullscreen(active)` | `_bodyClassManager?.setMinimalistFullscreen(active)` | Yes |
| `setFullscreenMode(active)` | `_bodyClassManager?.setFullscreenMode(active)` | Yes |

**14 of 16 methods are pure delegation (1 line each).**

The remaining 2 (`disableCursorAutoHide`, `disableToolbarAutoHide`) have minimal conditional logic.

**Coordination logic (private methods):** `_handleActivity`, `_handleToolbarHoverStart`, `_handleToolbarHoverEnd`, `_shouldStartUnifiedTimer`, `_handleUnifiedTimeout`, `_showAll`, `_hideAll` -- these 7 methods (~60 lines) are the only unique value UIEffects provides beyond delegation.

**Assessment:** UIEffects is 336 lines. ~210 lines (14 delegation methods * 5-6 lines each with JSDoc + 30 lines of constructor) are pass-through overhead. ~60 lines are coordination logic. ~30 lines are dispose. The facade adds value by coordinating the unified timer between cursor and toolbar auto-hide, but the ratio of boilerplate to logic is unfavorable.

### 3c. BodyClassManager

**File:** `presentation/effects/body-class.class.ts` (133 lines)
**Role:** Encapsulates `document.body.classList` mutations behind named methods

All methods follow the same pattern: `document.body.classList.toggle(CSS_CLASS, boolean)`. One method (`setMinimalistFullscreen`) has additional transition timer logic (15 lines).

This class is well-scoped and self-contained. No consolidation opportunities.

### 3d. CaptureEffects

**File:** `presentation/effects/capture.effect.ts` (43 lines)
**Role:** Creates and removes a shutter flash overlay element

Tiny, focused class. Creates a DOM element, appends it, waits for animation end or timeout, removes it. The `dispose()` method is a no-op since there is no persistent state. This is fine as-is.

### 3e. ButtonFeedback

**File:** `presentation/effects/button-feedback.effect.ts` (90 lines)
**Role:** CSS class animations on button elements with timeout cleanup

Well-scoped. Tracks active timeouts in a `Set` and clears them on dispose. Uses `void element.offsetWidth` for forced reflow to restart animations -- this is the standard technique.

---

## 4. Controller Analysis

### 4a. UIController

**File:** `presentation/controller/ui.controller.js` (365 lines)
**Role:** Thin facade delegating to UIComponentRegistry and UIEffects

#### Method Classification

| Method | Lines | Classification | Delegates To |
|--------|-------|---------------|-------------|
| `initializeElements()` | 4 | SETUP | `createDomBindings(document)` |
| `initializeComponents()` | 3 | SETUP | `registry.initialize(elements, deps)` |
| `initSettingsMenu(deps)` | 8 | SETUP | `registry.initializeComponent('settingsMenuComponent')` |
| `toggleSettingsMenu()` | 3 | PASS-THROUGH | `registry.get('settingsMenuComponent')?.toggle()` |
| `initShaderSelector(deps, els)` | 3 | SETUP | `registry.initializeComponent('shaderSelectorComponent')` |
| `toggleShaderSelector()` | 3 | PASS-THROUGH | `registry.get('shaderSelectorComponent')?.toggle()` |
| `initNotesPanel(deps, els)` | 3 | SETUP | `registry.initializeComponent('notesPanelComponent')` |
| `toggleNotesPanel()` | 3 | PASS-THROUGH | `registry.get('notesPanelComponent')?.toggle()` |
| `updateStatusMessage(msg, type)` | 1 | PASS-THROUGH | `registry.get('statusNotificationComponent')?.show(msg, type)` |
| `updateDeviceStatus(status)` | 1 | PASS-THROUGH | `registry.get('deviceStatusComponent')?.updateStatus(status)` |
| `updateOverlayMessage(connected)` | 1 | PASS-THROUGH | `registry.get('deviceStatusComponent')?.updateOverlayMessage(connected)` |
| `get deviceStatus` | 1 | PASS-THROUGH | `registry.get('deviceStatusComponent')` |
| `setStreamingMode(isStreaming)` | 7 | HAS LOGIC | Delegates to component + conditionally enables/disables effects |
| `updateStreamInfo(settings)` | 1 | PASS-THROUGH | `registry.get('streamControlsComponent')?.updateStreamInfo(settings)` |
| `showErrorOverlay(msg)` | 1 | PASS-THROUGH | `registry.get('deviceStatusComponent')?.showError(msg)` |
| `updateFullscreenButton(fs)` | 3 | MINOR LOGIC | Sets `title` attribute on element |
| `updateFullscreenMode(active)` | 1 | PASS-THROUGH | `effects?.setFullscreenMode(active)` |
| `triggerShutterFlash()` | 1 | PASS-THROUGH | `effects?.triggerShutterFlash()` |
| `triggerRecordButtonPop()` | 1 | PASS-THROUGH | `effects?.triggerRecordButtonPop()` |
| `triggerRecordButtonPress()` | 1 | PASS-THROUGH | `effects?.triggerRecordButtonPress()` |
| `triggerButtonFeedback(...)` | 1 | PASS-THROUGH | `effects?.triggerButtonFeedback(...)` |
| `updateRecordingButtonState(active)` | 3 | MINOR LOGIC | Looks up element, delegates to effects |
| `setRecordButtonDisabled(disabled)` | 7 | MINOR LOGIC | Sets `disabled` + toggles CSS class |
| `updateCinematicMode(active)` | 1 | PASS-THROUGH | `effects?.setCinematicMode(active)` |
| `updateMinimalistFullscreen(active)` | 1 | PASS-THROUGH | `effects?.setMinimalistFullscreen(active)` |
| `enableControlsAutoHide()` | 1 | PASS-THROUGH | `effects?.enableControlsAutoHide(elements)` |
| `disableControlsAutoHide()` | 1 | PASS-THROUGH | `effects?.disableControlsAutoHide()` |
| `getFullscreenControls()` | 1 | GETTER | Returns `elements.fullscreenControls` |
| `getStreamCanvas()` | 1 | GETTER | Returns `elements.streamCanvas` |
| `setStreamCanvas(canvas)` | 1 | SETTER | Assigns `elements.streamCanvas` |
| `getStreamVideo()` | 1 | GETTER | Returns `elements.streamVideo` |
| `triggerDownload(blob, filename)` | 1 | PASS-THROUGH | `downloadFile(blob, filename)` |
| `on(elementKey, event, handler)` | 5 | HELPER | `_domListeners.add(element, event, handler)` |
| `dispose()` | 4 | LIFECYCLE | Disposes effects + registry + listeners |

**Summary:**
- 20 of 33 methods are pure pass-through (1-line delegation)
- 5 methods are element getters/setters
- 4 methods are setup/initialization
- 3 methods have minor logic (2-7 lines)
- 1 method (`setStreamingMode`) has meaningful coordination logic (7 lines)

#### Indirection Cost

The UIController sits between bridges and effects/components. The call chain for a typical event is:

```
EventBus -> Bridge._handleX(data) -> uiController.updateX(data) -> effects.setX(data) -> bodyClassManager.setX(data) -> document.body.classList.toggle()
```

That is **4 levels of delegation** for what ends up being a single `classList.toggle()` call. The UIController adds virtually no logic in most chains.

**However**, UIController does serve as:
1. The central DOM element reference holder (`this.elements`)
2. The coordination point for streaming mode (enabling/disabling multiple effects)
3. The component initialization orchestrator (settings, shader, notes)
4. The `on()` helper for tracked event listener registration

### 4b. UIComponentRegistry

**File:** `presentation/controller/component.registry.js` (124 lines)
**Role:** Component lifecycle management (create, cache, dispose)

This is a clean, focused utility. It:
- Stores component definitions (id, stage, create factory)
- Provides `initialize()` (batch all core components) and `initializeComponent()` (lazy single)
- Manages a `Map<string, Component>` for lookups via `get(name)`
- Disposes all components on `dispose()`

**Assessment:** This class earns its existence. It prevents the UIController from being littered with component construction code. The "definition" pattern (register factories, create lazily) is sound.

---

## 5. Feature Components Analysis

### 5a. Component Initialization Patterns

Every feature component follows the same structure:

```javascript
class XComponent {
  constructor({ dep1, dep2, logger }) {
    this.dep1 = dep1;
    this.dep2 = dep2;
    this.logger = logger;
    this._domListeners = createDomListenerManager({ logger });
    this._eventSubscriptions = [];
  }

  initialize(elements) {
    this.element1 = elements.foo;
    this.element2 = elements.bar;
    if (!this.element1) { this.logger?.warn('...'); return; }
    this._setupX();
    this._subscribeToEvents();
  }

  dispose() {
    this._domListeners.removeAll();
    this._eventSubscriptions.forEach(unsubscribe => {
      if (typeof unsubscribe === 'function') unsubscribe();
    });
    this._eventSubscriptions = [];
    this.element1 = null;
    // ... null all references
  }
}
```

This pattern repeats in **13 component files**:
1. `ShaderPresetListComponent` (174 lines)
2. `ShaderSliderControlsComponent` (259 lines)
3. `CinematicToggleComponent` (91 lines)
4. `NotesPanelComponent` (513 lines)
5. `NotesEditorViewComponent` (370 lines)
6. `NotesListViewComponent` (279 lines)
7. `NotesSearchComponent` (133 lines)
8. `NotesResizeHandlerComponent` (274 lines)
9. `NotesPanelLayoutComponent` (186 lines)
10. `GameAutocompleteComponent` (389 lines)
11. `GameFilterComponent` (299 lines)
12. `UpdateSectionComponent` (333 lines)
13. `SettingsMenuComponent` (381 lines)

### 5b. Repeated Dispose Pattern

The event subscription cleanup pattern appears in every component that subscribes to EventBus events:

```javascript
this._eventSubscriptions.forEach(unsubscribe => {
  if (typeof unsubscribe === 'function') {
    unsubscribe();
  }
});
this._eventSubscriptions = [];
```

This exact block appears in:
- `ShaderPresetListComponent` (dispose, lines 157-164)
- `ShaderSliderControlsComponent` (dispose, lines 240-245)
- `CinematicToggleComponent` (dispose, lines 76-82)
- `NotesPanelComponent` (dispose, lines 487-494)
- `UpdateSectionComponent` (dispose, lines 313-318)
- `UIEventBridge` (dispose, lines 161-168)
- `CaptureUIBridge` (dispose, lines 31-38)
- `TranscodeUIBridge` (dispose, lines 40-48)

**8 identical blocks totaling ~48 lines of duplicated cleanup code.**

This is the strongest argument for `LifecycleService` adoption in the feature component layer, not just bridges.

### 5c. Repeated Reference Nullification in Dispose

Every component that stores element references nullifies them on dispose:

```javascript
dispose() {
  // ... cleanup ...
  this.element1 = null;
  this.element2 = null;
  this.dep1 = null;
  this.dep2 = null;
  this.logger = null;
}
```

Examples:
- `GameAutocompleteComponent`: 10 null assignments (lines 375-385)
- `NotesEditorViewComponent`: 12 null assignments (lines 354-366)
- `ShaderSliderControlsComponent`: 9 null assignments (lines 247-255)
- `GameFilterComponent`: 7 null assignments (lines 288-294)

**Total across all components: ~60-70 null assignment lines.**

In a garbage-collected runtime like V8, explicit nullification of member references is rarely necessary for preventing memory leaks. The component instance itself going out of scope is sufficient. These null assignments are defensive coding that adds bulk without measurable benefit.

### 5d. Components That Are NOT Thin Wrappers

The following components contain substantial, irreducible logic:

| Component | Lines | Substantive Logic |
|-----------|-------|-------------------|
| `NotesPanelComponent` | 513 | Full CRUD orchestration, sub-component coordination, search/filter piping |
| `GameAutocompleteComponent` | 389 | ARIA combobox, keyboard navigation, debounced search, blur race condition handling |
| `NotesEditorViewComponent` | 370 | Autosave debouncing, game tag UI, hold-to-delete interaction |
| `UpdateSectionComponent` | 333 | State machine UI (7 states), badge management, progress display, action dispatch |
| `SettingsMenuComponent` | 381 | 6 settings bindings, recording format dropdown, disclaimer toggle, external links |
| `GameFilterComponent` | 299 | Listbox pattern, option rendering, keyboard navigation |
| `NotesListViewComponent` | 279 | Game grouping, HTML rendering, expand/collapse, active state |
| `NotesResizeHandlerComponent` | 274 | Drag-to-resize with RAF throttling, touch support, width constraints |
| `ShaderSliderControlsComponent` | 259 | Dual slider management (brightness + volume), custom thumb positioning |

These are all well-structured, appropriately scoped components.

### 5e. Components That Could Potentially Be Simplified

| Component | Lines | Assessment |
|-----------|-------|-----------|
| `StreamingControlsComponent` | 143 | Contains animation timeout management that is specific and justified |
| `TranscodeToastComponent` | 161 | Clean, focused. CSS class management for progress ring states |
| `ShaderPresetListComponent` | 174 | Renders preset list from PresetRegistry, handles selection |
| `NotesSearchComponent` | 133 | Simple debounced search input -- could be a utility, but fine as-is |
| `NotesPanelLayoutComponent` | 186 | Complex viewport math for panel positioning. Self-contained |
| `CinematicToggleComponent` | 91 | Simple toggle with ARIA. Appropriate size |
| `ShaderSelectorComponent` | 123 | Composes 3 sub-components via DisclosureController. Clean |

None of these are thin wrappers. Every component has at least one non-trivial responsibility. The component decomposition is appropriate.

---

## 6. Primitives Analysis

### 6a. DisclosureController

**File:** `presentation/primitives/disclosure.class.js` (149 lines)
**Used by:** `SettingsMenuComponent`, `ShaderSelectorComponent`, `GameFilterComponent`, `ListboxDropdownController`

Solid reusable primitive. Handles:
- Show/hide with CSS class toggling
- ARIA `expanded` attribute management
- Escape key to close
- Click-outside to close (with configurable outside event and ignore elements/selectors)
- Tracked DOM listeners via `createDomListenerManager`

**Assessment:** Well-utilized across 4 consumers. No changes needed.

### 6b. ListboxDropdownController

**File:** `presentation/primitives/listbox-dropdown.class.js` (120 lines)
**Used by:** `SettingsMenuComponent` (recording format dropdown)

Composes `DisclosureController` + `listbox.utils.js` for a complete dropdown with option selection, label update, and ARIA state.

**Assessment:** Only 1 consumer. Could be used more if other dropdowns are added. Fine as-is for extensibility.

### 6c. HideTimer

**File:** `presentation/primitives/hide-timer.class.js` (64 lines)
**Used by:** `UIEffects` (unified cursor/toolbar timer)

Clean timer abstraction with `start`/`clear`/`dispose` and a `shouldStart` predicate.

**Assessment:** Single consumer but well-abstracted. No changes needed.

### 6d. listbox.utils.js

**File:** `presentation/primitives/listbox.utils.js` (41 lines)
**Used by:** `ListboxDropdownController`, `GameFilterComponent`

Two utility functions: `renderListboxOptions` and `updateListboxActiveState`.

**Assessment:** Properly extracted shared helpers. No changes needed.

### 6e. dom-bindings.utils.js

**File:** `presentation/primitives/dom-bindings.utils.js` (149 lines)
**Used by:** `UIController` (single consumer)

Maps every DOMSelector ID to its corresponding DOM element, organized by domain (shell, streaming, settings, updates, notes). Returns both grouped and flat views.

**Assessment:** This is a well-structured centralization of DOM lookups. Single consumer but appropriate as a utility since it is pure data mapping. No changes needed.

---

## 7. Shared Components Analysis

### 7a. DeviceStatusComponent

**File:** `presentation/shared/device-status.component.js` (90 lines)
**Used by:** Registered as `deviceStatusComponent` in UIComponentRegistry

Manages device connection status display (indicator classes, status text, overlay messages).

**Assessment:** Well-scoped. Used via UIController pass-through methods. No changes needed.

### 7b. StatusNotificationComponent

**File:** `presentation/shared/status-notification.component.js` (33 lines)
**Used by:** Registered as `statusNotificationComponent` in UIComponentRegistry

Minimal component: sets `textContent` and `dataset.type` on a status message element.

**Assessment:** At 33 lines (including JSDoc), this is the most minimal component. It could theoretically be inlined, but it follows the component pattern consistently and provides type validation. Fine as-is.

---

## 8. Config Files Analysis

### 8a. Config Files That Add Value

| File | Lines | Content | Consumers |
|------|-------|---------|-----------|
| `css-classes.config.ts` | 73 | CSS class string constants | 20+ files across presentation layer |
| `dom-selectors.config.ts` | 116 | DOM element ID constants | `dom-bindings.utils.js` (single consumer) |
| `notes-panel.config.ts` | 16 | Notes panel numeric constants | `notes-editor-view`, `notes-resize-handler`, `game-autocomplete` |

These provide genuine value by preventing typos and enabling IDE autocomplete.

### 8b. Re-Export Files (No Value Added)

| File | Lines | Content | Consumers | Original Source |
|------|-------|---------|-----------|----------------|
| `constants.config.ts` | 1 | `export { TIMING } from '@shared/config/timing.config'` | 5 files | `@shared/config/timing.config` |
| `storage-keys.config.ts` | 5 | Re-exports 3 symbols from `@shared/config/storage-keys.config` | **0 consumers** | `@shared/config/storage-keys.config` |
| `update-state.config.ts` | 1 | `export { UpdateState } from '@shared/config/update-state.config'` | 1 file | `@shared/config/update-state.config` |

**Detailed consumer analysis:**

`constants.config.ts` (re-exports `TIMING`):
- `body-class.class.ts` -- imports via `@renderer/presentation/config/constants.config`
- `button-feedback.effect.ts` -- imports via `@renderer/presentation/config/constants.config`
- `controls-auto-hide.effect.ts` -- imports via `@renderer/presentation/config/constants.config`
- `capture-ui.bridge.ts` -- imports via `@renderer/presentation/config/constants.config`
- `hide-timer.class.js` -- imports via `@renderer/presentation/config/constants.config`

All 5 consumers could import directly from `@shared/config/timing.config` (which 3 other files already do).

`storage-keys.config.ts`: **Zero consumers.** No file imports from `@renderer/presentation/config/storage-keys.config`. All actual consumers already import directly from `@shared/config/storage-keys.config`. This file is dead code.

`update-state.config.ts`: 1 consumer (`update-section.component.js`). That consumer could import directly from `@shared/config/update-state.config`.

**Recommendation:** Delete all 3 re-export config files. Update 6 import paths total (5 for constants, 1 for update-state).

---

## 9. Lib Re-Exports Analysis

| File | Lines | Content | Consumers | Original Source |
|------|-------|---------|-----------|----------------|
| `lib/file-download.utils.ts` | 1 | `export { downloadFile } from '@shared/lib/file-download.utils'` | 1 file (`ui.controller.js`) | `@shared/lib/file-download.utils` |
| `lib/filename-generator.utils.ts` | 1 | `export { FilenameGenerator } from '@shared/lib/filename-generator.utils'` | **0 consumers** | `@shared/lib/filename-generator.utils` |

`file-download.utils.ts`: Single consumer could import directly.

`filename-generator.utils.ts`: **Zero consumers.** Dead code.

**Recommendation:** Delete both re-export files. Update 1 import path (for file-download in ui.controller.js).

### Lib File That Adds Value

`lib/brightness.utils.ts` (26 lines): Contains `sliderToBrightness` and `brightnessToSlider` conversion functions. Used by `ShaderSliderControlsComponent`. This is genuine presentation-layer utility code. Keep.

---

## 10. Cross-Cutting Patterns

### 10a. Event Subscription Cleanup Pattern

This identical pattern appears in 8 files (3 bridges + 5 feature components):

```javascript
this._eventSubscriptions = [];

// in initialize:
this._eventSubscriptions.push(
  this.eventBus.subscribe(...)
);

// in dispose:
this._eventSubscriptions.forEach(unsubscribe => {
  if (typeof unsubscribe === 'function') unsubscribe();
});
this._eventSubscriptions = [];
```

**Impacted files:**
1. `bridges/ui-event.bridge.ts`
2. `bridges/capture-ui.bridge.ts`
3. `bridges/transcode-ui.bridge.ts`
4. `features/toolbar/components/shader-preset-list.component.js`
5. `features/toolbar/components/shader-slider-controls.component.js`
6. `features/toolbar/components/cinematic-toggle.component.js`
7. `features/notes/notes-panel.component.js`
8. `features/updates/update-section.component.js`

If `LifecycleService.subscribeWithCleanup()` were adopted by feature components (not just bridges), this would eliminate ~48 lines of boilerplate.

### 10b. DOM Listener Manager Usage

`createDomListenerManager` is imported and used in **15 files** across the presentation layer. Every file follows the same pattern:

```javascript
this._domListeners = createDomListenerManager({ logger });
// ... in various methods:
this._domListeners.add(element, 'click', handler);
// ... in dispose:
this._domListeners.removeAll();
```

This is a well-adopted pattern with consistent usage. No consolidation needed -- the utility itself is the consolidation.

### 10c. Inconsistent Listener Management

The 3 auto-hide effect classes (`CursorAutoHide`, `ToolbarAutoHide`, `ControlsAutoHide`) do NOT use `createDomListenerManager`. Instead, they manually:
- Store pre-bound handlers as instance properties
- Call `document.addEventListener(...)` in `enable()`
- Call `document.removeEventListener(...)` in `disable()`

This is an inconsistency. These classes predate the `createDomListenerManager` utility or were written with a different pattern in mind (enable/disable lifecycle vs. single-setup lifecycle).

**Impact:** Not a bug, but a pattern inconsistency. Low priority fix.

### 10d. UIController Double-Delegation Chain

Several call paths have excessive indirection:

**Example 1: Shutter Flash**
```
EventBus(UI.SHUTTER_FLASH)
  -> UIEventBridge._handleShutterFlash()           // 1 line
    -> uiController.triggerShutterFlash()           // 1 line
      -> effects.triggerShutterFlash()              // 1 line
        -> _captureEffects.triggerShutterFlash()    // 1 line
          -> _createFlashOverlay('shutter-flash')   // actual work
```
**5 delegation levels** for a flash overlay creation.

**Example 2: Cinematic Mode**
```
EventBus(SETTINGS.CINEMATIC_MODE_CHANGED)
  -> UIEventBridge._handleCinematicMode()           // 3 lines
    -> presentationModeService.handleCinematicModeChanged()  // 3 lines
      -> uiController.updateCinematicMode()         // 1 line
        -> effects.setCinematicMode()               // 1 line
          -> bodyClassManager.setCinematicMode()    // 1 line
            -> document.body.classList.toggle()     // actual work
```
**6 delegation levels** for a single CSS class toggle.

**Assessment:** The indirection is not a performance problem (these are infrequent UI events). The architectural concern is maintainability: when debugging "why isn't cinematic mode toggling?", a developer must trace through 6 files. However, each layer has a clear single responsibility, so the trade-off is defensible for a codebase of this size.

---

## 11. Architectural Assessment

### 11a. Does UIController Earn Its Keep?

**Arguments FOR keeping UIController:**
- Central DOM element reference holder (`this.elements` consumed by 10+ callers)
- Single dispose point for effects + registry + DOM listeners
- The `on()` helper provides tracked listener management to orchestrators
- Serves as a stable public API that shields orchestrators from internal UI restructuring

**Arguments AGAINST (or for slimming):**
- 20 of 33 methods are 1-line delegations
- Bridges could hold their own element references (they already receive them indirectly)
- The `setStreamingMode()` logic (7 lines) is the only meaningful coordination

**Verdict:** UIController should be **kept but not expanded further**. It is a necessary integration point between the DI-managed world (orchestrators, services) and the DOM-managed world (effects, components). The pass-through methods are the cost of clean layer separation. However, new UI interactions should go directly through EventBus -> Component rather than adding more pass-through methods.

### 11b. Does UIComponentRegistry Earn Its Keep?

Yes. Without it, UIController would need to hard-code component construction and lifecycle for every component. The registry pattern (definition factories + lazy initialization + batch dispose) is clean and extensible.

### 11c. Is the Bridge Pattern Worth It?

**UIEventBridge:** Borderline. 15 of 16 handlers are pure pass-through. If `PresentationModeService` subscribed to its own events (fullscreen, cinematic, minimalist) and components subscribed to their own events (status message, device status, overlay), UIEventBridge could be eliminated. However, this would scatter subscriptions across 5+ files and make it harder to see the complete event-to-UI mapping.

**CaptureUIBridge:** Definitively worth it. Every handler contains meaningful translation logic (domain events -> multi-step UI feedback sequences).

**TranscodeUIBridge:** Worth it. Manages transcode state, coordinates button disable/enable with toast display.

### 11d. Notes Feature Complexity

The notes panel has 8 files totaling 2,443 lines -- more than 1/3 of the entire presentation layer. This is appropriate given the complexity:
- Full CRUD operations
- Search with debouncing
- Game filtering with dropdown
- Game autocomplete with ARIA combobox
- Drag-to-resize with touch support
- Auto-save with debouncing
- Hold-to-delete interaction
- Dynamic panel positioning

The sub-component decomposition is well done (each has a clear, testable responsibility).

---

## 12. Consolidation Opportunities

### 12a. Confirmed Wins (In Scope for Consolidation Design)

| Opportunity | Files Changed | Lines Saved | Risk |
|------------|--------------|-------------|------|
| Delete re-export config files (`constants.config.ts`, `storage-keys.config.ts`, `update-state.config.ts`) | Delete 3, modify 6 | ~7 lines + 6 import updates | LOW |
| Delete re-export lib files (`file-download.utils.ts`, `filename-generator.utils.ts`) | Delete 2, modify 1 | ~2 lines + 1 import update | LOW |
| Bridge LifecycleService migration (per design doc Phase 4) | Modify 3 | ~33 lines | MEDIUM |

### 12b. Follow-Up Opportunities (Not In Scope)

| Opportunity | Files Changed | Lines Saved | Risk |
|------------|--------------|-------------|------|
| Auto-hide effect base class | 3 effects + 1 new base | ~75-90 lines | MEDIUM |
| Feature component subscription cleanup via LifecycleService | 5 components | ~35 lines | MEDIUM |
| Remove explicit null assignments in dispose methods | 13 components | ~60-70 lines | LOW |
| Migrate auto-hide effects to use `createDomListenerManager` | 3 files | ~20 lines (net, after removing manual bind/unbind) | LOW |

### 12c. Architecture Preservations (Do NOT Change)

| Item | Reason to Keep |
|------|---------------|
| UIController | Central DOM reference holder + stable public API |
| UIComponentRegistry | Component lifecycle management + factory pattern |
| CaptureUIBridge | Meaningful domain-to-UI translation logic |
| TranscodeUIBridge | State management + multi-event coordination |
| DisclosureController | Well-utilized by 4 consumers |
| Notes sub-component decomposition | Appropriate complexity management |
| `createDomListenerManager` pattern | Widely adopted, prevents memory leaks |

### 12d. Dead Code Summary

| File | Lines | Status |
|------|-------|--------|
| `presentation/config/storage-keys.config.ts` | 5 | DEAD (zero consumers) |
| `presentation/lib/filename-generator.utils.ts` | 1 | DEAD (zero consumers) |
| **Total dead code** | **6 lines, 2 files** | |

---

## Appendix: File Inventory with Line Counts

```
presentation/
  bridges/
    capture-ui.bridge.ts                     87 lines
    transcode-ui.bridge.ts                  127 lines
    ui-event.bridge.ts                      170 lines
  config/
    constants.config.ts                       1 line   [RE-EXPORT]
    css-classes.config.ts                    73 lines
    dom-selectors.config.ts                 116 lines
    notes-panel.config.ts                    16 lines
    storage-keys.config.ts                    5 lines  [DEAD CODE]
    update-state.config.ts                    1 line   [RE-EXPORT]
  controller/
    component.registry.js                   124 lines
    ui.controller.js                        365 lines
  effects/
    body-class.class.ts                     133 lines
    button-feedback.effect.ts                90 lines
    capture.effect.ts                        43 lines
    controls-auto-hide.effect.ts            233 lines
    cursor-auto-hide.effect.ts              113 lines
    toolbar-auto-hide.effect.ts             249 lines
    ui-effects.class.ts                     336 lines
  features/
    notes/
      components/
        game-autocomplete.component.js      389 lines
        game-filter.component.js            299 lines
        notes-editor-view.component.js      370 lines
        notes-list-view.component.js        279 lines
        notes-panel-layout.component.js     186 lines
        notes-resize-handler.component.js   274 lines
        notes-search.component.js           133 lines
      notes-panel.component.js              513 lines
    settings/
      settings-menu.component.js            381 lines
    streaming/
      streaming-controls.component.js       143 lines
    toolbar/
      components/
        cinematic-toggle.component.js        91 lines
        shader-preset-list.component.js     174 lines
        shader-selector.component.js        123 lines
        shader-slider-controls.component.js 259 lines
    transcode/
      transcode-toast.component.js          161 lines
    updates/
      update-section.component.js           333 lines
  icons/
    icon.utils.js                           101 lines
  lib/
    brightness.utils.ts                      26 lines
    file-download.utils.ts                    1 line   [RE-EXPORT]
    filename-generator.utils.ts               1 line   [DEAD CODE]
  primitives/
    disclosure.class.js                     149 lines
    dom-bindings.utils.js                   149 lines
    hide-timer.class.js                      64 lines
    listbox-dropdown.class.js               120 lines
    listbox.utils.js                         41 lines
  shared/
    device-status.component.js               90 lines
    status-notification.component.js         33 lines

TOTAL: 47 source files, 7,438 lines
```
