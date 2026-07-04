/**
 * Performance Metrics Orchestrator
 *
 * Centralizes process memory snapshot logging for performance analysis.
 */

import { injectable, inject } from 'inversify';
import { BaseOrchestrator } from '@platform/core';
import { EventChannels, OnEvent } from '@platform/events';
import type { MemorySnapshotRequestPayload } from '@platform/events';
import type { EventBusLike, LoggerFactoryLike } from '@platform/core';
import type { PerformanceMetricsService } from '@renderer/infrastructure/services/performance/performance-metrics.service';
import { TOKENS } from '@renderer/application/di/tokens.js';

@injectable()
export class PerformanceMetricsOrchestrator extends BaseOrchestrator {
  constructor(
    @inject(TOKENS.eventBus) eventBus: EventBusLike,
    @inject(TOKENS.loggerFactory) loggerFactory: LoggerFactoryLike,
    @inject(TOKENS.performanceMetricsService) private readonly performanceMetricsService: PerformanceMetricsService
  ) {
    super({ loggerFactory, eventBus }, 'PerformanceMetricsOrchestrator');
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
