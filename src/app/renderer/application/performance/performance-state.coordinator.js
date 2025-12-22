/**
 * Performance State Coordinator
 *
 * Thin coordinator that delegates state tracking to PerformanceStateService
 * and publishes performance state events.
 */

import { BaseOrchestrator } from '@shared/base/orchestrator.js';
import { EventChannels } from '@infrastructure/events/event-channels.js';

export class PerformanceStateCoordinator extends BaseOrchestrator {
  /**
   * @param {Object} dependencies
   * @param {EventBus} dependencies.eventBus
   * @param {Function} dependencies.loggerFactory
   */
  constructor(dependencies) {
    super(
      dependencies,
      ['eventBus', 'performanceStateService', 'loggerFactory'],
      'PerformanceStateCoordinator'
    );
    this._lastUiMode = null;
  }

  async onInitialize() {
    this.subscribeWithCleanup({
      [EventChannels.SETTINGS.PERFORMANCE_MODE_CHANGED]: (enabled) => {
        this._handlePerformanceModeChanged(Boolean(enabled));
      },
      [EventChannels.RENDER.CAPABILITY_DETECTED]: (capabilities) => {
        this._handleCapabilitiesChanged(capabilities);
      },
      [EventChannels.STREAM.STARTED]: () => {
        this.performanceStateService.setStreaming(true);
      },
      [EventChannels.STREAM.STOPPED]: () => {
        this.performanceStateService.setStreaming(false);
      }
    });

    this.performanceStateService.initialize({
      onStateChange: (state) => this._handleStateChanged(state)
    });
  }

  _handlePerformanceModeChanged(enabled) {
    const changed = this.performanceStateService.setPerformanceModeEnabled(enabled);
    if (changed) {
      this.eventBus.publish(EventChannels.PERFORMANCE.RENDER_MODE_CHANGED, enabled);
    }
  }

  _handleCapabilitiesChanged(capabilities) {
    this.performanceStateService.setCapabilities(capabilities);
  }

  _handleStateChanged(state) {
    this.eventBus.publish(EventChannels.PERFORMANCE.STATE_CHANGED, { ...state });

    const uiMode = {
      enabled: Boolean(state.performanceModeEnabled),
      weakGpuDetected: Boolean(state.weakGpuDetected)
    };

    if (!this._lastUiMode || this._lastUiMode.enabled !== uiMode.enabled || this._lastUiMode.weakGpuDetected !== uiMode.weakGpuDetected) {
      this.eventBus.publish(EventChannels.PERFORMANCE.UI_MODE_CHANGED, uiMode);
      this._lastUiMode = uiMode;
    }
  }

  async onCleanup() {
    this.performanceStateService.dispose();
  }
}
