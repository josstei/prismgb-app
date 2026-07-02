/**
 * ControlsAutoHide - Manages fullscreen controls auto-hiding
 *
 * Hides the fullscreen exit button, toolbar, and cursor after inactivity.
 * Takes over cursor management when active.
 */

import { TIMING } from '@platform/config';
import { CSSClasses } from '@renderer/presentation/config/css-classes.config';
import { PresentationComponent, ActivityAutoHideController } from '@platform/ui-base';

type ControlsAutoHideOptions = {
  onShowAll?: () => void;
  onHideAll?: () => void;
  onEnable?: () => void;
  onDisable?: () => void;
};

export class ControlsAutoHide extends PresentationComponent {
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

  constructor(options: ControlsAutoHideOptions = {}) {
    super();

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
    this.track(this._activityController);
  }

  get isEnabled() {
    return this._activityController.isEnabled;
  }

  enable(element: HTMLElement | null) {
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

  _handleMouseEnter() {
    this._show();
    this._onShowAll();
    this._startHideTimer();
  }

  _handleMouseLeave() {
    this._startHideTimer();
  }

  _handleFocusIn() {
    this._show();
    this._onShowAll();
    this._startHideTimer();
  }

  _handleFocusOut() {
    this._startHideTimer();
  }

  _startHideTimer() {
    this._activityController.startTimer();
  }

  _clearHideTimer() {
    this._activityController.clearTimer();
  }

  _hide() {
    if (this._element) {
      this._element.classList.add(CSSClasses.FULLSCREEN_HEADER_HIDDEN);
    }
  }

  _show() {
    if (this._element) {
      this._element.classList.remove(CSSClasses.FULLSCREEN_HEADER_HIDDEN);
    }
  }

  /**
   * Dispose and cleanup resources
   */
  override dispose(): void | Promise<void> {
    this.disable();
    return super.dispose();
  }
}
