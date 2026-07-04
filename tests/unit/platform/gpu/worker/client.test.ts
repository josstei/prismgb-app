import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkerRendererClient } from '../../../../../src/platform/gpu/worker/client';
import { WorkerMessageType, WorkerResponseType, createWorkerResponse } from '../../../../../src/platform/gpu/worker/protocol';
import { createMockCanvas } from '@platform/gpu/testkit';

function createWorkerMock(): Worker {
  return {
    onmessage: null,
    onerror: null,
    postMessage: vi.fn(),
    terminate: vi.fn()
  } as unknown as Worker;
}

function createConfig() {
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

describe('WorkerRendererClient', () => {
  let worker: Worker;
  let client: WorkerRendererClient;

  beforeEach(() => {
    worker = createWorkerMock();
    client = new WorkerRendererClient({
      createWorker: () => worker,
      logger: {
        debug: vi.fn(),
        error: vi.fn(),
        info: vi.fn()
      }
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('transfers canvas and resolves when the worker reports ready', async () => {
    const canvas = createMockCanvas() as unknown as HTMLCanvasElement;
    const transferControlToOffscreen = vi.spyOn(canvas, 'transferControlToOffscreen');
    const initializePromise = client.initialize(canvas, createConfig());

    worker.onmessage?.({ data: createWorkerResponse(WorkerResponseType.READY, { backend: 'webgpu' }) } as MessageEvent);

    await initializePromise;

    expect(transferControlToOffscreen).toHaveBeenCalledTimes(1);
    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: WorkerMessageType.INIT }),
      [expect.objectContaining({ width: 160, height: 144 })]
    );
    expect(client.isReady()).toBe(true);
  });

  it('returns false instead of throwing when frame commands are sent before ready', () => {
    const imageBitmap = { close: vi.fn() } as unknown as ImageBitmap;

    expect(client.renderFrame(imageBitmap)).toBe(false);
    expect(worker.postMessage).not.toHaveBeenCalled();
  });

  it('rejects timed-out initialization and allows same-canvas reinitialization', async () => {
    vi.useFakeTimers();
    const canvas = createMockCanvas() as unknown as HTMLCanvasElement;
    const initializePromise = client.initialize(canvas, createConfig(), 50);
    const initializationExpectation = expect(initializePromise).rejects.toThrow('Worker initialization timed out');

    await vi.advanceTimersByTimeAsync(50);
    await initializationExpectation;
    expect(client.isReady()).toBe(false);

    const reinitializePromise = client.initialize(canvas, createConfig(), 50);
    worker.onmessage?.({ data: createWorkerResponse(WorkerResponseType.READY, { backend: 'webgpu' }) } as MessageEvent);

    await expect(reinitializePromise).resolves.toBe(true);
    expect(worker.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: WorkerMessageType.INIT })
    );
    expect(client.isReady()).toBe(true);
  });

  it('dispatches typed callbacks and posts accepted frame commands', async () => {
    const canvas = createMockCanvas() as unknown as HTMLCanvasElement;
    const onFrameRendered = vi.fn();
    client.onMessage(WorkerResponseType.FRAME_RENDERED, onFrameRendered);

    const initializePromise = client.initialize(canvas, createConfig());
    worker.onmessage?.({ data: createWorkerResponse(WorkerResponseType.READY, { backend: 'webgpu' }) } as MessageEvent);
    await initializePromise;

    const imageBitmap = { close: vi.fn() } as unknown as ImageBitmap;
    expect(client.renderFrame(imageBitmap)).toBe(true);
    worker.onmessage?.({ data: createWorkerResponse(WorkerResponseType.FRAME_RENDERED) } as MessageEvent);

    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: WorkerMessageType.FRAME }),
      [imageBitmap]
    );
    expect(onFrameRendered).toHaveBeenCalledWith(undefined);
  });

  it('releases resources without terminating and fully terminates on dispose', async () => {
    const canvas = createMockCanvas() as unknown as HTMLCanvasElement;
    const initializePromise = client.initialize(canvas, createConfig());
    worker.onmessage?.({ data: createWorkerResponse(WorkerResponseType.READY, { backend: 'webgpu' }) } as MessageEvent);
    await initializePromise;

    client.releaseResources();

    expect(worker.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: WorkerMessageType.RELEASE }));
    expect(worker.terminate).not.toHaveBeenCalled();
    expect(client.isReady()).toBe(false);

    client.dispose();

    expect(worker.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: WorkerMessageType.DESTROY }));
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(client.isCanvasTransferred()).toBe(false);
  });
});
