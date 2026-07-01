import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Canvas2DPipeline } from '@/infrastructure/canvas2d/canvas2d-pipeline';
import { getPackageDefaultPreset } from '@/application/preset-catalog';
import { createMockCanvas } from '@prismgb/gpu/testkit';

function createCanvas2DTestFixture() {
  const context = {
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    imageSmoothingEnabled: true
  };
  const canvas = createMockCanvas(160, 144, { '2d': context });

  return { canvas, context };
}

describe('Canvas2DPipeline', () => {
  beforeEach(() => {
    vi.stubGlobal('performance', {
      now: vi.fn(() => 0)
    });
  });

  it('keeps image smoothing disabled after resize resets canvas context state', async () => {
    const { canvas, context } = createCanvas2DTestFixture();
    const pipeline = new Canvas2DPipeline({
      canvas: canvas as unknown as HTMLCanvasElement,
      nativeWidth: 160,
      nativeHeight: 144,
      preset: getPackageDefaultPreset()
    });

    await pipeline.initialize();
    expect(context.imageSmoothingEnabled).toBe(false);

    context.imageSmoothingEnabled = true;
    pipeline.resize(320, 288);

    expect(canvas.width).toBe(320);
    expect(canvas.height).toBe(288);
    expect(context.imageSmoothingEnabled).toBe(false);

    await pipeline.dispose();
    expect(pipeline.isActive).toBe(false);
  });
});
