import { BaseOrchestrator } from '@shared/base/orchestrator.base.js';
import { EventChannels } from '@shared/events/event-channels.js';
import type { EventBusLike, LoggerFactoryLike } from '@shared/interfaces/infrastructure.types.js';

type PreferencesPayload = {
  gameVolume: number;
  performanceMode: boolean;
  minimalistFullscreen: boolean;
  [key: string]: unknown;
};

type SettingsServiceLike = {
  loadAllPreferences(): PreferencesPayload;
};

type SettingsPreferencesOrchestratorDependencies = {
  settingsService: SettingsServiceLike;
  eventBus: EventBusLike;
  loggerFactory: LoggerFactoryLike;
};

export class SettingsPreferencesOrchestrator extends BaseOrchestrator {
  private readonly settingsService: SettingsServiceLike;

  constructor(dependencies: SettingsPreferencesOrchestratorDependencies) {
    super(
      dependencies,
      ['settingsService', 'eventBus', 'loggerFactory'],
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

      // Apply volume via event (ShaderSelector listens for this)
      this.eventBus.publish(EventChannels.SETTINGS.VOLUME_CHANGED, preferences.gameVolume);
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
}
