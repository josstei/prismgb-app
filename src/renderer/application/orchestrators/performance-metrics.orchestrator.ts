/**
 * Performance Metrics Orchestrator
 *
 * Centralizes process memory snapshot logging for performance analysis.
 */

import { BaseOrchestrator } from '@shared/base/orchestrator.base.js';
import { EventChannels } from '@shared/events/event-channels.js';

export class PerformanceMetricsOrchestrator extends BaseOrchestrator {

  constructor(dependencies: Record<string, unknown>) {
    super(
      dependencies,
      ['eventBus', 'loggerFactory', 'performanceMetricsService'],
      'PerformanceMetricsOrchestrator'
    );
  }

  async onInitialize() {
    this.subscribeWithCleanup({
      [EventChannels.PERFORMANCE.MEMORY_SNAPSHOT_REQUESTED]: (payload) => {
        this.performanceMetricsService.requestSnapshot(payload);
      }
    });

    if (import.meta.env.DEV) {
      this.performanceMetricsService.startPeriodicSnapshots();
    }
  }

  async onCleanup() {
    this.performanceMetricsService.stopPeriodicSnapshots();
    this.performanceMetricsService.clearPendingRequests();
  }
}
