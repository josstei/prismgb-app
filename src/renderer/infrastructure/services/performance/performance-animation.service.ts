/**
 * Animation Performance Service
 *
 * Computes animation suppression and application state.
 * Does NOT mutate DOM - returns state that BodyClassManager applies.
 */

import { BaseService } from '@shared/base/service.base.js';

type AnimationSuppressionReason = 'reducedMotion' | 'weakGPU' | 'performanceMode';

interface PerformanceStatePayload {
  performanceModeEnabled?: boolean;
  weakGpuDetected?: boolean;
  reducedMotion?: boolean;
  hidden?: boolean;
  idle?: boolean;
}

class PerformanceAnimationService extends BaseService {

  constructor(dependencies: Record<string, unknown>) {
    super(dependencies, ['loggerFactory'], 'PerformanceAnimationService');

    this._animationSuppression = {
      reducedMotion: false,
      weakGPU: false,
      performanceMode: false
    };

    this._isHidden = false;
    this._isIdle = false;
  }

  setPerformanceState(performanceState: PerformanceStatePayload) {
    const performanceEnabled = Boolean(performanceState.performanceModeEnabled);
    const weakGpuDetected = Boolean(performanceState.weakGpuDetected);
    const reducedMotion = Boolean(performanceState.reducedMotion);

    this._setAnimationsSuppressed('performanceMode', performanceEnabled);
    this._setAnimationsSuppressed('weakGPU', performanceEnabled && weakGpuDetected);
    this._setAnimationsSuppressed('reducedMotion', reducedMotion);

    this._isHidden = Boolean(performanceState.hidden);
    this._isIdle = Boolean(performanceState.idle);

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

  _getState() {
    return {
      idle: this._isIdle,
      hidden: this._isHidden,
      animationsOff: Object.values(this._animationSuppression).some(Boolean)
    };
  }

  _setAnimationsSuppressed(reason: AnimationSuppressionReason, suppressed: boolean) {
    this._animationSuppression[reason] = suppressed;
  }
}

export { PerformanceAnimationService };
