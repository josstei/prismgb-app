import { BaseOrchestrator } from '@prismgb/core';
import { EventChannels } from '@shared/events/event-channels.js';

export class PerformanceOrchestrator extends BaseOrchestrator {
  static readonly dependencies = [
    'eventBus',
    'loggerFactory',
    'performanceStateService',
    'animationPerformanceService',
    'performanceMetricsService',
    'bodyClassManager'
  ] as const;

  constructor(dependencies) {
    super(
      dependencies,
      [...PerformanceOrchestrator.dependencies],
      'PerformanceOrchestrator'
    );
    this._lastUiMode = null;
  }

  async onInitialize() {
    this.performanceStateService.initialize({
      onStateChange: (state) => this._handleStateChanged(state)
    });

    this.subscribeWithCleanup({
      [EventChannels.SETTINGS.PERFORMANCE_MODE_CHANGED]: (enabled) =>
        this._handlePerformanceModeChanged(Boolean(enabled)),
      [EventChannels.RENDER.CAPABILITY_DETECTED]: (capabilities) =>
        this.performanceStateService.setCapabilities(capabilities),
      [EventChannels.STREAM.STARTED]: () => this._handleStreamStarted(),
      [EventChannels.STREAM.STOPPED]: () => this._handleStreamStopped(),
      [EventChannels.PERFORMANCE.STATE_CHANGED]: (state) =>
        this._handlePerformanceStateForAnimation(state),
      [EventChannels.PERFORMANCE.MEMORY_SNAPSHOT_REQUESTED]: (payload) =>
        this.performanceMetricsService.requestSnapshot(payload)
    });

    if (import.meta.env.DEV) {
      this.performanceMetricsService.startPeriodicSnapshots();
    }
  }

  _handlePerformanceModeChanged(enabled) {
    const changed = this.performanceStateService.setPerformanceModeEnabled(enabled);
    if (changed) {
      this.eventBus.publish(EventChannels.PERFORMANCE.RENDER_MODE_CHANGED, enabled);
    }
  }

  _handleStateChanged(state) {
    this.eventBus.publish(EventChannels.PERFORMANCE.STATE_CHANGED, { ...state });

    const uiMode = {
      enabled: Boolean(state.performanceModeEnabled),
      weakGpuDetected: Boolean(state.weakGpuDetected)
    };

    if (!this._lastUiMode
      || this._lastUiMode.enabled !== uiMode.enabled
      || this._lastUiMode.weakGpuDetected !== uiMode.weakGpuDetected) {
      this.eventBus.publish(EventChannels.PERFORMANCE.UI_MODE_CHANGED, uiMode);
      this._lastUiMode = uiMode;
    }
  }

  _handleStreamStarted() {
    this.performanceStateService.setStreaming(true);
    const animState = this.animationPerformanceService.setStreaming(true);
    this._applyBodyClasses(animState);
  }

  _handleStreamStopped() {
    this.performanceStateService.setStreaming(false);
    const animState = this.animationPerformanceService.setStreaming(false);
    this._applyBodyClasses(animState);
  }

  _handlePerformanceStateForAnimation(performanceState) {
    const state = this.animationPerformanceService.setPerformanceState(performanceState);
    this._applyBodyClasses(state);
  }

  _applyBodyClasses(state) {
    this.bodyClassManager.setStreaming(state.streaming);
    this.bodyClassManager.setIdle(state.idle);
    this.bodyClassManager.setHidden(state.hidden);
    this.bodyClassManager.setAnimationsOff(state.animationsOff);
  }

  async onCleanup() {
    this.performanceStateService.dispose();
    this.performanceMetricsService.stopPeriodicSnapshots();
    this.performanceMetricsService.clearPendingRequests();
  }
}
