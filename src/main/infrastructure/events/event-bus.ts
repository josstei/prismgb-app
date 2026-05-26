import { SharedEventBus } from '@shared/events/event-bus.js';
import type { EventHandler, IEventBus, UnsubscribeFn } from '@shared/events/event-bus.js';

class EventBus extends SharedEventBus {}

export { EventBus };
export type { EventHandler, IEventBus, UnsubscribeFn };
