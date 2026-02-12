/**
 * PerformanceCache
 *
 * LRU cache with TTL support for caching expensive computations,
 * resolution calculations, animation states, and reusable data.
 * Reduces CPU/GPU overhead by avoiding redundant calculations.
 */

export class PerformanceCache {
  #cache;
  #maxSize;
  #defaultTTL;
  #hits;
  #misses;

  /**
   * Create a performance cache
   * @param {Object} options - Cache options
   * @param {number} options.maxSize - Maximum cache entries (default: 100)
   * @param {number} options.defaultTTL - Default TTL in ms (default: 60000 = 1 minute)
   */
  constructor(options = {}) {
    this.#cache = new Map();
    this.#maxSize = options.maxSize || 100;
    this.#defaultTTL = options.defaultTTL || 60000;
    this.#hits = 0;
    this.#misses = 0;
  }

  /**
   * Generate cache key from arguments
   * @param {string} prefix - Key prefix
   * @param  {...any} args - Arguments to hash
   * @returns {string} Cache key
   */
  static generateKey(prefix, ...args) {
    const argsKey = args.map(arg => {
      if (arg === null || arg === undefined) return 'null';
      if (typeof arg === 'object') return JSON.stringify(arg);
      return String(arg);
    }).join(':');
    return `${prefix}:${argsKey}`;
  }

  /**
   * Get value from cache
   * @param {string} key - Cache key
   * @returns {*} Cached value or undefined
   */
  get(key) {
    const entry = this.#cache.get(key);

    if (!entry) {
      this.#misses++;
      return undefined;
    }

    // Check TTL
    if (entry.expires && Date.now() > entry.expires) {
      this.#cache.delete(key);
      this.#misses++;
      return undefined;
    }

    // Move to end for LRU
    this.#cache.delete(key);
    this.#cache.set(key, entry);

    this.#hits++;
    return entry.value;
  }

  /**
   * Set value in cache
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   * @param {number} ttl - TTL in ms (optional, uses default if not provided)
   */
  set(key, value, ttl = this.#defaultTTL) {
    // Evict oldest if at capacity
    if (this.#cache.size >= this.#maxSize) {
      const oldestKey = this.#cache.keys().next().value;
      this.#cache.delete(oldestKey);
    }

    this.#cache.set(key, {
      value,
      expires: ttl > 0 ? Date.now() + ttl : null,
      created: Date.now()
    });
  }

  /**
   * Get or compute value (memoization pattern)
   * @param {string} key - Cache key
   * @param {Function} compute - Function to compute value if not cached
   * @param {number} ttl - TTL in ms (optional)
   * @returns {*} Cached or computed value
   */
  getOrCompute(key, compute, ttl) {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = compute();
    this.set(key, value, ttl);
    return value;
  }

  /**
   * Check if key exists and is valid
   * @param {string} key - Cache key
   * @returns {boolean}
   */
  has(key) {
    const entry = this.#cache.get(key);
    if (!entry) return false;
    if (entry.expires && Date.now() > entry.expires) {
      this.#cache.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Delete entry from cache
   * @param {string} key - Cache key
   * @returns {boolean} True if entry was deleted
   */
  delete(key) {
    return this.#cache.delete(key);
  }

  /**
   * Clear all entries
   */
  clear() {
    this.#cache.clear();
  }

  /**
   * Clear expired entries
   * @returns {number} Number of entries cleared
   */
  clearExpired() {
    const now = Date.now();
    let cleared = 0;

    for (const [key, entry] of this.#cache) {
      if (entry.expires && now > entry.expires) {
        this.#cache.delete(key);
        cleared++;
      }
    }

    return cleared;
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getStats() {
    const total = this.#hits + this.#misses;
    return {
      size: this.#cache.size,
      maxSize: this.#maxSize,
      hits: this.#hits,
      misses: this.#misses,
      hitRate: total > 0 ? (this.#hits / total * 100).toFixed(2) + '%' : '0%'
    };
  }

  /**
   * Get cache size
   * @returns {number}
   */
  get size() {
    return this.#cache.size;
  }
}


/**
 * AnimationCache - Cache for animation states and reusable animation data
 *
 * Note: This class is designed for main-thread use only.
 * It requires requestAnimationFrame/cancelAnimationFrame APIs which are not
 * available in Web Workers. For worker-based animation, use the worker's
 * native scheduling mechanisms directly.
 */
export class AnimationCache extends PerformanceCache {
  #activeAnimations;
  #cancelAnimationFrame;

  constructor() {
    super({ maxSize: 30, defaultTTL: 0 }); // No TTL - manual control
    this.#activeAnimations = new Map();

    // Use globalThis for cross-environment compatibility
    // This works in browsers (window), Node.js (global), and modern workers (self)
    this.#cancelAnimationFrame = globalThis.cancelAnimationFrame?.bind(globalThis);

    if (!this.#cancelAnimationFrame) {
      throw new Error('AnimationCache requires cancelAnimationFrame API (main thread only)');
    }
  }

  /**
   * Register an animation frame ID for tracking
   * @param {string} name - Animation name
   * @param {number} frameId - RAF or RVFC ID
   */
  registerAnimation(name, frameId) {
    this.#activeAnimations.set(name, {
      frameId,
      startTime: performance.now()
    });
  }

  /**
   * Cancel a registered animation
   * @param {string} name - Animation name
   * @returns {boolean} True if animation was cancelled
   */
  cancelAnimation(name) {
    const animation = this.#activeAnimations.get(name);
    if (animation) {
      this.#cancelAnimationFrame(animation.frameId);
      this.#activeAnimations.delete(name);
      return true;
    }
    return false;
  }

  /**
   * Cancel all registered animations
   */
  cancelAllAnimations() {
    for (const [, animation] of this.#activeAnimations) {
      this.#cancelAnimationFrame(animation.frameId);
    }
    this.#activeAnimations.clear();
  }

  /**
   * Get active animation count
   * @returns {number}
   */
  get activeCount() {
    return this.#activeAnimations.size;
  }

  /**
   * Check if animation is active
   * @param {string} name - Animation name
   * @returns {boolean}
   */
  isAnimationActive(name) {
    return this.#activeAnimations.has(name);
  }

  /**
   * Get animation runtime in ms
   * @param {string} name - Animation name
   * @returns {number} Runtime in ms or -1 if not found
   */
  getAnimationRuntime(name) {
    const animation = this.#activeAnimations.get(name);
    if (!animation) return -1;
    return performance.now() - animation.startTime;
  }
}
