/**
 * Cinematic Mode Service
 *
 * Owns cinematic mode state and settings-level event emission.
 */

import { BaseService } from '@platform/core';
import { EventChannels } from '@platform/events';
import type { EventBusLike, LoggerFactoryLike } from '@platform/core';

type CinematicModeAppStateLike = {
  readonly isCinematicModeEnabled: boolean;
  setCinematicMode(enabled: boolean): void;
};

type SettingsCinematicModeServiceDependencies = {
  appState: CinematicModeAppStateLike;
  eventBus: EventBusLike;
  loggerFactory: LoggerFactoryLike;
};

class SettingsCinematicModeService extends BaseService {
  private readonly appState: CinematicModeAppStateLike;
  private readonly eventBus: EventBusLike;

  constructor(dependencies: SettingsCinematicModeServiceDependencies) {
    super(dependencies, 'SettingsCinematicModeService');
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
