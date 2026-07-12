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

  it('maps marker-bound worker spans to their source and token without cross-clock derivation', () => {
    const eventBus = createEventBus();
    const instrumentation = createStreamingPerformanceInstrumentation('launch-1', { error: vi.fn() }, eventBus);
    const context = instrumentation.beginSourceOpportunity(1);

    instrumentation.observe({
      kind: 'worker-frame-submitted',
      context,
      frameToken: 7
    });
    instrumentation.observe({
      kind: 'worker-frame-timing',
      context,
      frameToken: 7,
      diagnosticFrameId: 1,
      outcome: 'webgpu-queue-submit-completed',
      workerRender: { startedAt: 10, endedAt: 12 },
      queueSubmit: { startedAt: 11, endedAt: 11.5 },
      frameRequestProxies: [
        {
          operationId: 'render-pass-plan-materialization',
          sourceLocationId: 'webgpu-driver:materialize-render-plan',
          outcome: 'success',
          byteKind: 'count-only-unavailable',
          byteValue: null
        },
        {
          operationId: 'bind-group-create',
          sourceLocationId: 'webgpu-driver:create-bind-group',
          outcome: 'success',
          byteKind: 'count-only-unavailable',
          byteValue: null
        }
      ]
    });

    const snapshot = instrumentation.getSnapshot();
    expect(snapshot.timingSamples['webgpu-worker-render']).toEqual([{
      measurementEpochId: 'launch-1',
      sourceSequence: 1,
      firstSourceSequence: 1,
      lastSourceSequence: 1,
      frameToken: 7,
      metricId: 'webgpu-worker-render',
      unit: 'milliseconds',
      clock: 'worker-performance-now-v1',
      outcome: 'webgpu-worker-rendered',
      startedAt: 10,
      endedAt: 12
    }]);
    expect(snapshot.timingSamples['webgpu-worker-queue-submit']).toEqual([{
      measurementEpochId: 'launch-1',
      sourceSequence: 1,
      firstSourceSequence: 1,
      lastSourceSequence: 1,
      frameToken: 7,
      metricId: 'webgpu-worker-queue-submit',
      unit: 'milliseconds',
      clock: 'worker-performance-now-v1',
      outcome: 'webgpu-queue-submit-completed',
      startedAt: 11,
      endedAt: 11.5
    }]);
    expect(snapshot.source).toMatchObject({
      workerFramesSubmitted: 1,
      reconciliation: { isConserved: true }
    });
    expect(snapshot.allocationRequestProxies.frameRequests).toEqual([
      {
        backend: 'webgpu',
        carrier: 'frame-request',
        measurementEpochId: 'launch-1',
        sourceSequence: 1,
        operationId: 'render-pass-plan-materialization',
        sourceLocationId: 'webgpu-driver:materialize-render-plan',
        requestOrdinal: 1,
        outcome: 'success',
        byteKind: 'count-only-unavailable',
        byteValue: null
      },
      {
        backend: 'webgpu',
        carrier: 'frame-request',
        measurementEpochId: 'launch-1',
        sourceSequence: 1,
        operationId: 'bind-group-create',
        sourceLocationId: 'webgpu-driver:create-bind-group',
        requestOrdinal: 1,
        outcome: 'success',
        byteKind: 'count-only-unavailable',
        byteValue: null
      }
    ]);
  });
});
