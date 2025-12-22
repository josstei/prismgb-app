/**
 * Animation Performance Service
 *
 * Owns decorative animation suppression and DOM class updates.
 */

import { BaseService } from '@shared/base/service.js';

const APP_CSS_CLASSES = Object.freeze({
  STREAMING: 'app-streaming',
  IDLE: 'app-idle',
  HIDDEN: 'app-hidden',
  ANIMATIONS_OFF: 'app-animations-off'
});

class AnimationPerformanceService extends BaseService {
  constructor(dependencies) {
    super(dependencies, ['loggerFactory'], 'AnimationPerformanceService');

    this._isStreaming = false;
    this._animationSuppression = {
      reducedMotion: false,
      weakGPU: false,
      performanceMode: false
    };
  }

  updatePerformanceState(state) {
    if (!state) {
      return;
    }

    const performanceEnabled = Boolean(state.performanceModeEnabled);
    const weakGpuDetected = Boolean(state.weakGpuDetected);
    const reducedMotion = Boolean(state.reducedMotion);

    this._setAnimationsSuppressed('performanceMode', performanceEnabled);
    this._setAnimationsSuppressed('weakGPU', performanceEnabled && weakGpuDetected);
    this._setAnimationsSuppressed('reducedMotion', reducedMotion);

    document.body.classList.toggle(APP_CSS_CLASSES.HIDDEN, Boolean(state.hidden));
    document.body.classList.toggle(APP_CSS_CLASSES.IDLE, Boolean(state.idle));

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

  updateStreamingState(isStreaming) {
    this._isStreaming = isStreaming;

    if (isStreaming) {
      document.body.classList.add(APP_CSS_CLASSES.STREAMING);
      document.body.classList.remove(APP_CSS_CLASSES.IDLE);
      this.logger.debug('Streaming started - pausing decorative animations');
    } else {
      document.body.classList.remove(APP_CSS_CLASSES.STREAMING);
      this.logger.debug('Streaming stopped - starting idle timer');
    }
  }

  _setAnimationsSuppressed(reason, suppressed) {
    this._animationSuppression[reason] = suppressed;
    const shouldSuppress = Object.values(this._animationSuppression).some(Boolean);
    document.body.classList.toggle(APP_CSS_CLASSES.ANIMATIONS_OFF, shouldSuppress);
  }
}

export { AnimationPerformanceService };
