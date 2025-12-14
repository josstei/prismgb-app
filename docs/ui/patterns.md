# UI Patterns and Utilities

## 1. Overview

Common patterns for DOM handling, effects, and event management in the PrismGB renderer process.

## 2. UIEventHandler Pattern

**Location:** `src/ui/event-handler.js`

Bridges EventBus to UIController, providing a centralized event subscription map for UI updates.

```javascript
// Event subscription map
{
  'ui:status-message': _handleStatusMessage,
  'ui:device-status': _handleDeviceStatus,
  'ui:overlay-message': _handleOverlayMessage,
  'ui:streaming-mode': _handleStreamingMode,
  'ui:shutter-flash': _handleShutterFlash,
  'ui:recording-state': _handleRecordingState,
  'ui:volume-level': _handleVolumeLevel,
  'ui:cinematic-mode': _handleCinematicMode,
  // ... more
}
```

**Pattern:** Event → Handler → UIController method delegation

The UIEventHandler subscribes to all UI-related events from the EventBus and delegates them to the appropriate UIController methods. This provides a clean separation between event-driven communication and DOM manipulation.

## 3. UIEffects

**Location:** `src/ui/effects.js`

Visual feedback effects for user interactions:

- `triggerShutterFlash()` - Screenshot flash overlay
- `triggerRecordButtonPop()` - Recording start animation
- `triggerRecordButtonPress()` - Recording stop animation
- `triggerButtonFeedback(element, className, duration)` - Generic button animation

**Animation restart pattern:**

```javascript
element.classList.remove(className);
void element.offsetWidth; // Force reflow
element.classList.add(className);
setTimeout(() => element.classList.remove(className), duration);
```

This pattern ensures animations can be retriggered even if the class is already present by forcing a browser reflow.

## 4. DOMListenerManager

**Location:** `src/shared/base/dom-listener.js`

Tracked DOM event listener management with automatic cleanup:

```javascript
const listeners = createDomListenerManager({ logger });
listeners.add(element, 'click', handler);
listeners.removeAll(); // Cleanup
```

**Features:**

- Tracks all listeners for cleanup
- Returns unsubscribe function
- Safe null checks with logging
- Memory leak prevention

Use this pattern in all services and orchestrators to ensure proper cleanup when components are destroyed.

## 5. CSS-Driven Animations

**Pattern:** JavaScript adds/removes classes, CSS handles animations.

This separation of concerns keeps animation logic in CSS while JavaScript controls timing and state.

**Key CSS classes** (from `css-classes.js`):

- `CONNECTED` / `DISCONNECTED` - Device status
- `HIDDEN` / `VISIBLE` - Visibility
- `RECORDING` - Record button state
- `ACTIVE` - Selected element
- `CINEMATIC_ACTIVE` - Body cinematic mode
- `STREAMING_MODE` - Body streaming state

## 6. DOM Selectors Pattern

**Location:** `src/shared/config/dom-selectors.js`

Centralized element IDs prevent typos and make refactoring easier:

```javascript
const elements = {
  statusIndicator: document.getElementById(DOMSelectors.STATUS_INDICATOR),
  streamVideo: document.getElementById(DOMSelectors.STREAM_VIDEO),
  // ...
};
```

Always use `DOMSelectors` constants instead of hardcoded strings when accessing DOM elements.

## 7. Click-Outside Pattern

Used in dropdown components for closing when clicking outside:

```javascript
document.addEventListener('click', (e) => {
  if (!container.contains(e.target)) {
    this.hide();
  }
});
```

Remember to remove these listeners during cleanup to prevent memory leaks.

## 8. Key Files

- `src/ui/event-handler.js` - Event-to-UI bridge
- `src/ui/effects.js` - Visual feedback effects
- `src/shared/base/dom-listener.js` - DOM listener management
- `src/shared/config/css-classes.js` - CSS class constants
- `src/shared/config/dom-selectors.js` - DOM element ID constants
