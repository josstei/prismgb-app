/**
 * Fullscreen Service
 *
 * Owns fullscreen event listeners and UI state updates.
 */

import { BaseService } from '@shared/base/service.base.js';
import { EventChannels } from '@renderer/infrastructure/events/event-channels.config.js';

class SettingsFullscreenService extends BaseService {
  constructor(dependencies) {
    super(dependencies, ['eventBus', 'loggerFactory'], 'SettingsFullscreenService');

    this._boundHandleFullscreenChange = this._handleFullscreenChange.bind(this);
    this._isFullscreenActive = false;
    this._unsubscribeEnterFullscreen = null;
    this._unsubscribeLeaveFullscreen = null;
    this._unsubscribeResized = null;
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
      this._unsubscribeResized = window.windowAPI.onResized(() => {
        this._syncFullscreenState();
        this.eventBus.publish(EventChannels.UI.WINDOW_RESIZED);
      });
    }

    this._syncFullscreenState();
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
    if (this._unsubscribeResized) {
      this._unsubscribeResized();
      this._unsubscribeResized = null;
    }
  }

  async toggleFullscreen() {
    const isActuallyFullscreen = await this._syncFullscreenState();

    if (isActuallyFullscreen) {
      this._forceExitFullscreen();
    } else {
      this._forceEnterFullscreen();
    }
  }

  async _syncFullscreenState() {
    if (window.windowAPI?.isFullScreen) {
      try {
        const isActuallyFullscreen = await window.windowAPI.isFullScreen();
        this._applyFullscreenState(isActuallyFullscreen);
        return isActuallyFullscreen;
      } catch (err) {
        this.logger.error('Error querying fullscreen state:', err);
        return this._isFullscreenActive;
      }
    }

    const isDocumentFullscreen = Boolean(document.fullscreenElement);
    this._applyFullscreenState(isDocumentFullscreen);
    return isDocumentFullscreen;
  }

  enterFullscreen() {
    if (this._isFullscreenActive) {
      return;
    }
    this._forceEnterFullscreen();
  }

  _forceEnterFullscreen() {

    if (window.windowAPI?.setFullScreen) {
      window.windowAPI.setFullScreen(true).catch(err => {
        this.logger.error('Error entering fullscreen:', err);
        this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Could not enter fullscreen', type: 'error' });
      });
    } else {
      document.documentElement.requestFullscreen().catch(err => {
        this.logger.error('Error entering fullscreen:', err);
        this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Could not enter fullscreen', type: 'error' });
        this._isFullscreenActive = false;
        this.eventBus.publish(EventChannels.UI.FULLSCREEN_STATE, { active: false });
      });
    }
  }

  exitFullscreen() {
    if (!this._isFullscreenActive) {
      return;
    }
    this._forceExitFullscreen();
  }

  _forceExitFullscreen() {
    if (window.windowAPI?.setFullScreen) {
      window.windowAPI.setFullScreen(false).catch(err => {
        this.logger.error('Error exiting fullscreen:', err);
        this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Could not exit fullscreen', type: 'error' });
      });
    } else if (document.fullscreenElement) {
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

    // Publish event - UIEventBridge handles all UI updates (body class, controls auto-hide)
    this.eventBus.publish(EventChannels.UI.FULLSCREEN_STATE, { active });
  }
}

export { SettingsFullscreenService };
