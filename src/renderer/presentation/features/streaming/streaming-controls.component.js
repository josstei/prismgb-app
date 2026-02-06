/**
 * StreamControlsComponent
 *
 * Manages stream-related controls and display (resolution, FPS, streaming state).
 * Handles all UI elements related to streaming configuration and state.
 */

import { CSSClasses } from '@renderer/presentation/config/css-classes.config.ts';

const STREAM_TRANSITION_DURATION = 1000; // Match CSS animation duration

class StreamingControlsComponent {
  /**
   * Create stream controls component
   * @param {Object} elements - DOM elements
   */
  constructor({ elements, bodyClassManager }) {
    this.elements = elements;
    this.bodyClassManager = bodyClassManager || null;
    this._animationTimeoutId = null;
    this._streamTransitionTimeoutId = null;
  }

  /**
   * Check if animations are disabled (performance mode)
   * @returns {boolean}
   */
  _areAnimationsDisabled() {
    return this.bodyClassManager?.areAnimationsOff?.() ?? document.body.classList.contains(CSSClasses.APP_ANIMATIONS_OFF);
  }

  /**
   * Set streaming mode
   * @param {boolean} isStreaming - Is streaming active
   */
  setStreamingMode(isStreaming) {
    const skipAnimation = this._areAnimationsDisabled();

    if (isStreaming) {
      // Remove any lingering hiding class from previous cycle
      this.elements.screenshotBtn?.classList.remove(CSSClasses.HIDING);
      this.elements.recordBtn?.classList.remove(CSSClasses.HIDING);
      this.elements.shaderControls?.classList.remove(CSSClasses.HIDING);

      // Clear any pending transition timeout
      if (this._streamTransitionTimeoutId !== null) {
        clearTimeout(this._streamTransitionTimeoutId);
        this._streamTransitionTimeoutId = null;
      }

      if (skipAnimation) {
        // Skip animation - show stream immediately
        this.bodyClassManager?.setStreamingMode(true);
        if (this.elements.screenshotBtn) this.elements.screenshotBtn.disabled = false;
        if (this.elements.recordBtn) this.elements.recordBtn.disabled = false;
        this.elements.streamOverlay?.classList.add(CSSClasses.HIDDEN);
      } else {
        // Start exit animation on overlay and fade in video simultaneously (cross-fade)
        this.elements.streamOverlay?.classList.add(CSSClasses.TRANSITIONING_TO_STREAM);
        this.bodyClassManager?.setStreamingMode(true);

        // After animation completes, enable controls and finalize overlay state
        this._streamTransitionTimeoutId = setTimeout(() => {
          this._streamTransitionTimeoutId = null;
          if (this.elements.screenshotBtn) this.elements.screenshotBtn.disabled = false;
          if (this.elements.recordBtn) this.elements.recordBtn.disabled = false;
          // Hide the overlay
          this.elements.streamOverlay?.classList.remove(CSSClasses.TRANSITIONING_TO_STREAM);
          this.elements.streamOverlay?.classList.add(CSSClasses.HIDDEN);
        }, STREAM_TRANSITION_DURATION);
      }
    } else {
      // Clear any pending stream transition timeout
      if (this._streamTransitionTimeoutId !== null) {
        clearTimeout(this._streamTransitionTimeoutId);
        this._streamTransitionTimeoutId = null;
        // Remove transitioning class if it was applied
        this.elements.streamOverlay?.classList.remove(CSSClasses.TRANSITIONING_TO_STREAM);
      }

      // Clear any pending animation timeout
      if (this._animationTimeoutId !== null) {
        clearTimeout(this._animationTimeoutId);
        this._animationTimeoutId = null;
      }

      if (skipAnimation) {
        // Skip animation - hide stream immediately
        this.elements.streamOverlay?.classList.remove(CSSClasses.HIDDEN);
        this.bodyClassManager?.setStreamingMode(false);
        if (this.elements.screenshotBtn) this.elements.screenshotBtn.disabled = true;
        if (this.elements.recordBtn) this.elements.recordBtn.disabled = true;
        if (this.elements.currentResolution) this.elements.currentResolution.textContent = '—';
        if (this.elements.currentFPS) this.elements.currentFPS.textContent = '—';
      } else {
        // Trigger pop-out animation before hiding
        this.elements.screenshotBtn?.classList.add(CSSClasses.HIDING);
        this.elements.recordBtn?.classList.add(CSSClasses.HIDING);
        this.elements.shaderControls?.classList.add(CSSClasses.HIDING);

        // Wait for animation to complete before removing streaming-mode
        this._animationTimeoutId = setTimeout(() => {
          this._animationTimeoutId = null;
          this.elements.streamOverlay?.classList.remove(CSSClasses.HIDDEN);
          this.bodyClassManager?.setStreamingMode(false);
          if (this.elements.screenshotBtn) this.elements.screenshotBtn.disabled = true;
          if (this.elements.recordBtn) this.elements.recordBtn.disabled = true;
          if (this.elements.currentResolution) this.elements.currentResolution.textContent = '—';
          if (this.elements.currentFPS) this.elements.currentFPS.textContent = '—';
        }, 150);
      }
    }
  }

  /**
   * Update stream info display
   * @param {Object} settings - { width: number, height: number, frameRate: number }
   */
  updateStreamInfo(settings) {
    if (settings) {
      if (this.elements.currentResolution) this.elements.currentResolution.textContent = `${settings.width}x${settings.height}`;
      if (this.elements.currentFPS) this.elements.currentFPS.textContent = `${settings.frameRate} fps`;
    }
  }

  /**
   * Dispose and cleanup resources
   */
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
    this.bodyClassManager = null;
  }
}

export { StreamingControlsComponent };
