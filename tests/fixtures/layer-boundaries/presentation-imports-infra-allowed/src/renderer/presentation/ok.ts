import { EventChannels } from '@renderer/infrastructure/events/event-channels.config.js';

export function getStatusEventName() {
  return EventChannels.UI.STATUS_MESSAGE;
}
