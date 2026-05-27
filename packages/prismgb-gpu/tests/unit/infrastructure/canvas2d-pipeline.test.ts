import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Canvas2DPipeline } from '@/infrastructure/canvas2d/canvas2d-pipeline';
import { BUILT_IN_PRESETS, PresetRegistry } from '@/domain/presets';

PresetRegistry.registerMany(BUILT_IN_PRESETS);

function createCanvasMock() {
  const context = {
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    imageSmoothingEnabled: true
  };
  const canvas = {
    width: 160,
    height: 144,
    getContext: vi.fn(() => context)
  };

  return { canvas, context };
}

describe('Canvas2DPipeline', () => {
  beforeEach(() => {
    vi.stubGlobal('performance', {
      now: vi.fn(() => 0)
    });
  });

  it('keeps image smoothing disabled after resize resets canvas context state', async () => {
    const { canvas, context } = createCanvasMock();
    const pipeline = new Canvas2DPipeline({
      canvas: canvas as unknown as HTMLCanvasElement,
      nativeWidth: 160,
      nativeHeight: 144,
      preset: PresetRegistry.getDefault()
    });

    await pipeline.initialize();
    expect(context.imageSmoothingEnabled).toBe(false);

    context.imageSmoothingEnabled = true;
    pipeline.resize(320, 288);

    expect(canvas.width).toBe(320);
    expect(canvas.height).toBe(288);
    expect(context.imageSmoothingEnabled).toBe(false);
  });
});
