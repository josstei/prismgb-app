import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGpuVideoRendererSession } from '../../../../../src/platform/gpu/application/video-session';
import { createMockCanvas, createRenderCapabilitiesFixture } from '@platform/gpu/testkit';
import { createWorkerResponse } from '../../../../../src/platform/gpu/worker/protocol';
const bitmap = () => ({ close: vi.fn(), width: 640, height: 576 } as unknown as ImageBitmap);
function fixture() {
  const worker = { onmessage: null, onerror: null, postMessage: vi.fn(), terminate: vi.fn() } as unknown as Worker;
  const canvas = createMockCanvas() as unknown as HTMLCanvasElement;
  const emit = (data: unknown) => worker.onmessage?.({ data } as MessageEvent);
  const create = (signal?: AbortSignal) => createGpuVideoRendererSession({ canvas, nativeResolution: { width: 160, height: 144 }, createWorker: () => worker, capabilities: createRenderCapabilitiesFixture({ webgpu: true, transferControlToOffscreen: true, preferredBackend: 'webgpu' }), signal });
  const start = async () => { const session = create(); emit(createWorkerResponse('ready', { backend: 'webgpu' })); return session; };
  return { worker, canvas, emit, create, start };
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('GPU video session', () => {
  it('creates Canvas2D rendering without transferring the canvas', async () => {
    const drawImage = vi.fn();
    const canvas = createMockCanvas(160, 144, { '2d': { drawImage, imageSmoothingEnabled: true } }) as unknown as HTMLCanvasElement;
    const session = await createGpuVideoRendererSession({ canvas, nativeResolution: { width: 160, height: 144 }, preferredBackend: 'canvas2d', capabilities: createRenderCapabilitiesFixture() });
    await session.renderFrame({ readyState: 4, HAVE_CURRENT_DATA: 2 } as HTMLVideoElement);
    expect(drawImage).toHaveBeenCalled();
    expect(session.isCanvasTransferred).toBe(false);
    session.terminate();
    expect(session.isActive).toBe(false);
  });
  it('reports scaled dimensions and forwards brightness/preset', async () => {
    const { start, worker } = fixture();
    const session = await start();
    session.resize(640, 576);
    expect(session.getTargetDimensions()).toEqual({ width: 640, height: 576 });
    session.setBrightness(1.2);
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'setBrightness', payload: { brightness: 1.2 } }, []);
    session.setPreset('pixel');
    expect(worker.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'setPreset', payload: { preset: expect.objectContaining({ id: 'pixel' }) } }), []);
    session.terminate();
  });
  it('closes late capture replies and never lets them settle the next capture', async () => {
    vi.useFakeTimers();
    const { start, emit, worker } = fixture();
    const session = await start();
    const first = session.captureFrame();
    const rejected = expect(first).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(1000);
    await rejected;
    const second = session.captureFrame();
    const requests = vi.mocked(worker.postMessage).mock.calls.filter(([message]) => message.type === 'capture');
    const oldBitmap = bitmap();
    emit(createWorkerResponse('captureReady', { bitmap: oldBitmap, requestId: requests[0][0].payload.requestId }));
    expect(oldBitmap.close).toHaveBeenCalledTimes(1);
    const current = bitmap();
    emit(createWorkerResponse('captureReady', { bitmap: current, requestId: requests[1][0].payload.requestId }));
    await expect(second).resolves.toBe(current);
    expect(current.close).not.toHaveBeenCalled();
    current.close();
    session.terminate();
  });
  it('clears capture state when sending the request throws', async () => {
    const { start, worker, emit } = fixture();
    const session = await start();
    vi.mocked(worker.postMessage).mockImplementationOnce(() => { throw new Error('send failed'); });
    await expect(session.captureFrame()).rejects.toThrow('send failed');
    const next = session.captureFrame();
    const request = vi.mocked(worker.postMessage).mock.calls.at(-1)![0];
    const captured = bitmap();
    emit(createWorkerResponse('captureReady', { requestId: request.payload.requestId, bitmap: captured }));
    await expect(next).resolves.toBe(captured);
    captured.close();
    session.terminate();
  });
  it('rejects pending capture and terminates its worker on disposal', async () => {
    const { start, worker } = fixture();
    const session = await start();
    const capture = session.captureFrame();
    session.terminate();
    await expect(capture).rejects.toThrow('terminated');
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
  it('rolls back a worker if startup is aborted after canvas transfer', async () => {
    const { create, worker } = fixture();
    const abort = new AbortController();
    const started = create(abort.signal);
    abort.abort();
    await expect(started).rejects.toThrow();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
  it('reserves frame slots before bitmap creation and closes frames completing after termination', async () => {
    const { start } = fixture();
    const session = await start();
    const first = Promise.withResolvers<ImageBitmap>();
    const second = Promise.withResolvers<ImageBitmap>();
    const create = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    vi.stubGlobal('createImageBitmap', create);
    const video = { readyState: 4, HAVE_CURRENT_DATA: 2 } as HTMLVideoElement;
    const rendering1 = session.renderFrame(video);
    const rendering2 = session.renderFrame(video);
    await session.renderFrame(video);
    expect(create).toHaveBeenCalledTimes(2);
    session.terminate();
    const frame1 = bitmap(), frame2 = bitmap();
    first.resolve(frame1); second.resolve(frame2);
    await Promise.all([rendering1, rendering2]);
    expect(frame1.close).toHaveBeenCalledTimes(1);
    expect(frame2.close).toHaveBeenCalledTimes(1);
  });
});
