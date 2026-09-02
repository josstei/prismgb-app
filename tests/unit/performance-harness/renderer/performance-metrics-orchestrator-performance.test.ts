import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventChannels } from '@platform/events';
import { PerformanceMetricsOrchestrator } from '@renderer/application/orchestrators/performance/performance-metrics.orchestrator';
import { createEventBus } from '../../../factories/index.js';
import { createInjectableHarness } from '../../../support/di/injectable.harness.js';

describe('instrumented PerformanceMetricsOrchestrator', () => {
  let orchestrator: PerformanceMetricsOrchestrator;
  let eventBus: ReturnType<typeof createEventBus>;
  let performanceMetricsService: { requestSnapshot: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    const harness = createInjectableHarness(PerformanceMetricsOrchestrator, {
      overrides: {
        eventBus: createEventBus()
      }
    });
    orchestrator = harness.subject;
    ({
      eventBus,
      performanceMetricsService
    } = harness.deps as typeof harness.deps & {
      eventBus: ReturnType<typeof createEventBus>;
      performanceMetricsService: { requestSnapshot: ReturnType<typeof vi.fn> };
    });
  });

  it('does not turn a diagnostic shutdown boundary into a legacy memory snapshot', async () => {
    await orchestrator.initialize();

    eventBus.publish(EventChannels.PERFORMANCE.MEMORY_SNAPSHOT_REQUESTED, {
      diagnosticBoundary: {
        kind: 'performance-shutdown-boundary',
        boundary: 'before-release',
        launchId: '6e3cc1a1-c341-4e20-9737-56ac2c4bd192'
      }
    });

    expect(performanceMetricsService.requestSnapshot).not.toHaveBeenCalled();
  });
});
