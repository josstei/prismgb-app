/**
 * Animation Performance Orchestrator
 *
 * Coordinates animation suppression based on performance state.
 * Routes computed state from service to BodyClassManager for DOM updates.
 */

import { BaseOrchestrator } from '@shared/base/orchestrator.base.js';
import { EventChannels } from '@shared/events/event-channels.js';

export class PerformanceAnimationOrchestrator extends BaseOrchestrator {

  constructor(dependencies: Record<string, unknown>) {
    super(
      dependencies,
      ['eventBus', 'animationPerformanceService', 'bodyClassManager', 'loggerFactory'],
      'PerformanceAnimationOrchestrator'
    );
  }

  async onInitialize() {
    this.subscribeWithCleanup({
      [EventChannels.PERFORMANCE.STATE_CHANGED]: (state) => this._handlePerformanceStateChanged(state)
    });
  }

  _handlePerformanceStateChanged(performanceState: unknown) {
    const state = this.animationPerformanceService.setPerformanceState(performanceState);
    this._applyBodyClasses(state);
  }

  _applyBodyClasses(state: { idle?: boolean; hidden?: boolean; animationsOff?: boolean }) {
    this.bodyClassManager.setIdle(Boolean(state.idle));
    this.bodyClassManager.setHidden(Boolean(state.hidden));
    this.bodyClassManager.setAnimationsOff(Boolean(state.animationsOff));
  }

  async onCleanup() {
    // BodyClassManager owns DOM mutations; nothing to cleanup here.
  }
}
