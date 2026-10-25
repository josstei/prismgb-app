/**
 * Performance Metrics Orchestrator
 *
 * Centralizes process memory snapshot logging for performance analysis.
 */

import { BaseOrchestrator } from '@platform/core';
import { EventChannels, OnEvent } from '@platform/events';
import type { MemorySnapshotRequestPayload } from '@platform/events';
import type { EventBusLike, LoggerFactoryLike } from '@platform/core';
import type { PerformanceMetricsService } from '@renderer/infrastructure/services/performance/performance-metrics.service';

type PerformanceMetricsOrchestratorDependencies = {
  eventBus: EventBusLike;
  loggerFactory: LoggerFactoryLike;
  performanceMetricsService: PerformanceMetricsService;
};

export class PerformanceMetricsOrchestrator extends BaseOrchestrator {
  private readonly performanceMetricsService: PerformanceMetricsService;

  constructor({ eventBus, loggerFactory, performanceMetricsService }: PerformanceMetricsOrchestratorDependencies) {
    super({ loggerFactory, eventBus }, 'PerformanceMetricsOrchestrator');
    this.performanceMetricsService = performanceMetricsService;
  }

  async onInitialize(): Promise<void> {
    if (import.meta.env.DEV) {
      this.performanceMetricsService.startPeriodicSnapshots();
    }
  }

  @OnEvent(EventChannels.PERFORMANCE.MEMORY_SNAPSHOT_REQUESTED)
  private _handleMemorySnapshotRequested(payload: MemorySnapshotRequestPayload): void {
    this.performanceMetricsService.requestSnapshot(payload);
  }

  override async onCleanup(): Promise<void> {
    this.performanceMetricsService.stopPeriodicSnapshots();
    this.performanceMetricsService.clearPendingRequests();
  }

}
