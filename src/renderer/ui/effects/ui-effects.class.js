/**
 * UIEffects - Facade for visual feedback effects
 *
 * Coordinates feature-specific effect classes for cursor hiding, toolbar hiding,
 * fullscreen controls, button feedback, and body mode management.
 * Maintains backwards-compatible public API.
 */

import { CursorAutoHide } from '@renderer/ui/features/streaming/effects/cursor-auto-hide.class.js';
import { ToolbarAutoHide } from '@renderer/ui/features/toolbar/effects/toolbar-auto-hide.class.js';
import { ButtonFeedback } from '@renderer/ui/features/toolbar/effects/button-feedback.class.js';
import { CaptureEffects } from '@renderer/ui/features/toolbar/effects/capture-effects.class.js';
import { ControlsAutoHide } from '@renderer/ui/features/fullscreen/effects/controls-auto-hide.class.js';
import { HideTimer } from '@renderer/ui/primitives/hide-timer.class.js';

export class UIEffects {
  constructor(dependencies = {}) {
    const { elements, bodyClassManager } = dependencies;
    this.elements = elements;

    // Shared body class manager (global)
    this._bodyClassManager = bodyClassManager || null;

    // Initialize button feedback
    this._buttonFeedback = new ButtonFeedback({ elements });

    // Initialize capture effects
    this._captureEffects = new CaptureEffects();

    // Initialize cursor auto-hide with activity callback
    this._cursor = new CursorAutoHide({
      onActivity: () => this._handleActivity(),
      onHide: () => {}
    });

    // Initialize toolbar auto-hide with hover callbacks
    this._toolbar = new ToolbarAutoHide({
      onActivity: () => this._handleActivity(),
      onHide: () => {},
      onHoverStart: () => this._handleToolbarHoverStart(),
      onHoverEnd: () => this._handleToolbarHoverEnd()
    });

    // Initialize fullscreen controls auto-hide
    this._controls = new ControlsAutoHide({
      onShowAll: () => this._showAll(),
      onHideAll: () => this._hideAll(),
      onEnable: () => this._unifiedTimer.clear(),
      onDisable: () => this._handleActivity()
    });

    // Unified hide timer for cursor and toolbar
    this._unifiedTimer = new HideTimer({
      onTimeout: () => this._handleUnifiedTimeout(),
      shouldStart: () => this._shouldStartUnifiedTimer()
    });
  }

  // =====================================================
  // Capture Effects (delegated)
  // =====================================================

  /**
   * Trigger shutter flash effect
   */
  triggerShutterFlash() {
    this._captureEffects.triggerShutterFlash();
  }

  // =====================================================
  // Button Feedback (delegated)
  // =====================================================

  /**
   * Trigger record button pop effect (for recording start)
   */
  triggerRecordButtonPop() {
    this._buttonFeedback.triggerRecordButtonPop();
  }

  /**
   * Trigger record button press effect (for recording stop)
   */
  triggerRecordButtonPress() {
    this._buttonFeedback.triggerRecordButtonPress();
  }

  /**
   * Trigger button feedback animation
   * @param {string} elementKey - Key of the button element
   * @param {string} className - CSS class to add temporarily
   * @param {number} duration - Duration in ms before removing class
   */
  triggerButtonFeedback(elementKey, className, duration) {
    this._buttonFeedback.triggerButtonFeedback(elementKey, className, duration);
  }

  /**
   * Set recording button state
   * @param {HTMLElement} element - The record button element
   * @param {boolean} isActive - Whether recording is active
   */
  setRecordingButtonState(element, isActive) {
    this._buttonFeedback.setRecordingButtonState(element, isActive);
  }

  // =====================================================
  // Cursor Auto-Hide (delegated)
  // =====================================================

  /**
   * Enable cursor auto-hide
   */
  enableCursorAutoHide() {
    this._cursor.enable();
  }

  /**
   * Disable cursor auto-hide
   */
  disableCursorAutoHide() {
    this._cursor.disable();
    if (!this._toolbar.isEnabled) {
      this._unifiedTimer.clear();
    }
  }

  // =====================================================
  // Toolbar Auto-Hide (delegated)
  // =====================================================

