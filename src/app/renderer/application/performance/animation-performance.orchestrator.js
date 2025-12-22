/**
 * Animation Performance Orchestrator
 *
 * Owns decorative animation suppression based on user preferences,
 * system settings, and performance state signals.
 */

import { BaseOrchestrator } from '@shared/base/orchestrator.js';
import { EventChannels } from '@infrastructure/events/event-channels.js';

const APP_CSS_CLASSES = Object.freeze({
  STREAMING: 'app-streaming',
  IDLE: 'app-idle',
  HIDDEN: 'app-hidden',
  ANIMATIONS_OFF: 'app-animations-off'
});

export class AnimationPerformanceOrchestrator extends BaseOrchestrator {
  /**
   * @param {Object} dependencies
   * @param {EventBus} dependencies.eventBus
   * @param {Function} dependencies.loggerFactory
   */
  constructor(dependencies) {
    super(
      dependencies,
      ['eventBus', 'loggerFactory'],
      'AnimationPerformanceOrchestrator'
    );

    this._isStreaming = false;
    this._animationSuppression = {
      reducedMotion: false,
      weakGPU: false,
      performanceMode: false
    };
  }

  async onInitialize() {
    this.subscribeWithCleanup({
      [EventChannels.STREAM.STARTED]: () => this._handleStreamingStateChanged(true),
      [EventChannels.STREAM.STOPPED]: () => this._handleStreamingStateChanged(false),
      [EventChannels.PERFORMANCE.STATE_CHANGED]: (state) => this._handlePerformanceStateChanged(state)
    });
  }

  _handlePerformanceStateChanged(state) {
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

  _handleStreamingStateChanged(isStreaming) {
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

  _isAnimationsSuppressed() {
    return Object.values(this._animationSuppression).some(Boolean);
  }

  _setAnimationsSuppressed(reason, suppressed) {
    this._animationSuppression[reason] = suppressed;
    const shouldSuppress = Object.values(this._animationSuppression).some(Boolean);
    document.body.classList.toggle(APP_CSS_CLASSES.ANIMATIONS_OFF, shouldSuppress);
  }

  async onCleanup() {
    // Performance state coordinator owns DOM listeners now.
  }
}
