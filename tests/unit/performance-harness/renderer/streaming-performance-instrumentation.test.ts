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
      kind: 'bitmap-creation',
      context,
      outcome: 'success',
      frameToken: 7,
      startedAt: 8,
      endedAt: 9,
      sourceWidth: 160,
      sourceHeight: 144
    });
    instrumentation.observe({
      kind: 'worker-frame-submitted',
      context,
      frameToken: 7,
      submittedAt: 12
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
          operationId: 'uniform-float32-array',
          sourceLocationId: 'webgpu-driver:uniform-float32-array',
          outcome: 'success',
          byteKind: 'requested-byte-length',
          byteValue: 96,
          requestedByteLength: 96
        },
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
    instrumentation.observe({
      kind: 'worker-frame-acknowledged',
      context,
      frameToken: 7,
      outcome: 'webgpu-queue-submit-completed',
      submittedAt: 12,
      acknowledgedAt: 15
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
    expect(snapshot.timingSamples['webgpu-enqueue-to-ack']).toEqual([{
      measurementEpochId: 'launch-1',
      sourceSequence: 1,
      firstSourceSequence: 1,
      lastSourceSequence: 1,
      frameToken: 7,
      metricId: 'webgpu-enqueue-to-ack',
      unit: 'milliseconds',
      clock: 'renderer-performance-now-v1',
      outcome: 'enqueue-acknowledged',
      startedAt: 12,
      endedAt: 15
    }]);
    expect(snapshot.source).toMatchObject({
      workerFramesSubmitted: 1,
      reconciliation: { isConserved: true }
    });
    expect(snapshot.allocationRequestProxies.frameRequests).toEqual([
      {
        backend: 'webgpu',
        carrier: 'frame-request',
        measurementWindowId: 'launch-1',
        measurementEpochId: 'launch-1',
        sourceSequence: 1,
        diagnosticFrameId: 1,
        frameToken: 7,
        operationId: 'video-frame-image-bitmap-request',
        sourceLocationId: 'video-session:create-image-bitmap',
        requestOrdinal: 1,
        outcome: 'success',
        byteKind: 'rgba-transfer-footprint',
        byteValue: 160 * 144 * 4,
        sourceWidth: 160,
        sourceHeight: 144
      },
      {
        backend: 'webgpu',
        carrier: 'frame-request',
        measurementWindowId: 'launch-1',
        measurementEpochId: 'launch-1',
        sourceSequence: 1,
        diagnosticFrameId: 1,
        frameToken: 7,
        operationId: 'uniform-float32-array',
        sourceLocationId: 'webgpu-driver:uniform-float32-array',
        requestOrdinal: 2,
        outcome: 'success',
        byteKind: 'requested-byte-length',
        byteValue: 96,
        requestedByteLength: 96
      },
      {
        backend: 'webgpu',
        carrier: 'frame-request',
        measurementWindowId: 'launch-1',
        measurementEpochId: 'launch-1',
        sourceSequence: 1,
        diagnosticFrameId: 1,
        frameToken: 7,
        operationId: 'render-pass-plan-materialization',
        sourceLocationId: 'webgpu-driver:materialize-render-plan',
        requestOrdinal: 3,
        outcome: 'success',
        byteKind: 'count-only-unavailable',
        byteValue: null
      },
      {
        backend: 'webgpu',
        carrier: 'frame-request',
        measurementWindowId: 'launch-1',
        measurementEpochId: 'launch-1',
        sourceSequence: 1,
        diagnosticFrameId: 1,
        frameToken: 7,
        operationId: 'bind-group-create',
        sourceLocationId: 'webgpu-driver:create-bind-group',
        requestOrdinal: 4,
        outcome: 'success',
        byteKind: 'count-only-unavailable',
        byteValue: null
      }
    ]);
  });

  it('maps worker lifecycle requests to the marker-bound execution and preserves them across a cohort reset', () => {
    const eventBus = createEventBus();
    const instrumentation = createStreamingPerformanceInstrumentation('launch-1', { error: vi.fn() }, eventBus);

    instrumentation.observe({
      kind: 'worker-lifecycle-requests',
      lifecycleRequestProxies: [
        {
          lifecyclePhase: 'startup',
          operationId: 'gpu-texture-request',
          sourceLocationId: 'webgpu-driver:create-texture',
          outcome: 'success',
          byteKind: 'logical-texel-footprint',
          byteValue: 160 * 144 * 4,
          textureDescriptor: {
            width: 160,
            height: 144,
            depth: 1,
            format: 'rgba8unorm',
            usage: 'texture-binding-copy-dst-render-attachment',
            logicalTexelFootprint: 160 * 144 * 4
          }
        },
        {
          lifecyclePhase: 'startup',
          operationId: 'gpu-buffer-request',
          sourceLocationId: 'webgpu-driver:create-buffer',
          outcome: 'success',
          byteKind: 'descriptor-size',
          byteValue: 64,
          descriptorSize: 64
        },
        {
          lifecyclePhase: 'resize',
          operationId: 'gpu-texture-request',
          sourceLocationId: 'webgpu-driver:create-texture',
          outcome: 'success',
          byteKind: 'logical-texel-footprint',
          byteValue: 320 * 288 * 4,
          textureDescriptor: {
            width: 320,
            height: 288,
            depth: 1,
            format: 'rgba8unorm',
            usage: 'texture-binding-render-attachment',
            logicalTexelFootprint: 320 * 288 * 4
          }
        }
      ]
    });

    const expectedLifecycleRequests = [
      {
        backend: 'webgpu',
        carrier: 'lifecycle-request',
        executionId: 'launch-1',
        lifecyclePhase: 'startup',
        phaseSequence: 1,
        operationId: 'gpu-texture-request',
        sourceLocationId: 'webgpu-driver:create-texture',
        requestOrdinal: 1,
        outcome: 'success',
        byteKind: 'logical-texel-footprint',
        byteValue: 160 * 144 * 4,
        textureDescriptor: {
          width: 160,
          height: 144,
          depth: 1,
          format: 'rgba8unorm',
          usage: 'texture-binding-copy-dst-render-attachment',
          logicalTexelFootprint: 160 * 144 * 4
        }
      },
      {
        backend: 'webgpu',
        carrier: 'lifecycle-request',
        executionId: 'launch-1',
        lifecyclePhase: 'startup',
        phaseSequence: 2,
        operationId: 'gpu-buffer-request',
        sourceLocationId: 'webgpu-driver:create-buffer',
        requestOrdinal: 1,
        outcome: 'success',
        byteKind: 'descriptor-size',
        byteValue: 64,
        descriptorSize: 64
      },
      {
        backend: 'webgpu',
        carrier: 'lifecycle-request',
        executionId: 'launch-1',
        lifecyclePhase: 'resize',
        phaseSequence: 1,
        operationId: 'gpu-texture-request',
        sourceLocationId: 'webgpu-driver:create-texture',
        requestOrdinal: 1,
        outcome: 'success',
        byteKind: 'logical-texel-footprint',
        byteValue: 320 * 288 * 4,
        textureDescriptor: {
          width: 320,
          height: 288,
          depth: 1,
          format: 'rgba8unorm',
          usage: 'texture-binding-render-attachment',
          logicalTexelFootprint: 320 * 288 * 4
        }
      }
    ];

    expect(instrumentation.getSnapshot().allocationRequestProxies.lifecycleRequests).toEqual(expectedLifecycleRequests);
    instrumentation.reset();
    expect(instrumentation.getSnapshot().allocationRequestProxies.lifecycleRequests).toEqual(expectedLifecycleRequests);
  });

  it('retains a failed pre-token bitmap request with a null token and no success timing span', () => {
    const instrumentation = createStreamingPerformanceInstrumentation(
      'launch-1',
      { error: vi.fn() },
      createEventBus()
    );
    const context = instrumentation.beginSourceOpportunity(1);

    instrumentation.observe({
      kind: 'bitmap-creation',
      context,
      outcome: 'failed',
      frameToken: null,
      startedAt: 8,
      endedAt: 9,
      sourceWidth: 160,
      sourceHeight: 144
    });

    expect(instrumentation.getSnapshot().allocationRequestProxies.frameRequests).toEqual([{
      backend: 'webgpu',
      carrier: 'frame-request',
      measurementWindowId: 'launch-1',
      measurementEpochId: 'launch-1',
      sourceSequence: 1,
      diagnosticFrameId: 1,
      frameToken: null,
      operationId: 'video-frame-image-bitmap-request',
      sourceLocationId: 'video-session:create-image-bitmap',
      requestOrdinal: 1,
      outcome: 'failed',
      byteKind: 'rgba-transfer-footprint',
      byteValue: 160 * 144 * 4,
      sourceWidth: 160,
      sourceHeight: 144
    }]);
    expect(instrumentation.getSnapshot().timingSamples['webgpu-bitmap-creation']).toEqual([]);
  });
});
