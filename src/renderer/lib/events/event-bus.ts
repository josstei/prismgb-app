import { createOnEventDecorator, isPromiseLike, type Logger } from '@platform/core';
import type { EventChannel, EventPayloadMap } from './event-channels';

type PublishArgs<K extends EventChannel> = EventPayloadMap[K] extends void
  ? [event: K]
  : [event: K, payload: EventPayloadMap[K]];

type EventHandler<K extends EventChannel> = EventPayloadMap[K] extends void
  ? () => void | Promise<void>
  : (payload: EventPayloadMap[K]) => void | Promise<void>;

type Listener = (payload: unknown) => void | Promise<void>;

export class EventBus {
  private readonly listeners = new Map<string, Set<Listener>>();

  constructor(private readonly logger?: Pick<Logger, 'error'>) {}

  publish<K extends EventChannel>(...args: PublishArgs<K>): void;
  publish(event: string, payload?: unknown): void {
    for (const listener of this.snapshot(event)) {
      listener(payload);
    }
  }

  publishAsync<K extends EventChannel>(...args: PublishArgs<K>): Promise<void>;
  async publishAsync(event: string, payload?: unknown): Promise<void> {
    await Promise.all(this.snapshot(event).map((listener) => listener(payload)).filter(isPromiseLike));
  }

  subscribe<K extends EventChannel>(event: K, handler: EventHandler<K>): () => void {
    const listener: Listener = (payload) => this.invoke(event, handler as Listener, payload);
    let listeners = this.listeners.get(event);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(event, listeners);
    }
    listeners.add(listener);
    return () => {
      this.listeners.get(event)?.delete(listener);
    };
  }

  // Iterating a copy keeps emit order stable: listeners added during an emit wait for the next one,
  // and listeners removed during an emit still receive the current one.
  private snapshot(event: string): Listener[] {
    return [...(this.listeners.get(event) ?? [])];
  }

  private invoke(event: string, handler: Listener, payload: unknown): void | Promise<void> {
    try {
      const result = handler(payload);
      if (isPromiseLike<void>(result)) {
        return result.catch((error: unknown) => this.logHandlerError(event, error));
      }
    } catch (error) {
      this.logHandlerError(event, error);
    }
  }

  private logHandlerError(event: string, error: unknown): void {
    this.logger?.error(`Error in event handler for "${event}":`, error instanceof Error ? error : new Error(String(error)));
  }
}

export const OnEvent = createOnEventDecorator<EventPayloadMap>();