  /**
   * Enable toolbar auto-hide
   * @param {HTMLElement} toolbarElement - The toolbar element to auto-hide
   */
  enableToolbarAutoHide(toolbarElement) {
    this._toolbar.enable(toolbarElement);
  }

  /**
   * Disable toolbar auto-hide
   */
  disableToolbarAutoHide() {
    this._toolbar.disable();
    if (!this._cursor.isEnabled) {
      this._unifiedTimer.clear();
    }
  }

  /**
   * Invalidate the toolbar panel open state cache
   */
  invalidateToolbarPanelCache() {
    this._toolbar.invalidatePanelCache();
  }

  // =====================================================
  // Fullscreen Controls Auto-Hide (delegated)
  // =====================================================

  /**
   * Enable fullscreen controls auto-hide
   * @param {HTMLElement} controlsElement - The fullscreen controls element
   */
  enableControlsAutoHide(controlsElement) {
    this._controls.enable(controlsElement);
  }

  /**
   * Disable fullscreen controls auto-hide
   */
  disableControlsAutoHide() {
    this._controls.disable();
  }

  // =====================================================
  // Body Modes (delegated)
  // =====================================================

  /**
   * Set cinematic mode body class
   * @param {boolean} isActive - Whether cinematic mode should be visually active
   */
  setCinematicMode(isActive) {
    this._bodyClassManager?.setCinematicMode(isActive);
  }

  /**
   * Set minimalist fullscreen body class
   * @param {boolean} isActive - Whether minimalist fullscreen should be active
   */
  setMinimalistFullscreen(isActive) {
    this._bodyClassManager?.setMinimalistFullscreen(isActive);
  }

  /**
   * Set fullscreen mode body class
   * @param {boolean} isActive - Whether fullscreen mode is active
   */
  setFullscreenMode(isActive) {
    this._bodyClassManager?.setFullscreenMode(isActive);
  }

  // =====================================================
  // Coordination Logic
  // =====================================================

  /**
   * Handle activity (mouse move, etc.) - start unified timer
   * @private
   */
  _handleActivity() {
    // Don't start unified timer if controls auto-hide is managing
    if (this._controls.isEnabled) {
      return;
    }

    if (this._toolbar.isEnabled) {
      this._toolbar.show();
    }

    this._unifiedTimer.start();
  }

  /**
   * Handle toolbar hover start - pause unified timer
   * @private
   */
  _handleToolbarHoverStart() {
    this._unifiedTimer.clear();
    if (this._cursor.isEnabled) {
      this._cursor.show();
    }
  }

  /**
   * Handle toolbar hover end - resume unified timer
   * @private
   */
  _handleToolbarHoverEnd() {
    if (!this._toolbar.isPanelOpen()) {
      this._unifiedTimer.start();
    }
  }

  /**
   * Check if unified timer should start
   * @returns {boolean}
   * @private
   */
  _shouldStartUnifiedTimer() {
    if (this._controls.isEnabled) {
      return false;
    }
    if (this._toolbar.isHovering || this._toolbar.isPanelOpen()) {
      return false;
    }
    return true;
  }

  /**
   * Handle unified timer timeout - hide cursor and toolbar
   * @private
   */
  _handleUnifiedTimeout() {
    if (this._cursor.isEnabled) {
      this._cursor.hide();
    }
    if (this._toolbar.isEnabled) {
      this._toolbar.hide();
    }
  }

  /**
   * Show all - cursor and toolbar (for controls auto-hide)
   * @private
   */
  _showAll() {
    this._cursor.show();
    if (this._toolbar.isEnabled) {
      this._toolbar.show();
    }
  }

  /**
   * Hide all - cursor and toolbar (for controls auto-hide)
   * @private
   */
  _hideAll() {
    if (this._toolbar.isEnabled) {
      this._toolbar.hide();
    }
    this._cursor.hide();
  }

  // =====================================================
  // Lifecycle
  // =====================================================

  /**
   * Dispose of UIEffects and cleanup resources
   */
  dispose() {
    this._cursor.dispose();
    this._toolbar.dispose();
    this._controls.dispose();
    this._buttonFeedback.dispose();
    this._captureEffects.dispose();
    this._bodyClassManager?.dispose?.();
    this._unifiedTimer.dispose();
    this.elements = null;
  }
}
