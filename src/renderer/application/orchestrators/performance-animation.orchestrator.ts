import { Service } from '@shared/di/decorators.js';
/**
 * Animation Performance Orchestrator
 *
 * Coordinates animation suppression based on performance state.
 * Routes computed state from service to BodyClassManager for DOM updates.
 */

import { BaseOrchestrator } from '@shared/base/orchestrator.base.js';
import { EventChannels } from '@shared/events/event-channels.js';
import type { EventBusLike, LoggerFactoryLike } from '@shared/interfaces/infrastructure.types.js';
import type {
  AnimationPerformanceState,
  PerformanceAnimationService
} from '@renderer/infrastructure/services/performance/performance-animation.service';
import type { BodyClassManager } from '@renderer/presentation/effects/body-class.class';

@Service({
  "token": "animationPerformanceOrchestrator",
  "dependencies": [
    "eventBus",
    "animationPerformanceService",
    "bodyClassManager",
    "loggerFactory"
  ]
})
export class PerformanceAnimationOrchestrator extends BaseOrchestrator {
  private readonly animationPerformanceService: PerformanceAnimationService;
  private readonly bodyClassManager: BodyClassManager;

  constructor(dependencies: {
    eventBus: EventBusLike;
    animationPerformanceService: PerformanceAnimationService;
    bodyClassManager: BodyClassManager;
    loggerFactory: LoggerFactoryLike;
  }) {
    super(
      dependencies,
      ['eventBus', 'animationPerformanceService', 'bodyClassManager', 'loggerFactory'],
      'PerformanceAnimationOrchestrator'
    );
    this.eventBus = dependencies.eventBus;
    this.animationPerformanceService = dependencies.animationPerformanceService;
    this.bodyClassManager = dependencies.bodyClassManager;
  }

  async onInitialize(): Promise<void> {
    this.subscribeWithCleanup({
      [EventChannels.PERFORMANCE.STATE_CHANGED]: (state) => {
        this._handlePerformanceStateChanged(state);
      }
    });
  }

  _handlePerformanceStateChanged(performanceState: unknown): void {
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
