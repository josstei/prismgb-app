/**
 * Animation Performance Orchestrator
 *
 * Owns decorative animation suppression based on user preferences,
 * system settings, and idle/visibility state.
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

    this._idleTimeoutId = null;
    this._idleDelayMs = 30000;
    this._isStreaming = false;
    this._idleActivityEvents = ['pointermove', 'keydown', 'wheel', 'touchstart'];
    this._lastIdleReset = 0;
    this._animationSuppression = {
      reducedMotion: false,
      weakGPU: false,
      performanceMode: false
    };
    this._motionPreferenceCleanup = null;
  }

  async onInitialize() {
    this.subscribeWithCleanup({
      [EventChannels.STREAM.STARTED]: () => this._handleStreamingStateChanged(true),
      [EventChannels.STREAM.STOPPED]: () => this._handleStreamingStateChanged(false),
      [EventChannels.PERFORMANCE.UI_MODE_CHANGED]: (state) => this._handleUiPerformanceChanged(state)
    });

    this._setupVisibilityHandling();
    this._setupReducedMotionHandling();
    this._setupIdleHandling();
    this._startIdleTimer();
  }

  _handleUiPerformanceChanged(state) {
    const enabled = typeof state === 'boolean' ? state : Boolean(state?.enabled);
    const weakGpuDetected = Boolean(state?.weakGpuDetected);

    this._setAnimationsSuppressed('performanceMode', enabled);
    this._setAnimationsSuppressed('weakGPU', enabled && weakGpuDetected);

    if (enabled) {
      this._clearIdleTimer();
      document.body.classList.remove(APP_CSS_CLASSES.IDLE);
      this.logger.info('Performance mode enabled - pausing decorative animations');
    } else {
      this.logger.info('Performance mode disabled - decorative animations allowed unless other suppressions active');
      if (!this._isAnimationsSuppressed()) {
        this._startIdleTimer();
      }
    }

    if (enabled && weakGpuDetected) {
      this.logger.info('Weak GPU detected - pausing decorative animations to reduce load (performance mode enabled)');
    }
  }

  _setupVisibilityHandling() {
    this._handleVisibilityChange = () => {
      if (document.hidden) {
        document.body.classList.add(APP_CSS_CLASSES.HIDDEN);
        this._clearIdleTimer();
        this.logger.debug('App hidden - pausing decorative animations');
      } else {
        document.body.classList.remove(APP_CSS_CLASSES.HIDDEN);
        this.logger.debug('App visible - resuming decorative animations');
        this._resetIdleTimer();
      }
    };
    document.addEventListener('visibilitychange', this._handleVisibilityChange);
    this._handleVisibilityChange();
  }

  _setupReducedMotionHandling() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = (event) => {
      this._setAnimationsSuppressed('reducedMotion', event.matches);
      if (event.matches) {
        this.logger.debug('Prefers-reduced-motion detected - pausing decorative animations');
      }
    };

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      this._motionPreferenceCleanup = () => mediaQuery.removeEventListener('change', handleChange);
    } else if (typeof mediaQuery.addListener === 'function') {
      // Safari fallback
      mediaQuery.addListener(handleChange);
      this._motionPreferenceCleanup = () => mediaQuery.removeListener(handleChange);
    }

    this._setAnimationsSuppressed('reducedMotion', mediaQuery.matches);
  }

  _setupIdleHandling() {
    this._handleUserActivity = () => {
      if (this._isStreaming || document.hidden) {
        return;
      }

      const now = performance.now();
      if (now - this._lastIdleReset < 1000) {
        return;
      }

      this._resetIdleTimer();
    };

    this._idleActivityEvents.forEach((event) => {
      document.addEventListener(event, this._handleUserActivity, { passive: true });
    });
  }

  _handleStreamingStateChanged(isStreaming) {
    this._isStreaming = isStreaming;

    if (isStreaming) {
      document.body.classList.add(APP_CSS_CLASSES.STREAMING);
      document.body.classList.remove(APP_CSS_CLASSES.IDLE);
      this._clearIdleTimer();
      this.logger.debug('Streaming started - pausing decorative animations');
    } else {
      document.body.classList.remove(APP_CSS_CLASSES.STREAMING);
      this._startIdleTimer();
      this.logger.debug('Streaming stopped - starting idle timer');
    }
  }

  _startIdleTimer() {
    if (this._isStreaming || document.hidden) {
      return;
    }

    if (this._isAnimationsSuppressed()) {
      return;
    }

    this._clearIdleTimer();
    this._lastIdleReset = performance.now();
    this._idleTimeoutId = setTimeout(() => {
      document.body.classList.add(APP_CSS_CLASSES.IDLE);
      this.logger.debug('App idle - pausing decorative animations');
    }, this._idleDelayMs);
  }

  _isAnimationsSuppressed() {
    return Object.values(this._animationSuppression).some(Boolean);
  }

  _resetIdleTimer() {
    this._lastIdleReset = performance.now();
    document.body.classList.remove(APP_CSS_CLASSES.IDLE);
    this._startIdleTimer();
  }

  _clearIdleTimer() {
    if (this._idleTimeoutId) {
      clearTimeout(this._idleTimeoutId);
      this._idleTimeoutId = null;
    }
  }

  _setAnimationsSuppressed(reason, suppressed) {
    this._animationSuppression[reason] = suppressed;
    const shouldSuppress = Object.values(this._animationSuppression).some(Boolean);
    document.body.classList.toggle(APP_CSS_CLASSES.ANIMATIONS_OFF, shouldSuppress);
  }

  async onCleanup() {
    this._clearIdleTimer();
    if (this._handleVisibilityChange) {
      document.removeEventListener('visibilitychange', this._handleVisibilityChange);
    }
    if (this._handleUserActivity) {
      this._idleActivityEvents.forEach((event) => {
        document.removeEventListener(event, this._handleUserActivity, { passive: true });
      });
    }
    if (this._motionPreferenceCleanup) {
      this._motionPreferenceCleanup();
      this._motionPreferenceCleanup = null;
    }
  }
}
