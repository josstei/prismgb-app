# Overlay Streaming Animation - Implementation Plan

This document outlines the implementation plan for adding a smooth animation transition from standby (overlay visible) to streaming mode.

## Current State Analysis

### Existing Transition Flow (Standby → Streaming)

The current transition from overlay (standby) to streaming is **instant**:

1. User clicks overlay → `ui:stream-start-requested` event
2. `StreamingOrchestrator` calls `StreamingService.start()`
3. `StreamingService` emits `stream:started` event
4. `StreamingOrchestrator` publishes `ui:streaming-mode { enabled: true }`
5. `StreamingControlsComponent.setStreamingMode(true)` executes:
   - `streamOverlay.classList.add('hidden')` → **Immediate opacity: 0**
   - `document.body.classList.add('streaming-mode')` → Shows video

**Problem**: The `.hidden` class is applied instantly without animation:

```css
/* overlays.css:45-51 */
.stream-overlay.hidden {
  opacity: 0 !important;
  visibility: hidden;
  pointer-events: none;
  animation: none !important;
  content-visibility: hidden;
}
```

### Existing Animation Patterns

The codebase uses:
- **CSS-driven state changes** via `:has()` selectors (`states.css:247-356`)
- **GPU-accelerated properties only**: `transform`, `opacity`, `filter`
- **Centralized CSS classes** in `css-classes.config.js`
- **Synchronized timing**: 1.4s heartbeat cycle for ready state animations
- **Reduced motion support**: `@media (prefers-reduced-motion: reduce)` blocks
- **Performance optimizations**: `contain`, `will-change`, animation pausing when hidden

---

## Proposed Solution

### Architecture Decision: CSS Class + Timeout Pattern

Following the existing pattern in `StreamingControlsComponent` (where button hide animation uses 150ms timeout before state change), we introduce a **transitional class** that triggers CSS animations before hiding.

### State Transition

```
READY (visible, pulsing)
  → TRANSITIONING (fade-out animation playing)
  → HIDDEN (streaming mode active)
```

---

## Implementation Components

### 1. New CSS Class Constant

**File**: `src/shared/config/css-classes.config.js`

Add a new class constant:

```javascript
TRANSITIONING_TO_STREAM: 'transitioning-to-stream',
```

### 2. CSS Keyframe Animation

**File**: `src/renderer/assets/styles/animations.css`

Add a new keyframe for the overlay exit animation:

```css
/* Overlay exit animation - dissolve effect with scale */
@keyframes overlay-exit-dissolve {
  0% {
    opacity: 1;
    transform: scale(1);
    filter: brightness(1);
  }
  30% {
    opacity: 0.9;
    transform: scale(1.02);
    filter: brightness(1.3);
  }
  100% {
    opacity: 0;
    transform: scale(1.08);
    filter: brightness(1.5);
  }
}
```

**Rationale**:
- Scale slightly expands (1.08) to create a "zoom into stream" effect
- Brightness increases to simulate "flash" as stream activates
- Duration: 300ms (fast enough not to feel sluggish, slow enough to be perceived)

### 3. CSS State Styles

**File**: `src/renderer/assets/styles/overlays.css`

Add transitioning state rules (before `.hidden` rules):

```css
/* Transitioning state - overlay exit animation */
.stream-overlay.transitioning-to-stream {
  animation: overlay-exit-dissolve 300ms ease-out forwards;
  pointer-events: none;
}

/* Staggered child element exits for depth */
.stream-overlay.transitioning-to-stream .icon-wrapper {
  animation: overlay-exit-dissolve 250ms ease-out forwards;
}

.stream-overlay.transitioning-to-stream .particle {
  animation: overlay-exit-dissolve 200ms ease-out forwards;
}

.stream-overlay.transitioning-to-stream .ready-ring {
  animation: overlay-exit-dissolve 200ms ease-out forwards;
}

.stream-overlay.transitioning-to-stream .gem-glow {
  animation: overlay-exit-dissolve 280ms ease-out forwards;
}

.stream-overlay.transitioning-to-stream .scanlines {
  animation: overlay-exit-dissolve 150ms ease-out forwards;
}
```

**Rationale**:
- Staggered timing creates visual depth (scanlines first, icon last)
- Child elements use slightly different durations for organic feel
- `forwards` fill mode keeps final state until `.hidden` is applied

### 4. Reduced Motion Support

**File**: `src/renderer/assets/styles/states.css`

Add to the existing `@media (prefers-reduced-motion: reduce)` block:

```css
/* Instant transition for reduced motion users */
.stream-overlay.transitioning-to-stream,
.stream-overlay.transitioning-to-stream .icon-wrapper,
.stream-overlay.transitioning-to-stream .particle,
.stream-overlay.transitioning-to-stream .ready-ring,
.stream-overlay.transitioning-to-stream .gem-glow,
.stream-overlay.transitioning-to-stream .scanlines {
  animation: none !important;
  transition: opacity 150ms ease !important;
  opacity: 0;
}
```

### 5. JavaScript Logic Changes

**File**: `src/renderer/features/streaming/ui/streaming-controls.component.js`

