/**
 * Performance Metrics Orchestrator
 *
 * Centralizes process memory snapshot logging for performance analysis.
 */

import { BaseOrchestrator } from '@prismgb/core';
import { EventChannels } from '@prismgb/events';
import type { EventBusLike, LoggerFactoryLike } from '@prismgb/core';
import type { PerformanceMetricsService } from '@renderer/infrastructure/services/performance/performance-metrics.service';

interface PerformanceMetricsOrchestratorDependencies {
  eventBus: EventBusLike;
  loggerFactory: LoggerFactoryLike;
  performanceMetricsService: PerformanceMetricsService;
}

export class PerformanceMetricsOrchestrator extends BaseOrchestrator {
  private readonly performanceMetricsService: PerformanceMetricsService;

  constructor(dependencies: PerformanceMetricsOrchestratorDependencies) {
    super(
      dependencies,
      'PerformanceMetricsOrchestrator'
    );
    this.eventBus = dependencies.eventBus;
    this.performanceMetricsService = dependencies.performanceMetricsService;
  }

  async onInitialize(): Promise<void> {
    this.subscribeWithCleanup({
      [EventChannels.PERFORMANCE.MEMORY_SNAPSHOT_REQUESTED]: (payload) => {
        this.performanceMetricsService.requestSnapshot(payload);
      }
    });

    if (import.meta.env.DEV) {
      this.performanceMetricsService.startPeriodicSnapshots();
    }
  }

  override async onCleanup(): Promise<void> {
    this.performanceMetricsService.stopPeriodicSnapshots();
    this.performanceMetricsService.clearPendingRequests();
  }

}
