export class Container<TTokenMap extends Record<string, any>> {
  #cradle: Partial<TTokenMap> = {};
  #factories = new Map<keyof TTokenMap, (c: Container<TTokenMap>) => any>();

  /**
   * Register a factory function for a generic dependency token
   */
  register<K extends keyof TTokenMap>(token: K, factory: (c: Container<TTokenMap>) => TTokenMap[K]): void {
    this.#factories.set(token, factory);
  }

  /**
   * Resolve a generic dependency token, instantiating and caching it on demand
   */
  resolve<K extends keyof TTokenMap>(token: K): TTokenMap[K] {
    if (token in this.#cradle) {
      return this.#cradle[token]!;
    }
    const factory = this.#factories.get(token);
    if (!factory) {
      throw new Error(`Dependency token "${String(token)}" not registered in container`);
    }
    const instance = factory(this);
    this.#cradle[token] = instance;
    return instance;
  }
}
