import { describe, expect, it, vi } from 'vitest';
import { createGpuVideoRendererSession } from '../../../../../src/platform/gpu/application/video-session.factory';
import type { RenderCapabilities } from '../../../../../src/platform/gpu/domain/types';
import { createMockCanvas, createRenderCapabilitiesFixture } from '@platform/gpu/testkit';

const { mockDetectBrowserGpuCapabilities } = vi.hoisted(() => ({
  mockDetectBrowserGpuCapabilities: vi.fn()
}));

vi.mock('../../../../../src/platform/gpu/infrastructure/capabilities.browser', () => ({
  detectBrowserGpuCapabilities: mockDetectBrowserGpuCapabilities
}));

const WEBGPU_CAPABILITIES = createRenderCapabilitiesFixture({
  webgpu: true,
  transferControlToOffscreen: true,
  preferredBackend: 'webgpu'
});

function createCanvas() {
  const canvas = createMockCanvas(160, 144, { '2d': { drawImage: vi.fn(), imageSmoothingEnabled: true } });
  vi.spyOn(canvas, 'getContext');
  vi.spyOn(canvas, 'transferControlToOffscreen');
  return canvas;
}

function createWorkerMock(): Worker {
  const worker = {
    onmessage: null as Worker['onmessage'],
    onerror: null,
    postMessage: vi.fn(() => {
      queueMicrotask(() => worker.onmessage?.call(worker as unknown as Worker, { data: { type: 'ready' } } as MessageEvent));
    }),
    terminate: vi.fn()
  };
  return worker as unknown as Worker;
}

async function createSession(capabilities: RenderCapabilities | undefined, preferredBackend?: 'webgpu' | 'canvas2d') {
  const canvas = createCanvas();
  const session = await createGpuVideoRendererSession({
    canvas: canvas as unknown as HTMLCanvasElement,
    nativeResolution: { width: 160, height: 144 },
    preferredBackend,
    capabilities,
    createWorker: createWorkerMock,
    logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() }
  });

  return { canvas, session };
}

describe('createGpuVideoRendererSession', () => {
  it('creates a WebGPU worker session when WebGPU and canvas transfer are available', async () => {
    const { canvas, session } = await createSession(WEBGPU_CAPABILITIES, 'webgpu');

    expect(session.backend).toBe('webgpu');
    expect(canvas.transferControlToOffscreen).toHaveBeenCalledTimes(1);
    expect(canvas.getContext).not.toHaveBeenCalled();
    session.terminate();
  });

  it('creates a Canvas2D session when canvas2d is preferred', async () => {
    const { canvas, session } = await createSession(WEBGPU_CAPABILITIES, 'canvas2d');

    expect(session.backend).toBe('canvas2d');
    expect(canvas.transferControlToOffscreen).not.toHaveBeenCalled();
    session.terminate();
  });

  it('creates a Canvas2D session when the canvas cannot be transferred', async () => {
    const { session } = await createSession({ ...WEBGPU_CAPABILITIES, transferControlToOffscreen: false }, 'webgpu');

    expect(session.backend).toBe('canvas2d');
    session.terminate();
  });

  it('detects browser capabilities when none are passed', async () => {
    mockDetectBrowserGpuCapabilities.mockResolvedValueOnce(createRenderCapabilitiesFixture({ webgpu: false }));

    const { session } = await createSession(undefined);

    expect(mockDetectBrowserGpuCapabilities).toHaveBeenCalledTimes(1);
    expect(session.backend).toBe('canvas2d');
    session.terminate();
  });

  it('refuses to fall back to Canvas2D when it is disallowed', async () => {
    const canvas = createCanvas();

    await expect(createGpuVideoRendererSession({
      canvas: canvas as unknown as HTMLCanvasElement,
      nativeResolution: { width: 160, height: 144 },
      capabilities: createRenderCapabilitiesFixture({ webgpu: false }),
      allowCanvas2D: false
    })).rejects.toThrow('No accelerated render backend available');
    expect(canvas.getContext).not.toHaveBeenCalled();
  });
});
