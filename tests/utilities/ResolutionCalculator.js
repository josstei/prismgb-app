/**
 * Resolution Calculator
 *
 * Generic utility for calculating resolutions, scales, and dimensions
 * for any display with a native resolution.
 *
 * Includes built-in caching for expensive calculations to reduce CPU overhead.
 */

import { PerformanceCache } from '../../src/shared/utils/performance-cache.utils.js';

/**
 * ResolutionCache - Specialized cache for resolution calculations (test-only)
 */
class ResolutionCache extends PerformanceCache {
  constructor() {
    super({ maxSize: 50, defaultTTL: 300000 }); // 5 minute TTL
  }

  /**
   * Cache scaled resolution
   * @param {number} nativeWidth
   * @param {number} nativeHeight
   * @param {number} scale
   * @returns {Object} Cached dimensions
   */
  getScaled(nativeWidth, nativeHeight, scale) {
    const key = PerformanceCache.generateKey('scaled', nativeWidth, nativeHeight, scale);
    return this.getOrCompute(key, () => ({
      width: nativeWidth * scale,
      height: nativeHeight * scale,
      scale
    }));
  }

  /**
   * Cache scale-to-fit calculation
   * @param {number} nativeWidth
   * @param {number} nativeHeight
   * @param {number} containerWidth
   * @param {number} containerHeight
   * @param {Object} options
   * @returns {number} Cached scale
   */
  getScaleToFit(nativeWidth, nativeHeight, containerWidth, containerHeight, options = {}) {
    const key = PerformanceCache.generateKey('scaleToFit',
      nativeWidth, nativeHeight, containerWidth, containerHeight, options);

    return this.getOrCompute(key, () => {
      const { minScale = 1, maxScale = Infinity } = options;
      const scaleX = Math.floor(containerWidth / nativeWidth);
      const scaleY = Math.floor(containerHeight / nativeHeight);
      const scale = Math.min(scaleX, scaleY);
      return Math.max(minScale, Math.min(maxScale, scale));
    });
  }

  /**
   * Cache nearest resolution lookup
   * @param {number} targetWidth
   * @param {number} targetHeight
   * @param {Array} resolutions
   * @param {Object} defaultRes
   * @returns {Object} Nearest resolution
   */
  getNearestResolution(targetWidth, targetHeight, resolutions, defaultRes) {
    if (!resolutions || resolutions.length === 0) {
      return defaultRes;
    }

    const key = PerformanceCache.generateKey('nearest',
      targetWidth, targetHeight, resolutions.length);

    return this.getOrCompute(key, () => {
      let nearest = resolutions[0];
      let minDistance = Infinity;

      for (const resolution of resolutions) {
        // Use squared distance to avoid sqrt (faster)
        const dx = resolution.width - targetWidth;
        const dy = resolution.height - targetHeight;
        const distanceSquared = dx * dx + dy * dy;

        if (distanceSquared < minDistance) {
          minDistance = distanceSquared;
          nearest = resolution;
        }
      }

      return nearest;
    });
  }
}

// Create a global instance for this utility
const globalResolutionCache = new ResolutionCache();

export class ResolutionCalculator {
  #nativeWidth;
  #nativeHeight;
  #aspectRatio;
  #useCache;

  /**
   * Create a ResolutionCalculator for a specific native resolution
   * @param {number} nativeWidth - Native display width
   * @param {number} nativeHeight - Native display height
   * @param {Object} options - Options
   * @param {boolean} options.useCache - Enable caching (default: true)
   */
  constructor(nativeWidth, nativeHeight, options = {}) {
    if (typeof nativeWidth !== 'number' || nativeWidth <= 0) {
      throw new Error('ResolutionCalculator: nativeWidth must be a positive number');
    }
    if (typeof nativeHeight !== 'number' || nativeHeight <= 0) {
      throw new Error('ResolutionCalculator: nativeHeight must be a positive number');
    }

    this.#nativeWidth = nativeWidth;
    this.#nativeHeight = nativeHeight;
    this.#aspectRatio = nativeWidth / nativeHeight;
    this.#useCache = options.useCache !== false;
  }

  /**
   * Get native width
   * @returns {number}
   */
  get nativeWidth() {
    return this.#nativeWidth;
  }

  /**
   * Get native height
   * @returns {number}
   */
  get nativeHeight() {
    return this.#nativeHeight;
  }

  /**
   * Get aspect ratio
   * @returns {number}
   */
  get aspectRatio() {
    return this.#aspectRatio;
  }

