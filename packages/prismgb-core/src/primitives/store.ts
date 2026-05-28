export class Store<TSchema extends Record<string, any>> {
  #storage = new Map<keyof TSchema, any>();

  async get<K extends keyof TSchema>(key: K): Promise<TSchema[K] | null> {
    return this.#storage.has(key) ? this.#storage.get(key) : null;
  }

  async set<K extends keyof TSchema>(key: K, value: TSchema[K]): Promise<void> {
    this.#storage.set(key, value);
  }

  async delete<K extends keyof TSchema>(key: K): Promise<boolean> {
    return this.#storage.delete(key);
  }

  async clear(): Promise<void> {
    this.#storage.clear();
  }
}
