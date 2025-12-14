/**
 * StreamControlsComponent
 *
 * Manages stream-related controls and display (resolution, FPS, streaming state).
 * Handles all UI elements related to streaming configuration and state.
 */

import { CSSClasses } from '@shared/config/css-classes.js';

class StreamControlsComponent {
  /**
   * Create stream controls component
   * @param {Object} elements - DOM elements
   */
  constructor(elements) {
    this.elements = elements;
    this._animationTimeoutId = null;
  }

  /**
   * Set streaming mode
   * @param {boolean} isStreaming - Is streaming active
   */
  setStreamingMode(isStreaming) {
    if (isStreaming) {
      // Remove hiding class if present from previous hide
      this.elements.screenshotBtn?.classList.remove(CSSClasses.HIDING);
      this.elements.recordBtn?.classList.remove(CSSClasses.HIDING);

      this.elements.streamOverlay?.classList.add(CSSClasses.HIDDEN);
      document.body.classList.add(CSSClasses.STREAMING_MODE);
      if (this.elements.screenshotBtn) this.elements.screenshotBtn.disabled = false;
      if (this.elements.recordBtn) this.elements.recordBtn.disabled = false;
    } else {
      // Clear any pending animation timeout
      if (this._animationTimeoutId !== null) {
        clearTimeout(this._animationTimeoutId);
        this._animationTimeoutId = null;
      }

      // Trigger pop-out animation before hiding
      this.elements.screenshotBtn?.classList.add(CSSClasses.HIDING);
      this.elements.recordBtn?.classList.add(CSSClasses.HIDING);

      // Wait for animation to complete before removing streaming-mode
      this._animationTimeoutId = setTimeout(() => {
        this._animationTimeoutId = null;
        this.elements.streamOverlay?.classList.remove(CSSClasses.HIDDEN);
        document.body.classList.remove(CSSClasses.STREAMING_MODE);
        if (this.elements.screenshotBtn) this.elements.screenshotBtn.disabled = true;
        if (this.elements.recordBtn) this.elements.recordBtn.disabled = true;
        if (this.elements.currentResolution) this.elements.currentResolution.textContent = '—';
        if (this.elements.currentFPS) this.elements.currentFPS.textContent = '—';
      }, 150);
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
    this.elements = null;
  }
}

// Export for ESM
export { StreamControlsComponent };
