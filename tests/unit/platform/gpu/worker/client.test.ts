import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkerRendererClient } from '../../../../../src/platform/gpu/worker/client';
import { createWorkerResponse } from '../../../../../src/platform/gpu/worker/protocol';
import { createMockCanvas } from '@platform/gpu/testkit';
const config = { nativeWidth: 160, nativeHeight: 144, targetWidth: 640, targetHeight: 576, backend: 'webgpu' as const, presetId: 'vibrant' };
function fixture() {
  const worker = { onmessage: null, onerror: null, postMessage: vi.fn(), terminate: vi.fn() } as unknown as Worker;
  const client = new WorkerRendererClient({ createWorker: () => worker, logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn() } });
  const canvas = createMockCanvas() as unknown as HTMLCanvasElement;
  const emit = (data: unknown) => worker.onmessage?.({ data } as MessageEvent);
  return { worker, client, canvas, emit };
}
afterEach(() => vi.useRealTimers());
describe('single-use worker client', () => {
  it('transfers canvas once and transfers frame ownership only after ready', async () => {
    const { worker, client, canvas, emit } = fixture();
    const frame = { close: vi.fn() } as unknown as ImageBitmap;
    expect(client.renderFrame(frame)).toBe(false);
    const ready = client.initialize(canvas, config);
    emit(createWorkerResponse('ready', { backend: 'webgpu' }));
    await ready;
    expect(client.renderFrame(frame)).toBe(true);
    expect(worker.postMessage).toHaveBeenLastCalledWith({ type: 'frame', payload: { imageBitmap: frame } }, [frame]);
    expect(frame.close).not.toHaveBeenCalled();
    await expect(client.initialize(canvas, config)).rejects.toThrow('single-use');
    client.terminate();
    client.terminate();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
  it('terminates failed initialization and does not reuse a transferred canvas', async () => {
    vi.useFakeTimers();
    const { worker, client, canvas } = fixture();
    const ready = client.initialize(canvas, config, 10);
    const rejected = expect(ready).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(10);
    await rejected;
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(client.isReady()).toBe(false);
    await expect(client.initialize(canvas, config)).rejects.toThrow('single-use');
  });
  it('rejects readiness and terminates when postMessage throws', async () => {
    const { worker, client, canvas } = fixture();
    vi.mocked(worker.postMessage).mockImplementation(() => { throw new Error('transfer failed'); });
    await expect(client.initialize(canvas, config)).rejects.toThrow('transfer failed');
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
  it('reports worker crashes to subscribers after readiness', async () => {
    const { worker, client, canvas, emit } = fixture();
    const error = vi.fn();
    client.onError(error);
    const ready = client.initialize(canvas, config);
    emit(createWorkerResponse('ready', { backend: 'webgpu' }));
    await ready;
    worker.onerror?.({ message: 'crashed' } as ErrorEvent);
    expect(error).toHaveBeenCalledWith({ message: 'crashed', code: 'WORKER_FAILED' });
    expect(client.isReady()).toBe(false);
    client.terminate();
  });
});
