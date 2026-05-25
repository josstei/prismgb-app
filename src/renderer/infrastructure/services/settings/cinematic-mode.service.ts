/**
 * Cinematic Mode Service
 *
 * Owns cinematic mode state and settings-level event emission.
 */

import { BaseService } from '@shared/base/service.base.js';
import { EventChannels } from '@shared/events/event-channels.js';

class SettingsCinematicModeService extends BaseService {

  constructor(dependencies: Record<string, unknown>) {
    super(dependencies, ['appState', 'eventBus', 'loggerFactory'], 'SettingsCinematicModeService');
  }

  toggleCinematicMode() {
    const newMode = !this.appState.isCinematicModeEnabled;
    this.appState.setCinematicMode(newMode);
    this.eventBus.publish(EventChannels.SETTINGS.CINEMATIC_MODE_CHANGED, { enabled: newMode });
  }
}

export { SettingsCinematicModeService };
