import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkerRendererClient } from '../../../../../src/platform/gpu/worker/client';
import { startWorkerRendererService } from '../../../../../src/platform/gpu/worker/runtime';
import {
  WorkerMessageType,
  WorkerResponseType,
  createWorkerMessage,
  isFrameMessage,
  isFrameRenderedResponse,
  isPerformanceHarnessBuild
} from '../../../../../src/platform/gpu/worker/protocol';
import {
  FakeWorker,
  createRecordingDriver,
  flush,
  makeDeterministicFrame,
  stubControlWorker,
  type WorkerServiceScope
} from '../../../platform/gpu/worker/golden-harness';

const { mockCreateGpuRenderer, mockResolvePreset } = vi.hoisted(() => ({
  mockCreateGpuRenderer: vi.fn(),
  mockResolvePreset: vi.fn()
}));

vi.mock('../../../../../src/platform/gpu/application/renderer.service', () => ({
  createGpuRenderer: mockCreateGpuRenderer
}));
vi.mock('../../../../../src/platform/gpu/application/catalog', () => ({
  resolvePreset: mockResolvePreset
}));

const PRESET = { id: 'vibrant' } as never;

function config() {
  return {
    nativeWidth: 160,
    nativeHeight: 144,
    targetWidth: 640,
    targetHeight: 576,
    scaleFactor: 4,
    backend: 'webgpu' as const,
    presetId: 'vibrant'
  };
}

function mockCanvas(): HTMLCanvasElement {
  const offscreen = { width: 160, height: 144, getContext: () => null };
  return {
    width: 160,
    height: 144,
    getContext: () => null,
    transferControlToOffscreen: () => offscreen
  } as unknown as HTMLCanvasElement;
}

