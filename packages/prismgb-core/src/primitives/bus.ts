export class Bus<TEventMap extends Record<string, any>> {
  #listeners = new Map<keyof TEventMap, Set<(payload: any) => void | Promise<void>>>();

  publish<K extends keyof TEventMap>(event: K, payload: TEventMap[K]): void {
    const handlers = this.#listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(payload);
        } catch (err) {
          console.error(`Error in event handler for ${String(event)}:`, err);
        }
      }
    }
  }

  async publishAsync<K extends keyof TEventMap>(event: K, payload: TEventMap[K]): Promise<void> {
    const handlers = this.#listeners.get(event);
    if (handlers) {
      await Promise.all(
        Array.from(handlers).map(async (handler) => {
          try {
            await handler(payload);
          } catch (err) {
            console.error(`Error in async event handler for ${String(event)}:`, err);
          }
        })
      );
    }
  }

  subscribe<K extends keyof TEventMap>(
    event: K,
    handler: (payload: TEventMap[K]) => void | Promise<void>
  ): () => void {
    let handlers = this.#listeners.get(event);
    if (!handlers) {
      handlers = new Set();
      this.#listeners.set(event, handlers);
    }
    handlers.add(handler);

    return () => {
      handlers?.delete(handler);
      if (handlers?.size === 0) {
        this.#listeners.delete(event);
      }
    };
  }
}
