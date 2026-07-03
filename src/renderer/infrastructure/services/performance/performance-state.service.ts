/**
 * Performance State Service
 *
 * Owns performance state tracking (visibility, idle, motion, capabilities).
 * Emits state updates through provided callbacks.
 */

import { injectable, inject } from 'inversify';
import { BaseService } from '@platform/core';
import type { LoggerFactoryLike } from '@platform/core';
import { TOKENS } from '@renderer/application/di/tokens.js';

export type PerformanceState = {
  performanceModeEnabled: boolean;
  weakGpuDetected: boolean;
  hidden: boolean;
  idle: boolean;
  reducedMotion: boolean;
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

const IDLE_TIMER_LIFECYCLE = Symbol('performanceStateIdleTimer');
const VISIBILITY_LIFECYCLE = Symbol('performanceStateVisibility');
const ACTIVITY_LIFECYCLE = Symbol('performanceStateActivity');
const MOTION_LIFECYCLE = Symbol('performanceStateMotion');

const DEFAULT_STATE: PerformanceState = Object.freeze({
  performanceModeEnabled: false,
  weakGpuDetected: false,
  hidden: false,
  idle: false,
  reducedMotion: false
});

interface PerformanceStateInitOptions {
  onStateChange?: (state: PerformanceState) => void;
}

@injectable()
class PerformanceStateService extends BaseService {
  private readonly _state: PerformanceState;
  private _isStreaming: boolean;
  private readonly _idleDelayMs: number;
  private _lastIdleReset: number;
  private _onStateChange: ((state: PerformanceState) => void) | null;

  constructor(
    @inject(TOKENS.loggerFactory) loggerFactory: LoggerFactoryLike,
    @inject(TOKENS.visibilityAdapter) private readonly _visibilityAdapter: VisibilityAdapterLike,
    @inject(TOKENS.userActivityAdapter) private readonly _userActivityAdapter: UserActivityAdapterLike,
    @inject(TOKENS.reducedMotionAdapter) private readonly _reducedMotionAdapter: ReducedMotionAdapterLike
  ) {
    super({ loggerFactory }, 'PerformanceStateService');

    this._state = { ...DEFAULT_STATE };
    this._isStreaming = false;

    this._idleDelayMs = 30000;
    this._lastIdleReset = 0;
    this._onStateChange = null;
  }

  initialize({ onStateChange }: PerformanceStateInitOptions = {}): void {
    this._onStateChange = onStateChange || null;
    this._setupVisibilityHandling();
    this._setupReducedMotionHandling();
    this._setupIdleHandling();
    this._syncIdleTimer();
    this._emitState();
  }

  override dispose(): void | Promise<void> {
    this._onStateChange = null;
    return super.dispose();
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

  setStreaming(isStreaming: boolean): void {
    this._isStreaming = Boolean(isStreaming);
    if (this._state.idle) {
      this._updateState({ idle: false });
    }
    this._syncIdleTimer();
  }

  _setupVisibilityHandling(): void {
    // Subscribe to visibility changes
    this.disposables.cancel(VISIBILITY_LIFECYCLE);
    this.disposables.replace(VISIBILITY_LIFECYCLE, this._visibilityAdapter.onVisibilityChange((hidden: boolean) => {
      const changed = this._updateState({ hidden });
      if (hidden) {
        this._updateState({ idle: false });
      }
      if (changed) {
        this._syncIdleTimer();
      }
    }));

    // Initialize with current visibility state
    const currentlyHidden = this._visibilityAdapter.isHidden();
    this._updateState({ hidden: currentlyHidden });
  }

  _setupReducedMotionHandling(): void {
    // Subscribe to reduced motion preference changes
    this.disposables.cancel(MOTION_LIFECYCLE);
    this.disposables.replace(MOTION_LIFECYCLE, this._reducedMotionAdapter.onChange((reducedMotion: boolean) => {
      this._updateState({ reducedMotion });
    }));

    // Initialize with current preference
    const currentlyReducedMotion = this._reducedMotionAdapter.prefersReducedMotion();
    this._updateState({ reducedMotion: currentlyReducedMotion });
  }

  _setupIdleHandling(): void {
    // Subscribe to user activity events
    this.disposables.cancel(ACTIVITY_LIFECYCLE);
    this.disposables.replace(ACTIVITY_LIFECYCLE, this._userActivityAdapter.onActivity(() => {
      if (!this._shouldTrackIdle()) {
        return;
      }

      const now = performance.now();
      if (now - this._lastIdleReset < 1000) {
        return;
      }

      this._resetIdleTimer();
    }));
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
    this.schedule(IDLE_TIMER_LIFECYCLE, () => {
      this._updateState({ idle: true });
    }, this._idleDelayMs);
  }

  _clearIdleTimer(): void {
    this.cancelScheduled(IDLE_TIMER_LIFECYCLE);
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
