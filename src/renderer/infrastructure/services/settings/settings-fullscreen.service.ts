
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
  private revision = 0;
  private closing = false;
  private lifetime = {};

  private readonly eventBus: EventBusLike;

  constructor({ eventBus, loggerFactory }: SettingsFullscreenServiceDependencies) {
    super({ loggerFactory, eventBus }, 'SettingsFullscreenService');
    this.eventBus = eventBus;

    this._isFullscreenActive = false;
  }

  protected override onInitialize(): void {
    this.closing = false;
    this.lifetime = {};
    this.revision++;
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
    const lifetime = this.lifetime;
    const isActuallyFullscreen = await this._syncFullscreenState();
    if (this.closing || lifetime !== this.lifetime) return;

    if (isActuallyFullscreen) {
      this._forceExitFullscreen();
    } else {
      this._forceEnterFullscreen();
    }
  }

  async _syncFullscreenState() {
    if (this.closing) return this._isFullscreenActive;
    const revision = ++this.revision;
    try {
      const result = await trpcClient.window.isFullScreen.query();
      if (this.closing || revision !== this.revision) return this._isFullscreenActive;
      this._applyFullscreenState(result.isFullscreen);
      return result.isFullscreen;
    } catch (err) {
      this.logger.error('Error querying fullscreen state:', err);
      return this._isFullscreenActive;
    }
  }

  enterFullscreen() {
    if (this.closing || this._isFullscreenActive) {
      return;
    }
    this._forceEnterFullscreen();
  }

  _forceEnterFullscreen() {
    if (this.closing) return;
    const lifetime = this.lifetime;
    trpcClient.window.setFullScreen.mutate({ enabled: true }).catch(err => {
      if (this.closing || lifetime !== this.lifetime) return;
      this.logger.error('Error entering fullscreen:', err);
      this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Could not enter fullscreen', type: 'error' });
    });
  }

  _forceExitFullscreen() {
    if (this.closing) return;
    const lifetime = this.lifetime;
    trpcClient.window.setFullScreen.mutate({ enabled: false }).catch(err => {
      if (this.closing || lifetime !== this.lifetime) return;
      this.logger.error('Error exiting fullscreen:', err);
      this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Could not exit fullscreen', type: 'error' });
    });
  }

  _applyFullscreenState(active: boolean) {
    if (this.closing) return;
    this.revision++;
    if (this._isFullscreenActive === active) return;
    this._isFullscreenActive = active;
    this.eventBus.publish(EventChannels.UI.FULLSCREEN_STATE, { active });
  }

  override dispose(): void | Promise<void> {
    this.closing = true;
    this.lifetime = {};
    this.revision++;
    return super.dispose();
  }
}

export { SettingsFullscreenService };
