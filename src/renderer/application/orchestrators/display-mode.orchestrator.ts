/**
 * Display Mode Orchestrator
 *
 * Coordinates display mode services (fullscreen + cinematic mode).
 */

import { BaseOrchestrator } from '@shared/base/orchestrator.base.js';
import { EventChannels } from '@shared/events/event-channels.js';

export class SettingsDisplayModeOrchestrator extends BaseOrchestrator {
  static readonly dependencies = [
    'fullscreenService',
    'appState',
    'settingsService',
    'eventBus',
    'loggerFactory'
  ] as const;

  constructor(dependencies) {
    super(
      dependencies,
      [...SettingsDisplayModeOrchestrator.dependencies],
      'SettingsDisplayModeOrchestrator'
    );
  }

  /**
   * Initialize the orchestrator - setup fullscreen listeners
   */
  async onInitialize() {
    await this.fullscreenService.initialize();

    this.subscribeWithCleanup({
      [EventChannels.SETTINGS.PREFERENCES_LOADED]: () => this._applyStartupBehaviors(),
      // UI command events - decoupled from UISetupOrchestrator
      [EventChannels.UI.FULLSCREEN_TOGGLE_REQUESTED]: () => this.toggleFullscreen(),
      [EventChannels.UI.CINEMATIC_TOGGLE_REQUESTED]: () => this.toggleCinematicMode()
    });
  }

  _applyStartupBehaviors() {
    if (this.settingsService.getFullscreenOnStartup()) {
      this.fullscreenService.enterFullscreen();
    }
  }

  /**
   * Cleanup - remove fullscreen listeners
   */
  async onCleanup() {
    await this.fullscreenService.dispose();
  }

  /**
   * Toggle fullscreen mode
   */
  toggleFullscreen() {
    this.fullscreenService.toggleFullscreen();
  }

  /**
   * Enter fullscreen mode
   */
  enterFullscreen() {
    this.fullscreenService.enterFullscreen();
  }

  /**
   * Exit fullscreen mode
   */
  exitFullscreen() {
    this.fullscreenService.exitFullscreen();
  }

  /**
   * Toggle cinematic mode
   */
  toggleCinematicMode() {
    const newMode = !this.appState.isCinematicModeEnabled;
    this.appState.setCinematicMode(newMode);
    this.eventBus.publish(EventChannels.SETTINGS.CINEMATIC_MODE_CHANGED, { enabled: newMode });
  }
}