#### Add constant at top of file:

```javascript
const STREAM_TRANSITION_DURATION = 300; // ms, matches CSS animation
```

#### Add property to constructor:

```javascript
constructor(elements) {
  this.elements = elements;
  this._animationTimeoutId = null;
  this._streamTransitionTimeoutId = null; // NEW
}
```

#### Modify `setStreamingMode(true)` to use transitional class:

```javascript
setStreamingMode(isStreaming) {
  if (isStreaming) {
    // Remove any lingering hiding class from previous cycle
    this.elements.screenshotBtn?.classList.remove(CSSClasses.HIDING);
    this.elements.recordBtn?.classList.remove(CSSClasses.HIDING);
    this.elements.shaderControls?.classList.remove(CSSClasses.HIDING);

    // Start exit animation on overlay
    this.elements.streamOverlay?.classList.add(CSSClasses.TRANSITIONING_TO_STREAM);

    // Clear any pending transition timeout
    if (this._streamTransitionTimeoutId !== null) {
      clearTimeout(this._streamTransitionTimeoutId);
    }

    // After animation completes, apply hidden state
    this._streamTransitionTimeoutId = setTimeout(() => {
      this._streamTransitionTimeoutId = null;
      this.elements.streamOverlay?.classList.remove(CSSClasses.TRANSITIONING_TO_STREAM);
      this.elements.streamOverlay?.classList.add(CSSClasses.HIDDEN);
      document.body.classList.add(CSSClasses.STREAMING_MODE);
      if (this.elements.screenshotBtn) this.elements.screenshotBtn.disabled = false;
      if (this.elements.recordBtn) this.elements.recordBtn.disabled = false;
    }, STREAM_TRANSITION_DURATION);
  } else {
    // ... existing stop streaming logic unchanged
  }
}
```

#### Update `dispose()`:

```javascript
dispose() {
  if (this._animationTimeoutId !== null) {
    clearTimeout(this._animationTimeoutId);
    this._animationTimeoutId = null;
  }
  if (this._streamTransitionTimeoutId !== null) {
    clearTimeout(this._streamTransitionTimeoutId);
    this._streamTransitionTimeoutId = null;
  }
  this.elements = null;
}
```

---

## File Change Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `src/shared/config/css-classes.config.js` | Add | New `TRANSITIONING_TO_STREAM` constant |
| `src/renderer/assets/styles/animations.css` | Add | New `overlay-exit-dissolve` keyframe |
| `src/renderer/assets/styles/overlays.css` | Add | Transitioning state styles |
| `src/renderer/assets/styles/states.css` | Add | Reduced motion support for transitioning |
| `src/renderer/features/streaming/ui/streaming-controls.component.js` | Modify | Transition timing logic |

---

## Design Decisions & Rationale

### 1. Why CSS Class + Timeout (not CSS transition)?

The existing `.hidden` class uses `!important` overrides and `animation: none !important`. A CSS transition would conflict with these. The timeout pattern:
- Already exists in the codebase (button hide animation)
- Provides explicit control over timing
- Allows cleanup on component disposal

### 2. Why 300ms duration?

- Longer than button animations (150ms) since overlay is the main visual focus
- Short enough to not feel sluggish for rapid start/stop cycles
- Aligns with common perception thresholds (~300ms is noticeable but quick)

### 3. Why scale + brightness effect?

- Scale (1.08) creates "zoom into content" feel
- Brightness increase simulates flash/activation
- Both are GPU-accelerated properties
- Matches existing ready-state flash aesthetics

### 4. Why staggered child animations?

- Creates visual depth and organic feel
- Particles/scanlines (decorative) exit first
- Icon (focal point) exits last
- Follows existing pattern of independent child animations

### 5. Why not add a reverse animation for streaming → standby?

The existing stop-streaming flow already has a 150ms button exit animation followed by overlay reveal. The overlay reappearing with its ready-state animations (gem-pop, ready-ring pulse) already provides a smooth entrance. Adding more would over-complicate the transition.

---

## Considerations

### Performance
- All animations use GPU-accelerated properties only
- `will-change` already applied to animated elements
- Animation only runs once per transition (not looping)

### Edge Cases
- **Rapid start/stop**: Timeout cleanup prevents race conditions
- **Dispose during transition**: Timeouts are cleared in `dispose()`
- **Reduced motion**: Instant opacity transition, no animation

### Future Enhancements (Out of Scope)
- Configurable animation duration via settings
- Different animation styles (fade, blur, pixelate)
- Audio cue synchronization

---

## Testing Considerations

1. **Visual verification**: Overlay smoothly fades out when streaming starts
2. **Rapid toggle**: Start/stop streaming quickly should not cause visual glitches
3. **Reduced motion**: With `prefers-reduced-motion: reduce`, transition should be instant
4. **Device disconnect during transition**: Should handle gracefully
5. **Performance mode**: Animation should still work (Canvas2D rendering)

---

## Compatibility

This implementation is compatible with both:
- Current `main` branch
- `feature/transcode-progress-indicator` branch

The overlay-related files are identical on both branches, and the animation operates on different DOM elements than the transcode progress UI.
