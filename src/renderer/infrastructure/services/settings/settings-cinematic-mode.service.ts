import { injectable, inject } from 'inversify';
import { BaseService, type LoggerFactory } from '@platform/core';
import { EventChannels } from '@renderer/lib/events/event-channels';
import { OnEvent, type EventBus } from '@renderer/lib/events/event-bus';
import { TOKENS } from '@renderer/application/di/tokens';
import type { AppState } from '@renderer/application/state/app-state';

@injectable()
class SettingsCinematicModeService extends BaseService {
  constructor(
    @inject(TOKENS.appState) private readonly appState: Pick<AppState, 'isCinematicModeEnabled' | 'setCinematicMode'>,
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
    this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, {
      message: `Cinematic mode ${newMode ? 'enabled' : 'disabled'}`
    });
  }
}

export { SettingsCinematicModeService };
