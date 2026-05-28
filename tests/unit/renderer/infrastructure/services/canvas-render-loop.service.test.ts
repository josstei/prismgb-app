// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPipeline } from '@prismgb/gpu';
import { StreamingCanvasRenderLoopService } from '@renderer/infrastructure/services/canvas-render-loop.service.ts';
import {
  createAnimationCacheMock,
  createCanvasRenderPipelineMock,
  createLogger,
  createMockCanvas,
  createMockVideo,
} from '../../../../factories/index.js';
import { installDevicePixelRatioMock } from '../../../../support/mocks/browser-api.installers.js';

vi.mock('@prismgb/gpu', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createPipeline: vi.fn()
  };
});

describe('StreamingCanvasRenderLoopService', () => {
  let service;
  let mockLogger;
  let mockCanvas;
  let mockVideo;
  let mockPipeline;
  let mockAnimationCache;
  let devicePixelRatioMock;

  beforeEach(() => {
    vi.useFakeTimers();
    devicePixelRatioMock = installDevicePixelRatioMock(1);

    mockLogger = createLogger();

    mockAnimationCache = createAnimationCacheMock();
    mockPipeline = createCanvasRenderPipelineMock();

    createPipeline.mockResolvedValue(mockPipeline);

    mockCanvas = createMockCanvas({ width: 0, height: 0 });
    mockCanvas.style = {};

    mockVideo = createMockVideo();
    mockVideo.requestVideoFrameCallback = vi.fn(() => 1);

    service = new StreamingCanvasRenderLoopService(mockLogger, mockAnimationCache);
  });

  afterEach(() => {
    devicePixelRatioMock?.cleanup();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('initializes a package-owned Canvas2D pipeline', async () => {
    mockCanvas.width = 320;
    mockCanvas.height = 288;

    await service.initialize(mockCanvas, { width: 160, height: 144 });

    expect(createPipeline).toHaveBeenCalledWith(expect.objectContaining({
      canvas: mockCanvas,
      nativeWidth: 160,
      nativeHeight: 144,
      preferredAPI: 'canvas2d',
      capabilities: expect.objectContaining({
        webgpu: false,
        webgl2: false,
        preferredAPI: 'canvas2d'
      })
    }));
    expect(service.hasContextFor(mockCanvas)).toBe(true);
  });

  it('does not ask the renderer canvas for a 2D context', async () => {
    mockCanvas.getContext = vi.fn();

    await service.initialize(mockCanvas, { width: 160, height: 144 });
    service.resize(mockCanvas, 200, 150);

    expect(mockCanvas.getContext).not.toHaveBeenCalled();
  });

  it('recreates the package pipeline when native resolution changes on the same canvas', async () => {
    await service.initialize(mockCanvas, { width: 160, height: 144 });
    await service.initialize(mockCanvas, { width: 320, height: 240 });

    expect(mockPipeline.dispose).toHaveBeenCalledTimes(1);
    expect(createPipeline).toHaveBeenLastCalledWith(expect.objectContaining({
      nativeWidth: 320,
      nativeHeight: 240
    }));
  });

  it('renders video frames through the package pipeline on RVFC callbacks', async () => {
    let callbackInvoked = false;
    const isStreamingFn = vi.fn(() => callbackInvoked);
    const isHiddenFn = vi.fn(() => false);
    mockVideo.requestVideoFrameCallback.mockImplementation((callback) => {
      if (!callbackInvoked) {
        callbackInvoked = true;
        callback(1000, { mediaTime: 1 });
      }
      return 1;
    });

    await service.initialize(mockCanvas, { width: 160, height: 144 });
    service.startRendering(mockVideo, mockCanvas, isStreamingFn, isHiddenFn);

    expect(mockPipeline.renderFrame).toHaveBeenCalledWith(mockVideo);
    expect(service._lastFrameTime).toBe(1);
  });

  it('does not start without an initialized package pipeline', () => {
    service.startRendering(mockVideo, mockCanvas, () => true, () => false);

    expect(mockVideo.requestVideoFrameCallback).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Canvas render loop cannot start before the package pipeline is initialized'
    );
  });

  it('resizes canvas backing store through the package pipeline after initialization', async () => {
    devicePixelRatioMock.cleanup();
    devicePixelRatioMock = installDevicePixelRatioMock(2);
    await service.initialize(mockCanvas, { width: 160, height: 144 });

    service.resize(mockCanvas, 200, 150);

    expect(mockCanvas.style.width).toBe('200px');
    expect(mockCanvas.style.height).toBe('150px');
    expect(mockPipeline.resize).toHaveBeenCalledWith(400, 300);
    expect(service._displayWidth).toBe(200);
    expect(service._displayHeight).toBe(150);
    expect(service._devicePixelRatio).toBe(2);
  });

  it('sets backing dimensions directly before the package pipeline exists', () => {
    service.resize(mockCanvas, 200, 150);

    expect(mockCanvas.width).toBe(200);
    expect(mockCanvas.height).toBe(150);
    expect(mockPipeline.resize).not.toHaveBeenCalled();
  });

  it('clears through the package pipeline', async () => {
    await service.initialize(mockCanvas, { width: 160, height: 144 });

    service.clearCanvas(mockCanvas);

    expect(mockPipeline.clearFrame).toHaveBeenCalledTimes(1);
    expect(mockLogger.debug).toHaveBeenCalledWith('Canvas cleared by package pipeline');
  });

  it('stops the render loop and cancels RVFC handles', async () => {
    mockVideo.requestVideoFrameCallback.mockReturnValue(123);
    await service.initialize(mockCanvas, { width: 160, height: 144 });
    service.startRendering(mockVideo, mockCanvas, () => true, () => false);

    service.stopRendering(mockVideo);

    expect(service._isRenderLoopActive).toBe(false);
    expect(mockVideo.cancelVideoFrameCallback).toHaveBeenCalledWith(123);
    expect(mockAnimationCache.cancelAnimation).toHaveBeenCalledWith('canvasRender');
  });

  it('cleans loadeddata listeners before starting a new loop', async () => {
    await service.initialize(mockCanvas, { width: 160, height: 144 });

    // Start once
    service.startRendering(mockVideo, mockCanvas, () => true, () => false);
    expect(mockVideo.addEventListener).toHaveBeenCalledWith('loadeddata', expect.any(Function), { once: true });

    // Start again (should unsubscribe the previous listener first)
    service.startRendering(mockVideo, mockCanvas, () => true, () => false);
    expect(mockVideo.removeEventListener).toHaveBeenCalledWith('loadeddata', expect.any(Function));
  });

  it('disposes the package pipeline on reset and cleanup', async () => {
    await service.initialize(mockCanvas, { width: 160, height: 144 });

    await service.resetCanvasState();

    expect(mockPipeline.dispose).toHaveBeenCalledTimes(1);
    expect(service.hasContextFor(mockCanvas)).toBe(false);

    await service.initialize(mockCanvas, { width: 160, height: 144 });
    await service.cleanup();

    expect(mockPipeline.dispose).toHaveBeenCalledTimes(2);
    expect(mockAnimationCache.cancelAllAnimations).toHaveBeenCalled();
  });
});
