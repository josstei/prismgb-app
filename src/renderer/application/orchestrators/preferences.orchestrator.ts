import { injectable, inject } from 'inversify';
import { BaseOrchestrator } from '@platform/core';
import { EventChannels } from '@platform/events';
import { getStartupPreferenceEventDefinitions } from '@renderer/lib/settings.definitions.js';
import type { EventBusLike, LoggerFactoryLike } from '@platform/core';
import { TOKENS } from '@renderer/application/di/tokens.js';

type PreferencesPayload = Record<string, unknown>;

type SettingsServiceLike = {
  loadAllPreferences(): PreferencesPayload;
};

@injectable()
export class SettingsPreferencesOrchestrator extends BaseOrchestrator {
  constructor(
    @inject(TOKENS.settingsService) private readonly settingsService: SettingsServiceLike,
    @inject(TOKENS.eventBus) eventBus: EventBusLike,
    @inject(TOKENS.loggerFactory) loggerFactory: LoggerFactoryLike
  ) {
    super({ loggerFactory, eventBus }, 'SettingsPreferencesOrchestrator');
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
