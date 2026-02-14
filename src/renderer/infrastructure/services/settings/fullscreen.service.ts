/**
 * Fullscreen Service
 *
 * Owns fullscreen event listeners and UI state updates.
 */

import { LifecycleService } from '@prismgb/core';
import { EventChannels } from '@renderer/common/config/event-channels';

class SettingsFullscreenService extends LifecycleService {
  static readonly dependencies = ['eventBus', 'loggerFactory'] as const;

  constructor(dependencies) {
    super(dependencies, [...SettingsFullscreenService.dependencies], 'SettingsFullscreenService');

    this._isFullscreenActive = false;
  }

  async onInitialize() {
    const boundHandleFullscreenChange = this._handleFullscreenChange.bind(this);
    document.addEventListener('fullscreenchange', boundHandleFullscreenChange);
    this.addCleanup(() => document.removeEventListener('fullscreenchange', boundHandleFullscreenChange));

    if (window.windowAPI) {
      window.windowAPI.onEnterFullscreen(() => {
        this._handleNativeFullscreen(true);
      });
      window.windowAPI.onLeaveFullscreen(() => {
        this._handleNativeFullscreen(false);
      });
      window.windowAPI.onResized(() => {
        this._syncFullscreenState();
        this.eventBus.publish(EventChannels.UI.WINDOW_RESIZED);
      });

      this.addCleanup(() => window.windowAPI?.removeListeners?.());
    }

    await this._syncFullscreenState();
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
