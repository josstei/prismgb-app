/**
 * Animation Performance Service
 *
 * Computes animation suppression and application state.
 * Does NOT mutate DOM - returns state that BodyClassManager applies.
 */

import { BaseService } from '@shared/base/service.base.js';

class AnimationPerformanceService extends BaseService {
  constructor(dependencies) {
    super(dependencies, ['loggerFactory'], 'AnimationPerformanceService');

    this._animationSuppression = {
      reducedMotion: false,
      weakGPU: false,
      performanceMode: false
    };

    this._isStreaming = false;
    this._hidden = false;
    this._idle = false;
  }

  /**
   * Update streaming state
   * @param {boolean} isStreaming - Whether streaming is active
   * @returns {Object} Current state: { streaming, idle, hidden, animationsOff }
   */
  setStreaming(isStreaming) {
    this._isStreaming = Boolean(isStreaming);
    if (this._isStreaming) {
      this.logger.debug('Streaming started - pausing decorative animations');
    } else {
      this.logger.debug('Streaming stopped - starting idle timer');
    }
    return this._getState();
  }

  /**
   * Update performance state
   * @param {Object} performanceState - Performance state object
   * @returns {Object} Current state: { streaming, idle, hidden, animationsOff }
   */
  setPerformanceState(performanceState) {
    const performanceEnabled = Boolean(performanceState.performanceModeEnabled);
    const weakGpuDetected = Boolean(performanceState.weakGpuDetected);
    const reducedMotion = Boolean(performanceState.reducedMotion);

    this._setAnimationsSuppressed('performanceMode', performanceEnabled);
    this._setAnimationsSuppressed('weakGPU', performanceEnabled && weakGpuDetected);
    this._setAnimationsSuppressed('reducedMotion', reducedMotion);

    this._hidden = Boolean(performanceState.hidden);
    this._idle = Boolean(performanceState.idle);

    if (performanceEnabled) {
      this.logger.info('Performance mode enabled - pausing decorative animations');
    } else {
      this.logger.info('Performance mode disabled - decorative animations allowed unless other suppressions active');
    }

    if (performanceEnabled && weakGpuDetected) {
      this.logger.info('Weak GPU detected - pausing decorative animations to reduce load (performance mode enabled)');
    }

    if (reducedMotion) {
      this.logger.debug('Prefers-reduced-motion detected - pausing decorative animations');
    }

    return this._getState();
  }

  /**
   * Get current computed state
   * @returns {Object} Current state: { streaming, idle, hidden, animationsOff }
   * @private
   */
  _getState() {
    return {
      streaming: this._isStreaming,
      idle: this._idle,
      hidden: this._hidden,
      animationsOff: Object.values(this._animationSuppression).some(Boolean)
    };
  }

  /**
   * Internal method to track animation suppression reasons
   * @private
   */
  _setAnimationsSuppressed(reason, suppressed) {
    this._animationSuppression[reason] = suppressed;
  }
}

export { AnimationPerformanceService };
