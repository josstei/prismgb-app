import { Service } from '@prismgb/core';
/**
 * Performance State Orchestrator
 *
 * Thin coordinator that delegates state tracking to PerformanceStateService
 * and publishes performance state events.
 */

import { BaseOrchestrator } from '@prismgb/core';
import { EventChannels } from '@prismgb/events';
import type { PerformanceUiModePayload } from '@prismgb/events';
import type { EventBusLike, LoggerFactoryLike } from '@prismgb/core';
import type {
  PerformanceState,
  PerformanceStateService
} from '@renderer/infrastructure/services/performance-state.service';

@Service({
  "token": "performanceStateOrchestrator",
  "dependencies": [
    "eventBus",
    "performanceStateService",
    "loggerFactory"
  ]
})
export class PerformanceStateOrchestrator extends BaseOrchestrator {
  private readonly performanceStateService: PerformanceStateService;
  private _lastUiMode: PerformanceUiModePayload | null;

  constructor(dependencies: {
    eventBus: EventBusLike;
    performanceStateService: PerformanceStateService;
    loggerFactory: LoggerFactoryLike;
  }) {
    super(
      dependencies,
      'PerformanceStateOrchestrator'
    );
    this.eventBus = dependencies.eventBus;
    this.performanceStateService = dependencies.performanceStateService;
    this._lastUiMode = null;
  }

  async onInitialize(): Promise<void> {
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

  _handlePerformanceModeChanged(enabled: boolean): void {
    const changed = this.performanceStateService.setPerformanceModeEnabled(enabled);
    if (changed) {
      this.eventBus.publish(EventChannels.PERFORMANCE.RENDER_MODE_CHANGED, enabled);
    }
  }

  _handleCapabilitiesChanged(capabilities: unknown): void {
    this.performanceStateService.setCapabilities(capabilities);
  }

  _handleStateChanged(state: PerformanceState): void {
    this.eventBus.publish(EventChannels.PERFORMANCE.STATE_CHANGED, { ...state });

    const uiMode: PerformanceUiModePayload = {
      enabled: Boolean(state.performanceModeEnabled),
      weakGpuDetected: Boolean(state.weakGpuDetected)
    };

    if (!this._lastUiMode || this._lastUiMode.enabled !== uiMode.enabled || this._lastUiMode.weakGpuDetected !== uiMode.weakGpuDetected) {
      this.eventBus.publish(EventChannels.PERFORMANCE.UI_MODE_CHANGED, uiMode);
      this._lastUiMode = uiMode;
    }
  }

  override async onCleanup(): Promise<void> {
    this.performanceStateService.dispose();
  }

}
