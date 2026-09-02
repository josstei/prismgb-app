import { describe, expect, it } from 'vitest';
import {
  createPerformanceDiagnostics,
  type PerformanceTimingMetricId,
  type PerformanceTimingSampleInput,
  type WebGpuAllocationRequestProxyInput
} from '@renderer/infrastructure/diagnostics/performance-diagnostics';

function timingSample(
  sourceSequence: number,
  duration = sourceSequence,
  metricId: PerformanceTimingMetricId = 'canvas-draw-call'
): PerformanceTimingSampleInput {
  return {
    measurementEpochId: 'epoch-1',
    sourceSequence,
    firstSourceSequence: sourceSequence,
    lastSourceSequence: sourceSequence,
    frameToken: null,
    metricId,
    unit: 'milliseconds',
    clock: 'renderer-performance-now-v1',
    outcome: 'canvas-draw-completed',
    startedAt: 0,
    endedAt: duration
  };
}

function frameRequest(sourceSequence: number): WebGpuAllocationRequestProxyInput {
  return {
    backend: 'webgpu',
    carrier: 'frame-request',
    measurementWindowId: 'window-1',
    measurementEpochId: 'epoch-1',
    sourceSequence,
    diagnosticFrameId: sourceSequence,
    frameToken: sourceSequence,
    operationId: 'video-frame-image-bitmap-request',
    sourceLocationId: 'video-session:create-image-bitmap',
    requestOrdinal: 1,
    outcome: 'success',
    byteKind: 'rgba-transfer-footprint',
    byteValue: 92_160,
    sourceWidth: 160,
    sourceHeight: 144
  };
}

function lifecycleRequest(phaseSequence: number): WebGpuAllocationRequestProxyInput {
  return {
    backend: 'webgpu',
    carrier: 'lifecycle-request',
    executionId: 'execution-1',
    lifecyclePhase: 'startup',
    phaseSequence,
    operationId: 'gpu-buffer-request',
    sourceLocationId: 'webgpu-driver:create-buffer',
    requestOrdinal: phaseSequence,
    outcome: 'success',
    byteKind: 'descriptor-size',
    byteValue: 64,
    descriptorSize: 64
  };
}

