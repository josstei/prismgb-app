/**
 * Performance Metrics Orchestrator
 *
 * Centralizes process memory snapshot logging for performance analysis.
 */

import { injectable, inject } from 'inversify';
import { BaseOrchestrator } from '@platform/core';
import { EventChannels } from '@renderer/lib/events/event-channels';
import { OnEvent, type EventBus } from '@renderer/lib/events/event-bus';
import type { MemorySnapshotRequestPayload } from '@renderer/lib/events/event-payloads';
import type { LoggerFactory } from '@platform/core';
import type { PerformanceMetricsService } from '@renderer/infrastructure/services/performance/performance-metrics.service';
import { TOKENS } from '@renderer/application/di/tokens';

@injectable()
export class PerformanceMetricsOrchestrator extends BaseOrchestrator {
  constructor(
    @inject(TOKENS.eventBus) eventBus: EventBus,
    @inject(TOKENS.loggerFactory) loggerFactory: LoggerFactory,
    @inject(TOKENS.performanceMetricsService) private readonly performanceMetricsService: PerformanceMetricsService
  ) {
    super(loggerFactory, 'PerformanceMetricsOrchestrator', eventBus);
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
