/**
 * Cinematic Mode Service
 *
 * Owns cinematic mode state and settings-level event emission.
 */

import { injectable, inject } from 'inversify';
import { BaseService } from '@platform/core';
import { EventChannels } from '@renderer/lib/events/event-channels';
import { OnEvent, type EventBus } from '@renderer/lib/events/event-bus';
import type { LoggerFactory } from '@platform/core';
import { TOKENS } from '@renderer/application/di/tokens';

type CinematicModeAppStateLike = {
  readonly isCinematicModeEnabled: boolean;
  setCinematicMode(enabled: boolean): void;
};

@injectable()
class SettingsCinematicModeService extends BaseService {
  constructor(
    @inject(TOKENS.appState) private readonly appState: CinematicModeAppStateLike,
    @inject(TOKENS.eventBus) private readonly eventBus: EventBus,
    @inject(TOKENS.loggerFactory) loggerFactory: LoggerFactory
  ) {
    super(loggerFactory, 'SettingsCinematicModeService');
  }

  initialize(): void {
    this.bindEventHandlers(this.eventBus);
  }

  @OnEvent(EventChannels.UI.CINEMATIC_TOGGLE_REQUESTED)
  toggleCinematicMode() {
    const newMode = !this.appState.isCinematicModeEnabled;
    this.appState.setCinematicMode(newMode);
    this.eventBus.publish(EventChannels.SETTINGS.CINEMATIC_MODE_CHANGED, { enabled: newMode });
  }
}

export { SettingsCinematicModeService };