describe('PerformanceDiagnostics', () => {
  it('uses the policy maximum callback count as its default bounded sample capacity', () => {
    expect(createPerformanceDiagnostics().getSnapshot().maxSamplesPerKind).toBe(2048);
  });

  it('bounds each raw sample kind and rejects duplicate or summary-shaped timing input', () => {
    const diagnostics = createPerformanceDiagnostics({ maxSamplesPerKind: 1 });

    expect(diagnostics.recordTimingSample(timingSample(1))).toEqual({ accepted: true });
    expect(diagnostics.recordTimingSample(timingSample(1))).toEqual({
      accepted: false,
      reason: 'duplicate-sample'
    });
    expect(diagnostics.recordTimingSample({ ...timingSample(2), p95: 99 })).toEqual({
      accepted: false,
      reason: 'invalid-input'
    });
    expect(diagnostics.recordTimingSample(timingSample(2))).toEqual({
      accepted: false,
      reason: 'buffer-full'
    });

    expect(diagnostics.recordWebGpuAllocationRequestProxy(frameRequest(1))).toEqual({ accepted: true });
    expect(diagnostics.recordWebGpuAllocationRequestProxy(frameRequest(2))).toEqual({
      accepted: false,
      reason: 'buffer-full'
    });

    expect(diagnostics.recordRendererHeapObservation({
      observationId: 'heap-1',
      observedAt: 1,
      usedBytes: 100
    })).toEqual({ accepted: true });
    expect(diagnostics.recordRendererHeapObservation({
      observationId: 'heap-2',
      observedAt: 2,
      usedBytes: 200
    })).toEqual({
      accepted: false,
      reason: 'buffer-full'
    });
  });

  it('derives deterministic nearest-rank percentiles from raw timing samples', () => {
    const diagnostics = createPerformanceDiagnostics({ maxSamplesPerKind: 128 });

    for (let sourceSequence = 1; sourceSequence <= 100; sourceSequence++) {
      expect(diagnostics.recordTimingSample(timingSample(sourceSequence))).toEqual({ accepted: true });
    }

    expect(diagnostics.getSnapshot().timingDistributions['canvas-draw-call']).toEqual({
      availability: 'available',
      unavailableReason: null,
      sampleCount: 100,
      p50: 50,
      p95: 95,
      p99: 99
    });
  });

  it('retains source and pending counters needed to inspect both conservation relationships', () => {
    const diagnostics = createPerformanceDiagnostics();

    expect(diagnostics.recordBackendObservation({
      requestedBackend: 'webgpu',
      selectedBackend: 'webgpu',
      observedBackend: 'webgpu',
      observedBackendUnavailableReason: null,
      selectionReason: 'webgpu-selected',
      fallbackReason: null,
      adapter: {
        identity: 'test-adapter-v1',
        isFallbackAdapter: false
      }
    })).toEqual({ accepted: true });
    expect(diagnostics.recordSourceOpportunity({ sourceSequence: 1, disposition: 'duplicateMediaTime' })).toEqual({ accepted: true });
    expect(diagnostics.recordSourceOpportunity({ sourceSequence: 2, disposition: 'drawCompleted' })).toEqual({ accepted: true });
    expect(diagnostics.recordSourceOpportunity({ sourceSequence: 3, disposition: 'workerFrameSubmitted' })).toEqual({ accepted: true });
    expect(diagnostics.recordPendingCount({ boundary: 'observation-start', count: 4 })).toEqual({ accepted: true });
    expect(diagnostics.recordWorkerAcknowledgement({ outcome: 'queueSubmitCompleted' })).toEqual({ accepted: true });
    expect(diagnostics.recordPendingCount({ boundary: 'observation-end', count: 4 })).toEqual({ accepted: true });

    const snapshot = diagnostics.getSnapshot();
    expect(snapshot.source).toMatchObject({
      sourceOpportunities: 3,
      measuredDrops: { duplicateMediaTime: 1, total: 1 },
      canvas: { attempts: 1, drawCompleted: 1 },
      workerFramesSubmitted: 1,
      backendSuccesses: { availability: 'available', backend: 'webgpu', count: 1 },
      reconciliation: { accountedOpportunities: 3, isConserved: true }
    });
    expect(snapshot.worker).toMatchObject({
      submissions: 1,
      acknowledgements: 1,
      outcomes: { queueSubmitCompleted: 1 }
    });
    expect(snapshot.pendingCounts).toEqual({
      observationStart: { availability: 'observed', unavailableReason: null, count: 4 },
      observationEnd: { availability: 'observed', unavailableReason: null, count: 4 },
      reconciliation: {
        availability: 'available',
        unavailableReason: null,
        expectedEnd: 4,
        matchesObservedEnd: true
      }
    });
  });

  it('retains ordered shutdown boundaries without treating dispatch as completion', () => {
    const diagnostics = createPerformanceDiagnostics();

    expect(diagnostics.recordShutdownBoundary({
      launchId: 'launch-1',
      boundary: 'release-dispatched'
    })).toEqual({ accepted: false, reason: 'out-of-order-boundary' });
    expect(diagnostics.recordShutdownBoundary({
      launchId: 'launch-1',
      boundary: 'before-release'
    })).toEqual({ accepted: true });
    expect(diagnostics.recordShutdownBoundary({
      launchId: 'launch-1',
      boundary: 'release-dispatched'
    })).toEqual({ accepted: true });
    expect(diagnostics.getSnapshot().shutdown).toEqual({
      beforeRelease: {
        availability: 'observed',
        unavailableReason: null,
        launchId: 'launch-1'
      },
      releaseDispatched: {
        availability: 'observed',
        unavailableReason: null,
        launchId: 'launch-1'
      }
    });
  });

  it('stores discriminated WebGPU request-proxy rows without deriving coverage semantics', () => {
    const diagnostics = createPerformanceDiagnostics();

    expect(diagnostics.recordWebGpuAllocationRequestProxy(frameRequest(1))).toEqual({ accepted: true });
    expect(diagnostics.recordWebGpuAllocationRequestProxy(lifecycleRequest(1))).toEqual({ accepted: true });

    const snapshot = diagnostics.getSnapshot();
    expect(snapshot.allocationRequestProxies).toEqual({
      availability: 'observed',
      unavailableReason: null,
      frameRequests: [frameRequest(1)],
      lifecycleRequests: [lifecycleRequest(1)]
    });
    expect('allocations' in snapshot).toBe(false);
  });

  it('rejects frame token and ordinal shapes that cannot satisfy replay', () => {
    const diagnostics = createPerformanceDiagnostics();
    const first = frameRequest(1);

    expect(diagnostics.recordWebGpuAllocationRequestProxy({ ...first, frameToken: null })).toEqual({
      accepted: false,
      reason: 'invalid-input'
    });
    expect(diagnostics.recordWebGpuAllocationRequestProxy(first)).toEqual({ accepted: true });
    expect(diagnostics.recordWebGpuAllocationRequestProxy({
      backend: 'webgpu',
      carrier: 'frame-request',
      measurementWindowId: 'window-1',
      measurementEpochId: 'epoch-1',
      sourceSequence: 1,
      diagnosticFrameId: 1,
      frameToken: 1,
      operationId: 'uniform-float32-array',
      sourceLocationId: 'webgpu-driver:uniform-float32-array',
      requestOrdinal: 3,
      outcome: 'success',
      byteKind: 'requested-byte-length',
      byteValue: 96,
      requestedByteLength: 96
    })).toEqual({ accepted: false, reason: 'invalid-input' });
    const failedDiagnostics = createPerformanceDiagnostics();
    expect(failedDiagnostics.recordWebGpuAllocationRequestProxy({
      ...frameRequest(2),
      outcome: 'failed',
      frameToken: null
    })).toEqual({ accepted: true });
  });

  it('enforces lifecycle phase-global and operation-local ordinal domains independently', () => {
    const diagnostics = createPerformanceDiagnostics();
    const buffer = lifecycleRequest(1);
    const texture = {
      backend: 'webgpu',
      carrier: 'lifecycle-request',
      executionId: 'execution-1',
      lifecyclePhase: 'startup',
      phaseSequence: 2,
      operationId: 'gpu-texture-request',
      sourceLocationId: 'webgpu-driver:create-texture',
      requestOrdinal: 1,
      outcome: 'success',
      byteKind: 'logical-texel-footprint',
      byteValue: 92_160,
      textureDescriptor: {
        width: 160,
        height: 144,
        depth: 1,
        format: 'rgba8unorm',
        usage: 'texture-binding-render-attachment',
        logicalTexelFootprint: 92_160
      }
    } as const;

    expect(diagnostics.recordWebGpuAllocationRequestProxy(buffer)).toEqual({ accepted: true });
    expect(diagnostics.recordWebGpuAllocationRequestProxy(texture)).toEqual({ accepted: true });
    expect(diagnostics.recordWebGpuAllocationRequestProxy({
      ...buffer,
      phaseSequence: 3,
      requestOrdinal: 2
    })).toEqual({ accepted: true });
    expect(diagnostics.recordWebGpuAllocationRequestProxy({
      ...texture,
      phaseSequence: 5,
      requestOrdinal: 2
    })).toEqual({ accepted: false, reason: 'invalid-input' });
  });

  it('records explicit renderer heap unavailability instead of synthesizing an observation', () => {
    const diagnostics = createPerformanceDiagnostics();

    expect(diagnostics.getSnapshot().rendererHeap).toMatchObject({
      availability: 'unavailable',
      unavailableReason: 'not-collected',
      observations: []
    });
    expect(diagnostics.recordRendererHeapUnavailable('performance-memory-unavailable')).toEqual({ accepted: true });
    expect(diagnostics.recordRendererHeapObservation({
      observationId: 'late-heap',
      observedAt: 1,
      usedBytes: 1
    })).toEqual({
      accepted: false,
      reason: 'heap-state-already-recorded'
    });
    expect(diagnostics.getSnapshot().rendererHeap).toMatchObject({
      availability: 'unavailable',
      unavailableReason: 'performance-memory-unavailable',
      observations: [],
      distribution: {
        availability: 'unavailable',
        unavailableReason: 'no-raw-samples'
      }
    });
  });

  it('resets cohort observations while preserving lifecycle request proxies and earlier snapshots', () => {
    const diagnostics = createPerformanceDiagnostics();

    expect(diagnostics.recordBackendObservation({
      requestedBackend: 'canvas2d',
      selectedBackend: 'canvas2d',
      observedBackend: 'canvas2d',
      observedBackendUnavailableReason: null,
      selectionReason: 'requested-canvas2d',
      fallbackReason: null
    })).toEqual({ accepted: true });
    expect(diagnostics.recordWindowBoundary({ kind: 'warmup-start', measurementEpochId: 'epoch-1', at: 1 })).toEqual({ accepted: true });
    expect(diagnostics.recordWindowBoundary({ kind: 'warmup-end', measurementEpochId: 'epoch-1', at: 2 })).toEqual({ accepted: true });
    expect(diagnostics.recordTimingSample(timingSample(1))).toEqual({ accepted: true });
    expect(diagnostics.recordWebGpuAllocationRequestProxy(lifecycleRequest(1))).toEqual({ accepted: true });

    const beforeReset = diagnostics.getSnapshot();
    diagnostics.reset();
    const afterReset = diagnostics.getSnapshot();

    expect(beforeReset.backend.availability).toBe('observed');
    expect(beforeReset.timingSamples['canvas-draw-call']).toHaveLength(1);
    expect(afterReset.backend).toMatchObject({ availability: 'unavailable', unavailableReason: 'backend-not-recorded' });
    expect(afterReset.timingSamples['canvas-draw-call']).toEqual([]);
    expect(afterReset.windows.warmup.start).toEqual({
      availability: 'unavailable',
      unavailableReason: 'not-recorded',
      measurementEpochId: null,
      at: null
    });
    expect(afterReset.allocationRequestProxies.lifecycleRequests).toEqual([lifecycleRequest(1)]);
  });

  it('retains a source sequence boundary across a cohort reset', () => {
    const diagnostics = createPerformanceDiagnostics();
    diagnostics.reset({ lastSourceSequence: 4 });

    expect(diagnostics.recordSourceOpportunity({
      sourceSequence: 5,
      disposition: 'drawCompleted'
    })).toEqual({ accepted: true });
    expect(diagnostics.getSnapshot().source).toMatchObject({
      sourceOpportunities: 1,
      reconciliation: { accountedOpportunities: 1, isConserved: true }
    });
  });

  it('returns deeply immutable snapshots that cannot mutate retained raw data', () => {
    const diagnostics = createPerformanceDiagnostics();
    expect(diagnostics.recordSourceOpportunity({ sourceSequence: 1, disposition: 'drawCompleted' })).toEqual({ accepted: true });
    expect(diagnostics.recordTimingSample(timingSample(1))).toEqual({ accepted: true });

    const snapshot = diagnostics.getSnapshot();
    const mutableSnapshot = snapshot as unknown as {
      source: { sourceOpportunities: number };
      timingSamples: Record<PerformanceTimingMetricId, PerformanceTimingSampleInput[]>;
    };

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.timingSamples['canvas-draw-call'])).toBe(true);
    expect(() => {
      mutableSnapshot.source.sourceOpportunities = 99;
    }).toThrow(TypeError);
    expect(() => {
      mutableSnapshot.timingSamples['canvas-draw-call'].push(timingSample(2));
    }).toThrow(TypeError);
    expect(diagnostics.getSnapshot().source.sourceOpportunities).toBe(1);
    expect(diagnostics.getSnapshot().timingSamples['canvas-draw-call']).toEqual([timingSample(1)]);
  });
});
