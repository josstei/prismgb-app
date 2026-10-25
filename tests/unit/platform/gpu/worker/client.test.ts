import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkerRendererClient } from '../../../../../src/platform/gpu/worker/client';
import { createWorkerResponse } from '../../../../../src/platform/gpu/worker/protocol';
import { createMockCanvas } from '@platform/gpu/testkit';

const config = { nativeWidth: 160, nativeHeight: 144, targetWidth: 640, targetHeight: 576, presetId: 'vibrant' };
function fixture() {
  const worker = { onmessage: null, onerror: null, postMessage: vi.fn(), terminate: vi.fn() } as unknown as Worker;
  const logger = { error: vi.fn(), info: vi.fn() };
  const client = new WorkerRendererClient({ createWorker: () => worker, logger });
  const canvas = createMockCanvas() as unknown as HTMLCanvasElement;
  const emit = (data: unknown) => worker.onmessage?.({ data } as MessageEvent);
  const start = async () => {
    const ready = client.initialize(canvas, config);
    emit(createWorkerResponse('ready'));
    await ready;
  };
  return { worker, client, canvas, emit, logger, start };
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('worker resource ownership', () => {
  it('creates and transfers frames only after readiness and disposes the worker once', async () => {
    const { worker, client, canvas, start } = fixture();
    const frame = { close: vi.fn() } as unknown as ImageBitmap;
    const createBitmap = vi.fn(async () => frame);
    vi.stubGlobal('createImageBitmap', createBitmap);
    const video = {} as HTMLVideoElement;
    await client.renderFrame(video);
    expect(createBitmap).not.toHaveBeenCalled();
    await start();
    await client.renderFrame(video);
    expect(worker.postMessage).toHaveBeenLastCalledWith({ type: 'frame', payload: { imageBitmap: frame } }, [frame]);
    expect(frame.close).not.toHaveBeenCalled();
    await expect(client.initialize(canvas, config)).rejects.toThrow('single-use');
    await client.dispose();
    await client.dispose();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('terminates timed out initialization and never reuses a transferred canvas', async () => {
    vi.useFakeTimers();
    const { worker, client, canvas } = fixture();
    const ready = client.initialize(canvas, config, 10);
    const rejected = expect(ready).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(10);
    await rejected;
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    await expect(client.captureFrame()).rejects.toThrow('not ready');
    await expect(client.initialize(canvas, config)).rejects.toThrow('single-use');
  });

  it('rejects readiness and terminates when initialization transfer throws', async () => {
    const { worker, client, canvas } = fixture();
    vi.mocked(worker.postMessage).mockImplementation(() => { throw new Error('transfer failed'); });
    await expect(client.initialize(canvas, config)).rejects.toThrow('transfer failed');
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('rejects in-flight capture and disables further work after a worker crash', async () => {
    const { worker, client, start, logger } = fixture();
    await start();
    const capture = client.captureFrame();
    worker.onerror?.({ message: 'crashed' } as ErrorEvent);
    await expect(capture).rejects.toThrow('crashed');
    expect(logger.error).toHaveBeenCalledWith('Worker error:', 'crashed');
    await expect(client.captureFrame()).rejects.toThrow('not ready');
    await client.dispose();
  });

  it('keeps capture single-flight and ignores stale request errors', async () => {
    const { client, worker, emit, start } = fixture();
    await start();
    const capture = client.captureFrame();
    await expect(client.captureFrame()).rejects.toThrow('already in progress');
    const { requestId } = vi.mocked(worker.postMessage).mock.calls.at(-1)![0].payload;
    emit(createWorkerResponse('error', { message: 'old error', requestId: requestId - 1 }));
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
    emit(createWorkerResponse('captureReady', { bitmap, requestId }));
    await expect(capture).resolves.toBe(bitmap);
    expect(bitmap.close).not.toHaveBeenCalled();
    bitmap.close();
    await client.dispose();
  });

  it('closes failed transfers and releases the frame reservation for the next frame', async () => {
    const { client, worker, start } = fixture();
    await start();
    const failed = { close: vi.fn() } as unknown as ImageBitmap;
    const next = { close: vi.fn() } as unknown as ImageBitmap;
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValueOnce(failed).mockResolvedValueOnce(next));
    vi.mocked(worker.postMessage).mockImplementationOnce(() => { throw new Error('transfer failed'); });
    await client.renderFrame({} as HTMLVideoElement);
    expect(failed.close).toHaveBeenCalledOnce();
    await client.renderFrame({} as HTMLVideoElement);
    expect(worker.postMessage).toHaveBeenLastCalledWith({ type: 'frame', payload: { imageBitmap: next } }, [next]);
    expect(next.close).not.toHaveBeenCalled();
    await client.dispose();
  });
});
