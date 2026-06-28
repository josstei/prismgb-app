import { Service } from '@prismgb/core';
import { BaseService } from '@prismgb/core';
import { EventChannels } from '@prismgb/events';
import { createTrpcEventBridge } from '@renderer/infrastructure/services/platform/trpc-event-bridge.factory';
import { trpcClient } from '@renderer/infrastructure/ipc/trpc-client';
import type { EventBusLike, LoggerFactoryLike } from '@prismgb/core';

type SettingsFullscreenServiceDependencies = {
  eventBus: EventBusLike;
  loggerFactory: LoggerFactoryLike;
};

const FULLSCREEN_DOCUMENT_LIFECYCLE = Symbol('settingsFullscreenDocumentLifecycle');
const FULLSCREEN_NATIVE_LIFECYCLE = Symbol('settingsFullscreenNativeLifecycle');

@Service({
  "token": "fullscreenService",
  "disposal": "dispose"
})
class SettingsFullscreenService extends BaseService {
  private readonly eventBus: EventBusLike;
  private readonly _boundHandleFullscreenChange: () => void;
  private _isFullscreenActive: boolean;

  constructor(dependencies: SettingsFullscreenServiceDependencies) {
    super(dependencies, 'SettingsFullscreenService');

    this.eventBus = dependencies.eventBus;
    this._boundHandleFullscreenChange = this._handleFullscreenChange.bind(this);
    this._isFullscreenActive = false;
  }

  initialize() {
    this.disposables.cancel(FULLSCREEN_DOCUMENT_LIFECYCLE);
    document.addEventListener('fullscreenchange', this._boundHandleFullscreenChange);
    this.disposables.replace(FULLSCREEN_DOCUMENT_LIFECYCLE, () =>
      document.removeEventListener('fullscreenchange', this._boundHandleFullscreenChange)
    );

    this.disposables.replace(FULLSCREEN_NATIVE_LIFECYCLE, createTrpcEventBridge('SettingsFullscreenService', [
      () => trpcClient.window.onEnterFullscreen.subscribe(undefined, { onData: () => this._handleNativeFullscreen(true) }),
      () => trpcClient.window.onLeaveFullscreen.subscribe(undefined, { onData: () => this._handleNativeFullscreen(false) }),
      () => trpcClient.window.onResized.subscribe(undefined, {
        onData: () => {
          this._syncFullscreenState();
          this.eventBus.publish(EventChannels.UI.WINDOW_RESIZED);
        }
      })
    ], this.logger));

    this._syncFullscreenState();
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
    try {
      const result = await trpcClient.window.isFullScreen.query();
      const isActuallyFullscreen = result.success ? result.isFullscreen : false;
      this._applyFullscreenState(isActuallyFullscreen);
      return isActuallyFullscreen;
    } catch (err) {
      this.logger.error('Error querying fullscreen state:', err);
      return this._isFullscreenActive;
    }
  }

  enterFullscreen() {
    if (this._isFullscreenActive) {
      return;
    }
    this._forceEnterFullscreen();
  }

  _forceEnterFullscreen() {
    trpcClient.window.setFullScreen.mutate(true).catch(err => {
      this.logger.error('Error entering fullscreen:', err);
      this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Could not enter fullscreen', type: 'error' });
    });
  }

  exitFullscreen() {
    if (!this._isFullscreenActive) {
      return;
    }
    this._forceExitFullscreen();
  }

  _forceExitFullscreen() {
    trpcClient.window.setFullScreen.mutate(false).catch(err => {
      this.logger.error('Error exiting fullscreen:', err);
      this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Could not exit fullscreen', type: 'error' });
    });
  }

  _handleFullscreenChange() {
    this._applyFullscreenState(!!document.fullscreenElement);
  }

  _handleNativeFullscreen(active: boolean) {
    this._applyFullscreenState(active);
  }

  _applyFullscreenState(active: boolean) {
    if (this._isFullscreenActive === active) return;
    this._isFullscreenActive = active;
    this.eventBus.publish(EventChannels.UI.FULLSCREEN_STATE, { active });
  }
}

export { SettingsFullscreenService };
