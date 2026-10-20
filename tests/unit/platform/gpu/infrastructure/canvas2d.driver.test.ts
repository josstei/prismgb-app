import { afterEach, describe, expect, it, vi } from 'vitest';
import { Canvas2dDriver } from '../../../../../src/platform/gpu/infrastructure/canvas2d.driver';
import { createMockCanvas } from '@platform/gpu/testkit';

function createCanvas2dFixture() {
  const context = {
    drawImage: vi.fn(),
    imageSmoothingEnabled: true
  };
  const canvas = createMockCanvas(640, 576, { '2d': context });
  vi.spyOn(canvas, 'getContext');

  return { canvas: canvas as unknown as HTMLCanvasElement, context };
}

describe('Canvas2dDriver', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens an opaque desynchronized 2D context with smoothing disabled', () => {
    const { canvas, context } = createCanvas2dFixture();

    new Canvas2dDriver(canvas, 160, 144);

    expect(canvas.getContext).toHaveBeenCalledWith('2d', { alpha: false, desynchronized: true });
    expect(context.imageSmoothingEnabled).toBe(false);
  });

  it('throws when the canvas has no 2D context', () => {
    const canvas = createMockCanvas() as unknown as HTMLCanvasElement;

    expect(() => new Canvas2dDriver(canvas, 160, 144)).toThrow('Canvas 2D context not available');
  });

  it('draws the native frame scaled to the current canvas size', () => {
    const { canvas, context } = createCanvas2dFixture();
    const driver = new Canvas2dDriver(canvas, 160, 144);
    const frame = {} as CanvasImageSource;

    driver.renderFrame(frame);
    driver.resize(320, 288);
    driver.renderFrame(frame);

    expect(context.drawImage.mock.calls).toEqual([
      [frame, 0, 0, 160, 144, 0, 0, 640, 576],
      [frame, 0, 0, 160, 144, 0, 0, 320, 288]
    ]);
  });

  it('keeps image smoothing disabled after resize resets canvas context state', () => {
    const { canvas, context } = createCanvas2dFixture();
    const driver = new Canvas2dDriver(canvas, 160, 144);

    context.imageSmoothingEnabled = true;
    driver.resize(320, 288);

    expect(canvas.width).toBe(320);
    expect(canvas.height).toBe(288);
    expect(context.imageSmoothingEnabled).toBe(false);
  });

  it('captures the canvas as an image bitmap', async () => {
    const { canvas } = createCanvas2dFixture();
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
    const createImageBitmap = vi.fn(async () => bitmap);
    vi.stubGlobal('createImageBitmap', createImageBitmap);
    const driver = new Canvas2dDriver(canvas, 160, 144);

    await expect(driver.captureFrame()).resolves.toBe(bitmap);
    expect(createImageBitmap).toHaveBeenCalledWith(canvas);
  });

  it('stops drawing once disposed', () => {
    const { canvas, context } = createCanvas2dFixture();
    const driver = new Canvas2dDriver(canvas, 160, 144);

    driver.dispose();
    driver.renderFrame({} as CanvasImageSource);

    expect(context.drawImage).not.toHaveBeenCalled();
  });
});
