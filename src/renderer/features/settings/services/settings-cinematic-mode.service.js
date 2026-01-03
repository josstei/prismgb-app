/**
 * Cinematic Mode Service
 *
 * Owns cinematic mode state and settings-level event emission.
 */

import { BaseService } from '@shared/base/service.base.js';
import { EventChannels } from '@renderer/infrastructure/events/event-channels.config.js';

class SettingsCinematicModeService extends BaseService {
  constructor(dependencies) {
    super(dependencies, ['appState', 'eventBus', 'loggerFactory'], 'SettingsCinematicModeService');
  }

  toggleCinematicMode() {
    const newMode = !this.appState.cinematicModeEnabled;
    this.appState.setCinematicMode(newMode);
    this.eventBus.publish(EventChannels.SETTINGS.CINEMATIC_MODE_CHANGED, { enabled: newMode });
  }
}

export { SettingsCinematicModeService };
