/**
 * CaptureEffects - Handles visual feedback for capture actions
 *
 * Manages the shutter flash effect when taking screenshots.
 */

export class CaptureEffects {
  /**
   * Trigger shutter flash effect
   */
  triggerShutterFlash() {
    this._createFlashOverlay('shutter-flash');
  }

  /**
   * Create a flash overlay with given class
   * @param {string} className - CSS class for the flash overlay
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
   * Dispose (no resources to cleanup)
   */
  dispose() {
    // No persistent state to cleanup
  }
}
