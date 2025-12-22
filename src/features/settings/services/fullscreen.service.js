/**
 * Fullscreen Service
 *
 * Owns fullscreen event listeners and UI state updates.
 */

import { BaseService } from '@shared/base/service.js';
import { EventChannels } from '@infrastructure/events/event-channels.js';
import { CSSClasses } from '@shared/config/css-classes.js';

class FullscreenService extends BaseService {
  constructor(dependencies) {
    super(dependencies, ['uiController', 'eventBus', 'loggerFactory'], 'FullscreenService');

    this._boundHandleFullscreenChange = this._handleFullscreenChange.bind(this);
    this._isFullscreenActive = false;
    this._unsubscribeEnterFullscreen = null;
    this._unsubscribeLeaveFullscreen = null;
  }

  initialize() {
    document.addEventListener('fullscreenchange', this._boundHandleFullscreenChange);

    if (window.windowAPI) {
      this._unsubscribeEnterFullscreen = window.windowAPI.onEnterFullscreen(() => {
        this._handleNativeFullscreen(true);
      });
      this._unsubscribeLeaveFullscreen = window.windowAPI.onLeaveFullscreen(() => {
        this._handleNativeFullscreen(false);
      });
    }
  }

  dispose() {
    document.removeEventListener('fullscreenchange', this._boundHandleFullscreenChange);

    if (this._unsubscribeEnterFullscreen) {
      this._unsubscribeEnterFullscreen();
      this._unsubscribeEnterFullscreen = null;
    }
    if (this._unsubscribeLeaveFullscreen) {
      this._unsubscribeLeaveFullscreen();
      this._unsubscribeLeaveFullscreen = null;
    }
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        this.logger.error('Error entering fullscreen:', err);
        this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Could not enter fullscreen', type: 'error' });
        this._isFullscreenActive = false;
        this.eventBus.publish(EventChannels.UI.FULLSCREEN_STATE, { active: false });
      });
    } else {
      document.exitFullscreen();
    }
  }

  _handleFullscreenChange() {
    this._applyFullscreenState(!!document.fullscreenElement);
  }

  _handleNativeFullscreen(active) {
    this._applyFullscreenState(active);
  }

  _applyFullscreenState(active) {
    if (this._isFullscreenActive === active) return;
    this._isFullscreenActive = active;

    if (active) {
      document.body.classList.add(CSSClasses.FULLSCREEN_ACTIVE);
      this.uiController.enableControlsAutoHide();
      this.eventBus.publish(EventChannels.UI.FULLSCREEN_STATE, { active: true });
    } else {
      document.body.classList.remove(CSSClasses.FULLSCREEN_ACTIVE);
      this.uiController.disableControlsAutoHide();
      this.eventBus.publish(EventChannels.UI.FULLSCREEN_STATE, { active: false });
    }
  }
}

export { FullscreenService };
