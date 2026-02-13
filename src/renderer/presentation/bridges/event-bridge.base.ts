/**
 * Event Bridge Base Class
 *
 * Abstract base for bridges that translate EventBus events into UI effects.
 * Eliminates boilerplate by standardizing the event subscription pattern.
 *
 * Subclasses only need to:
 * 1. Define static dependencies array
 * 2. Implement getEventMappings() to map event channels to handlers
 */

import { LifecycleService } from '@prismgb/core';

export abstract class EventBridgeBase extends LifecycleService {
  /**
   * Get the event channel to handler mappings.
   * Called during initialization to set up subscriptions.
   *
   * @returns {Record<string, (...args: unknown[]) => void>} Event channel to handler map
   * @abstract
   */
  protected abstract getEventMappings(): Record<string, (...args: unknown[]) => void>;

  /**
   * Initialize event subscriptions using the mappings from getEventMappings().
   * Automatically cleaned up via subscribeWithCleanup() on disposal.
   */
  async onInitialize(): Promise<void> {
    this.subscribeWithCleanup(this.getEventMappings());
    this.logger.info(`${this.constructor.name} initialized`);
  }

  /**
   * Dispose handler. Override if custom cleanup needed beyond event unsubscription.
   */
  async onDispose(): Promise<void> {
    this.logger.info(`${this.constructor.name} disposed`);
  }
}
