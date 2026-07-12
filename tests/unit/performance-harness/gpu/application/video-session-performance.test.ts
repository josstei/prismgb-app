import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGpuVideoRendererSession } from '../../../../../src/platform/gpu/application/video-session';
import {
  WorkerMessageType,
  WorkerResponseType,
  createWorkerPerformanceFrameTimingResponse
} from '../../../../../src/platform/gpu/worker/protocol';
import { flush, makeDeterministicFrame, stubControlWorker } from '../../../platform/gpu/worker/golden-harness';

describe('harness video-session performance observations', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (window as Window & { prismgbPerformanceLaunchMarker?: unknown }).prismgbPerformanceLaunchMarker;
  });

  it('maps one source frame through bitmap creation, token submission, and token-matched acknowledgement', async () => {
    Object.defineProperty(window, 'prismgbPerformanceLaunchMarker', {
      configurable: true,
      value: Object.freeze({ launchId: '6e3cc1a1-c341-4e20-9737-56ac2c4bd192' })
    });
    const bitmap = makeDeterministicFrame(1);
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap));

    const worker = stubControlWorker();
    const rawMessages: unknown[] = [];
    const postMessage = worker.postMessage.bind(worker);
    worker.postMessage = (message: unknown) => {
      rawMessages.push(message);
      postMessage(message);
    };
    const observations: unknown[] = [];
    const harnessObservations: unknown[] = [];
    const canvas = {
      clientWidth: 160,
      clientHeight: 144,
      transferControlToOffscreen: () => ({ width: 160, height: 144, getContext: () => null })
    } as unknown as HTMLCanvasElement;
    const session = await createGpuVideoRendererSession({
      canvas,
      nativeResolution: { width: 160, height: 144 },
      preferredBackend: 'webgpu',
      createWorker: () => worker as unknown as Worker,
      capabilities: {
        webgpu: true,
        offscreenCanvas: true,
        transferControlToOffscreen: true,
        preferredBackend: 'webgpu',
        maxTextureSize: 4096
      },
      onHarnessObservation: (observation) => harnessObservations.push(observation),
      onPerformanceObservation: (observation) => observations.push(observation)
    });
    const video = document.createElement('video');
    Object.defineProperties(video, {
      readyState: { value: 4 },
      HAVE_CURRENT_DATA: { value: 2 },
      videoWidth: { value: 160 },
      videoHeight: { value: 144 }
    });

    await session.renderFrame(video, { sourceSequence: 1, measurementEpochId: 'epoch-1' });
    const frameMessage = rawMessages.find(
      (message) => (message as { type?: string }).type === WorkerMessageType.FRAME
    ) as { payload?: unknown } | undefined;
    expect(frameMessage?.payload).toEqual({ imageBitmap: bitmap, frameToken: 1, diagnosticFrameId: 1 });
    expect(observations).toEqual([
      expect.objectContaining({ kind: 'bitmap-creation', context: { sourceSequence: 1, measurementEpochId: 'epoch-1' } }),
      { kind: 'worker-frame-submitted', context: { sourceSequence: 1, measurementEpochId: 'epoch-1' }, frameToken: 1 }
    ]);
    expect(harnessObservations).toEqual([
      {
        kind: 'bitmap-creation',
        context: { sourceSequence: 1, measurementEpochId: 'epoch-1' },
        outcome: 'created'
      },
      {
        kind: 'worker-frame-submitted',
        context: { sourceSequence: 1, measurementEpochId: 'epoch-1' },
        frameToken: 1
      }
    ]);

    worker.onmessage?.({
      data: createWorkerPerformanceFrameTimingResponse({
        frameToken: 1,
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
      })
    } as MessageEvent);
    await flush();

    expect(observations.at(-1)).toEqual({
      kind: 'worker-frame-timing',
      context: { sourceSequence: 1, measurementEpochId: 'epoch-1' },
      frameToken: 1,
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

    worker.onmessage?.({
      data: {
        type: WorkerResponseType.FRAME_RENDERED,
        payload: { frameToken: 1, outcome: 'webgpu-queue-submit-completed' },
        timestamp: 0
      }
    } as MessageEvent);
    await flush();

    expect(observations.at(-1)).toEqual({
      kind: 'worker-frame-acknowledged',
      context: { sourceSequence: 1, measurementEpochId: 'epoch-1' },
      frameToken: 1,
      outcome: 'webgpu-queue-submit-completed'
    });
    expect(harnessObservations.at(-1)).toEqual({
      kind: 'worker-frame-acknowledged',
      context: { sourceSequence: 1, measurementEpochId: 'epoch-1' },
      frameToken: 1,
      outcome: 'webgpu-queue-submit-completed'
    });
    session.terminate();
  });

  it('forwards exact worker lifecycle requests without assigning frame-cohort keys', async () => {
    Object.defineProperty(window, 'prismgbPerformanceLaunchMarker', {
      configurable: true,
      value: Object.freeze({ launchId: '6e3cc1a1-c341-4e20-9737-56ac2c4bd192' })
    });
    const textureRequest = (
      lifecyclePhase: 'startup' | 'resize',
      width: number,
      height: number,
      usage: 'texture-binding-copy-dst-render-attachment' | 'texture-binding-render-attachment'
    ) => ({
      lifecyclePhase,
      operationId: 'gpu-texture-request' as const,
      sourceLocationId: 'webgpu-driver:create-texture' as const,
      outcome: 'success' as const,
      byteKind: 'logical-texel-footprint' as const,
      byteValue: width * height * 4,
      textureDescriptor: {
        width,
        height,
        depth: 1,
        format: 'rgba8unorm' as const,
        usage,
        logicalTexelFootprint: width * height * 4
      }
    });
    const bufferRequest = (descriptorSize: number) => ({
      lifecyclePhase: 'startup' as const,
      operationId: 'gpu-buffer-request' as const,
      sourceLocationId: 'webgpu-driver:create-buffer' as const,
      outcome: 'success' as const,
      byteKind: 'descriptor-size' as const,
      byteValue: descriptorSize,
      descriptorSize
    });
    const startupLifecycleRequestProxies = [
      textureRequest('startup', 160, 144, 'texture-binding-copy-dst-render-attachment'),
      textureRequest('startup', 160, 144, 'texture-binding-render-attachment'),
      textureRequest('startup', 160, 144, 'texture-binding-render-attachment'),
      bufferRequest(64),
      bufferRequest(64),
      bufferRequest(64),
      bufferRequest(64)
    ];
    const resizeLifecycleRequestProxies = [
      textureRequest('resize', 320, 288, 'texture-binding-render-attachment'),
      textureRequest('resize', 320, 288, 'texture-binding-render-attachment')
    ];
    const worker = stubControlWorker({
      initialize: async () => ({
        backend: 'webgpu' as const,
        lifecycleRequestProxies: startupLifecycleRequestProxies
      }),
      resize: async () => ({ lifecycleRequestProxies: resizeLifecycleRequestProxies })
    });
    const observations: unknown[] = [];
    const canvas = {
      clientWidth: 160,
      clientHeight: 144,
      transferControlToOffscreen: () => ({ width: 160, height: 144, getContext: () => null })
    } as unknown as HTMLCanvasElement;

    const session = await createGpuVideoRendererSession({
      canvas,
      nativeResolution: { width: 160, height: 144 },
      preferredBackend: 'webgpu',
      createWorker: () => worker as unknown as Worker,
      capabilities: {
        webgpu: true,
        offscreenCanvas: true,
        transferControlToOffscreen: true,
        preferredBackend: 'webgpu',
        maxTextureSize: 4096
      },
      onPerformanceObservation: (observation) => observations.push(observation)
    });

    expect(observations).toEqual([{
      kind: 'worker-lifecycle-requests',
      lifecycleRequestProxies: startupLifecycleRequestProxies
    }]);

    session.resize(320, 288);
    await flush();

    expect(observations.at(-1)).toEqual({
      kind: 'worker-lifecycle-requests',
      lifecycleRequestProxies: resizeLifecycleRequestProxies
    });
    session.terminate();
  });
});
