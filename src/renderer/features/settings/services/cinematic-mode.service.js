/**
 * Cinematic Mode Service
 *
 * Owns cinematic mode state and UI event emission.
 */

import { BaseService } from '@shared/base/service.js';
import { EventChannels } from '@infrastructure/events/event-channels.js';

class CinematicModeService extends BaseService {
  constructor(dependencies) {
    super(dependencies, ['appState', 'eventBus', 'loggerFactory'], 'CinematicModeService');
  }

  toggleCinematicMode() {
    const newMode = !this.appState.cinematicModeEnabled;
    this.appState.setCinematicMode(newMode);
    this.eventBus.publish(EventChannels.UI.CINEMATIC_MODE, { enabled: newMode });
    this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Cinematic mode ' + (newMode ? 'enabled' : 'disabled') });
  }
}

export { CinematicModeService };
