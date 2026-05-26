/**
 * Performance State Service
 *
 * Owns performance state tracking (visibility, idle, motion, capabilities).
 * Emits state updates through provided callbacks.
 */

import { BaseService } from '@shared/base/service.base.js';
import type { StreamingCapabilities } from '@shared/events/event-payloads.js';
import type { LoggerFactoryLike } from '@shared/interfaces/infrastructure.types.js';

export type PerformanceState = {
  performanceModeEnabled: boolean;
  weakGpuDetected: boolean;
  hidden: boolean;
  idle: boolean;
  reducedMotion: boolean;
};

type PerformanceCapabilities = StreamingCapabilities & {
  maxTextureSize?: number;
};

type VisibilityAdapterLike = {
  isHidden: () => boolean;
  onVisibilityChange: (callback: (hidden: boolean) => void) => () => void;
};

type UserActivityAdapterLike = {
  onActivity: (callback: () => void) => () => void;
};

type ReducedMotionAdapterLike = {
  prefersReducedMotion: () => boolean;
  onChange: (callback: (reducedMotion: boolean) => void) => () => void;
};

type PerformanceStateDependencies = {
  loggerFactory: LoggerFactoryLike;
  visibilityAdapter: VisibilityAdapterLike;
  userActivityAdapter: UserActivityAdapterLike;
  reducedMotionAdapter: ReducedMotionAdapterLike;
};

const DEFAULT_STATE: PerformanceState = Object.freeze({
  performanceModeEnabled: false,
  weakGpuDetected: false,
  hidden: false,
  idle: false,
  reducedMotion: false
});

function isPerformanceCapabilities(value: unknown): value is PerformanceCapabilities {
  return typeof value === 'object' && value !== null;
}

interface PerformanceStateInitOptions {
  onStateChange?: (state: PerformanceState) => void;
}

class PerformanceStateService extends BaseService {
  private readonly _visibilityAdapter: VisibilityAdapterLike;
  private readonly _userActivityAdapter: UserActivityAdapterLike;
  private readonly _reducedMotionAdapter: ReducedMotionAdapterLike;

  private readonly _state: PerformanceState;
  private _isStreaming: boolean;
  private _idleTimeoutId: ReturnType<typeof setTimeout> | null;
  private readonly _idleDelayMs: number;
  private _lastIdleReset: number;
  private _onStateChange: ((state: PerformanceState) => void) | null;
  private _visibilityCleanup: (() => void) | null;
  private _activityCleanup: (() => void) | null;
  private _motionCleanup: (() => void) | null;

  constructor(dependencies: PerformanceStateDependencies) {
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

  initialize({ onStateChange }: PerformanceStateInitOptions = {}): void {
    this._onStateChange = onStateChange || null;
    this._setupVisibilityHandling();
    this._setupReducedMotionHandling();
    this._setupIdleHandling();
    this._syncIdleTimer();
    this._emitState();
  }

  dispose(): void {
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

  getState(): PerformanceState {
    return { ...this._state };
  }

  setPerformanceModeEnabled(enabled: boolean): boolean {
    const changed = this._updateState({ performanceModeEnabled: Boolean(enabled) });
    if (changed) {
      this._syncIdleTimer();
    }
    return changed;
  }

  setCapabilities(capabilities: unknown): boolean {
    const weakGpuDetected = this._detectWeakGPU(capabilities);
    return this._updateState({ weakGpuDetected });
  }

  setStreaming(isStreaming: boolean): void {
    this._isStreaming = Boolean(isStreaming);
    if (this._state.idle) {
      this._updateState({ idle: false });
    }
    this._syncIdleTimer();
  }

  _setupVisibilityHandling(): void {
    // Subscribe to visibility changes
    this._visibilityCleanup = this._visibilityAdapter.onVisibilityChange((hidden: boolean) => {
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

  _setupReducedMotionHandling(): void {
    // Subscribe to reduced motion preference changes
    this._motionCleanup = this._reducedMotionAdapter.onChange((reducedMotion: boolean) => {
      this._updateState({ reducedMotion });
    });

    // Initialize with current preference
    const currentlyReducedMotion = this._reducedMotionAdapter.prefersReducedMotion();
    this._updateState({ reducedMotion: currentlyReducedMotion });
  }

  _setupIdleHandling(): void {
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

  _shouldTrackIdle(): boolean {
    return !this._isStreaming && !this._state.hidden && !this._state.performanceModeEnabled;
  }

  _resetIdleTimer(): void {
    this._lastIdleReset = performance.now();
    this._updateState({ idle: false });
    this._syncIdleTimer();
  }

  _syncIdleTimer(): void {
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

  _clearIdleTimer(): void {
    if (this._idleTimeoutId) {
      clearTimeout(this._idleTimeoutId);
      this._idleTimeoutId = null;
    }
  }

  _detectWeakGPU(capabilities: unknown): boolean {
    if (!isPerformanceCapabilities(capabilities)) {
      return false;
    }

    const noAcceleratedPath = !capabilities.webgpu && !capabilities.webgl2;
    const usingCanvasFallback = capabilities.preferredAPI === 'canvas2d';
    const maxTextureSize = typeof capabilities.maxTextureSize === 'number'
      ? capabilities.maxTextureSize
      : 0;
    const lowTextureBudget = maxTextureSize > 0 && maxTextureSize < 2048;

    return noAcceleratedPath || usingCanvasFallback || lowTextureBudget;
  }

  _updateState(partial: Partial<PerformanceState>): boolean {
    let changed = false;

    for (const key of Object.keys(partial) as Array<keyof PerformanceState>) {
      const value = partial[key];
      if (value === undefined) {
        continue;
      }

      if (this._state[key] !== value) {
        this._state[key] = value;
        changed = true;
      }
    }

    if (changed) {
      this._emitState();
    }

    return changed;
  }

  _emitState(): void {
    if (this._onStateChange) {
      this._onStateChange({ ...this._state });
    }
  }
}

export { PerformanceStateService };
