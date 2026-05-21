export interface DomListenerLogger {
  warn(...args: unknown[]): void;
}

export interface DomListenerManagerOptions {
  logger?: DomListenerLogger;
}

export type DomListenerUnsubscribe = () => void;

interface ListenerEntry {
  target: EventTarget;
  event: string;
  handler: EventListenerOrEventListenerObject;
  options?: AddEventListenerOptions | boolean;
}

export interface DomListenerManager {
  add(
    target: EventTarget | null | undefined,
    event: string,
    handler: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions | boolean
  ): DomListenerUnsubscribe;
  removeAll(): void;
  removeByTarget(targetToRemove: EventTarget): number;
  count(): number;
}

export function createDomListenerManager(
  options: DomListenerManagerOptions = {}
): DomListenerManager {
  const { logger } = options;
  const listeners: ListenerEntry[] = [];

  return {
    add(target, event, handler, listenerOptions) {
      if (!target) {
        logger?.warn(`Cannot add listener: target is null for "${event}"`);
        return () => {};
      }

      target.addEventListener(event, handler, listenerOptions);
      const entry: ListenerEntry = { target, event, handler, options: listenerOptions };
      listeners.push(entry);

      return () => {
        target.removeEventListener(event, handler, listenerOptions);
        const index = listeners.indexOf(entry);
        if (index >= 0) {
          listeners.splice(index, 1);
        }
      };
    },

    removeAll() {
      for (const { target, event, handler, options: listenerOptions } of listeners) {
        try {
          target.removeEventListener(event, handler, listenerOptions);
        } catch (error) {
          logger?.warn(`Error removing "${event}" listener:`, error);
        }
      }
      listeners.length = 0;
    },

    removeByTarget(targetToRemove) {
      let removed = 0;
      for (let index = listeners.length - 1; index >= 0; index -= 1) {
        const { target, event, handler, options: listenerOptions } = listeners[index];
        if (target !== targetToRemove) {
          continue;
        }

        try {
          target.removeEventListener(event, handler, listenerOptions);
          removed += 1;
        } catch (error) {
          logger?.warn(`Error removing "${event}" listener from target:`, error);
        }
        listeners.splice(index, 1);
      }
      return removed;
    },

    count() {
      return listeners.length;
    }
  };
}
