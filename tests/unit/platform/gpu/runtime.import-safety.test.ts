import { describe, expect, it, vi } from 'vitest';
import { createMockCanvas } from '@platform/gpu/testkit';

vi.mock('../../../../src/platform/gpu/infrastructure/capabilities.browser', () => {
  throw new Error('browser capabilities imported');
});

vi.mock('../../../../src/platform/gpu/infrastructure/webgpu.driver', () => {
  throw new Error('webgpu driver imported');
});

vi.mock('../../../../src/platform/gpu/infrastructure/webgpu-passes.definitions', () => {
  throw new Error('webgpu pass table imported');
});

describe('@platform/gpu/runtime import safety', () => {
  it('creates a Canvas2D session without importing browser capability detection, the WebGPU driver or its pass table', async () => {
    const { createGpuVideoRendererSession } = await import('@platform/gpu/runtime');
    const canvas = createMockCanvas(160, 144, {
      '2d': {
        drawImage: vi.fn(),
        imageSmoothingEnabled: true
      }
    }) as unknown as HTMLCanvasElement;

    const session = await createGpuVideoRendererSession({
      canvas,
      nativeResolution: { width: 160, height: 144 },
      preferredBackend: 'canvas2d',
      allowCanvas2D: true,
      capabilities: {
        webgpu: false,
        offscreenCanvas: false,
        transferControlToOffscreen: false,
        preferredBackend: 'canvas2d',
        maxTextureSize: 4096
      }
    });

    expect(session.isActive).toBe(true);

    session.terminate();
  });
});
