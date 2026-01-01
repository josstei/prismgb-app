/**
 * Performance State Service
 *
 * Owns performance state tracking (visibility, idle, motion, capabilities).
 * Emits state updates through provided callbacks.
 */

import { BaseService } from '@shared/base/service.base.js';

const DEFAULT_STATE = Object.freeze({
  performanceModeEnabled: false,
  weakGpuDetected: false,
  hidden: false,
  idle: false,
  reducedMotion: false
});

class PerformanceStateService extends BaseService {
  constructor(dependencies) {
    super(dependencies, ['loggerFactory', 'visibilityAdapter', 'userActivityAdapter', 'reducedMotionAdapter'], 'PerformanceStateService');

    this._visibilityAdapter = dependencies.visibilityAdapter;
    this._userActivityAdapter = dependencies.userActivityAdapter;
    this._reducedMotionAdapter = dependencies.reducedMotionAdapter;

    this._state = { ...DEFAULT_STATE };
    this._isStreaming = false;

    this._idleTimeoutId = null;
    this._idleDelayMs = 30000;
    this._lastIdleReset = 0;
    this._onStateChange = null;
    this._visibilityCleanup = null;
    this._activityCleanup = null;
    this._motionCleanup = null;
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
    if (this._visibilityCleanup) {
      this._visibilityCleanup();
      this._visibilityCleanup = null;
    }
    if (this._activityCleanup) {
      this._activityCleanup();
      this._activityCleanup = null;
    }
    if (this._motionCleanup) {
      this._motionCleanup();
      this._motionCleanup = null;
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
    // Subscribe to visibility changes
    this._visibilityCleanup = this._visibilityAdapter.onVisibilityChange((hidden) => {
      const changed = this._updateState({ hidden });
      if (hidden) {
        this._updateState({ idle: false });
      }
      if (changed) {
        this._syncIdleTimer();
      }
    });

    // Initialize with current visibility state
    const currentlyHidden = this._visibilityAdapter.isHidden();
    this._updateState({ hidden: currentlyHidden });
  }

  _setupReducedMotionHandling() {
    // Subscribe to reduced motion preference changes
    this._motionCleanup = this._reducedMotionAdapter.onChange((reducedMotion) => {
      this._updateState({ reducedMotion });
    });

    // Initialize with current preference
    const currentlyReducedMotion = this._reducedMotionAdapter.prefersReducedMotion();
    this._updateState({ reducedMotion: currentlyReducedMotion });
  }

  _setupIdleHandling() {
    // Subscribe to user activity events
    this._activityCleanup = this._userActivityAdapter.onActivity(() => {
      if (!this._shouldTrackIdle()) {
        return;
      }

      const now = performance.now();
      if (now - this._lastIdleReset < 1000) {
        return;
      }

      this._resetIdleTimer();
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
