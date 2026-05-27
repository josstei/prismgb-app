/**
 * CursorAutoHide - Manages cursor auto-hiding during streaming
 *
 * Hides the cursor after inactivity during streaming.
 * Coordinates with toolbar auto-hide through callbacks.
 */

import { CSSClasses } from '@renderer/presentation/config/css-classes.config';
import { ActivityAutoHideController } from '@renderer/presentation/primitives/activity-auto-hide.controller';
import { PresentationComponent } from '@renderer/presentation/primitives/presentation-component.base';

type CursorAutoHideOptions = {
  onActivity?: () => void;
  onHide?: () => void;
};

export class CursorAutoHide extends PresentationComponent {
  _activityController: ActivityAutoHideController;
  _onActivity: () => void;
  _onHide: () => void;

  /**
   * @param {Object} options
   * @param {Function} [options.onActivity] - Callback when mouse activity detected
   * @param {Function} [options.onHide] - Callback when cursor is hidden
   */
  constructor(options: CursorAutoHideOptions = {}) {
    super();

    this._activityController = new ActivityAutoHideController({
      onActivity: () => {
        this._handleActivity();
      },
      onEnable: () => {},
      onDisable: () => {
        document.body.classList.remove(CSSClasses.CURSOR_HIDDEN);
      }
    });

    this._onActivity = options.onActivity || (() => {});
    this._onHide = options.onHide || (() => {});
    this.track(this._activityController);
  }

  get isEnabled() {
    return this._activityController.isEnabled;
  }

  /**
   * Enable cursor auto-hide
   */
  enable() {
    if (this._activityController.isEnabled) return;

    this._activityController.enable({
      activityEvents: [{ target: document, type: 'mousemove' }],
      triggerActivityImmediately: true
    });
  }

  /**
   * Disable cursor auto-hide
   */
  disable() {
    this._activityController.disable();
  }

  /**
   * Handle mouse move - show cursor and notify activity
   * @private
   */
  _handleActivity() {
    this.show();
    this._onActivity();
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
  override dispose(): void | Promise<void> {
    this.disable();
    return super.dispose();
  }
}
