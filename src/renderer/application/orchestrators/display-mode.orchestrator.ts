import type { SettingsAccess } from '@renderer/lib/settings.definitions.js';

import { BaseOrchestrator, disposeInOrder } from '@platform/core';
import { EventChannels, OnEvent } from '@platform/events';
import type { EventBusLike, LoggerFactoryLike } from '@platform/core';

type FullscreenServiceLike = {
  initialize(): void;
  enterFullscreen(): void;
  dispose(): void | Promise<void>;
};

type CinematicModeServiceLike = {
  initialize(): void;
  dispose(): void | Promise<void>;
};

type SettingsServiceLike = Pick<SettingsAccess, 'getSetting'>;

const STARTUP_VISIBILITY_LIFECYCLE = Symbol('settingsDisplayModeStartupVisibilityLifecycle');

type SettingsDisplayModeOrchestratorDependencies = {
  fullscreenService: FullscreenServiceLike;
  cinematicModeService: CinematicModeServiceLike;
  settingsService: SettingsServiceLike;
  eventBus: EventBusLike;
  loggerFactory: LoggerFactoryLike;
};

export class SettingsDisplayModeOrchestrator extends BaseOrchestrator {
  private readonly fullscreenService: FullscreenServiceLike;
  private readonly cinematicModeService: CinematicModeServiceLike;
  private readonly settingsService: SettingsServiceLike;

  constructor({ fullscreenService, cinematicModeService, settingsService, eventBus, loggerFactory }: SettingsDisplayModeOrchestratorDependencies) {
    super({ loggerFactory, eventBus }, 'SettingsDisplayModeOrchestrator');
    this.fullscreenService = fullscreenService;
    this.cinematicModeService = cinematicModeService;
    this.settingsService = settingsService;
  }

  /**
   * Initialize the orchestrator - setup fullscreen listeners
   */
  async onInitialize(): Promise<void> {
    this.fullscreenService.initialize();
    this.cinematicModeService.initialize();
  }

  @OnEvent(EventChannels.SETTINGS.PREFERENCES_LOADED)
  _applyStartupBehaviors(): void {
    this._clearStartupVisibilityListener();

    if (this.settingsService.getSetting('fullscreenOnStartup')) {
      if (document.hidden) {
        const onVisible = () => {
          if (document.hidden) {
            return;
          }

          this._clearStartupVisibilityListener();
          this.fullscreenService.enterFullscreen();
        };
        this.replaceManaged(STARTUP_VISIBILITY_LIFECYCLE, this.listen(document, 'visibilitychange', onVisible));
      } else {
        this.fullscreenService.enterFullscreen();
      }
    }
  }

  _clearStartupVisibilityListener(): void {
    this.cancelManaged(STARTUP_VISIBILITY_LIFECYCLE);
  }

  async onCleanup(): Promise<void> {
    this._clearStartupVisibilityListener();
    await disposeInOrder([() => this.fullscreenService.dispose(), () => this.cinematicModeService.dispose()]);
  }
}
