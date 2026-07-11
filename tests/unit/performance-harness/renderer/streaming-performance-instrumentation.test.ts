import { describe, expect, it, vi } from 'vitest';
import { EventChannels } from '@platform/events';
import { createStreamingPerformanceInstrumentation } from '@renderer/infrastructure/diagnostics/streaming-performance-instrumentation';
import { createEventBus } from '../../../factories/index.js';

describe('StreamingPerformanceInstrumentation', () => {
  it('retains only bounded diagnostic event subscriptions and releases them on disposal', () => {
    const eventBus = createEventBus();
    const logger = { error: vi.fn() };
    const instrumentation = createStreamingPerformanceInstrumentation('launch-1', logger, eventBus);

    eventBus.publish(EventChannels.RENDER.PIPELINE_READY, { backend: 'canvas2d' });
    eventBus.publish(EventChannels.RENDER.PIPELINE_ERROR, { message: 'renderer failed', code: 'INIT_FAILED' });
    eventBus.publish(EventChannels.RENDER.STATS_UPDATE, {
      fps: 60,
      frameTime: 16,
      gpuTime: 4,
      uploadTime: 2
    });
    eventBus.publish(EventChannels.PERFORMANCE.MEMORY_SNAPSHOT_REQUESTED, {
      diagnosticBoundary: {
        kind: 'performance-shutdown-boundary',
        boundary: 'before-release',
        launchId: 'launch-1'
      }
    });

    expect(instrumentation.getSnapshot().pipeline).toEqual({
      ready: {
        availability: 'observed',
        unavailableReason: null,
        backends: ['canvas2d']
      },
      errors: [{ message: 'renderer failed', code: 'INIT_FAILED' }],
      renderStats: [{ fps: 60, frameTime: 16, gpuTime: 4, uploadTime: 2 }],
      renderStatDistributions: {
        fps: {
          availability: 'available',
          unavailableReason: null,
          sampleCount: 1,
          p50: 60,
          p95: 60,
          p99: 60
        },
        frameTime: {
          availability: 'available',
          unavailableReason: null,
          sampleCount: 1,
          p50: 16,
          p95: 16,
          p99: 16
        },
        gpuTime: {
          availability: 'available',
          unavailableReason: null,
          sampleCount: 1,
          p50: 4,
          p95: 4,
          p99: 4
        },
        uploadTime: {
          availability: 'available',
          unavailableReason: null,
          sampleCount: 1,
          p50: 2,
          p95: 2,
          p99: 2
        }
      }
    });
    expect(instrumentation.getSnapshot().shutdown.beforeRelease).toEqual({
      availability: 'observed',
      unavailableReason: null,
      launchId: 'launch-1'
    });

    instrumentation.dispose();
    eventBus.publish(EventChannels.RENDER.STATS_UPDATE, {
      fps: 30,
      frameTime: 33,
      gpuTime: 8,
      uploadTime: 3
    });

    expect(instrumentation.getSnapshot().pipeline.renderStats).toHaveLength(1);
  });
});
