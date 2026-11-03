import { beforeEach, describe, expect, it, vi } from 'vitest';
import { startWorkerRendererService, type WorkerRendererServiceScope } from '../../../../../src/platform/gpu/worker/service';
import { createWorkerMessage } from '../../../../../src/platform/gpu/worker/protocol';
import { createMockCanvas, createRenderPresetFixture } from '@platform/gpu/testkit';
const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('../../../../../src/platform/gpu/application/renderer.service', () => ({ createGpuRenderer: create }));
const bitmap = () => ({ close: vi.fn() } as unknown as ImageBitmap);
const renderer = { renderFrame: vi.fn(), captureFrame: vi.fn(), resize: vi.fn(), setPreset: vi.fn(), setBrightness: vi.fn() };
function fixture() {
  const scope: WorkerRendererServiceScope = { onmessage: null, postMessage: vi.fn() };
  startWorkerRendererService(scope);
  const send = (message: unknown) => scope.onmessage?.({ data: message } as MessageEvent);
  const initialize = () => send(createWorkerMessage('init', { canvas: createMockCanvas().transferControlToOffscreen(), config: { nativeWidth: 160, nativeHeight: 144, targetWidth: 640, targetHeight: 576, presetId: 'vibrant' } }));
  return { scope, send, initialize };
}
beforeEach(() => { create.mockResolvedValue(renderer); renderer.captureFrame.mockResolvedValue(bitmap()); });
describe('worker renderer ownership', () => {
  it('initializes directly and forwards rendering and controls', async () => {
    const { scope, send, initialize } = fixture();
    await initialize();
    const frame = bitmap();
    await send(createWorkerMessage('frame', { imageBitmap: frame }));
    const preset = createRenderPresetFixture();
    await send(createWorkerMessage('setPreset', { presetId: preset.id }));
    await send(createWorkerMessage('resize', { width: 640, height: 576 }));
    expect(renderer.renderFrame).toHaveBeenCalledWith(frame);
    expect(frame.close).toHaveBeenCalledTimes(1);
    expect(renderer.setPreset).toHaveBeenCalledWith(preset);
    expect(renderer.resize).toHaveBeenCalledWith(640, 576);
    expect(scope.postMessage).toHaveBeenCalledWith({ type: 'frameRendered', payload: undefined });
  });
  it('captures the next completed frame and transfers its ownership with the request id', async () => {
    const { scope, send, initialize } = fixture();
    await initialize();
    const captured = bitmap();
    renderer.captureFrame.mockResolvedValueOnce(captured);
    await send(createWorkerMessage('capture', { requestId: 7 }));
    expect(renderer.captureFrame).not.toHaveBeenCalled();
    await send(createWorkerMessage('frame', { imageBitmap: bitmap() }));
    expect(scope.postMessage).toHaveBeenCalledWith({ type: 'captureReady', payload: { requestId: 7, bitmap: captured } }, [captured]);
    expect(captured.close).not.toHaveBeenCalled();
  });
  it('serializes frame processing behind asynchronous initialization', async () => {
    const waiting = Promise.withResolvers<typeof renderer>();
    create.mockReturnValueOnce(waiting.promise);
    const { send, initialize } = fixture();
    const initializing = initialize();
    const frame = bitmap();
    const rendering = send(createWorkerMessage('frame', { imageBitmap: frame }));
    await Promise.resolve();
    expect(renderer.renderFrame).not.toHaveBeenCalled();
    waiting.resolve(renderer);
    await initializing;
    await rendering;
    expect(frame.close).toHaveBeenCalledTimes(1);
  });
  it('closes frame bitmaps and releases backpressure even when rendering fails', async () => {
    const { scope, send, initialize } = fixture();
    await initialize();
    renderer.renderFrame.mockImplementationOnce(() => { throw new Error('device lost'); });
    const frame = bitmap();
    await send(createWorkerMessage('frame', { imageBitmap: frame }));
    expect(frame.close).toHaveBeenCalledTimes(1);
    expect(scope.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
    expect(scope.postMessage).toHaveBeenCalledWith({ type: 'frameRendered', payload: undefined });
  });
  it('closes a captured bitmap if its transfer fails', async () => {
    const { scope, send, initialize } = fixture();
    await initialize();
    const captured = bitmap();
    renderer.captureFrame.mockResolvedValueOnce(captured);
    vi.mocked(scope.postMessage).mockImplementation((message) => { if ((message as {type:string}).type === 'captureReady') throw new Error('transfer failed'); });
    await send(createWorkerMessage('capture', { requestId: 8 }));
    await send(createWorkerMessage('frame', { imageBitmap: bitmap() }));
    expect(captured.close).toHaveBeenCalledTimes(1);
    expect(scope.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'error', payload: expect.objectContaining({ requestId: 8 }) }));
  });
});
