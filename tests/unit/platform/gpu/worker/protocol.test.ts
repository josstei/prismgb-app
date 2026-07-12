import { describe, expect, it } from 'vitest';
import {
  CANVAS_HANDOFF_MESSAGE,
  CONTROL_PORT_MESSAGE,
  WorkerMessageType,
  WorkerResponseType,
  createWorkerMessage,
  createWorkerResponse,
  isCanvasHandoffMessage,
  isControlPortMessage,
  isFrameErrorResponse,
  isFrameMessage,
  isFramePayload,
  isFrameRenderedResponse,
  isInstrumentedWorkerReadyPayload,
  isStatsResponse,
  isWorkerLifecycleRequestPayload,
  isWorkerReadyPayload
} from '../../../../../src/platform/gpu/worker/protocol';

function bitmap(): ImageBitmap {
  return { close: () => {} } as unknown as ImageBitmap;
}

function textureLifecycleRequest(
  lifecyclePhase: 'startup' | 'resize',
  width: number,
  height: number,
  usage: 'texture-binding-copy-dst-render-attachment' | 'texture-binding-render-attachment'
) {
  return {
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
  };
}

function bufferLifecycleRequest(descriptorSize: number) {
  return {
    lifecyclePhase: 'startup' as const,
    operationId: 'gpu-buffer-request' as const,
    sourceLocationId: 'webgpu-driver:create-buffer' as const,
    outcome: 'success' as const,
    byteKind: 'descriptor-size' as const,
    byteValue: descriptorSize,
    descriptorSize
  };
}

function startupLifecycleRequests() {
  return [
    textureLifecycleRequest('startup', 160, 144, 'texture-binding-copy-dst-render-attachment'),
    textureLifecycleRequest('startup', 640, 576, 'texture-binding-render-attachment'),
    textureLifecycleRequest('startup', 640, 576, 'texture-binding-render-attachment'),
    bufferLifecycleRequest(64),
    bufferLifecycleRequest(64),
    bufferLifecycleRequest(64),
    bufferLifecycleRequest(64)
  ];
}

describe('worker protocol', () => {
  it('creates typed frame-plane messages and responses with timestamps', () => {
    const message = createWorkerMessage(WorkerMessageType.FRAME, { imageBitmap: bitmap() });
    expect(message).toMatchObject({ type: WorkerMessageType.FRAME });
    expect(message.payload).toEqual({ imageBitmap: expect.any(Object) });
    expect(typeof message.timestamp).toBe('number');

    const rendered = createWorkerResponse(WorkerResponseType.FRAME_RENDERED);
    expect(rendered).toMatchObject({ type: WorkerResponseType.FRAME_RENDERED });
    expect(rendered.payload).toBeUndefined();
    expect(typeof rendered.timestamp).toBe('number');

    const stats = createWorkerResponse(WorkerResponseType.STATS, {
      fps: 60,
      frameTime: 16,
      gpuTime: 4,
      uploadTime: 2
    });
    expect(stats).toMatchObject({
      type: WorkerResponseType.STATS,
      payload: { fps: 60, frameTime: 16, gpuTime: 4, uploadTime: 2 }
    });
  });

  it('guards the surviving channel, frame, and response discriminants at the boundary', () => {
    const frameBitmap = bitmap();
    const frameMessage = createWorkerMessage(WorkerMessageType.FRAME, { imageBitmap: frameBitmap });

    expect(isFramePayload({ imageBitmap: frameBitmap })).toBe(true);
    expect(isFramePayload({ imageBitmap: frameBitmap, diagnosticFrameId: 1 })).toBe(false);
    expect(isFramePayload({})).toBe(false);
    expect(isFrameMessage(frameMessage)).toBe(true);
    expect(isFrameMessage({ type: WorkerMessageType.FRAME, payload: {} })).toBe(false);

    const port = {} as unknown as MessagePort;
    expect(isControlPortMessage({ channel: CONTROL_PORT_MESSAGE, port })).toBe(true);
    expect(isControlPortMessage({ channel: CANVAS_HANDOFF_MESSAGE })).toBe(false);

    const canvas = {} as unknown as OffscreenCanvas;
    expect(isCanvasHandoffMessage({ channel: CANVAS_HANDOFF_MESSAGE, canvas })).toBe(true);
    expect(isCanvasHandoffMessage({ channel: CONTROL_PORT_MESSAGE })).toBe(false);

    expect(isFrameRenderedResponse(createWorkerResponse(WorkerResponseType.FRAME_RENDERED))).toBe(true);
    expect(isStatsResponse(createWorkerResponse(WorkerResponseType.STATS, { fps: 1, frameTime: 1 }))).toBe(true);
    expect(isFrameErrorResponse({ type: WorkerResponseType.ERROR, payload: { message: 'boom' } })).toBe(true);
    expect(isFrameErrorResponse({ type: WorkerResponseType.ERROR, payload: {} })).toBe(false);
  });

  it('accepts only exact rich lifecycle control payloads in instrumented builds', () => {
    const startup = startupLifecycleRequests();
    const resize = [
      textureLifecycleRequest('resize', 320, 288, 'texture-binding-render-attachment'),
      textureLifecycleRequest('resize', 320, 288, 'texture-binding-render-attachment')
    ];

    expect(isWorkerReadyPayload({ backend: 'webgpu' })).toBe(true);
    expect(isInstrumentedWorkerReadyPayload({
      backend: 'webgpu',
      lifecycleRequestProxies: startup
    })).toBe(true);
    expect(isWorkerLifecycleRequestPayload({ lifecycleRequestProxies: resize })).toBe(true);

    expect(isInstrumentedWorkerReadyPayload({
      backend: 'webgpu',
      lifecycleRequestProxies: [...startup.slice(0, 3), bufferLifecycleRequest(64)]
    })).toBe(false);
    expect(isWorkerLifecycleRequestPayload({
      lifecycleRequestProxies: [resize[1], resize[0], resize[0]]
    })).toBe(false);
    expect(isWorkerLifecycleRequestPayload({
      lifecycleRequestProxies: [{ ...resize[0], lifecyclePhase: 'startup' }, resize[1]]
    })).toBe(false);
  });
});
