/**
 * Animation Performance Orchestrator
 *
 * Coordinates animation suppression based on performance state.
 * Routes computed state from service to BodyClassManager for DOM updates.
 */

import { injectable, inject } from 'inversify';
import { BaseOrchestrator } from '@platform/core';
import { EventChannels, OnEvent } from '@platform/events';
import type { PerformanceStatePayload } from '@platform/events';
import type { EventBusLike, LoggerFactoryLike } from '@platform/core';
import type {
  AnimationPerformanceState,
  PerformanceAnimationService
} from '@renderer/infrastructure/services/performance/performance-animation.service';
import type { BodyClassManager } from '@renderer/presentation/effects/body-class-manager';
import { TOKENS } from '@renderer/application/di/tokens.js';

@injectable()
export class PerformanceAnimationOrchestrator extends BaseOrchestrator {
  constructor(
    @inject(TOKENS.eventBus) eventBus: EventBusLike,
    @inject(TOKENS.animationPerformanceService) private readonly animationPerformanceService: PerformanceAnimationService,
    @inject(TOKENS.bodyClassManager) private readonly bodyClassManager: BodyClassManager,
    @inject(TOKENS.loggerFactory) loggerFactory: LoggerFactoryLike
  ) {
    super({ loggerFactory, eventBus }, 'PerformanceAnimationOrchestrator');
  }

  @OnEvent(EventChannels.PERFORMANCE.STATE_CHANGED)
  _handlePerformanceStateChanged(performanceState: PerformanceStatePayload): void {
    const state = this.animationPerformanceService.setPerformanceState(performanceState);
    this._applyBodyClasses(state);
  }

  _applyBodyClasses(state: AnimationPerformanceState): void {
    this.bodyClassManager.setIdle(Boolean(state.idle));
    this.bodyClassManager.setHidden(Boolean(state.hidden));
    this.bodyClassManager.setAnimationsOff(Boolean(state.animationsOff));
  }

  async onCleanup(): Promise<void> {
    // BodyClassManager owns DOM mutations; nothing to cleanup here.
  }
}
