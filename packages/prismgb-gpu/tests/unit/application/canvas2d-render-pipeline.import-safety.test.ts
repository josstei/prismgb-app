import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockCanvas } from '@prismgb/gpu/testkit';

vi.mock('@/infrastructure/capabilities.browser', () => {
  throw new Error('browser capabilities imported');
});

vi.mock('@/infrastructure/webgl2/webgl2-pipeline', () => {
  throw new Error('webgl2 pipeline imported');
});

vi.mock('@/infrastructure/webgpu/webgpu-pipeline', () => {
  throw new Error('webgpu pipeline imported');
});

describe('createCanvas2DRenderPipeline import safety', () => {
  beforeEach(() => {
    vi.stubGlobal('performance', {
      now: vi.fn(() => 0)
    });
  });

  it('does not import browser capability or accelerated backend modules through the public runtime path', async () => {
    const { createCanvas2DRenderPipeline } = await import('@prismgb/gpu/runtime');
    const canvas = createMockCanvas(160, 144, {
      '2d': {
        drawImage: vi.fn(),
        fillRect: vi.fn(),
        imageSmoothingEnabled: true
      }
    });

    const pipeline = await createCanvas2DRenderPipeline({
      canvas,
      nativeWidth: 160,
      nativeHeight: 144
    });

    expect(pipeline.isInitialized).toBe(true);

    await pipeline.dispose();
  });
});
