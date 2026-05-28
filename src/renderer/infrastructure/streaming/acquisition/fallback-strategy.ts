export interface FallbackConfig {
  name: string;
  detailLevel: string;
  audio: boolean;
  video: boolean;
  description?: string;
}

export class IFallbackStrategy {
  initialize(_context: unknown): void {
    throw new Error('initialize() must be implemented');
  }

  getNext(): FallbackConfig | null {
    throw new Error('getNext() must be implemented');
  }

  hasMore(): boolean {
    throw new Error('hasMore() must be implemented');
  }

  reset(): void {
    throw new Error('reset() must be implemented');
  }
}
import type { AcquisitionContextLike } from './acquisition.types';

/**
 * DeviceAwareFallbackStrategy
 *
 * Generates device-aware fallback configurations that preserve device context.
 * Each fallback is a declarative configuration (detailLevel, audio, video flags)
 * that the ConstraintBuilder uses to build actual constraints.
 *
 * This ensures device targeting is never lost during fallback operations.
 *
 * Fallback chain:
 * 1. simple - Simplified constraints, both audio and video
 * 2. minimal - Minimal constraints (device only), both audio and video
 * 3. video-only-simple - Video only with simplified constraints
 * 4. video-only-minimal - Video only with minimal constraints (last resort)
 */
export class DeviceAwareFallbackStrategy extends IFallbackStrategy {
  includeAudioFallbacks: boolean;
  currentIndex: number;
  chain: FallbackConfig[] | null;
  context: AcquisitionContextLike | null;

  constructor(options: { includeAudioFallbacks?: boolean } = {}) {
    super();
    this.includeAudioFallbacks = options.includeAudioFallbacks !== false;
    this.currentIndex = -1;
    this.chain = null;
    this.context = null;
  }

  /**
   * Initialize the fallback chain for a specific acquisition context
   * Must be called before using getNext() or hasMore()
   * @param {AcquisitionContext} context - The acquisition context
   */
  initialize(context: AcquisitionContextLike) {
    this.context = context;
    this.currentIndex = -1;
    this.chain = this._buildChain(context);
  }

  /**
   * Build the fallback chain based on context
   * @private
   */
  _buildChain(context: AcquisitionContextLike) {
    const chain = [];

    const hasAudio = context.hasAudioProfile();
    const hasVideo = context.hasVideoProfile();

    // Fallback 1: Simple constraints (reduced quality, same device)
    if (hasAudio && hasVideo) {
      chain.push({
        name: 'simple',
        detailLevel: 'simple',
        audio: true,
        video: true,
        description: 'Simplified constraints with device targeting preserved'
      });
    }

    // Fallback 2: Minimal constraints (device only, no quality settings)
    if (hasAudio && hasVideo) {
      chain.push({
        name: 'minimal',
        detailLevel: 'minimal',
        audio: true,
        video: true,
        description: 'Minimal constraints - device targeting only'
      });
    }

    // Fallback 3: Video only with simple constraints
    if (hasVideo) {
      chain.push({
        name: 'video-only-simple',
        detailLevel: 'simple',
        audio: false,
        video: true,
        description: 'Video only with simplified constraints'
      });
    }

    // Fallback 4: Video only minimal (last resort)
    if (hasVideo) {
      chain.push({
        name: 'video-only-minimal',
        detailLevel: 'minimal',
        audio: false,
        video: true,
        description: 'Video only with minimal constraints'
      });
    }

    return chain;
  }

  /**
   * Get next fallback configuration
   * @returns {Object|null} Fallback configuration or null if exhausted
   */
  getNext() {
    if (!this.chain) {
      throw new Error('DeviceAwareFallbackStrategy must be initialized with a context');
    }

    this.currentIndex++;

    if (this.currentIndex >= this.chain.length) {
      return null;
    }

    return this.chain[this.currentIndex];
  }

  /**
   * Check if more fallbacks are available
   * @returns {boolean}
   */
  hasMore() {
    if (!this.chain) {
      return false;
    }
    return this.currentIndex < this.chain.length - 1;
  }

  /**
   * Reset fallback state to beginning
   */
  reset() {
    this.currentIndex = -1;
  }

  /**
   * Get remaining fallback count (for logging/debugging)
   * @returns {number}
   */
  getRemainingCount() {
    if (!this.chain) return 0;
    return Math.max(0, this.chain.length - this.currentIndex - 1);
  }

  /**
   * Get the current context
   * @returns {AcquisitionContext|null}
   */
  getContext(): AcquisitionContextLike | null {
    return this.context;
  }
}
