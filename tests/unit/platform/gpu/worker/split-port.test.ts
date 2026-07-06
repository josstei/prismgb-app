import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkerRendererClient } from '../../../../../src/platform/gpu/worker/client';
import { startWorkerRendererService } from '../../../../../src/platform/gpu/worker/service';
import {
  CANVAS_HANDOFF_MESSAGE,
  CONTROL_PORT_MESSAGE,
  WorkerMessageType,
  WorkerResponseType
} from '../../../../../src/platform/gpu/worker/protocol';
import {
  createRecordingDriver,
  makeDeterministicFrame,
  FakeWorker,
  flush,
  type WorkerServiceScope
} from './golden-harness';

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

const PRESET = { id: 'authentic' } as never;

function config() {
  return {
    nativeWidth: 160, nativeHeight: 144, targetWidth: 640, targetHeight: 576,
    scaleFactor: 4, backend: 'webgpu' as const, presetId: 'vibrant'
  };
}
function mockCanvas() {
  const offscreen = { width: 160, height: 144, getContext: () => null };
  return { width: 160, height: 144, getContext: () => null, transferControlToOffscreen: () => offscreen } as unknown as HTMLCanvasElement;
}

describe('split-port transport separation', () => {
  beforeEach(() => { mockResolvePreset.mockReturnValue(PRESET); });

  it('(a) routes FRAME over raw worker.postMessage and control over the comlink port', async () => {
    const driver = createRecordingDriver(mockCreateGpuRenderer);
    const worker = new FakeWorker();
    startWorkerRendererService(worker.scope as unknown as WorkerServiceScope);

    const mainChannel: unknown[] = [];
    const originalPost = worker.postMessage.bind(worker);
    worker.postMessage = (message: unknown) => { mainChannel.push(message); originalPost(message); };

    const client = new WorkerRendererClient({
      createWorker: () => worker as unknown as Worker,
      logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn() }
    });

    await client.initialize(mockCanvas(), config(), 5000);
    await flush();
    client.setPreset('authentic', PRESET);
    client.setBrightness(1.25);
    client.resize(320, 288, 2);
    await flush();
    client.renderFrame(makeDeterministicFrame(1));
    await flush(3);

    const types = mainChannel.map((m) => {
      const r = m as { type?: string; channel?: string };
      return r.type ?? r.channel ?? 'unknown';
    });

    // The raw main channel carries ONLY the canvas handoff and FRAME envelopes.
    expect(types).toContain(CANVAS_HANDOFF_MESSAGE);
    expect(types).toContain(WorkerMessageType.FRAME);
    // No control-plane op ever appears on the raw channel.
    expect(types).not.toContain('setPreset');
    expect(types).not.toContain('resize');
    expect(types).not.toContain('setBrightness');
    expect(types).not.toContain('init');
    expect(mainChannel.filter((m) => (m as { type?: string }).type === WorkerMessageType.FRAME).length).toBe(1);

    // Control effects still reached the service — proving they traversed the comlink port.
    expect(driver.record).toContain('setPreset:authentic');
    expect(driver.record).toContain('setBrightness:1.25');
    expect(driver.record).toContain('resize:320x288');

    // "byte-for-byte" frame envelope: exact shape crossing the raw channel.
    const frameEnvelope = mainChannel.find((m) => (m as { type?: string }).type === WorkerMessageType.FRAME) as {
      type: string; payload: { imageBitmap: { sig: string } }; timestamp: number;
    };
    expect(frameEnvelope.type).toBe('frame');
    expect(typeof frameEnvelope.timestamp).toBe('number');
    expect(frameEnvelope.payload.imageBitmap.sig).toBe((makeDeterministicFrame(1) as unknown as { sig: string }).sig);
    client.dispose();
  });

  it('(a/b) capture request rides comlink and the captured transferable returns over the control port', async () => {
    const driver = createRecordingDriver(mockCreateGpuRenderer);
    const worker = new FakeWorker();
    startWorkerRendererService(worker.scope as unknown as WorkerServiceScope);

    const mainChannel: unknown[] = [];
    const originalPost = worker.postMessage.bind(worker);
    worker.postMessage = (message: unknown) => { mainChannel.push(message); originalPost(message); };

    const client = new WorkerRendererClient({
      createWorker: () => worker as unknown as Worker,
      logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn() }
    });
    await client.initialize(mockCanvas(), config(), 5000);
    await flush();

    let captured: { bitmap: ArrayBuffer } | null = null;
    client.onCaptureReady((payload) => { captured = payload as unknown as { bitmap: ArrayBuffer }; });

    client.requestCapture();     // comlink: sets captureRequested on the service
    await flush();
    client.renderFrame(makeDeterministicFrame(1)); // raw channel: populates capturedFrame
    await flush(3);
    client.requestCapturedFrame(); // comlink: returns Comlink.transfer(bitmap)
    await flush(4);

    // requestCapture never appeared on the raw channel (rode comlink).
    const rawTypes = mainChannel.map((m) => (m as { type?: string; channel?: string }).type ?? (m as { channel?: string }).channel);
    expect(rawTypes).not.toContain('requestCapture');
    expect(rawTypes).not.toContain('capture');
    // The captured transferable arrived intact over the control port.
    expect(captured).not.toBeNull();
    expect(Array.from(new Uint8Array(captured!.bitmap))).toEqual([9, 8, 7, 6]);
    expect(driver.record).toContain('create:160x144');
    client.dispose();
  });

  it('posts a frame-plane ERROR on the raw channel when a render throws', async () => {
    createRecordingDriver(mockCreateGpuRenderer);
    mockCreateGpuRenderer.mockImplementationOnce(async () => ({
      backend: 'webgpu',
      renderFrame: () => {
        throw new Error('boom');
      },
      resize: () => {},
      captureFrame: async () => new Uint8Array([9, 8, 7, 6]).buffer,
      getStats: () => ({ fps: 0, frameTime: 0 }),
      dispose: async () => {},
      setPreset: () => {},
      setBrightness: () => {}
    }));

    const worker = new FakeWorker();
    const mainChannel: unknown[] = [];
    const scope = worker.scope as unknown as WorkerServiceScope;
    const originalScopePost = scope.postMessage.bind(scope);
    scope.postMessage = (message: unknown, transfer?: Transferable[]) => {
      mainChannel.push(message);
      originalScopePost(message, transfer);
    };
    startWorkerRendererService(scope);

    const client = new WorkerRendererClient({
      createWorker: () => worker as unknown as Worker,
      logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn() }
    });
    await client.initialize(mockCanvas(), config(), 5000);
    await flush();

    client.renderFrame(makeDeterministicFrame(1));
    await flush(3);

    const errorResponse = mainChannel.find(
      (m) => (m as { type?: string }).type === WorkerResponseType.ERROR
    ) as { type: string; payload: { code?: string }; timestamp: number } | undefined;

    expect(errorResponse).toBeDefined();
    expect(errorResponse?.payload.code).toBe('FRAME_RENDER_FAILED');
    client.dispose();
  });

  it('the service emits exactly one control-port handoff on the raw channel', async () => {
    createRecordingDriver(mockCreateGpuRenderer);
    const worker = new FakeWorker();
    const handoffs: unknown[] = [];
    const scope = worker.scope as unknown as WorkerServiceScope;
    const originalScopePost = scope.postMessage.bind(scope);
    scope.postMessage = (message: unknown, transfer?: Transferable[]) => {
      if ((message as { channel?: string }).channel === CONTROL_PORT_MESSAGE) handoffs.push(message);
      originalScopePost(message, transfer);
    };
    startWorkerRendererService(scope);
    await flush();
    expect(handoffs.length).toBe(1);
  });
});
