export interface EventBus<TEventMap extends Record<string, any>> {
  publish<K extends keyof TEventMap>(event: K, payload: TEventMap[K]): void;
  publishAsync<K extends keyof TEventMap>(event: K, payload: TEventMap[K]): Promise<void>;
  subscribe<K extends keyof TEventMap>(
    event: K,
    handler: (payload: TEventMap[K]) => void | Promise<void>
  ): () => void;
}
