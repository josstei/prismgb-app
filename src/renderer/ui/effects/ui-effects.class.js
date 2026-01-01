/**
 * UIEffects - Handles visual feedback effects
 * Manages flash overlays, button animation feedback, and cursor auto-hide
 */

import { TIMING } from '@shared/config/constants.config.js';
import { CSSClasses } from '@shared/config/css-classes.config.js';

export class UIEffects {
  constructor(dependencies = {}) {
    const { elements } = dependencies;

    // Store references
    this.elements = elements;

    // Track active timeouts for cleanup
    this._activeTimeouts = new Set();

    // Cursor auto-hide state
    this._cursorHideTimer = null;
    this._cursorHideEnabled = false;
    this._boundHandleMouseMove = this._handleMouseMove.bind(this);

    // Fullscreen controls auto-hide state
    this._controlsHideTimer = null;
    this._controlsHideEnabled = false;
    this._controlsHovering = false;
    this._controlsFocused = false;
    this._boundHandleControlsMouseMove = this._handleControlsMouseMove.bind(this);
    this._boundHandleControlsMouseEnter = this._handleControlsMouseEnter.bind(this);
    this._boundHandleControlsMouseLeave = this._handleControlsMouseLeave.bind(this);
    this._boundHandleControlsFocusIn = this._handleControlsFocusIn.bind(this);
    this._boundHandleControlsFocusOut = this._handleControlsFocusOut.bind(this);
    this._controlsElement = null;
    this._lastMouseMoveTime = 0;
    this._mouseMoveThrottle = 100; // Throttle mousemove events to once per 100ms
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
   * Enable cursor auto-hide
   * Hides cursor after inactivity, shows on mouse move
   */
  enableCursorAutoHide() {
    if (this._cursorHideEnabled) return;

    this._cursorHideEnabled = true;
    document.addEventListener('mousemove', this._boundHandleMouseMove);
    this._startCursorHideTimer();
  }

  /**
   * Disable cursor auto-hide
   * Removes event listener and shows cursor
   */
  disableCursorAutoHide() {
    if (!this._cursorHideEnabled) return;

    this._cursorHideEnabled = false;
    document.removeEventListener('mousemove', this._boundHandleMouseMove);
    this._clearCursorHideTimer();
    this._showCursor();
  }

  /**
   * Handle mouse move - show cursor and reset hide timer
   * @private
   */
  _handleMouseMove() {
    this._showCursor();
    this._startCursorHideTimer();
  }

  /**
   * Start or reset the cursor hide timer
   * @private
   */
  _startCursorHideTimer() {
    this._clearCursorHideTimer();
    this._cursorHideTimer = setTimeout(() => {
      this._hideCursor();
    }, TIMING.CURSOR_HIDE_DELAY_MS);
  }

  /**
   * Clear the cursor hide timer
   * @private
   */
  _clearCursorHideTimer() {
    if (this._cursorHideTimer) {
      clearTimeout(this._cursorHideTimer);
      this._cursorHideTimer = null;
    }
  }

  /**
   * Hide the cursor
   * @private
   */
  _hideCursor() {
    document.body.classList.add(CSSClasses.CURSOR_HIDDEN);
  }

  /**
   * Show the cursor
   * @private
   */
  _showCursor() {
    document.body.classList.remove(CSSClasses.CURSOR_HIDDEN);
  }

  /**
   * Enable fullscreen controls auto-hide
   * Hides controls after inactivity, shows on mouse move
   * Pauses hide timer when hovering or focused on controls
   * @param {HTMLElement} controlsElement - The fullscreen controls element
   */
  enableControlsAutoHide(controlsElement) {
    if (this._controlsHideEnabled) return;

    this._controlsElement = controlsElement || document.getElementById('fullscreenControls');
    if (!this._controlsElement) return;

    this._controlsHideEnabled = true;
    this._controlsHovering = false;
    this._controlsFocused = false;

    // Mouse movement shows controls and resets timer
    document.addEventListener('mousemove', this._boundHandleControlsMouseMove);

    // Hover pauses the hide timer
    this._controlsElement.addEventListener('mouseenter', this._boundHandleControlsMouseEnter);
    this._controlsElement.addEventListener('mouseleave', this._boundHandleControlsMouseLeave);

    // Focus pauses the hide timer
    this._controlsElement.addEventListener('focusin', this._boundHandleControlsFocusIn);
    this._controlsElement.addEventListener('focusout', this._boundHandleControlsFocusOut);

    this._startControlsHideTimer();
  }

  /**
   * Disable fullscreen controls auto-hide
   * Removes event listeners and shows controls
   */
  disableControlsAutoHide() {
    if (!this._controlsHideEnabled) return;

    this._controlsHideEnabled = false;

    document.removeEventListener('mousemove', this._boundHandleControlsMouseMove);

    if (this._controlsElement) {
      this._controlsElement.removeEventListener('mouseenter', this._boundHandleControlsMouseEnter);
      this._controlsElement.removeEventListener('mouseleave', this._boundHandleControlsMouseLeave);
      this._controlsElement.removeEventListener('focusin', this._boundHandleControlsFocusIn);
      this._controlsElement.removeEventListener('focusout', this._boundHandleControlsFocusOut);
    }

    this._clearControlsHideTimer();
    this._showControls();
    this._controlsElement = null;
    this._controlsHovering = false;
    this._controlsFocused = false;
    this._lastMouseMoveTime = 0; // Reset throttle state
  }

  /**
   * Handle mouse move - show controls and reset hide timer
   * Throttled to prevent infinite loops from synthetic mousemove events
   * @private
   */
  _handleControlsMouseMove() {
    const now = Date.now();
    if (now - this._lastMouseMoveTime < this._mouseMoveThrottle) {
      return; // Throttle: ignore if called too frequently
    }
    this._lastMouseMoveTime = now;

    this._showControls();
    this._startControlsHideTimer();
  }

  /**
   * Handle mouse enter on controls - pause hide timer
   * @private
   */
  _handleControlsMouseEnter() {
    this._controlsHovering = true;
    this._clearControlsHideTimer();
    this._showControls();
  }

  /**
   * Handle mouse leave on controls - resume hide timer
   * @private
   */
  _handleControlsMouseLeave() {
    this._controlsHovering = false;
    if (!this._controlsFocused) {
      this._startControlsHideTimer();
    }
  }

  /**
   * Handle focus in on controls - pause hide timer
   * @private
   */
  _handleControlsFocusIn() {
    this._controlsFocused = true;
    this._clearControlsHideTimer();
    this._showControls();
  }

  /**
   * Handle focus out on controls - resume hide timer if not hovering
   * @private
   */
  _handleControlsFocusOut() {
    this._controlsFocused = false;
    if (!this._controlsHovering) {
      this._startControlsHideTimer();
    }
  }

  /**
   * Start or reset the controls hide timer
   * Only starts if not hovering and not focused
   * @private
   */
  _startControlsHideTimer() {
    this._clearControlsHideTimer();

    // Don't start timer if hovering or focused
    if (this._controlsHovering || this._controlsFocused) {
      return;
    }

    this._controlsHideTimer = setTimeout(() => {
      this._hideControls();
    }, TIMING.CURSOR_HIDE_DELAY_MS);
  }

  /**
   * Clear the controls hide timer
   * @private
   */
  _clearControlsHideTimer() {
    if (this._controlsHideTimer) {
      clearTimeout(this._controlsHideTimer);
      this._controlsHideTimer = null;
    }
  }

  /**
   * Hide the fullscreen controls
   * @private
   */
  _hideControls() {
    if (this._controlsElement) {
      this._controlsElement.classList.add(CSSClasses.FULLSCREEN_HEADER_HIDDEN);
    }
  }

  /**
   * Show the fullscreen controls
   * @private
   */
  _showControls() {
    if (this._controlsElement) {
      this._controlsElement.classList.remove(CSSClasses.FULLSCREEN_HEADER_HIDDEN);
    }
  }

  /**
   * Set recording button state
   * @param {HTMLElement} element - The record button element
   * @param {boolean} isActive - Whether recording is active
   */
  setRecordingButtonState(element, isActive) {
    if (!element) return;

    if (isActive) {
      element.classList.add(CSSClasses.RECORDING);
    } else {
      element.classList.remove(CSSClasses.RECORDING);
    }
  }

  /**
   * Set cinematic mode body class
   * @param {boolean} isActive - Whether cinematic mode should be visually active
   */
  setCinematicMode(isActive) {
    if (isActive) {
      document.body.classList.add(CSSClasses.CINEMATIC_ACTIVE);
    } else {
      document.body.classList.remove(CSSClasses.CINEMATIC_ACTIVE);
    }
  }

  /**
   * Set fullscreen mode body class
   * @param {boolean} isActive - Whether fullscreen mode is active
   */
  setFullscreenMode(isActive) {
    if (isActive) {
      document.body.classList.add(CSSClasses.FULLSCREEN_ACTIVE);
    } else {
      document.body.classList.remove(CSSClasses.FULLSCREEN_ACTIVE);
    }
  }

  /**
   * Dispose of UIEffects and cleanup resources
   */
  dispose() {
    // Disable cursor auto-hide
    this.disableCursorAutoHide();

    // Disable fullscreen controls auto-hide
    this.disableControlsAutoHide();

    // Clear all active timeouts
    for (const timeoutId of this._activeTimeouts) {
      clearTimeout(timeoutId);
    }
    this._activeTimeouts.clear();

    // Clear element references
    this.elements = null;
  }
}
