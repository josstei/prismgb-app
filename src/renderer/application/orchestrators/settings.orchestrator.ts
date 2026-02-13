/**
 * Settings Orchestrator
 *
 * Coordinates settings management including preferences and display modes
 *
 * Responsibilities:
 * - Load user preferences from SettingsService
 * - Apply preferences to AppState
 * - Publish preference events for UI updates
 * - Manage fullscreen and cinematic mode
 * - Handle display mode toggle commands
 */

import { BaseOrchestrator } from '@prismgb/core';
import { EventChannels } from '@renderer/common/config/event-channels';

export class SettingsOrchestrator extends BaseOrchestrator {
  static readonly dependencies = [
    'settingsService',
    'fullscreenService',
    'appState',
    'eventBus',
    'loggerFactory'
  ] as const;

  constructor(dependencies) {
    super(
      dependencies,
      [...SettingsOrchestrator.dependencies],
      'SettingsOrchestrator'
    );
  }

  /**
   * Initialize orchestrator - load preferences and setup fullscreen listeners
   */
  async onInitialize() {
    // Initialize fullscreen service first
    await this.fullscreenService.initialize();

    // Setup event subscriptions
    this.subscribeWithCleanup({
      [EventChannels.SETTINGS.PREFERENCES_LOADED]: () => this._applyStartupBehaviors(),
      [EventChannels.UI.FULLSCREEN_TOGGLE_REQUESTED]: () => this.toggleFullscreen(),
      [EventChannels.UI.CINEMATIC_TOGGLE_REQUESTED]: () => this.toggleCinematicMode()
    });

    // Load preferences
    await this.loadPreferences();
  }

  /**
   * Cleanup - remove fullscreen listeners
   */
  async onCleanup() {
    await this.fullscreenService.dispose();
  }

  /**
   * Load all preferences from storage and apply them
   */
  async loadPreferences() {
    try {
      const preferences = this.settingsService.loadAllPreferences();

      // Apply volume via event (ShaderSelector listens for this)
      this.eventBus.publish(EventChannels.SETTINGS.VOLUME_CHANGED, preferences.volume);
      this.eventBus.publish(EventChannels.SETTINGS.PERFORMANCE_MODE_CHANGED, preferences.performanceMode);
      this.eventBus.publish(EventChannels.SETTINGS.MINIMALIST_FULLSCREEN_CHANGED, preferences.minimalistFullscreen);

      // Status strip visibility is applied by SettingsMenuComponent on initialize

      // Signal that all preferences are loaded (for startup behaviors)
      this.eventBus.publish(EventChannels.SETTINGS.PREFERENCES_LOADED, preferences);

      this.logger.info('Preferences loaded');
    } catch (error) {
      this.logger.error('Error loading preferences:', error);
    }
  }

  /**
   * Apply startup behaviors based on preferences
   * @private
   */
  _applyStartupBehaviors() {
    if (this.settingsService.getFullscreenOnStartup()) {
      this.fullscreenService.enterFullscreen();
    }
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
