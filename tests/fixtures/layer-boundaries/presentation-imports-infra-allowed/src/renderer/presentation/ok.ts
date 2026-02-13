import { EventChannels } from '@renderer/infrastructure/events/event-channels';

export function getStatusEventName() {
  return EventChannels.UI.STATUS_MESSAGE;
}
