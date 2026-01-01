/**
 * Preferences Orchestrator
 *
 * Coordinates preferences loading and state management
 *
 * Responsibilities:
 * - Load user preferences from SettingsService
 * - Apply preferences to AppState
 * - Publish preference events for UI updates
 */

import { BaseOrchestrator } from '@shared/base/orchestrator.base.js';
import { EventChannels } from '@renderer/infrastructure/events/event-channels.config.js';

export class PreferencesOrchestrator extends BaseOrchestrator {
  constructor(dependencies) {
    super(
      dependencies,
      ['settingsService', 'appState', 'eventBus', 'loggerFactory'],
      'PreferencesOrchestrator'
    );
  }

  /**
   * Initialize orchestrator - load preferences on startup
   */
  async onInitialize() {
    await this.loadPreferences();
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

      // Status strip visibility is applied by SettingsMenuComponent on initialize

      // Signal that all preferences are loaded (for startup behaviors)
      this.eventBus.publish(EventChannels.SETTINGS.PREFERENCES_LOADED, preferences);

      this.logger.info('Preferences loaded');
    } catch (error) {
      this.logger.error('Error loading preferences:', error);
      this.eventBus.publish(EventChannels.SETTINGS.PREFERENCES_LOAD_FAILED, {
        error: error.message || 'Unknown error'
      });
    }
  }
}
