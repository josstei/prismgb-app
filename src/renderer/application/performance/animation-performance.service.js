/**
 * Animation Performance Service
 *
 * Computes animation suppression and application state.
 * Does NOT mutate DOM - returns state that BodyClassManager applies.
 */

import { BaseService } from '@shared/base/service.js';

class AnimationPerformanceService extends BaseService {
  constructor(dependencies) {
    super(dependencies, ['loggerFactory'], 'AnimationPerformanceService');

    this._animationSuppression = {
      reducedMotion: false,
      weakGPU: false,
      performanceMode: false
    };
  }

  /**
   * Update state based on streaming and performance state
   * @param {Object} params
   * @param {boolean} [params.streaming] - Whether streaming is active
   * @param {Object} [params.performanceState] - Performance state object
   * @returns {Object} State to apply to body classes: { streaming, idle, hidden, animationsOff }
   */
  setState({ streaming, performanceState }) {
    const result = {
      streaming: false,
      idle: false,
      hidden: false,
      animationsOff: false
    };

    // Handle streaming state
    if (streaming !== undefined) {
      result.streaming = Boolean(streaming);
      if (result.streaming) {
        this.logger.debug('Streaming started - pausing decorative animations');
      } else {
        this.logger.debug('Streaming stopped - starting idle timer');
      }
    }

    // Handle performance state
    if (performanceState) {
      const performanceEnabled = Boolean(performanceState.performanceModeEnabled);
      const weakGpuDetected = Boolean(performanceState.weakGpuDetected);
      const reducedMotion = Boolean(performanceState.reducedMotion);

      this._setAnimationsSuppressed('performanceMode', performanceEnabled);
      this._setAnimationsSuppressed('weakGPU', performanceEnabled && weakGpuDetected);
      this._setAnimationsSuppressed('reducedMotion', reducedMotion);

      result.hidden = Boolean(performanceState.hidden);
      result.idle = Boolean(performanceState.idle);
      result.animationsOff = Object.values(this._animationSuppression).some(Boolean);

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
    }

    return result;
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
