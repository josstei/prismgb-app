/**
 * CursorAutoHide - Manages cursor auto-hiding during streaming
 *
 * Hides the cursor after inactivity during streaming.
 * Coordinates with toolbar auto-hide through callbacks.
 */

import { CSSClasses } from '@renderer/presentation/config/css-classes.config.ts';

export class CursorAutoHide {
  /**
   * @param {Object} options
   * @param {Function} [options.onActivity] - Callback when mouse activity detected
   * @param {Function} [options.onHide] - Callback when cursor is hidden
   */
  constructor(options = {}) {
    this._enabled = false;
    this._onActivity = options.onActivity || (() => {});
    this._onHide = options.onHide || (() => {});
    this._boundHandleMouseMove = this._handleMouseMove.bind(this);
    this._mouseMoveFramePending = false;
    this._rafId = null;
  }

  /**
   * Check if cursor auto-hide is enabled
   * @returns {boolean}
   */
  get isEnabled() {
    return this._enabled;
  }

  /**
   * Enable cursor auto-hide
   */
  enable() {
    if (this._enabled) return;

    this._enabled = true;
    document.addEventListener('mousemove', this._boundHandleMouseMove);
    this._onActivity();
  }

  /**
   * Disable cursor auto-hide
   */
  disable() {
    if (!this._enabled) return;

    this._enabled = false;
    document.removeEventListener('mousemove', this._boundHandleMouseMove);

    // Cancel any pending RAF
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    this._mouseMoveFramePending = false;

    this.show();
  }

  /**
   * Handle mouse move - show cursor and notify activity
   * Uses RAF throttling to avoid excessive handler execution
   * @private
   */
  _handleMouseMove() {
    if (this._mouseMoveFramePending) return;

    this._mouseMoveFramePending = true;
    this._rafId = requestAnimationFrame(() => {
      this._mouseMoveFramePending = false;
      this._rafId = null;
      this.show();
      this._onActivity();
    });
  }

  /**
   * Hide the cursor
   */
  hide() {
    document.body.classList.add(CSSClasses.CURSOR_HIDDEN);
    this._onHide();
  }

  /**
   * Show the cursor
   */
  show() {
    document.body.classList.remove(CSSClasses.CURSOR_HIDDEN);
  }

  /**
   * Dispose and cleanup resources
   */
  dispose() {
    this.disable();
  }
}
