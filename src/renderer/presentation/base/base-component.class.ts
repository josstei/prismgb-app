import type { EventBusLike, LoggerLike } from '@prismgb/core';
import { createDomListenerManager } from '@renderer/presentation/primitives/dom-listener.utils.js';

export abstract class BaseComponent {
  protected logger: LoggerLike | null;
  protected eventBus: EventBusLike | null;
  private _domListeners: ReturnType<typeof createDomListenerManager>;
  private _eventSubscriptions: (() => void)[] = [];

  constructor(deps: { eventBus?: EventBusLike; logger?: LoggerLike; loggerFactory?: any }) {
    this.eventBus = deps.eventBus ?? null;
    this.logger = deps.logger ?? (deps.loggerFactory?.create?.(this.constructor.name) ?? null);
    this._domListeners = createDomListenerManager({ logger: this.logger });
  }

  protected addDomListener(target: EventTarget, event: string, handler: EventListener, options?: AddEventListenerOptions): void {
    this._domListeners.add(target, event, handler, options);
  }

  protected subscribe(channel: string, handler: (...args: unknown[]) => void): void {
    if (!this.eventBus) return;
    const unsub = this.eventBus.subscribe(channel, handler);
    this._eventSubscriptions.push(unsub);
  }

  dispose(): void {
    this._domListeners.removeAll();
    for (const unsub of this._eventSubscriptions) {
      try {
        unsub();
      } catch (error) {
        this.logger?.warn?.('Error unsubscribing from event', error);
      }
    }
    this._eventSubscriptions = [];
  }
}
