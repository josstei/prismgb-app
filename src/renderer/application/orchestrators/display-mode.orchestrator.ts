/**
 * Display Mode Orchestrator
 *
 * Coordinates display mode services (fullscreen + cinematic mode).
 */

import { BaseOrchestrator } from '@shared/base/orchestrator.base.js';
import { EventChannels } from '@shared/events/event-channels.js';

export class SettingsDisplayModeOrchestrator extends BaseOrchestrator {
  private _removeStartupVisibilityListener: (() => void) | null = null;

  constructor(dependencies) {
    super(
      dependencies,
      ['fullscreenService', 'cinematicModeService', 'settingsService', 'eventBus', 'loggerFactory'],
      'SettingsDisplayModeOrchestrator'
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
      [EventChannels.UI.FULLSCREEN_TOGGLE_REQUESTED]: () => this.toggleFullscreen(),
      [EventChannels.UI.CINEMATIC_TOGGLE_REQUESTED]: () => this.toggleCinematicMode()
    });
  }

  _applyStartupBehaviors() {
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
        document.addEventListener('visibilitychange', onVisible);
        this._removeStartupVisibilityListener = () => {
          document.removeEventListener('visibilitychange', onVisible);
        };
      } else {
        this.fullscreenService.enterFullscreen();
      }
    }
  }

  _clearStartupVisibilityListener() {
    this._removeStartupVisibilityListener?.();
    this._removeStartupVisibilityListener = null;
  }

  /**
   * Cleanup - remove fullscreen listeners
   */
  async onCleanup() {
    this._clearStartupVisibilityListener();
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
