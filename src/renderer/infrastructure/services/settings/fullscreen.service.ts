import { BaseService } from '@shared/base/service.base.js';
import { EventChannels } from '@shared/events/event-channels.js';
import {
  createRendererPreloadEventBridge,
  RendererPreloadBridgeDescriptors
} from '@renderer/infrastructure/services/preload-event-bridge.factory';
import type { EventBusLike, LoggerFactoryLike } from '@shared/interfaces/infrastructure.types.js';

type SettingsFullscreenServiceDependencies = {
  eventBus: EventBusLike;
  loggerFactory: LoggerFactoryLike;
};

const FULLSCREEN_DOCUMENT_LIFECYCLE = Symbol('settingsFullscreenDocumentLifecycle');

class SettingsFullscreenService extends BaseService {
  private readonly eventBus: EventBusLike;
  private readonly _boundHandleFullscreenChange: () => void;
  private _isFullscreenActive: boolean;

  constructor(dependencies: SettingsFullscreenServiceDependencies) {
    super(dependencies, ['eventBus', 'loggerFactory'], 'SettingsFullscreenService');

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

    this.disposables.cancel(RendererPreloadBridgeDescriptors.windowAPI.lifecycleKey);
    const windowAPI = window.windowAPI;
    if (windowAPI) {
      this.disposables.replace(RendererPreloadBridgeDescriptors.windowAPI.lifecycleKey, createRendererPreloadEventBridge({
        api: windowAPI,
        descriptor: RendererPreloadBridgeDescriptors.windowAPI,
        logger: this.logger,
        handlers: {
          onEnterFullscreen: () => this._handleNativeFullscreen(true),
          onLeaveFullscreen: () => this._handleNativeFullscreen(false),
          onResized: () => {
            this._syncFullscreenState();
            this.eventBus.publish(RendererPreloadBridgeDescriptors.windowAPI.events.onResized);
          }
        }
      }));
    }

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

  _handleNativeFullscreen(active: boolean) {
    this._applyFullscreenState(active);
  }

  _applyFullscreenState(active: boolean) {
    if (this._isFullscreenActive === active) return;
    this._isFullscreenActive = active;

    // Publish event - UIEventBridge handles all UI updates (body class, controls auto-hide)
    this.eventBus.publish(EventChannels.UI.FULLSCREEN_STATE, { active });
  }
}

export { SettingsFullscreenService };
