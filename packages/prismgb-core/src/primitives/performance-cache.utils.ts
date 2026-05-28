import { Service } from '../di/decorators.js';

export interface PerformanceCacheOptions {
  maxSize?: number;
  defaultTTL?: number;
}

interface CacheEntry<T> {
  value: T;
  expires: number | null;
}

interface AnimationEntry {
  frameId: number;
  startTime: number;
}

export class PerformanceCache<T = unknown> {
  #cache: Map<string, CacheEntry<T>>;
  #maxSize: number;
  #defaultTTL: number;
  #hits: number;
  #misses: number;

  constructor(options: PerformanceCacheOptions = {}) {
    this.#cache = new Map();
    this.#maxSize = options.maxSize || 100;
    this.#defaultTTL = options.defaultTTL || 60000;
    this.#hits = 0;
    this.#misses = 0;
  }

  static generateKey(prefix: string, ...args: unknown[]): string {
    const argsKey = args.map((arg) => {
      if (arg === null || arg === undefined) return 'null';
      if (typeof arg === 'object') return JSON.stringify(arg);
      return String(arg);
    }).join(':');

    return `${prefix}:${argsKey}`;
  }

  get(key: string): T | undefined {
    const entry = this.#cache.get(key);

    if (!entry) {
      this.#misses += 1;
      return undefined;
    }

    if (entry.expires && Date.now() > entry.expires) {
      this.#cache.delete(key);
      this.#misses += 1;
      return undefined;
    }

    this.#cache.delete(key);
    this.#cache.set(key, entry);

    this.#hits += 1;
    return entry.value;
  }

  set(key: string, value: T, ttl = this.#defaultTTL): void {
    if (this.#cache.size >= this.#maxSize) {
      const oldest = this.#cache.keys().next();
      if (!oldest.done) {
        this.#cache.delete(oldest.value);
      }
    }

    this.#cache.set(key, {
      value,
      expires: ttl > 0 ? Date.now() + ttl : null
    });
  }

  getOrCompute(key: string, compute: () => T, ttl?: number): T {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = compute();
    this.set(key, value, ttl);
    return value;
  }

  has(key: string): boolean {
    const entry = this.#cache.get(key);
    if (!entry) return false;

    if (entry.expires && Date.now() > entry.expires) {
      this.#cache.delete(key);
      return false;
    }

    return true;
  }

  delete(key: string): boolean {
    return this.#cache.delete(key);
  }

  clear(): void {
    this.#cache.clear();
  }

  clearExpired(): number {
    const now = Date.now();
    let cleared = 0;

    for (const [key, entry] of this.#cache) {
      if (entry.expires && now > entry.expires) {
        this.#cache.delete(key);
        cleared += 1;
      }
    }

    return cleared;
  }

  getStats(): {
    size: number;
    maxSize: number;
    hits: number;
    misses: number;
    hitRate: string;
  } {
    const total = this.#hits + this.#misses;
    return {
      size: this.#cache.size,
      maxSize: this.#maxSize,
      hits: this.#hits,
      misses: this.#misses,
      hitRate: total > 0 ? `${((this.#hits / total) * 100).toFixed(2)}%` : '0%'
    };
  }

  get size(): number {
    return this.#cache.size;
  }
}

@Service({ token: 'animationCache' })
export class AnimationCache extends PerformanceCache {
  #activeAnimations: Map<string, AnimationEntry>;
  #cancelAnimationFrame: (handle: number) => void;

  constructor() {
    super({ maxSize: 30, defaultTTL: 0 });
    this.#activeAnimations = new Map();

    const cancelAnimationFrameFn = globalThis.cancelAnimationFrame?.bind(globalThis);
    if (!cancelAnimationFrameFn) {
      throw new Error('AnimationCache requires cancelAnimationFrame API (main thread only)');
    }

    this.#cancelAnimationFrame = cancelAnimationFrameFn;
  }

  registerAnimation(name: string, frameId: number): void {
    this.#activeAnimations.set(name, {
      frameId,
      startTime: performance.now()
    });
  }

  cancelAnimation(name: string): boolean {
    const animation = this.#activeAnimations.get(name);
    if (animation) {
      this.#cancelAnimationFrame(animation.frameId);
      this.#activeAnimations.delete(name);
      return true;
    }

    return false;
  }

  cancelAllAnimations(): void {
    for (const [, animation] of this.#activeAnimations) {
      this.#cancelAnimationFrame(animation.frameId);
    }
    this.#activeAnimations.clear();
  }

  dispose(): void {
    this.cancelAllAnimations();
    this.clear();
  }

  get activeCount(): number {
    return this.#activeAnimations.size;
  }

  isAnimationActive(name: string): boolean {
    return this.#activeAnimations.has(name);
  }

  getAnimationRuntime(name: string): number {
    const animation = this.#activeAnimations.get(name);
    if (!animation) return -1;

    return performance.now() - animation.startTime;
  }
}
