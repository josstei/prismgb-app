/**
 * Performance State Coordinator
 *
 * Centralizes performance-related state (mode, visibility, idle, motion)
 * and emits a unified state event for consumers.
 */

import { BaseOrchestrator } from '@shared/base/orchestrator.js';
import { EventChannels } from '@infrastructure/events/event-channels.js';

const DEFAULT_STATE = Object.freeze({
  performanceModeEnabled: false,
  weakGpuDetected: false,
  hidden: false,
  idle: false,
  reducedMotion: false
});

export class PerformanceStateCoordinator extends BaseOrchestrator {
  /**
   * @param {Object} dependencies
   * @param {EventBus} dependencies.eventBus
   * @param {Function} dependencies.loggerFactory
   */
  constructor(dependencies) {
    super(
      dependencies,
      ['eventBus', 'loggerFactory'],
      'PerformanceStateCoordinator'
    );

    this._state = { ...DEFAULT_STATE };
    this._isStreaming = false;

    this._idleTimeoutId = null;
    this._idleDelayMs = 30000;
    this._idleActivityEvents = ['pointermove', 'keydown', 'wheel', 'touchstart'];
    this._lastIdleReset = 0;
    this._motionPreferenceCleanup = null;
  }

  async onInitialize() {
    this.subscribeWithCleanup({
      [EventChannels.SETTINGS.PERFORMANCE_MODE_CHANGED]: (enabled) => {
        this._handlePerformanceModeChanged(Boolean(enabled));
      },
      [EventChannels.RENDER.CAPABILITY_DETECTED]: (capabilities) => {
        this._handleCapabilitiesChanged(capabilities);
      },
      [EventChannels.STREAM.STARTED]: () => {
        this._isStreaming = true;
        this._handleStreamingStateChange();
      },
      [EventChannels.STREAM.STOPPED]: () => {
        this._isStreaming = false;
        this._handleStreamingStateChange();
      }
    });

    this._setupVisibilityHandling();
    this._setupReducedMotionHandling();
    this._setupIdleHandling();
    this._syncIdleTimer();
    this._emitState();
  }

  _handlePerformanceModeChanged(enabled) {
    const changed = this._updateState({ performanceModeEnabled: enabled });
    if (!changed) {
      return;
    }

    this.eventBus.publish(EventChannels.PERFORMANCE.RENDER_MODE_CHANGED, enabled);
    this._emitUiModeChanged();
    this._syncIdleTimer();
  }

  _handleCapabilitiesChanged(capabilities) {
    const weakGpuDetected = this._detectWeakGPU(capabilities);
    if (!this._updateState({ weakGpuDetected })) {
      return;
    }

    this._emitUiModeChanged();
  }

  _handleStreamingStateChange() {
    if (this._state.idle) {
      this._updateState({ idle: false });
    }
    this._syncIdleTimer();
  }

  _emitUiModeChanged() {
    this.eventBus.publish(EventChannels.PERFORMANCE.UI_MODE_CHANGED, {
      enabled: this._state.performanceModeEnabled,
      weakGpuDetected: this._state.weakGpuDetected
    });
  }

  _setupVisibilityHandling() {
    this._handleVisibilityChange = () => {
      const hidden = Boolean(document.hidden);
      const changed = this._updateState({ hidden });
      if (hidden) {
        this._updateState({ idle: false });
      }
      if (changed) {
        this._syncIdleTimer();
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
      this._updateState({ reducedMotion: Boolean(event.matches) });
    };

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      this._motionPreferenceCleanup = () => mediaQuery.removeEventListener('change', handleChange);
    } else if (typeof mediaQuery.addListener === 'function') {
      // Safari fallback
      mediaQuery.addListener(handleChange);
      this._motionPreferenceCleanup = () => mediaQuery.removeListener(handleChange);
    }

    this._updateState({ reducedMotion: Boolean(mediaQuery.matches) });
  }

  _setupIdleHandling() {
    this._handleUserActivity = () => {
      if (!this._shouldTrackIdle()) {
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

  _shouldTrackIdle() {
    return !this._isStreaming && !this._state.hidden && !this._state.performanceModeEnabled;
  }

  _resetIdleTimer() {
    this._lastIdleReset = performance.now();
    this._updateState({ idle: false });
    this._syncIdleTimer();
  }

  _syncIdleTimer() {
    if (!this._shouldTrackIdle()) {
      this._clearIdleTimer();
      return;
    }

    if (this._state.idle) {
      return;
    }

    this._clearIdleTimer();
    this._lastIdleReset = performance.now();
    this._idleTimeoutId = setTimeout(() => {
      this._updateState({ idle: true });
    }, this._idleDelayMs);
  }

  _clearIdleTimer() {
    if (this._idleTimeoutId) {
      clearTimeout(this._idleTimeoutId);
      this._idleTimeoutId = null;
    }
  }

  _detectWeakGPU(capabilities) {
    if (!capabilities) {
      return false;
    }

    const noAcceleratedPath = !capabilities.webgpu && !capabilities.webgl2;
    const usingCanvasFallback = capabilities.preferredAPI === 'canvas2d';
    const lowTextureBudget = capabilities.maxTextureSize > 0 && capabilities.maxTextureSize < 2048;

    return noAcceleratedPath || usingCanvasFallback || lowTextureBudget;
  }

  _updateState(partial) {
    let changed = false;

    Object.entries(partial).forEach(([key, value]) => {
      if (this._state[key] !== value) {
        this._state[key] = value;
        changed = true;
      }
    });

    if (changed) {
      this._emitState();
    }

    return changed;
  }

  _emitState() {
    this.eventBus.publish(EventChannels.PERFORMANCE.STATE_CHANGED, { ...this._state });
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
