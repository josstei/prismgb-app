/**
 * Performance Metrics Orchestrator
 *
 * Centralizes process memory snapshot logging for performance analysis.
 */

import { BaseOrchestrator } from '@shared/base/orchestrator.base.js';
import { EventChannels } from '@shared/events/event-channels.js';
import type { EventBusLike, LoggerFactoryLike } from '@shared/interfaces/infrastructure.types.js';
import type { PerformanceMetricsService } from '@renderer/infrastructure/services/performance/performance-metrics.service';

export class PerformanceMetricsOrchestrator extends BaseOrchestrator {
  private readonly performanceMetricsService: PerformanceMetricsService;

  constructor(dependencies: {
    eventBus: EventBusLike;
    loggerFactory: LoggerFactoryLike;
    performanceMetricsService: PerformanceMetricsService;
  }) {
    super(
      dependencies,
      ['eventBus', 'loggerFactory', 'performanceMetricsService'],
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

}
