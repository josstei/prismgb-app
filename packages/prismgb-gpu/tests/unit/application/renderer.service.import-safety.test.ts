import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockCanvas } from '@prismgb/gpu/testkit';

vi.mock('@/infrastructure/capabilities.browser', () => {
  throw new Error('browser capabilities imported');
});

vi.mock('@/infrastructure/webgpu.driver', () => {
  throw new Error('webgpu driver imported');
});

describe('createGpuRenderer import safety', () => {
  beforeEach(() => {
    vi.stubGlobal('performance', {
      now: vi.fn(() => 0)
    });
  });

  it('does not import browser capability or accelerated backend modules through the public runtime path', async () => {
    const { createGpuVideoRendererSession } = await import('@prismgb/gpu/runtime');
    const canvas = createMockCanvas(160, 144, {
      '2d': {
        drawImage: vi.fn(),
        fillRect: vi.fn(),
        imageSmoothingEnabled: true
      }
    });

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

    await session.dispose();
  });
});