describe('harness worker frame-token acknowledgement', () => {
  beforeEach(() => {
    mockResolvePreset.mockReturnValue(PRESET);
  });

  it('echoes a positive raw FRAME token with the queue-submit disposition', async () => {
    expect(isPerformanceHarnessBuild).toBe(true);
    const driver = createRecordingDriver(mockCreateGpuRenderer);
    const worker = new FakeWorker();
    const rawOutbound: unknown[] = [];
    const rawInbound: unknown[] = [];
    const originalPostMessage = worker.postMessage.bind(worker);
    worker.postMessage = (message: unknown) => {
      rawOutbound.push(message);
      originalPostMessage(message);
    };
    worker.addEventListener('message', (event) => rawInbound.push(event.data));
    startWorkerRendererService(worker.scope as unknown as WorkerServiceScope);

    const client = new WorkerRendererClient({
      createWorker: () => worker as unknown as Worker,
      logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn() }
    });
    const onFrameRendered = vi.fn();
    client.onFrameRendered(onFrameRendered);

    await client.initialize(mockCanvas(), config());
    const frame = makeDeterministicFrame(1);
    expect(client.renderFrame(frame, 1)).toBe(true);
    await flush(3);

    const frameMessage = rawOutbound.find(
      (message) => (message as { type?: string }).type === WorkerMessageType.FRAME
    ) as { payload: { imageBitmap: ImageBitmap; frameToken: number } } | undefined;
    expect(frameMessage?.payload).toEqual({ imageBitmap: frame, frameToken: 1 });
    expect(Object.keys(frameMessage!.payload)).toEqual(['imageBitmap', 'frameToken']);

    const acknowledgement = rawInbound.find(
      (message) => (message as { type?: string }).type === WorkerResponseType.FRAME_RENDERED
    ) as { payload: unknown } | undefined;
    expect(acknowledgement?.payload).toEqual({
      frameToken: 1,
      outcome: 'webgpu-queue-submit-completed'
    });
    expect(Object.keys(acknowledgement!.payload as object)).toEqual(['frameToken', 'outcome']);
    expect(onFrameRendered).toHaveBeenCalledWith({
      frameToken: 1,
      outcome: 'webgpu-queue-submit-completed'
    });
    expect(driver.record.some((entry) => entry.startsWith('render:'))).toBe(true);
    client.dispose();
  });

  it('rejects malformed harness FRAME and acknowledgement payloads at the protocol boundary', () => {
    const frame = makeDeterministicFrame(2);

    expect(isFrameMessage({ type: WorkerMessageType.FRAME, payload: { imageBitmap: frame } })).toBe(false);
    expect(isFrameMessage({ type: WorkerMessageType.FRAME, payload: { imageBitmap: frame, frameToken: 0 } })).toBe(false);
    expect(isFrameMessage({ type: WorkerMessageType.FRAME, payload: { imageBitmap: frame, frameToken: 1.5 } })).toBe(false);
    expect(isFrameMessage({
      type: WorkerMessageType.FRAME,
      payload: { imageBitmap: frame, frameToken: 1, timestamp: 0 }
    })).toBe(false);

    expect(isFrameRenderedResponse({ type: WorkerResponseType.FRAME_RENDERED, timestamp: 0 })).toBe(false);
    expect(isFrameRenderedResponse({
      type: WorkerResponseType.FRAME_RENDERED,
      payload: { frameToken: 1, outcome: 'display-completed' },
      timestamp: 0
    })).toBe(false);
    expect(isFrameRenderedResponse({
      type: WorkerResponseType.FRAME_RENDERED,
      payload: { frameToken: 1, outcome: 'webgpu-queue-submit-completed', timestamp: 0 },
      timestamp: 0
    })).toBe(false);
  });

  it('rejects missing, duplicate, and unknown client token acknowledgements', async () => {
    let worker!: FakeWorker;
    const logger = { debug: vi.fn(), error: vi.fn(), info: vi.fn() };
    const client = new WorkerRendererClient({
      createWorker: () => {
        worker = stubControlWorker();
        return worker as unknown as Worker;
      },
      logger
    });
    const onFrameRendered = vi.fn();
    client.onFrameRendered(onFrameRendered);
    await client.initialize(mockCanvas(), config());

    expect(client.renderFrame(makeDeterministicFrame(3))).toBe(false);
    expect(client.renderFrame(makeDeterministicFrame(4), 0)).toBe(false);
    expect(client.renderFrame(makeDeterministicFrame(5), 1)).toBe(true);
    expect(client.renderFrame(makeDeterministicFrame(6), 1)).toBe(false);
    expect(client.renderFrame(makeDeterministicFrame(7), 2)).toBe(true);

    worker.onmessage?.({
      data: {
        type: WorkerResponseType.FRAME_RENDERED,
        payload: { frameToken: 3, outcome: 'webgpu-queue-submit-completed' },
        timestamp: 0
      }
    } as MessageEvent);
    worker.onmessage?.({
      data: {
        type: WorkerResponseType.FRAME_RENDERED,
        payload: { frameToken: 1, outcome: 'webgpu-queue-submit-completed', timestamp: 0 },
        timestamp: 0
      }
    } as MessageEvent);

    expect(onFrameRendered).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith('Worker frame acknowledgement used an unknown frame token');
    expect(logger.error).toHaveBeenCalledWith('Worker frame acknowledgement did not match the harness protocol');
    client.dispose();
  });

  it('rejects a duplicate raw FRAME token before rerendering it', async () => {
    const driver = createRecordingDriver(mockCreateGpuRenderer);
    const worker = new FakeWorker();
    const rawInbound: unknown[] = [];
    worker.addEventListener('message', (event) => rawInbound.push(event.data));
    startWorkerRendererService(worker.scope as unknown as WorkerServiceScope);

    const client = new WorkerRendererClient({
      createWorker: () => worker as unknown as Worker,
      logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn() }
    });
    await client.initialize(mockCanvas(), config());

    worker.postMessage(createWorkerMessage(WorkerMessageType.FRAME, {
      imageBitmap: makeDeterministicFrame(8),
      frameToken: 1
    }));
    worker.postMessage(createWorkerMessage(WorkerMessageType.FRAME, {
      imageBitmap: makeDeterministicFrame(9),
      frameToken: 1
    }));
    await flush(3);

    expect(driver.record.filter((entry) => entry.startsWith('render:'))).toHaveLength(1);
    expect(rawInbound).toContainEqual(expect.objectContaining({
      type: WorkerResponseType.ERROR,
      payload: expect.objectContaining({ code: 'FRAME_TOKEN_REJECTED' })
    }));
    client.dispose();
  });
});
