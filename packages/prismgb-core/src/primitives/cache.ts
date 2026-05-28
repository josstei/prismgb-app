export class Cache<K, V> {
  #cache = new Map<K, { value: V; expires: number | null }>();
  #maxSize: number;
  #defaultTTL: number;

  constructor(maxSize = 100, defaultTTL = 60000) {
    this.#maxSize = maxSize;
    this.#defaultTTL = defaultTTL;
  }

  get(key: K): V | undefined {
    const entry = this.#cache.get(key);
    if (!entry) return undefined;
    if (entry.expires && Date.now() > entry.expires) {
      this.#cache.delete(key);
      return undefined;
    }
    // Refresh insertion order
    this.#cache.delete(key);
    this.#cache.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V, ttl = this.#defaultTTL): void {
    if (this.#cache.size >= this.#maxSize && !this.#cache.has(key)) {
      const oldest = this.#cache.keys().next().value;
      if (oldest !== undefined) {
        this.#cache.delete(oldest);
      }
    }
    this.#cache.set(key, {
      value,
      expires: ttl > 0 ? Date.now() + ttl : null
    });
  }

  has(key: K): boolean {
    const entry = this.#cache.get(key);
    if (!entry) return false;
    if (entry.expires && Date.now() > entry.expires) {
      this.#cache.delete(key);
      return false;
    }
    return true;
  }

  delete(key: K): boolean {
    return this.#cache.delete(key);
  }

  clear(): void {
    this.#cache.clear();
  }

  get size(): number {
    return this.#cache.size;
  }
}
