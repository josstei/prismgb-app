/**
 * ControlsAutoHide - Manages fullscreen controls auto-hiding
 *
 * Hides the fullscreen exit button, toolbar, and cursor after inactivity.
 * Takes over cursor management when active.
 */

import { TIMING } from '@renderer/application/config/timing.config';
import { CSSClasses } from '@renderer/presentation/config/css-classes.config';
import { AutoHideBase, cancelRafThrottled, runRafThrottled } from './auto-hide.base';

type ControlsAutoHideOptions = {
  onShowAll?: () => void;
  onHideAll?: () => void;
  onEnable?: () => void;
  onDisable?: () => void;
};

export class ControlsAutoHide extends AutoHideBase {
  _element: HTMLElement | null;
  _hideTimer: ReturnType<typeof setTimeout> | null;
  _mouseMoveFramePending: boolean;
  _rafId: number | null;
  _onShowAll: () => void;
  _onHideAll: () => void;
  _boundHandleMouseMove: () => void;
  _boundHandleMouseEnter: () => void;
  _boundHandleMouseLeave: () => void;
  _boundHandleFocusIn: () => void;
  _boundHandleFocusOut: () => void;

  /**
   * @param {Object} options
   * @param {Function} [options.onShowAll] - Callback to show cursor and toolbar
   * @param {Function} [options.onHideAll] - Callback to hide cursor and toolbar
   * @param {Function} [options.onEnable] - Callback when controls auto-hide is enabled
   * @param {Function} [options.onDisable] - Callback when controls auto-hide is disabled
   */
  constructor(options: ControlsAutoHideOptions = {}) {
    super({
      onEnable: options.onEnable,
      onDisable: options.onDisable
    });
    this._element = null;
    this._hideTimer = null;
    this._mouseMoveFramePending = false;
    this._rafId = null;

    this._onShowAll = options.onShowAll || (() => {});
    this._onHideAll = options.onHideAll || (() => {});

    this._boundHandleMouseMove = this._handleMouseMove.bind(this);
    this._boundHandleMouseEnter = this._handleMouseEnter.bind(this);
    this._boundHandleMouseLeave = this._handleMouseLeave.bind(this);
    this._boundHandleFocusIn = this._handleFocusIn.bind(this);
    this._boundHandleFocusOut = this._handleFocusOut.bind(this);
  }

  /**
   * Enable controls auto-hide
   * @param {HTMLElement} [element] - The fullscreen controls element
   */
  enable(element: HTMLElement | null): void {
    if (!element) return;
    this.activate(() => {
      const controlsElement = element;
      this._element = controlsElement;

      // Mouse/pointer movement and clicks show controls and reset timer
      this.addListener(document, 'mousemove', this._boundHandleMouseMove);
      this.addListener(document, 'pointermove', this._boundHandleMouseMove);
      this.addListener(document, 'mousedown', this._boundHandleMouseMove);

      // Hover pauses the hide timer
      this.addListener(controlsElement, 'mouseenter', this._boundHandleMouseEnter);
      this.addListener(controlsElement, 'mouseleave', this._boundHandleMouseLeave);

      // Focus pauses the hide timer
      this.addListener(controlsElement, 'focusin', this._boundHandleFocusIn);
      this.addListener(controlsElement, 'focusout', this._boundHandleFocusOut);

      this._startHideTimer();
    });
  }

  /**
   * Disable controls auto-hide
   */
  disable() {
    this.deactivate(() => {
      cancelRafThrottled(this);
      this._clearHideTimer();
      this._show();
      this._element = null;
    });
  }

  /**
   * Handle mouse move
   * Uses RAF throttling to avoid excessive handler execution
   * @private
   */
  _handleMouseMove() {
    runRafThrottled(this, () => {
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
