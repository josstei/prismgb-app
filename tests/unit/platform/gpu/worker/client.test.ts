import { describe, expect, it, vi } from 'vitest';
import { WorkerRendererClient } from '../../../../../src/platform/gpu/worker/client';
import {
  CANVAS_HANDOFF_MESSAGE,
  WorkerMessageType,
  WorkerResponseType,
  createWorkerResponse
} from '../../../../../src/platform/gpu/worker/protocol';
import { createMockCanvas } from '@platform/gpu/testkit';
import { FakeWorker, flush, stubControlWorker } from './golden-harness';

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
  it('transfers canvas and resolves when the worker reports ready', async () => {
    const canvas = createMockCanvas() as unknown as HTMLCanvasElement;
    const transferControlToOffscreen = vi.spyOn(canvas, 'transferControlToOffscreen');
    let worker!: FakeWorker;
    const client = new WorkerRendererClient({
      createWorker: () => {
        worker = stubControlWorker();
        vi.spyOn(worker, 'postMessage');
        return worker as unknown as Worker;
      },
      logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn() }
    });

    await client.initialize(canvas, createConfig());

    expect(transferControlToOffscreen).toHaveBeenCalledTimes(1);
    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ channel: CANVAS_HANDOFF_MESSAGE }),
      [expect.objectContaining({ width: 160, height: 144 })]
    );
    expect(client.isReady()).toBe(true);
  });

  it('returns false instead of throwing when frame commands are sent before ready', () => {
    const worker = new FakeWorker();
    vi.spyOn(worker, 'postMessage');
    const client = new WorkerRendererClient({
      createWorker: () => worker as unknown as Worker,
      logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn() }
    });
    const imageBitmap = { close: vi.fn() } as unknown as ImageBitmap;

    expect(client.renderFrame(imageBitmap)).toBe(false);
    expect(worker.postMessage).not.toHaveBeenCalled();
  });

  it('rejects timed-out initialization and allows same-canvas reinitialization', async () => {
    const deadWorker = new FakeWorker();
    let attempt = 0;
    const client = new WorkerRendererClient({
      createWorker: () => {
        attempt += 1;
        return (attempt === 1 ? deadWorker : stubControlWorker()) as unknown as Worker;
      },
      logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn() }
    });
    const canvas = createMockCanvas() as unknown as HTMLCanvasElement;

    await expect(client.initialize(canvas, createConfig(), 10)).rejects.toThrow('Worker initialization timed out');
    expect(client.isReady()).toBe(false);

    await expect(client.initialize(canvas, createConfig(), 2000)).resolves.toBe(true);
    expect(client.isReady()).toBe(true);
  });

  it('dispatches typed callbacks and posts accepted frame commands', async () => {
    let worker!: FakeWorker;
    const client = new WorkerRendererClient({
      createWorker: () => {
        worker = stubControlWorker();
        vi.spyOn(worker, 'postMessage');
        return worker as unknown as Worker;
      },
      logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn() }
    });
    const canvas = createMockCanvas() as unknown as HTMLCanvasElement;
    const onFrameRendered = vi.fn();
    client.onMessage(WorkerResponseType.FRAME_RENDERED, onFrameRendered);

    await client.initialize(canvas, createConfig());

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
    const releaseSpy = vi.fn(async () => {});
    const destroySpy = vi.fn(async () => {});
    let worker!: FakeWorker;
    const client = new WorkerRendererClient({
      createWorker: () => {
        worker = stubControlWorker({ release: releaseSpy, destroy: destroySpy });
        vi.spyOn(worker, 'terminate');
        return worker as unknown as Worker;
      },
      logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn() }
    });
    const canvas = createMockCanvas() as unknown as HTMLCanvasElement;
    await client.initialize(canvas, createConfig());

    client.releaseResources();
    await flush();

    expect(releaseSpy).toHaveBeenCalledTimes(1);
    expect(worker.terminate).not.toHaveBeenCalled();
    expect(client.isReady()).toBe(false);

    client.dispose();
    await flush();

    expect(destroySpy).toHaveBeenCalledTimes(1);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(client.isCanvasTransferred()).toBe(false);
  });
});
