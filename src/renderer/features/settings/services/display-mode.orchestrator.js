/**
 * Display Mode Orchestrator
 *
 * Coordinates display mode services (fullscreen + cinematic mode).
 */

import { BaseOrchestrator } from '@shared/base/orchestrator.js';
import { EventChannels } from '@renderer/infrastructure/events/event-channels.js';

export class DisplayModeOrchestrator extends BaseOrchestrator {
  constructor(dependencies) {
    super(
      dependencies,
      ['fullscreenService', 'cinematicModeService', 'settingsService', 'eventBus', 'loggerFactory'],
      'DisplayModeOrchestrator'
    );
  }

  /**
   * Initialize the orchestrator - setup fullscreen listeners
   */
  async onInitialize() {
    this.fullscreenService.initialize();

    this.subscribeWithCleanup({
      [EventChannels.SETTINGS.PREFERENCES_LOADED]: () => this._applyStartupBehaviors(),
      // UI command events - decoupled from UISetupOrchestrator
      [EventChannels.UI.FULLSCREEN_TOGGLE_REQUESTED]: () => this.toggleFullscreen()
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
    this.fullscreenService.dispose();
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
    this.cinematicModeService.toggleCinematicMode();
  }
}
