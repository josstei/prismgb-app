/**
 * Event handler function type.
 */
export type EventHandler<T = unknown> = (payload: T) => void;

/**
 * Unsubscribe function returned by subscribe.
 */
export type Unsubscribe = () => void;

/**
 * Interface for event bus implementations.
 * Provides publish/subscribe pattern for cross-service communication.
 */
export interface IEventBus {
  /**
   * Subscribe to an event.
   * @param event - Event name to subscribe to
   * @param handler - Handler function called when event is published
   * @returns Unsubscribe function to remove the subscription
   */
  subscribe<T = unknown>(event: string, handler: EventHandler<T>): Unsubscribe;

  /**
   * Publish an event to all subscribers.
   * @param event - Event name to publish
   * @param payload - Data to pass to handlers
   */
  publish<T = unknown>(event: string, payload?: T): void;

  /**
   * Remove all subscriptions for a specific event.
   * @param event - Event name to clear
   */
  removeAllListeners(event?: string): void;
}
