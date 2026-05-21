/**
 * Animation Performance Orchestrator
 *
 * Coordinates animation suppression based on performance state.
 * Routes computed state from service to BodyClassManager for DOM updates.
 */

import { BaseOrchestrator } from '@shared/base/orchestrator.base.js';
import { EventChannels } from '@shared/events/event-channels.js';

export class PerformanceAnimationOrchestrator extends BaseOrchestrator {

  /**
   * @param {Object} dependencies
   * @param {EventBus} dependencies.eventBus
   * @param {PerformanceAnimationService} dependencies.animationPerformanceService
   * @param {BodyClassManager} dependencies.bodyClassManager
   * @param {Function} dependencies.loggerFactory
   */
  constructor(dependencies) {
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

  _handlePerformanceStateChanged(performanceState) {
    const state = this.animationPerformanceService.setPerformanceState(performanceState);
    this._applyBodyClasses(state);
  }

  _applyBodyClasses(state) {
    this.bodyClassManager.setIdle(state.idle);
    this.bodyClassManager.setHidden(state.hidden);
    this.bodyClassManager.setAnimationsOff(state.animationsOff);
  }

  async onCleanup() {
    // BodyClassManager owns DOM mutations; nothing to cleanup here.
  }
}
