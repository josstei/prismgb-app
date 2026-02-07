/**
 * Events Infrastructure
 * Main process event system exports
 */

export { EventBus } from './event-bus.js';
export type { IEventBus, EventHandler, UnsubscribeFn } from './event-bus.js';
export { MainEventChannels } from './event-channels.config.js';
export type { MainEventChannel } from './event-channels.config.js';
