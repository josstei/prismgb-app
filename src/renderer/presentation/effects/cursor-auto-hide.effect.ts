/**
 * CursorAutoHide - Manages cursor auto-hiding during streaming
 *
 * Hides the cursor after inactivity during streaming.
 * Coordinates with toolbar auto-hide through callbacks.
 */

import { CSSClasses } from '@renderer/presentation/config/css-classes.config';
import { AutoHideBase, cancelRafThrottled, runRafThrottled } from './auto-hide.base';

type CursorAutoHideOptions = {
  onActivity?: () => void;
  onHide?: () => void;
};

export class CursorAutoHide extends AutoHideBase {
  _onActivity: () => void;
  _onHide: () => void;
  _boundHandleMouseMove: () => void;
  _mouseMoveFramePending: boolean;
  _rafId: number | null;

  /**
   * @param {Object} options
   * @param {Function} [options.onActivity] - Callback when mouse activity detected
   * @param {Function} [options.onHide] - Callback when cursor is hidden
   */
  constructor(options: CursorAutoHideOptions = {}) {
    super();
    this._onActivity = options.onActivity || (() => {});
    this._onHide = options.onHide || (() => {});
    this._boundHandleMouseMove = this._handleMouseMove.bind(this);
    this._mouseMoveFramePending = false;
    this._rafId = null;
  }

  /**
   * Enable cursor auto-hide
   */
  enable() {
    if (!this.activate(() => {
      this.addListener(document, 'mousemove', this._boundHandleMouseMove);
    })) {
      return;
    }

    this._onActivity();
  }

  /**
   * Disable cursor auto-hide
   */
  disable() {
    this.deactivate(() => {
      cancelRafThrottled(this);
      this.show();
    });
  }

  /**
   * Handle mouse move - show cursor and notify activity
   * Uses RAF throttling to avoid excessive handler execution
   * @private
   */
  _handleMouseMove() {
    runRafThrottled(this, () => {
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
