import { Service } from '@prismgb/core';
import { BaseOrchestrator } from '@prismgb/core';
import { EventChannels } from '@prismgb/events';
import { getStartupPreferenceEventDefinitions } from '@shared/features/settings/settings.definitions.js';
import type { EventBusLike, LoggerFactoryLike } from '@prismgb/core';

type PreferencesPayload = Record<string, unknown>;

type SettingsServiceLike = {
  loadAllPreferences(): PreferencesPayload;
};

type SettingsPreferencesOrchestratorDependencies = {
  settingsService: SettingsServiceLike;
  eventBus: EventBusLike;
  loggerFactory: LoggerFactoryLike;
};

@Service({
  "token": "preferencesOrchestrator",
  "dependencies": [
    "settingsService",
    "eventBus",
    "loggerFactory"
  ]
})
export class SettingsPreferencesOrchestrator extends BaseOrchestrator {
  private readonly settingsService: SettingsServiceLike;

  constructor(dependencies: SettingsPreferencesOrchestratorDependencies) {
    super(
      dependencies,
      'SettingsPreferencesOrchestrator'
    );
    this.settingsService = dependencies.settingsService;
    this.eventBus = dependencies.eventBus;
  }

  /**
   * Initialize orchestrator - load preferences on startup
   */
  async onInitialize(): Promise<void> {
    await this.loadPreferences();
  }

  /**
   * Load all preferences from storage and apply them
   */
  async loadPreferences(): Promise<void> {
    try {
      const preferences = this.settingsService.loadAllPreferences();

      for (const { name, event } of getStartupPreferenceEventDefinitions()) {
        this.eventBus.publish(event, preferences[name]);
      }

      // Signal that all preferences are loaded (for startup behaviors)
      this.eventBus.publish(EventChannels.SETTINGS.PREFERENCES_LOADED, preferences);

      this.logger.info('Preferences loaded');
    } catch (error) {
      this.logger.error('Error loading preferences:', error);
    }
  }
}
