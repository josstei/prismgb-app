/**
 * Animation Performance Orchestrator
 *
 * Thin coordinator for animation suppression based on performance state.
 */

import { BaseOrchestrator } from '@shared/base/orchestrator.js';
import { EventChannels } from '@infrastructure/events/event-channels.js';

export class AnimationPerformanceOrchestrator extends BaseOrchestrator {
  /**
   * @param {Object} dependencies
   * @param {EventBus} dependencies.eventBus
   * @param {Function} dependencies.loggerFactory
   */
  constructor(dependencies) {
    super(
      dependencies,
      ['eventBus', 'animationPerformanceService', 'loggerFactory'],
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

  _handlePerformanceStateChanged(state) {
    this.animationPerformanceService.updatePerformanceState(state);
  }

  _handleStreamingStateChanged(isStreaming) {
    this.animationPerformanceService.updateStreamingState(isStreaming);
  }

  async onCleanup() {
    // AnimationPerformanceService owns DOM mutations; nothing to cleanup here.
  }
}
