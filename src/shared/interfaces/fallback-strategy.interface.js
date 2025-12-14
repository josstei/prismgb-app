/**
 * Interface for device-aware stream acquisition fallback strategies
 * Generates fallback configurations that preserve device targeting
 */
export class IFallbackStrategy {
  /**
   * Initialize the fallback chain for a specific acquisition context
   * Must be called before using getNext() or hasMore()
   * @param {AcquisitionContext} _context - The acquisition context with device identity
   */
  initialize(_context) {
    throw new Error('initialize() must be implemented');
  }

  /**
   * Get the next fallback configuration
   * @returns {Object|null} Fallback config { name, detailLevel, audio, video } or null if exhausted
   */
  getNext() {
    throw new Error('getNext() must be implemented');
  }

  /**
   * Check if fallback chain has more options
   * @returns {boolean} Whether more fallbacks are available
   */
  hasMore() {
    throw new Error('hasMore() must be implemented');
  }

  /**
   * Reset fallback state to beginning
   */
  reset() {
    throw new Error('reset() must be implemented');
  }
}
