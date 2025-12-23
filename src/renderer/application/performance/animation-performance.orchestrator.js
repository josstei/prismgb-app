/**
 * Animation Performance Orchestrator
 *
 * Coordinates animation suppression based on performance state.
 * Routes computed state from service to BodyClassManager for DOM updates.
 */

import { BaseOrchestrator } from '@shared/base/orchestrator.js';
import { EventChannels } from '@infrastructure/events/event-channels.js';

export class AnimationPerformanceOrchestrator extends BaseOrchestrator {
  /**
   * @param {Object} dependencies
   * @param {EventBus} dependencies.eventBus
   * @param {AnimationPerformanceService} dependencies.animationPerformanceService
   * @param {BodyClassManager} dependencies.bodyClassManager
   * @param {Function} dependencies.loggerFactory
   */
  constructor(dependencies) {
    super(
      dependencies,
      ['eventBus', 'animationPerformanceService', 'bodyClassManager', 'loggerFactory'],
      'AnimationPerformanceOrchestrator'
    );
  }

  async onInitialize() {
    this.subscribeWithCleanup({
      [EventChannels.STREAM.STARTED]: () => this._handleStreamingStateChanged(true),
      [EventChannels.STREAM.STOPPED]: () => this._handleStreamingStateChanged(false),
      [EventChannels.PERFORMANCE.STATE_CHANGED]: (state) => this._handlePerformanceStateChanged(state)
    });
  }

  _handlePerformanceStateChanged(performanceState) {
    const state = this.animationPerformanceService.setState({ performanceState });
    this._applyBodyClasses(state);
  }

  _handleStreamingStateChanged(isStreaming) {
    const state = this.animationPerformanceService.setState({ streaming: isStreaming });
    this._applyBodyClasses(state);
  }

  _applyBodyClasses(state) {
    this.bodyClassManager.setStreaming(state.streaming);
    this.bodyClassManager.setIdle(state.idle);
    this.bodyClassManager.setHidden(state.hidden);
    this.bodyClassManager.setAnimationsOff(state.animationsOff);
  }

  async onCleanup() {
    // BodyClassManager owns DOM mutations; nothing to cleanup here.
  }
}
