/**
 * Interface for device-aware stream acquisition fallback strategies
 * Generates fallback configurations that preserve device targeting
 */

export interface FallbackConfig {
  name: string;
  detailLevel: string;
  audio: boolean;
  video: boolean;
  description?: string;
}

export class IFallbackStrategy {
  /**
   * Initialize the fallback chain for a specific acquisition context
   * Must be called before using getNext() or hasMore()
   * @param {unknown} _context - The acquisition context with device identity
   */
  initialize(_context: unknown): void {
    throw new Error('initialize() must be implemented');
  }

  /**
   * Get the next fallback configuration
   * @returns {FallbackConfig|null} Fallback config { name, detailLevel, audio, video } or null if exhausted
   */
  getNext(): FallbackConfig | null {
    throw new Error('getNext() must be implemented');
  }

  /**
   * Check if fallback chain has more options
   * @returns {boolean} Whether more fallbacks are available
   */
  hasMore(): boolean {
    throw new Error('hasMore() must be implemented');
  }

  /**
   * Reset fallback state to beginning
   */
  reset(): void {
    throw new Error('reset() must be implemented');
  }
}
