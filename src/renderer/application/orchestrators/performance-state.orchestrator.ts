/**
 * Performance State Orchestrator
 *
 * Thin coordinator that delegates state tracking to PerformanceStateService
 * and publishes performance state events.
 */

import { BaseOrchestrator } from '@shared/base/orchestrator.base.js';
import { EventChannels } from '@shared/events/event-channels.js';

export class PerformanceStateOrchestrator extends BaseOrchestrator {

  constructor(dependencies: Record<string, unknown>) {
    super(
      dependencies,
      ['eventBus', 'performanceStateService', 'loggerFactory'],
      'PerformanceStateOrchestrator'
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
      onStateChange: (state: { performanceModeEnabled?: boolean; weakGpuDetected?: boolean; [key: string]: unknown }) =>
        this._handleStateChanged(state)
    });
  }

  _handlePerformanceModeChanged(enabled: unknown) {
    const changed = this.performanceStateService.setPerformanceModeEnabled(enabled);
    if (changed) {
      this.eventBus.publish(EventChannels.PERFORMANCE.RENDER_MODE_CHANGED, enabled);
    }
  }

  _handleCapabilitiesChanged(capabilities: unknown) {
    this.performanceStateService.setCapabilities(capabilities);
  }

  _handleStateChanged(state: { performanceModeEnabled?: boolean; weakGpuDetected?: boolean; [key: string]: unknown }) {
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
