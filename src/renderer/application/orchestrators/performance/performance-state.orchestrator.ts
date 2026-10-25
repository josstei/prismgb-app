/**
 * Performance State Orchestrator
 *
 * Thin coordinator that delegates state tracking to PerformanceStateService
 * and publishes performance state events.
 */

import { BaseOrchestrator } from '@platform/core';
import { EventChannels, OnEvent } from '@platform/events';
import type { PerformanceUiModePayload, TypedEventBusLike } from '@platform/events';
import type { LoggerFactoryLike } from '@platform/core';
import type {
  PerformanceState,
  PerformanceStateService
} from '@renderer/infrastructure/services/performance/performance-state.service';

type PerformanceStateOrchestratorDependencies = {
  eventBus: TypedEventBusLike;
  performanceStateService: PerformanceStateService;
  loggerFactory: LoggerFactoryLike;
};

export class PerformanceStateOrchestrator extends BaseOrchestrator {
  private _lastUiMode: PerformanceUiModePayload | null;

  protected readonly eventBus: TypedEventBusLike;
  private readonly performanceStateService: PerformanceStateService;

  constructor({ eventBus, performanceStateService, loggerFactory }: PerformanceStateOrchestratorDependencies) {
    super({ loggerFactory, eventBus }, 'PerformanceStateOrchestrator');
    this.eventBus = eventBus;
    this.performanceStateService = performanceStateService;

    this._lastUiMode = null;
  }

  async onInitialize(): Promise<void> {
    this.performanceStateService.initialize({
      onStateChange: (state) => this._handleStateChanged(state)
    });
  }

  @OnEvent(EventChannels.SETTINGS.PERFORMANCE_MODE_CHANGED)
  private _handlePerformanceModeChangedEvent(enabled: boolean): void {
    this._handlePerformanceModeChanged(Boolean(enabled));
  }

  @OnEvent(EventChannels.STREAM.STARTED)
  private _handleStreamStarted(): void {
    this.performanceStateService.setStreaming(true);
  }

  @OnEvent(EventChannels.STREAM.STOPPED)
  private _handleStreamStopped(): void {
    this.performanceStateService.setStreaming(false);
  }

  _handlePerformanceModeChanged(enabled: boolean): void {
    const changed = this.performanceStateService.setPerformanceModeEnabled(enabled);
    if (changed) {
      this.eventBus.publish(EventChannels.PERFORMANCE.RENDER_MODE_CHANGED, enabled);
    }
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
    await this.performanceStateService.dispose();
  }

}
