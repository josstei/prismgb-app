/**
 * Performance State Service
 *
 * Owns performance state tracking (visibility, idle, motion, capabilities).
 * Emits state updates through provided callbacks.
 */

import { BaseService } from '@shared/base/service.js';

const DEFAULT_STATE = Object.freeze({
  performanceModeEnabled: false,
  weakGpuDetected: false,
  hidden: false,
  idle: false,
  reducedMotion: false
});

class PerformanceStateService extends BaseService {
  constructor(dependencies) {
    super(dependencies, ['loggerFactory'], 'PerformanceStateService');

    this._state = { ...DEFAULT_STATE };
    this._isStreaming = false;

    this._idleTimeoutId = null;
    this._idleDelayMs = 30000;
    this._idleActivityEvents = ['pointermove', 'keydown', 'wheel', 'touchstart'];
    this._lastIdleReset = 0;
    this._motionPreferenceCleanup = null;
    this._onStateChange = null;
    this._handleVisibilityChange = null;
    this._handleUserActivity = null;
  }

  initialize({ onStateChange } = {}) {
    this._onStateChange = onStateChange;
    this._setupVisibilityHandling();
    this._setupReducedMotionHandling();
    this._setupIdleHandling();
    this._syncIdleTimer();
    this._emitState();
  }

  dispose() {
    this._clearIdleTimer();
    if (this._handleVisibilityChange) {
      document.removeEventListener('visibilitychange', this._handleVisibilityChange);
      this._handleVisibilityChange = null;
    }
    if (this._handleUserActivity) {
      this._idleActivityEvents.forEach((event) => {
        document.removeEventListener(event, this._handleUserActivity, { passive: true });
      });
      this._handleUserActivity = null;
    }
    if (this._motionPreferenceCleanup) {
      this._motionPreferenceCleanup();
      this._motionPreferenceCleanup = null;
    }
  }

  getState() {
    return { ...this._state };
  }

  setPerformanceModeEnabled(enabled) {
    const changed = this._updateState({ performanceModeEnabled: enabled });
    if (changed) {
      this._syncIdleTimer();
    }
    return changed;
  }

  setCapabilities(capabilities) {
    const weakGpuDetected = this._detectWeakGPU(capabilities);
    return this._updateState({ weakGpuDetected });
  }

  setStreaming(isStreaming) {
    this._isStreaming = isStreaming;
    if (this._state.idle) {
      this._updateState({ idle: false });
    }
    this._syncIdleTimer();
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
    if (this._onStateChange) {
      this._onStateChange({ ...this._state });
    }
  }
}

export { PerformanceStateService };