  /**
   * Get native resolution
   * @returns {Object} Native resolution {width, height}
   */
  getNativeResolution() {
    return {
      width: this.#nativeWidth,
      height: this.#nativeHeight
    };
  }

  /**
   * Calculate scaled dimensions (cached for performance)
   * @param {number} scale - Scale factor
   * @returns {Object} Scaled dimensions {width, height, scale}
   */
  calculateScaled(scale) {
    if (typeof scale !== 'number' || scale < 1) {
      throw new Error('ResolutionCalculator.calculateScaled: Scale must be a number >= 1');
    }

    // Use cache for repeated calculations
    if (this.#useCache) {
      return globalResolutionCache.getScaled(this.#nativeWidth, this.#nativeHeight, scale);
    }

    return {
      width: this.#nativeWidth * scale,
      height: this.#nativeHeight * scale,
      scale
    };
  }

  /**
   * Calculate scale to fit within container (cached for performance)
   * @param {number} containerWidth - Container width
   * @param {number} containerHeight - Container height
   * @param {Object} options - Options
   * @param {number} options.minScale - Minimum scale (default: 1)
   * @param {number} options.maxScale - Maximum scale (default: Infinity)
   * @returns {number} Scale factor
   */
  calculateScaleToFit(containerWidth, containerHeight, options = {}) {
    if (typeof containerWidth !== 'number' || typeof containerHeight !== 'number') {
      throw new Error('ResolutionCalculator.calculateScaleToFit: Valid dimensions required');
    }

    // Use cache for repeated calculations
    if (this.#useCache) {
      return globalResolutionCache.getScaleToFit(
        this.#nativeWidth, this.#nativeHeight,
        containerWidth, containerHeight, options
      );
    }

    const { minScale = 1, maxScale = Infinity } = options;

    const scaleX = Math.floor(containerWidth / this.#nativeWidth);
    const scaleY = Math.floor(containerHeight / this.#nativeHeight);
    const scale = Math.min(scaleX, scaleY);

    return Math.max(minScale, Math.min(maxScale, scale));
  }

  /**
   * Calculate dimensions to fit within container while maintaining aspect ratio
   * @param {number} containerWidth - Container width
   * @param {number} containerHeight - Container height
   * @param {Object} options - Options for scale calculation
   * @returns {Object} Fitted dimensions {width, height, scale}
   */
  fitToContainer(containerWidth, containerHeight, options = {}) {
    const scale = this.calculateScaleToFit(containerWidth, containerHeight, options);
    return this.calculateScaled(scale);
  }

  /**
   * Get aspect ratio as string label
   * @returns {string} Aspect ratio label (e.g., "16:9", "4:3")
   */
  getAspectRatioLabel() {
    // Find GCD to simplify ratio
    const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
    const divisor = gcd(this.#nativeWidth, this.#nativeHeight);
    return `${this.#nativeWidth / divisor}:${this.#nativeHeight / divisor}`;
  }

  /**
   * Find nearest resolution from a list that matches the target dimensions (cached)
   * Uses squared distance for faster computation (avoids sqrt)
   * @param {number} targetWidth - Target width
   * @param {number} targetHeight - Target height
   * @param {Array} resolutions - Array of resolution objects with width/height
   * @returns {Object} Nearest resolution from the list
   */
  findNearestResolution(targetWidth, targetHeight, resolutions) {
    const defaultRes = this.getNativeResolution();

    if (!resolutions || resolutions.length === 0) {
      return defaultRes;
    }

    // Use cache for repeated lookups
    if (this.#useCache) {
      return globalResolutionCache.getNearestResolution(
        targetWidth, targetHeight, resolutions, defaultRes
      );
    }

    let nearest = resolutions[0];
    let minDistanceSquared = Infinity;

    for (const resolution of resolutions) {
      // Use squared distance to avoid expensive sqrt
      const dx = resolution.width - targetWidth;
      const dy = resolution.height - targetHeight;
      const distanceSquared = dx * dx + dy * dy;

      if (distanceSquared < minDistanceSquared) {
        minDistanceSquared = distanceSquared;
        nearest = resolution;
      }
    }

    return nearest;
  }

  /**
   * Clear the resolution cache (useful for testing or memory management)
   */
  static clearCache() {
    globalResolutionCache.clear();
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  static getCacheStats() {
    return globalResolutionCache.getStats();
  }
}
