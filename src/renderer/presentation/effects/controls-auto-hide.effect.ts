/**
 * ControlsAutoHide - Manages fullscreen controls auto-hiding
 *
 * Hides the fullscreen exit button, toolbar, and cursor after inactivity.
 * Takes over cursor management when active.
 */

import { TIMING } from '@renderer/presentation/config/constants.config';
import { CSSClasses } from '@renderer/presentation/config/css-classes.config';
import { ActivityAutoHideController } from '@renderer/presentation/primitives/activity-auto-hide.controller';

type ControlsAutoHideOptions = {
  onShowAll?: () => void;
  onHideAll?: () => void;
  onEnable?: () => void;
  onDisable?: () => void;
};

export class ControlsAutoHide {
  _element: HTMLElement | null;
  _activityController: ActivityAutoHideController;
  _onShowAll: () => void;
  _onHideAll: () => void;
  _onEnable: () => void;
  _onDisable: () => void;
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
    this._element = null;
    this._onShowAll = options.onShowAll || (() => {});
    this._onHideAll = options.onHideAll || (() => {});
    this._onEnable = options.onEnable || (() => {});
    this._onDisable = options.onDisable || (() => {});

    this._activityController = new ActivityAutoHideController({
      onActivity: () => {
        this._show();
        this._onShowAll();
        this._startHideTimer();
      },
      onTimeout: () => {
        this._hide();
        this._onHideAll();
      },
      onEnable: () => {
        this._onEnable();
      },
      onDisable: () => {
        this._show();
        this._onDisable();
      },
      timeoutMs: TIMING.CURSOR_HIDE_DELAY_MS,
      shouldStartTimer: () => true
    });

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
    return this._activityController.isEnabled;
  }

  get _mouseMoveFramePending() {
    return this._activityController.isActivityFramePending;
  }

  get _rafId() {
    return this._activityController.rafId;
  }

  /**
   * Enable controls auto-hide
   * @param {HTMLElement} [element] - The fullscreen controls element
   */
  enable(element) {
    if (!element) return;
    this._element = element;

    this._activityController.enable({
      activityEvents: [
        { target: document, type: 'mousemove' },
        { target: document, type: 'pointermove' },
        { target: document, type: 'mousedown' }
      ],
      directEvents: [
        { target: element, type: 'mouseenter', handler: this._boundHandleMouseEnter },
        { target: element, type: 'mouseleave', handler: this._boundHandleMouseLeave },
        { target: element, type: 'focusin', handler: this._boundHandleFocusIn },
        { target: element, type: 'focusout', handler: this._boundHandleFocusOut }
      ],
      startTimer: true
    });
  }

  /**
   * Disable controls auto-hide
   */
  disable() {
    this._activityController.disable();
    this._element = null;
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
    this._activityController.startTimer();
  }

  /**
   * Clear the hide timer
   * @private
   */
  _clearHideTimer() {
    this._activityController.clearTimer();
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
