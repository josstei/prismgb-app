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
    this._cursorHideEnabled = false;
    this._boundHandleMouseMove = this._handleMouseMove.bind(this);

    // Unified timer for synchronized cursor and toolbar hiding
    this._unifiedHideTimer = null;

    // Fullscreen controls auto-hide state
    this._controlsHideTimer = null;
    this._controlsHideEnabled = false;
    this._boundHandleControlsMouseMove = this._handleControlsMouseMove.bind(this);
    this._boundHandleControlsMouseEnter = this._handleControlsMouseEnter.bind(this);
    this._boundHandleControlsMouseLeave = this._handleControlsMouseLeave.bind(this);
    this._boundHandleControlsFocusIn = this._handleControlsFocusIn.bind(this);
    this._boundHandleControlsFocusOut = this._handleControlsFocusOut.bind(this);
    this._controlsElement = null;

    // Minimalist transition state
    this._minimalistTransitionTimer = null;

    // Streaming toolbar auto-hide state
    this._toolbarElement = null;
    this._toolbarHideEnabled = false;
    this._toolbarHovering = false;
    this._boundHandleToolbarMouseEnter = this._handleToolbarMouseEnter.bind(this);
    this._boundHandleToolbarMouseLeave = this._handleToolbarMouseLeave.bind(this);
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
   * Uses unified timer shared with toolbar for synchronized hiding
   */
  enableCursorAutoHide() {
    if (this._cursorHideEnabled) return;

    this._cursorHideEnabled = true;
    document.addEventListener('mousemove', this._boundHandleMouseMove);
    this._startUnifiedHideTimer();
  }

  /**
   * Disable cursor auto-hide
   * Removes event listener and shows cursor
   */
  disableCursorAutoHide() {
    if (!this._cursorHideEnabled) return;

    this._cursorHideEnabled = false;
    document.removeEventListener('mousemove', this._boundHandleMouseMove);

    if (!this._toolbarHideEnabled) {
      this._clearUnifiedHideTimer();
    }
    this._showCursor();
  }

  /**
   * Handle mouse move - show cursor and reset unified hide timer
   * @private
   */
  _handleMouseMove() {
    this._showCursor();
    if (this._toolbarHideEnabled) {
      this._showToolbar();
    }
    this._startUnifiedHideTimer();
  }

  /**
   * Start or reset the unified hide timer for cursor and toolbar
   * Only starts if not hovering toolbar, no panel is open, and controls auto-hide is not active
   * When controls auto-hide is active, it manages cursor hiding instead
   * @private
   */
  _startUnifiedHideTimer() {
    this._clearUnifiedHideTimer();

    // Don't start if controls auto-hide is managing cursor
    if (this._controlsHideEnabled) {
      return;
    }

    if (this._toolbarHovering || this._isToolbarPanelOpen()) {
      return;
    }

    this._unifiedHideTimer = setTimeout(() => {
      if (this._cursorHideEnabled) {
        this._hideCursor();
      }
      if (this._toolbarHideEnabled) {
        this._hideToolbar();
      }
    }, TIMING.CURSOR_HIDE_DELAY_MS);
  }

  /**
   * Clear the unified hide timer
   * @private
   */
  _clearUnifiedHideTimer() {
    if (this._unifiedHideTimer) {
      clearTimeout(this._unifiedHideTimer);
      this._unifiedHideTimer = null;
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

  // =====================================================
  // Streaming Toolbar Auto-Hide
  // =====================================================

  /**
   * Enable toolbar auto-hide
   * Uses unified timer shared with cursor for synchronized hiding
   * Pauses hide timer when hovering or focused on toolbar
   * @param {HTMLElement} toolbarElement - The toolbar element to auto-hide
   */
  enableToolbarAutoHide(toolbarElement) {
    if (this._toolbarHideEnabled) return;

    this._toolbarElement = toolbarElement;
    if (!this._toolbarElement) return;

    this._toolbarHideEnabled = true;
    this._toolbarHovering = false;

    this._toolbarElement.addEventListener('mouseenter', this._boundHandleToolbarMouseEnter);
    this._toolbarElement.addEventListener('mouseleave', this._boundHandleToolbarMouseLeave);

    this._startUnifiedHideTimer();
  }

  /**
   * Disable toolbar auto-hide
   * Removes event listeners and shows toolbar
   */
  disableToolbarAutoHide() {
    if (!this._toolbarHideEnabled) return;

    this._toolbarHideEnabled = false;

    if (this._toolbarElement) {
      this._toolbarElement.removeEventListener('mouseenter', this._boundHandleToolbarMouseEnter);
      this._toolbarElement.removeEventListener('mouseleave', this._boundHandleToolbarMouseLeave);
    }

    if (!this._cursorHideEnabled) {
      this._clearUnifiedHideTimer();
    }
    this._showToolbar();

    this._toolbarElement = null;
    this._toolbarHovering = false;
  }

  /**
   * Handle mouse enter on toolbar - pause unified hide timer and show both
   * @private
   */
  _handleToolbarMouseEnter() {
    this._toolbarHovering = true;
    this._clearUnifiedHideTimer();
    this._showToolbar();
    if (this._cursorHideEnabled) {
      this._showCursor();
    }
  }

  /**
   * Handle mouse leave on toolbar - resume unified hide timer
   * @private
   */
  _handleToolbarMouseLeave() {
    this._toolbarHovering = false;
    if (!this._isToolbarPanelOpen()) {
      this._startUnifiedHideTimer();
    }
  }

  /**
   * Hide the streaming toolbar
   * @private
   */
  _hideToolbar() {
    if (this._isToolbarPanelOpen()) {
      return;
    }
    if (this._toolbarElement) {
      this._toolbarElement.classList.add(CSSClasses.TOOLBAR_HIDDEN);
    }
  }

  /**
   * Show the streaming toolbar
   * @private
   */
  _showToolbar() {
    if (this._toolbarElement) {
      this._toolbarElement.classList.remove(CSSClasses.TOOLBAR_HIDDEN);
    }
  }

  /**
   * Check if any toolbar panel is currently open
   * @returns {boolean} True if shader panel or notes panel is open
   * @private
   */
  _isToolbarPanelOpen() {
    if (!this._toolbarElement) return false;

    const shaderPanel = this._toolbarElement.querySelector('.shader-panel.visible');
    if (shaderPanel) return true;

    const openButton = this._toolbarElement.querySelector('.panel-open');
    if (openButton) return true;

    return false;
  }

  /**
   * Enable fullscreen controls auto-hide
   * Hides controls and cursor after inactivity, shows on mouse move or click
   * Pauses hide timer when hovering or focused on controls
   * @param {HTMLElement} controlsElement - The fullscreen controls element
   */
  enableControlsAutoHide(controlsElement) {
    if (this._controlsHideEnabled) return;

    this._controlsElement = controlsElement || document.getElementById('fullscreenControls');
    if (!this._controlsElement) return;

    this._controlsHideEnabled = true;

    // Pause unified timer - fullscreen controls will manage cursor hiding
    this._clearUnifiedHideTimer();

    // Mouse/pointer movement and clicks show controls and reset timer
    document.addEventListener('mousemove', this._boundHandleControlsMouseMove);
    document.addEventListener('pointermove', this._boundHandleControlsMouseMove);
    document.addEventListener('mousedown', this._boundHandleControlsMouseMove);

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
   * Resumes unified timer if cursor/toolbar hiding still active
   */
  disableControlsAutoHide() {
    if (!this._controlsHideEnabled) return;

    this._controlsHideEnabled = false;

    document.removeEventListener('mousemove', this._boundHandleControlsMouseMove);
    document.removeEventListener('pointermove', this._boundHandleControlsMouseMove);
    document.removeEventListener('mousedown', this._boundHandleControlsMouseMove);

    if (this._controlsElement) {
      this._controlsElement.removeEventListener('mouseenter', this._boundHandleControlsMouseEnter);
      this._controlsElement.removeEventListener('mouseleave', this._boundHandleControlsMouseLeave);
      this._controlsElement.removeEventListener('focusin', this._boundHandleControlsFocusIn);
      this._controlsElement.removeEventListener('focusout', this._boundHandleControlsFocusOut);
    }

    this._clearControlsHideTimer();
    this._showControls();
    this._controlsElement = null;

    // Resume unified timer if cursor or toolbar hiding still active
    if (this._cursorHideEnabled || this._toolbarHideEnabled) {
      this._startUnifiedHideTimer();
    }
  }

  /**
   * Handle mouse move - show controls and cursor, reset hide timer
   * @private
   */
  _handleControlsMouseMove() {
    this._showControls();
    this._showCursor();
    this._startControlsHideTimer();
  }

  /**
   * Handle mouse enter on controls - reset hide timer
   * @private
   */
  _handleControlsMouseEnter() {
    this._showControls();
    this._showCursor();
    this._startControlsHideTimer();
  }

  /**
   * Handle mouse leave on controls - reset hide timer
   * @private
   */
  _handleControlsMouseLeave() {
    this._startControlsHideTimer();
  }

  /**
   * Handle focus in on controls - reset hide timer
   * @private
   */
  _handleControlsFocusIn() {
    this._showControls();
    this._showCursor();
    this._startControlsHideTimer();
  }

  /**
   * Handle focus out on controls - reset hide timer
   * @private
   */
  _handleControlsFocusOut() {
    this._startControlsHideTimer();
  }

  /**
   * Start or reset the controls hide timer
   * Always starts - any mouse/pointer activity will reset it
   * @private
   */
  _startControlsHideTimer() {
    this._clearControlsHideTimer();

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
   * Hide the fullscreen controls and cursor
   * @private
   */
  _hideControls() {
    if (this._controlsElement) {
      this._controlsElement.classList.add(CSSClasses.FULLSCREEN_HEADER_HIDDEN);
    }
    this._hideCursor();
  }

  /**
   * Show the fullscreen controls and cursor
   * @private
   */
  _showControls() {
    if (this._controlsElement) {
      this._controlsElement.classList.remove(CSSClasses.FULLSCREEN_HEADER_HIDDEN);
    }
    this._showCursor();
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
   * Set minimalist fullscreen body class
   * @param {boolean} isActive - Whether minimalist fullscreen should be active
   */
  setMinimalistFullscreen(isActive) {
    const currentlyActive = document.body.classList.contains(CSSClasses.MINIMALIST_FULLSCREEN);
    if (currentlyActive === isActive) return;

    this._setMinimalistTransitionActive();
    document.body.classList.toggle(CSSClasses.MINIMALIST_FULLSCREEN, isActive);
  }

  /**
   * Apply transition class for minimalist mode changes
   * @private
   */
  _setMinimalistTransitionActive() {
    if (this._minimalistTransitionTimer) {
      clearTimeout(this._minimalistTransitionTimer);
      this._minimalistTransitionTimer = null;
    }

    document.body.classList.add(CSSClasses.MINIMALIST_TRANSITION);
    this._minimalistTransitionTimer = setTimeout(() => {
      document.body.classList.remove(CSSClasses.MINIMALIST_TRANSITION);
      this._minimalistTransitionTimer = null;
    }, TIMING.MINIMALIST_TRANSITION_MS);
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

    // Disable toolbar auto-hide
    this.disableToolbarAutoHide();

    // Clear all active timeouts
    for (const timeoutId of this._activeTimeouts) {
      clearTimeout(timeoutId);
    }
    this._activeTimeouts.clear();

    if (this._minimalistTransitionTimer) {
      clearTimeout(this._minimalistTransitionTimer);
      this._minimalistTransitionTimer = null;
    }
    document.body.classList.remove(CSSClasses.MINIMALIST_TRANSITION);

    // Clear element references
    this.elements = null;
  }
}
