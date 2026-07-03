import { injectable, inject } from 'inversify';
import { BaseOrchestrator } from '@platform/core';
import { EventChannels } from '@platform/events';
import type { EventBusLike, LoggerFactoryLike } from '@platform/core';
import { TOKENS } from '@renderer/application/di/tokens.js';

type FullscreenServiceLike = {
  initialize(): void;
  enterFullscreen(): void;
  exitFullscreen(): void;
  toggleFullscreen(): void;
  dispose(): void | Promise<void>;
};

type CinematicModeServiceLike = {
  toggleCinematicMode(): void;
};

type SettingsServiceLike = {
  getBooleanSetting(name: string): boolean;
};

const STARTUP_VISIBILITY_LIFECYCLE = Symbol('settingsDisplayModeStartupVisibilityLifecycle');

@injectable()
export class SettingsDisplayModeOrchestrator extends BaseOrchestrator {
  constructor(
    @inject(TOKENS.fullscreenService) private readonly fullscreenService: FullscreenServiceLike,
    @inject(TOKENS.cinematicModeService) private readonly cinematicModeService: CinematicModeServiceLike,
    @inject(TOKENS.settingsService) private readonly settingsService: SettingsServiceLike,
    @inject(TOKENS.eventBus) eventBus: EventBusLike,
    @inject(TOKENS.loggerFactory) loggerFactory: LoggerFactoryLike
  ) {
    super({ loggerFactory, eventBus }, 'SettingsDisplayModeOrchestrator');
  }

  /**
   * Initialize the orchestrator - setup fullscreen listeners
   */
  async onInitialize(): Promise<void> {
    this.fullscreenService.initialize();

    this.subscribeWithCleanup({
      [EventChannels.SETTINGS.PREFERENCES_LOADED]: () => this._applyStartupBehaviors(),
      // UI command events - decoupled from UISetupOrchestrator
      [EventChannels.UI.FULLSCREEN_TOGGLE_REQUESTED]: () => this.toggleFullscreen(),
      [EventChannels.UI.CINEMATIC_TOGGLE_REQUESTED]: () => this.toggleCinematicMode()
    });
  }

  _applyStartupBehaviors(): void {
    this._clearStartupVisibilityListener();

    if (this.settingsService.getBooleanSetting('fullscreenOnStartup')) {
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
    await this.fullscreenService.dispose();
  }

  /**
   * Toggle fullscreen mode
   */
  toggleFullscreen(): void {
    this.fullscreenService.toggleFullscreen();
  }

  /**
   * Enter fullscreen mode
   */
  enterFullscreen(): void {
    this.fullscreenService.enterFullscreen();
  }

  /**
   * Exit fullscreen mode
   */
  exitFullscreen(): void {
    this.fullscreenService.exitFullscreen();
  }

  /**
   * Toggle cinematic mode
   */
  toggleCinematicMode(): void {
    this.cinematicModeService.toggleCinematicMode();
  }
}
