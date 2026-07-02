import { BaseOrchestrator } from '@platform/core';
import { EventChannels } from '@platform/events';
import type { EventBusLike, LoggerFactoryLike } from '@platform/core';

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

type SettingsDisplayModeOrchestratorDependencies = {
  fullscreenService: FullscreenServiceLike;
  cinematicModeService: CinematicModeServiceLike;
  settingsService: SettingsServiceLike;
  eventBus: EventBusLike;
  loggerFactory: LoggerFactoryLike;
};

const STARTUP_VISIBILITY_LIFECYCLE = Symbol('settingsDisplayModeStartupVisibilityLifecycle');

export class SettingsDisplayModeOrchestrator extends BaseOrchestrator {
  private readonly fullscreenService: FullscreenServiceLike;
  private readonly cinematicModeService: CinematicModeServiceLike;
  private readonly settingsService: SettingsServiceLike;

  constructor(dependencies: SettingsDisplayModeOrchestratorDependencies) {
    super(
      dependencies,
      'SettingsDisplayModeOrchestrator'
    );
    this.fullscreenService = dependencies.fullscreenService;
    this.cinematicModeService = dependencies.cinematicModeService;
    this.settingsService = dependencies.settingsService;
    this.eventBus = dependencies.eventBus;
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
