import { injectable, inject } from 'inversify';
import { BaseService } from '@platform/core';
import { EventChannels, OnEvent } from '@platform/events';
import { createTrpcEventBridge } from '@renderer/infrastructure/services/platform/trpc-event-bridge.factory';
import { trpcClient } from '@renderer/infrastructure/ipc/trpc-client';
import type { EventBusLike, LoggerFactoryLike } from '@platform/core';
import { TOKENS } from '@renderer/application/di/tokens.js';

const FULLSCREEN_DOCUMENT_LIFECYCLE = Symbol('settingsFullscreenDocumentLifecycle');
const FULLSCREEN_NATIVE_LIFECYCLE = Symbol('settingsFullscreenNativeLifecycle');

@injectable()
class SettingsFullscreenService extends BaseService {
  private readonly _boundHandleFullscreenChange: () => void;
  private _isFullscreenActive: boolean;

  constructor(
    @inject(TOKENS.eventBus) private readonly eventBus: EventBusLike,
    @inject(TOKENS.loggerFactory) loggerFactory: LoggerFactoryLike
  ) {
    super({ loggerFactory, eventBus }, 'SettingsFullscreenService');

    this._boundHandleFullscreenChange = this._handleFullscreenChange.bind(this);
    this._isFullscreenActive = false;
  }

  initialize() {
    this.bindEventHandlers();

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

  @OnEvent(EventChannels.UI.FULLSCREEN_TOGGLE_REQUESTED)
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
      this._applyFullscreenState(result.isFullscreen);
      return result.isFullscreen;
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
