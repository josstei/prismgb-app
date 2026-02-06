// @ts-nocheck
/**
 * ControlsAutoHide - Manages fullscreen controls auto-hiding
 *
 * Hides the fullscreen exit button, toolbar, and cursor after inactivity.
 * Takes over cursor management when active.
 */

import { TIMING } from '@renderer/presentation/config/constants.config';
import { CSSClasses } from '@renderer/presentation/config/css-classes.config';

export class ControlsAutoHide {
  /**
   * @param {Object} options
   * @param {Function} [options.onShowAll] - Callback to show cursor and toolbar
   * @param {Function} [options.onHideAll] - Callback to hide cursor and toolbar
   * @param {Function} [options.onEnable] - Callback when controls auto-hide is enabled
   * @param {Function} [options.onDisable] - Callback when controls auto-hide is disabled
   */
  constructor(options = {}) {
    this._enabled = false;
    this._element = null;
    this._hideTimer = null;
    this._mouseMoveFramePending = false;
    this._rafId = null;

    this._onShowAll = options.onShowAll || (() => {});
    this._onHideAll = options.onHideAll || (() => {});
    this._onEnable = options.onEnable || (() => {});
    this._onDisable = options.onDisable || (() => {});

    this._boundHandleMouseMove = this._handleMouseMove.bind(this);
    this._boundHandleMouseEnter = this._handleMouseEnter.bind(this);
    this._boundHandleMouseLeave = this._handleMouseLeave.bind(this);
    this._boundHandleFocusIn = this._handleFocusIn.bind(this);
    this._boundHandleFocusOut = this._handleFocusOut.bind(this);
  }

  /**
   * Check if controls auto-hide is enabled
   * @returns {boolean}
   */
  get isEnabled() {
    return this._enabled;
  }

  /**
   * Enable controls auto-hide
   * @param {HTMLElement} [element] - The fullscreen controls element
   */
  enable(element) {
    if (this._enabled) return;

    if (!element) return;
    this._element = element;

    this._enabled = true;
    this._onEnable();

    // Mouse/pointer movement and clicks show controls and reset timer
    document.addEventListener('mousemove', this._boundHandleMouseMove);
    document.addEventListener('pointermove', this._boundHandleMouseMove);
    document.addEventListener('mousedown', this._boundHandleMouseMove);

    // Hover pauses the hide timer
    this._element.addEventListener('mouseenter', this._boundHandleMouseEnter);
    this._element.addEventListener('mouseleave', this._boundHandleMouseLeave);

    // Focus pauses the hide timer
    this._element.addEventListener('focusin', this._boundHandleFocusIn);
    this._element.addEventListener('focusout', this._boundHandleFocusOut);

    this._startHideTimer();
  }

  /**
   * Disable controls auto-hide
   */
  disable() {
    if (!this._enabled) return;

    this._enabled = false;

    document.removeEventListener('mousemove', this._boundHandleMouseMove);
    document.removeEventListener('pointermove', this._boundHandleMouseMove);
    document.removeEventListener('mousedown', this._boundHandleMouseMove);

    if (this._element) {
      this._element.removeEventListener('mouseenter', this._boundHandleMouseEnter);
      this._element.removeEventListener('mouseleave', this._boundHandleMouseLeave);
      this._element.removeEventListener('focusin', this._boundHandleFocusIn);
      this._element.removeEventListener('focusout', this._boundHandleFocusOut);
    }

    // Cancel any pending RAF
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    this._mouseMoveFramePending = false;

    this._clearHideTimer();
    this._show();
    this._element = null;
    this._onDisable();
  }

  /**
   * Handle mouse move
   * Uses RAF throttling to avoid excessive handler execution
   * @private
   */
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

  /**
   * Handle mouse enter on controls
   * @private
   */
  _handleMouseEnter() {
    this._show();
    this._onShowAll();
    this._startHideTimer();
  }

  /**
   * Handle mouse leave on controls
   * @private
   */
  _handleMouseLeave() {
    this._startHideTimer();
  }

  /**
   * Handle focus in on controls
   * @private
   */
  _handleFocusIn() {
    this._show();
    this._onShowAll();
    this._startHideTimer();
  }

  /**
   * Handle focus out on controls
   * @private
   */
  _handleFocusOut() {
    this._startHideTimer();
  }

  /**
   * Start or reset the hide timer
   * @private
   */
  _startHideTimer() {
    this._clearHideTimer();

    this._hideTimer = setTimeout(() => {
      this._hide();
      this._onHideAll();
    }, TIMING.CURSOR_HIDE_DELAY_MS);
  }

  /**
   * Clear the hide timer
   * @private
   */
  _clearHideTimer() {
    if (this._hideTimer) {
      clearTimeout(this._hideTimer);
      this._hideTimer = null;
    }
  }

  /**
   * Hide the fullscreen controls
   * @private
   */
  _hide() {
    if (this._element) {
      this._element.classList.add(CSSClasses.FULLSCREEN_HEADER_HIDDEN);
    }
  }

  /**
   * Show the fullscreen controls
   * @private
   */
  _show() {
    if (this._element) {
      this._element.classList.remove(CSSClasses.FULLSCREEN_HEADER_HIDDEN);
    }
  }

  /**
   * Dispose and cleanup resources
   */
  dispose() {
    this.disable();
  }
}
