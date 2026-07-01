import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CanvasDriver } from '@/infrastructure/canvas.driver';
import { PipelineController } from '@/infrastructure/pipeline-controller';
import { getPackageDefaultPreset } from '@/application/catalog';
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

describe('CanvasDriver', () => {
  beforeEach(() => {
    vi.stubGlobal('performance', {
      now: vi.fn(() => 0)
    });
  });

  it('keeps image smoothing disabled after resize resets canvas context state', async () => {
    const { canvas, context } = createCanvas2DTestFixture();
    const renderer = new PipelineController({
      canvas: canvas as unknown as HTMLCanvasElement,
      nativeWidth: 160,
      nativeHeight: 144,
      preset: getPackageDefaultPreset()
    }, new CanvasDriver());

    await renderer.initialize();
    expect(context.imageSmoothingEnabled).toBe(false);

    context.imageSmoothingEnabled = true;
    renderer.resize(320, 288);

    expect(canvas.width).toBe(320);
    expect(canvas.height).toBe(288);
    expect(context.imageSmoothingEnabled).toBe(false);

    await renderer.dispose();
    expect(renderer.isActive).toBe(false);
  });
});
