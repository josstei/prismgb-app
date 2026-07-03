/**
 * Animation Performance Service
 *
 * Computes animation suppression and application state.
 * Does NOT mutate DOM - returns state that BodyClassManager applies.
 */

import { injectable, inject } from 'inversify';
import { BaseService } from '@platform/core';
import type { PerformanceStatePayload } from '@platform/events';
import type { LoggerFactoryLike } from '@platform/core';
import { TOKENS } from '@renderer/application/di/tokens.js';

type AnimationSuppressionReason = 'reducedMotion' | 'weakGPU' | 'performanceMode';
type AnimationSuppressionState = Record<AnimationSuppressionReason, boolean>;

export interface AnimationPerformanceState {
  idle: boolean;
  hidden: boolean;
  animationsOff: boolean;
}

function isPerformanceStatePayload(value: unknown): value is PerformanceStatePayload {
  return typeof value === 'object' && value !== null;
}

@injectable()
class PerformanceAnimationService extends BaseService {
  private readonly _animationSuppression: AnimationSuppressionState;
  private _isHidden: boolean;
  private _isIdle: boolean;

  constructor(@inject(TOKENS.loggerFactory) loggerFactory: LoggerFactoryLike) {
    super({ loggerFactory }, 'PerformanceAnimationService');

    this._animationSuppression = {
      reducedMotion: false,
      weakGPU: false,
      performanceMode: false
    };

    this._isHidden = false;
    this._isIdle = false;
  }

  setPerformanceState(performanceState: unknown): AnimationPerformanceState {
    const state: PerformanceStatePayload = isPerformanceStatePayload(performanceState)
      ? performanceState
      : {};
    const performanceEnabled = Boolean(state.performanceModeEnabled);
    const weakGpuDetected = Boolean(state.weakGpuDetected);
    const reducedMotion = Boolean(state.reducedMotion);

    this._setAnimationsSuppressed('performanceMode', performanceEnabled);
    this._setAnimationsSuppressed('weakGPU', performanceEnabled && weakGpuDetected);
    this._setAnimationsSuppressed('reducedMotion', reducedMotion);

    this._isHidden = Boolean(state.hidden);
    this._isIdle = Boolean(state.idle);

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

  _getState(): AnimationPerformanceState {
    return {
      idle: this._isIdle,
      hidden: this._isHidden,
      animationsOff: Object.values(this._animationSuppression).some(Boolean)
    };
  }

  _setAnimationsSuppressed(reason: AnimationSuppressionReason, suppressed: boolean): void {
    this._animationSuppression[reason] = suppressed;
  }
}

export { PerformanceAnimationService };
