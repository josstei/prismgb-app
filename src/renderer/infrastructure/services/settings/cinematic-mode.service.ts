import { Service } from '@shared/di/decorators.js';
/**
 * Cinematic Mode Service
 *
 * Owns cinematic mode state and settings-level event emission.
 */

import { BaseService } from '@shared/base/service.base.js';
import { EventChannels } from '@shared/events/event-channels.js';
import type { EventBusLike, LoggerFactoryLike } from '@shared/interfaces/infrastructure.types.js';

type CinematicModeAppStateLike = {
  readonly isCinematicModeEnabled: boolean;
  setCinematicMode(enabled: boolean): void;
};

type SettingsCinematicModeServiceDependencies = {
  appState: CinematicModeAppStateLike;
  eventBus: EventBusLike;
  loggerFactory: LoggerFactoryLike;
};

@Service({
  "token": "cinematicModeService",
  "disposal": "dispose"
})
class SettingsCinematicModeService extends BaseService {
  private readonly appState: CinematicModeAppStateLike;
  private readonly eventBus: EventBusLike;

  constructor(dependencies: SettingsCinematicModeServiceDependencies) {
    super(dependencies, ['appState', 'eventBus', 'loggerFactory'], 'SettingsCinematicModeService');
    this.appState = dependencies.appState;
    this.eventBus = dependencies.eventBus;
  }

  toggleCinematicMode() {
    const newMode = !this.appState.isCinematicModeEnabled;
    this.appState.setCinematicMode(newMode);
    this.eventBus.publish(EventChannels.SETTINGS.CINEMATIC_MODE_CHANGED, { enabled: newMode });
  }
}

export { SettingsCinematicModeService };
