import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CaptureBuffer } from '@/infrastructure/capture';

describe('CaptureBuffer', () => {
  let captureBuffer: CaptureBuffer;
  let mockCanvas: OffscreenCanvas;
  let mockBitmap: ImageBitmap;
  let createImageBitmapSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockCanvas = {
      width: 640,
      height: 576,
    } as unknown as OffscreenCanvas;

    mockBitmap = { close: vi.fn() } as unknown as ImageBitmap;
    createImageBitmapSpy = vi.fn().mockResolvedValue(mockBitmap);
    vi.stubGlobal('createImageBitmap', createImageBitmapSpy);

    captureBuffer = new CaptureBuffer(mockCanvas);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('initial state', () => {
    it('should not have pending capture', () => {
      expect(captureBuffer.hasPendingCapture()).toBe(false);
    });

    it('should not have captured frame', () => {
      expect(captureBuffer.hasCapturedFrame()).toBe(false);
    });

    it('should return null when retrieving capture with no buffer', () => {
      expect(captureBuffer.retrieveCapture()).toBeNull();
    });
  });

  describe('armCapture', () => {
    it('should arm capture', () => {
      captureBuffer.armCapture();
      expect(captureBuffer.hasPendingCapture()).toBe(true);
    });

    it('should not affect captured frame state', () => {
      captureBuffer.armCapture();
      expect(captureBuffer.hasCapturedFrame()).toBe(false);
    });
  });

  describe('onFrameRendered', () => {
    it('should buffer frame when capture is pending', async () => {
      captureBuffer.armCapture();
      await captureBuffer.onFrameRendered();

      expect(createImageBitmapSpy).toHaveBeenCalledWith(mockCanvas);
      expect(captureBuffer.hasCapturedFrame()).toBe(true);
      expect(captureBuffer.hasPendingCapture()).toBe(false);
    });

    it('should not buffer frame when capture is not pending', async () => {
      await captureBuffer.onFrameRendered();

      expect(createImageBitmapSpy).not.toHaveBeenCalled();
      expect(captureBuffer.hasCapturedFrame()).toBe(false);
    });

    it('should clear pending flag after buffering', async () => {
      captureBuffer.armCapture();
      await captureBuffer.onFrameRendered();

      expect(captureBuffer.hasPendingCapture()).toBe(false);
    });

    it('should close previous frame before capturing new frame', async () => {
      const firstBitmap = { close: vi.fn() } as unknown as ImageBitmap;
      const secondBitmap = { close: vi.fn() } as unknown as ImageBitmap;

      createImageBitmapSpy
        .mockResolvedValueOnce(firstBitmap)
        .mockResolvedValueOnce(secondBitmap);

      captureBuffer.armCapture();
      await captureBuffer.onFrameRendered();

      captureBuffer.armCapture();
      await captureBuffer.onFrameRendered();

      expect(firstBitmap.close).toHaveBeenCalledOnce();
      expect(captureBuffer.hasCapturedFrame()).toBe(true);
    });

    it('should not crash if canvas is null', async () => {
      const bufferWithoutCanvas = new CaptureBuffer(null as any);
      bufferWithoutCanvas.armCapture();

      await expect(bufferWithoutCanvas.onFrameRendered()).resolves.not.toThrow();
      expect(bufferWithoutCanvas.hasCapturedFrame()).toBe(false);
    });
  });

  describe('storeCapture', () => {
    it('should store a bitmap directly', () => {
      captureBuffer.armCapture();
      captureBuffer.storeCapture(mockBitmap);

      expect(captureBuffer.hasCapturedFrame()).toBe(true);
      expect(captureBuffer.hasPendingCapture()).toBe(false);
    });

    it('should close previous bitmap when storing new one', () => {
      const firstBitmap = { close: vi.fn() } as unknown as ImageBitmap;
      captureBuffer.storeCapture(firstBitmap);
      captureBuffer.storeCapture(mockBitmap);

      expect(firstBitmap.close).toHaveBeenCalledOnce();
    });
  });

  describe('retrieveCapture', () => {
    it('should transfer ownership of buffered frame', async () => {
      captureBuffer.armCapture();
      await captureBuffer.onFrameRendered();

      const frame = captureBuffer.retrieveCapture();

      expect(frame).toBe(mockBitmap);
      expect(captureBuffer.hasCapturedFrame()).toBe(false);
    });

    it('should return null when no buffered frame exists', () => {
      const frame = captureBuffer.retrieveCapture();
      expect(frame).toBeNull();
    });

    it('should allow multiple calls returning null after transfer', async () => {
      captureBuffer.armCapture();
      await captureBuffer.onFrameRendered();

      captureBuffer.retrieveCapture();
      expect(captureBuffer.retrieveCapture()).toBeNull();
      expect(captureBuffer.retrieveCapture()).toBeNull();
    });
  });

  describe('captureImmediate', () => {
    it('should provide immediate capture from canvas', async () => {
      const frame = await captureBuffer.captureImmediate();

      expect(createImageBitmapSpy).toHaveBeenCalledWith(mockCanvas);
      expect(frame).toBe(mockBitmap);
    });

    it('should not affect pending or buffered state', async () => {
      captureBuffer.armCapture();
      await captureBuffer.captureImmediate();

      expect(captureBuffer.hasPendingCapture()).toBe(true);
      expect(captureBuffer.hasCapturedFrame()).toBe(false);
    });

    it('should work independently of buffered workflow', async () => {
      captureBuffer.armCapture();
      await captureBuffer.onFrameRendered();

      const immediateBitmap = { close: vi.fn() } as unknown as ImageBitmap;
      createImageBitmapSpy.mockResolvedValueOnce(immediateBitmap);

      const frame = await captureBuffer.captureImmediate();

      expect(frame).toBe(immediateBitmap);
      expect(captureBuffer.hasCapturedFrame()).toBe(true);
    });
  });

  describe('reset', () => {
    it('should close captured frame if exists', async () => {
      captureBuffer.armCapture();
      await captureBuffer.onFrameRendered();

      captureBuffer.reset();

      expect(mockBitmap.close).toHaveBeenCalledOnce();
    });

    it('should reset pending capture state', () => {
      captureBuffer.armCapture();
      captureBuffer.reset();

      expect(captureBuffer.hasPendingCapture()).toBe(false);
    });

    it('should reset captured frame state', async () => {
      captureBuffer.armCapture();
      await captureBuffer.onFrameRendered();

      captureBuffer.reset();

      expect(captureBuffer.hasCapturedFrame()).toBe(false);
    });
  });

  describe('dispose', () => {
    it('should close captured frame if exists', async () => {
      captureBuffer.armCapture();
      await captureBuffer.onFrameRendered();

      captureBuffer.dispose();

      expect(mockBitmap.close).toHaveBeenCalledOnce();
    });

    it('should not crash if no captured frame exists', () => {
      expect(() => captureBuffer.dispose()).not.toThrow();
    });

    it('should not crash on multiple dispose calls', async () => {
      captureBuffer.armCapture();
      await captureBuffer.onFrameRendered();

      captureBuffer.dispose();
      expect(() => captureBuffer.dispose()).not.toThrow();
    });
  });

  describe('workflow integration', () => {
    it('should support complete arm-render-retrieve cycle', async () => {
      captureBuffer.armCapture();
      expect(captureBuffer.hasPendingCapture()).toBe(true);
      expect(captureBuffer.hasCapturedFrame()).toBe(false);

      await captureBuffer.onFrameRendered();
      expect(captureBuffer.hasPendingCapture()).toBe(false);
      expect(captureBuffer.hasCapturedFrame()).toBe(true);

      const frame = captureBuffer.retrieveCapture();
      expect(frame).toBe(mockBitmap);
      expect(captureBuffer.hasPendingCapture()).toBe(false);
      expect(captureBuffer.hasCapturedFrame()).toBe(false);
    });

    it('should support multiple capture cycles', async () => {
      const bitmap1 = { close: vi.fn() } as unknown as ImageBitmap;
      const bitmap2 = { close: vi.fn() } as unknown as ImageBitmap;

      createImageBitmapSpy
        .mockResolvedValueOnce(bitmap1)
        .mockResolvedValueOnce(bitmap2);

      captureBuffer.armCapture();
      await captureBuffer.onFrameRendered();
      const frame1 = captureBuffer.retrieveCapture();

      captureBuffer.armCapture();
      await captureBuffer.onFrameRendered();
      const frame2 = captureBuffer.retrieveCapture();

      expect(frame1).toBe(bitmap1);
      expect(frame2).toBe(bitmap2);
      expect(bitmap1.close).not.toHaveBeenCalled();
      expect(bitmap2.close).not.toHaveBeenCalled();
    });

    it('should skip frame render when no capture requested', async () => {
      await captureBuffer.onFrameRendered();
      await captureBuffer.onFrameRendered();
      await captureBuffer.onFrameRendered();

      expect(createImageBitmapSpy).not.toHaveBeenCalled();
    });
  });
});
