/**
 * UIEffects - Handles visual feedback effects
 * Manages flash overlays and button animation feedback
 */

import { TIMING } from '@shared/config/constants.js';

export class UIEffects {
  constructor(dependencies = {}) {
    const { elements } = dependencies;

    // Store references
    this.elements = elements;

    // Track active timeouts for cleanup
    this._activeTimeouts = new Set();
  }

  /**
   * Trigger shutter flash effect
   */
  triggerShutterFlash() {
    this._createFlashOverlay('shutter-flash');
  }

  /**
   * Trigger record button pop effect (for recording start)
   */
  triggerRecordButtonPop() {
    this.triggerButtonFeedback('recordBtn', 'btn-pop', TIMING.UI_TIMEOUT_MS);
  }

  /**
   * Trigger record button press effect (for recording stop)
   */
  triggerRecordButtonPress() {
    this.triggerButtonFeedback('recordBtn', 'btn-press', TIMING.UI_TIMEOUT_MS);
  }

  /**
   * Trigger button feedback animation
   * @param {string} elementKey - Key of the button element
   * @param {string} className - CSS class to add temporarily
   * @param {number} duration - Duration in ms before removing class
   */
  triggerButtonFeedback(elementKey, className, duration) {
    const element = this.elements[elementKey];
    if (!element) return;

    // Remove class first in case of rapid clicks
    element.classList.remove(className);

    // Force reflow to restart animation
    void element.offsetWidth;

    element.classList.add(className);

    const timeoutId = setTimeout(() => {
      element.classList.remove(className);
      this._activeTimeouts.delete(timeoutId);
    }, duration);
    this._activeTimeouts.add(timeoutId);
  }

  /**
   * Create a flash overlay with given class
   * @private
   */
  _createFlashOverlay(className) {
    const flash = document.createElement('div');
    flash.className = className;
    document.body.appendChild(flash);

    const cleanup = () => {
      if (flash.parentNode) {
        flash.remove();
      }
      clearTimeout(timer);
    };

    // Fallback timeout in case animation doesn't fire
    const timer = setTimeout(cleanup, 500);
    flash.addEventListener('animationend', cleanup, { once: true });
  }

  /**
   * Dispose of UIEffects and cleanup resources
   */
  dispose() {
    // Clear all active timeouts
    for (const timeoutId of this._activeTimeouts) {
      clearTimeout(timeoutId);
    }
    this._activeTimeouts.clear();

    // Clear element references
    this.elements = null;
  }
}
