
import { BaseService } from '@platform/core';
import { EventChannels, OnEvent } from '@platform/events';
import { createTrpcEventBridge } from '@renderer/infrastructure/services/platform/trpc-event-bridge.factory';
import { trpcClient } from '@renderer/infrastructure/ipc/trpc-client';
import type { EventBusLike, LoggerFactoryLike } from '@platform/core';


type SettingsFullscreenServiceDependencies = {
  eventBus: EventBusLike;
  loggerFactory: LoggerFactoryLike;
};

class SettingsFullscreenService extends BaseService {
  private _isFullscreenActive: boolean;

  private readonly eventBus: EventBusLike;

  constructor({ eventBus, loggerFactory }: SettingsFullscreenServiceDependencies) {
    super({ loggerFactory, eventBus }, 'SettingsFullscreenService');
    this.eventBus = eventBus;

    this._isFullscreenActive = false;
  }

  protected override onInitialize(): void {
    this.bindEventHandlers();

    this.track(createTrpcEventBridge('SettingsFullscreenService', [
      () => trpcClient.window.onEnterFullscreen.subscribe(undefined, { onData: () => this._applyFullscreenState(true) }),
      () => trpcClient.window.onLeaveFullscreen.subscribe(undefined, { onData: () => this._applyFullscreenState(false) }),
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
    trpcClient.window.setFullScreen.mutate({ enabled: true }).catch(err => {
      this.logger.error('Error entering fullscreen:', err);
      this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Could not enter fullscreen', type: 'error' });
    });
  }

  _forceExitFullscreen() {
    trpcClient.window.setFullScreen.mutate({ enabled: false }).catch(err => {
      this.logger.error('Error exiting fullscreen:', err);
      this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Could not exit fullscreen', type: 'error' });
    });
  }

  _applyFullscreenState(active: boolean) {
    if (this._isFullscreenActive === active) return;
    this._isFullscreenActive = active;
    this.eventBus.publish(EventChannels.UI.FULLSCREEN_STATE, { active });
  }
}

export { SettingsFullscreenService };
