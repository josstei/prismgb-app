import { describe, expect, it, vi } from 'vitest';
import { createMockCanvas } from '@platform/gpu/testkit';

vi.mock('../../../../../src/platform/gpu/infrastructure/capabilities.browser', () => {
  throw new Error('browser capabilities imported');
});

vi.mock('../../../../../src/platform/gpu/infrastructure/webgpu.driver', () => {
  throw new Error('webgpu driver imported');
});

describe('createGpuRenderer import safety', () => {
  it('does not import browser capability or accelerated backend modules through the public runtime path', async () => {
    const { createGpuVideoRendererSession } = await import('@platform/gpu/runtime');
    const canvas = createMockCanvas(160, 144, {
      '2d': {
        drawImage: vi.fn(),
        fillRect: vi.fn(),
        imageSmoothingEnabled: true
      }
    }) as unknown as HTMLCanvasElement;

    const session = await createGpuVideoRendererSession({
      canvas,
      nativeResolution: { width: 160, height: 144 },
      backend: 'canvas2d'
    });

    expect(session.isActive).toBe(true);

    session.terminate();
  });
});
