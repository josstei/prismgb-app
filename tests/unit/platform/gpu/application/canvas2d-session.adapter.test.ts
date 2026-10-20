import { afterEach, describe, expect, it, vi } from 'vitest';
import { Canvas2dSessionAdapter } from '../../../../../src/platform/gpu/application/canvas2d-session.adapter';
import type {
  GpuVideoRendererSession,
  GpuVideoRendererSessionOptions
} from '../../../../../src/platform/gpu/application/video-session.factory';
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

function createSession(options: Partial<GpuVideoRendererSessionOptions> = {}) {
  const fixture = createCanvas2dFixture();
  const session: GpuVideoRendererSession = Canvas2dSessionAdapter.create({
    canvas: fixture.canvas,
    nativeResolution: { width: 160, height: 144 },
    ...options
  });

  return { ...fixture, session };
}

function createVideo(readyState: number): HTMLVideoElement {
  return { readyState, HAVE_CURRENT_DATA: 2 } as HTMLVideoElement;
}

describe('Canvas2dSessionAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens the 2D context, reports ready and targets the native resolution', () => {
    const onReady = vi.fn();
    const { canvas, session } = createSession({ onReady });

    expect(canvas.getContext).toHaveBeenCalledWith('2d', { alpha: false, desynchronized: true });
    expect(onReady).toHaveBeenCalledWith({ backend: 'canvas2d' });
    expect(session.backend).toBe('canvas2d');
    expect(session.isActive).toBe(true);
    expect(session.isCanvasTransferred).toBe(false);
    expect(session.getTargetDimensions()).toEqual({ width: 160, height: 144 });
  });

  it('logs, reports INIT_FAILED and rethrows when the canvas has no 2D context', () => {
    const logger = { error: vi.fn(), info: vi.fn() };
    const onReady = vi.fn();
    const onError = vi.fn();

    expect(() => Canvas2dSessionAdapter.create({
      canvas: createMockCanvas() as unknown as HTMLCanvasElement,
      nativeResolution: { width: 160, height: 144 },
      logger,
      onReady,
      onError
    })).toThrow('Canvas 2D context not available');

    expect(logger.error).toHaveBeenCalledWith('Failed to initialize local Canvas2D pipeline:', expect.any(Error));
    expect(onError).toHaveBeenCalledWith({ message: 'Canvas 2D context not available', code: 'INIT_FAILED' });
    expect(onReady).not.toHaveBeenCalled();
  });

  it('draws frames only once the video has current data', async () => {
    const { context, session } = createSession();
    const waiting = createVideo(1);
    const playing = createVideo(2);

    await session.renderFrame(waiting);
    await session.renderFrame(playing);

    expect(context.drawImage.mock.calls).toEqual([[playing, 0, 0, 160, 144, 0, 0, 640, 576]]);
  });

  it('sizes the backing store by the device pixel ratio', () => {
    const { canvas, session } = createSession();

    vi.stubGlobal('devicePixelRatio', 2);
    session.resize(100.4, 50.2);
    expect([canvas.width, canvas.height]).toEqual([201, 100]);

    vi.stubGlobal('devicePixelRatio', 0);
    session.resize(100.4, 50.2);
    expect([canvas.width, canvas.height]).toEqual([100, 50]);
  });

  it('ignores presets and brightness because frames are drawn unprocessed', async () => {
    const { context, session } = createSession();

    session.setPreset('vintage');
    session.setBrightness(1.5);
    await session.renderFrame(createVideo(2));

    expect(context.drawImage).toHaveBeenCalledTimes(1);
    expect(session.getTargetDimensions()).toEqual({ width: 160, height: 144 });
  });

  it('captures the canvas', async () => {
    const { canvas, session } = createSession();
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
    const createImageBitmap = vi.fn(async () => bitmap);
    vi.stubGlobal('createImageBitmap', createImageBitmap);

    await expect(session.captureFrame()).resolves.toBe(bitmap);
    expect(createImageBitmap).toHaveBeenCalledWith(canvas);
  });

  it('stops drawing on terminate and emits canvas expiry only when asked', async () => {
    const onCanvasExpired = vi.fn();
    const { canvas, context, session } = createSession({ onCanvasExpired });

    session.terminate();
    await session.renderFrame(createVideo(2));
    session.resize(320, 288);

    expect(session.isActive).toBe(false);
    expect(context.drawImage).not.toHaveBeenCalled();
    expect(canvas.width).toBe(640);
    await expect(session.captureFrame()).rejects.toThrow('Session is not active');
    expect(onCanvasExpired).not.toHaveBeenCalled();

    session.terminate({ emitCanvasExpired: true });
    expect(onCanvasExpired).toHaveBeenCalledTimes(1);
  });
});
