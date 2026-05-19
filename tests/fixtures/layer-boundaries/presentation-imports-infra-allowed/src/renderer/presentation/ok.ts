import { EventBus } from '@renderer/infrastructure/events/event-bus.class.js';

export function getStatusEventName() {
  return EventBus.name;
}
