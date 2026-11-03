import type { SettingsAccess } from '@renderer/lib/settings.definitions.js';

import { BaseOrchestrator } from '@platform/core';
import { EventChannels, OnEvent, type TypedEventBusLike } from '@platform/events';
import type { LoggerFactoryLike } from '@platform/core';
import type { AppState } from '../state/app-state';

type FullscreenServiceLike = {
  initialize(): void;
  enterFullscreen(): void;
  dispose(): void | Promise<void>;
};

type SettingsServiceLike = Pick<SettingsAccess, 'getSetting'>;

const STARTUP_VISIBILITY_LIFECYCLE = Symbol('settingsDisplayModeStartupVisibilityLifecycle');

type SettingsDisplayModeOrchestratorDependencies = {
  fullscreenService: FullscreenServiceLike;
  appState: Pick<AppState, 'isCinematicModeEnabled' | 'setCinematicMode'>;
  settingsService: SettingsServiceLike;
  eventBus: TypedEventBusLike;
  loggerFactory: LoggerFactoryLike;
};

export class SettingsDisplayModeOrchestrator extends BaseOrchestrator {
  constructor(private readonly dependencies: SettingsDisplayModeOrchestratorDependencies) {
    super(dependencies, 'SettingsDisplayModeOrchestrator');
  }

  /**
   * Initialize the orchestrator - setup fullscreen listeners
   */
  async onInitialize(): Promise<void> {
    this.dependencies.fullscreenService.initialize();
  }

  @OnEvent(EventChannels.UI.CINEMATIC_TOGGLE_REQUESTED)
  private toggleCinematicMode(): void {
    const { appState, eventBus } = this.dependencies;
    const enabled = !appState.isCinematicModeEnabled;
    appState.setCinematicMode(enabled);
    eventBus.publish(EventChannels.SETTINGS.CINEMATIC_MODE_CHANGED, { enabled });
  }

  @OnEvent(EventChannels.SETTINGS.PREFERENCES_LOADED)
  _applyStartupBehaviors(): void {
    this.cancelManaged(STARTUP_VISIBILITY_LIFECYCLE);

    if (this.dependencies.settingsService.getSetting('fullscreenOnStartup')) {
      if (document.hidden) {
        const onVisible = () => {
          if (document.hidden) {
            return;
          }

          this.cancelManaged(STARTUP_VISIBILITY_LIFECYCLE);
          this.dependencies.fullscreenService.enterFullscreen();
        };
        this.replaceManaged(STARTUP_VISIBILITY_LIFECYCLE, this.listen(document, 'visibilitychange', onVisible));
      } else {
        this.dependencies.fullscreenService.enterFullscreen();
      }
    }
  }

  async onCleanup(): Promise<void> {
    this.cancelManaged(STARTUP_VISIBILITY_LIFECYCLE);
    await this.dependencies.fullscreenService.dispose();
  }
}
