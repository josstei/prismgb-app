/**
 * CaptureGpuRecordingService Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CaptureGpuRecordingService } from '@renderer/infrastructure/services/gpu-recording.service.ts';
import {
  createCanvasRenderingContextMock,
  createEventBus,
  createGpuRendererServiceMock,
  createLoggerFactory,
  createMediaStreamMock,
  createMediaTrackMock,
  createMockCanvas,
  createRecordingFrameMock,
  createStreamPayloadMock
} from '../../../../factories/index.js';
import {
  createCleanupStack,
  installAnimationFrameMock,
  installDocumentCreateElementMock
} from '../../../../support/mocks/browser-api.installers.js';

describe('CaptureGpuRecordingService', () => {
  let service;
  let mockGpuRendererService;
  let mockEventBus;
  let mockLogger;
  let mockLoggerFactory;
  let cleanupStack;

  function trackMock(handle) {
    cleanupStack.add(() => handle.cleanup());
    return handle;
  }

  function createRecordingCanvasFixture({
    context = createCanvasRenderingContextMock({ imageSmoothingEnabled: true }),
    recordingStream = createMediaStreamMock(),
    width = 0,
    height = 0,
  } = {}) {
    const mockCanvas = createMockCanvas({ width, height });
    mockCanvas.getContext = vi.fn(() => context);
    mockCanvas.captureStream = vi.fn(() => recordingStream);

    return { mockCanvas, context, recordingStream };
  }

  function installCanvasAndAnimationFrameMocks(mockCanvas, animationFrameOptions = {}) {
    const documentMock = trackMock(installDocumentCreateElementMock({
      createElement: vi.fn(() => mockCanvas)
    }));
    const animationFrameMock = trackMock(installAnimationFrameMock(animationFrameOptions));

    return {
      documentMock,
      animationFrameMock,
      createElement: documentMock.createElement,
      requestAnimationFrame: animationFrameMock.requestAnimationFrame,
      cancelAnimationFrame: animationFrameMock.cancelAnimationFrame,
    };
  }

  beforeEach(() => {
    cleanupStack = createCleanupStack();

    mockGpuRendererService = createGpuRendererServiceMock({
      captureFrame: vi.fn(),
      getTargetDimensions: vi.fn(() => ({ width: 640, height: 576 }))
    });

    mockEventBus = createEventBus();
    mockLoggerFactory = createLoggerFactory();
    mockLogger = mockLoggerFactory.create('CaptureGpuRecordingService');

    service = new CaptureGpuRecordingService({
      gpuRendererService: mockGpuRendererService,
      eventBus: mockEventBus,
      loggerFactory: mockLoggerFactory
    });
  });

  afterEach(() => {
    cleanupStack.cleanup();
    vi.clearAllMocks();
  });

  it('should start GPU recording with provided frame rate', async () => {
    const {
      mockCanvas,
      recordingStream: mockRecordingStream
    } = createRecordingCanvasFixture();

    installCanvasAndAnimationFrameMocks(mockCanvas, {
      requestAnimationFrame: vi.fn()
    });

    const mockStream = createStreamPayloadMock();

    await service.start({ stream: mockStream, frameRate: 50 });

    expect(mockCanvas.captureStream).toHaveBeenCalledWith(50);
    expect(service.isActive()).toBe(true);
  });

  it('should throw a clear error when canvas context creation fails', async () => {
    const { mockCanvas } = createRecordingCanvasFixture({
      context: null,
      recordingStream: createMediaStreamMock({
        tracks: []
      })
    });

    trackMock(installDocumentCreateElementMock({
      createElement: vi.fn(() => mockCanvas)
    }));

    const mockStream = createStreamPayloadMock();

    await expect(service.start({ stream: mockStream, frameRate: 60 }))
      .rejects.toThrow('Unable to create GPU recording canvas context');

    expect(service.isActive()).toBe(false);
  });

  it('should calculate integer upscaling for smaller frames', () => {
    service._recordingWidth = 640;
    service._recordingHeight = 576;

    const result = service._calculateRecordingScale(320, 288);

    expect(result.scale).toBe(2);
    expect(result.drawWidth).toBe(640);
    expect(result.drawHeight).toBe(576);
  });

  it('should return null for invalid dimensions', () => {
    service._recordingWidth = 0;
    service._recordingHeight = 0;

    const result = service._calculateRecordingScale(640, 576);

    expect(result).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalledWith('Invalid dimensions for recording scale calculation');
  });

  it('should capture and draw frames during GPU recording', async () => {
    const mockFrame = createRecordingFrameMock();
    mockGpuRendererService.captureFrame.mockResolvedValue(mockFrame);

    const mockCtx = createCanvasRenderingContextMock({
      fillStyle: '',
      imageSmoothingEnabled: true
    });
    const { mockCanvas } = createRecordingCanvasFixture({
      context: mockCtx
    });

    let rafCallback;
    installCanvasAndAnimationFrameMocks(mockCanvas, {
      requestAnimationFrame: vi.fn((cb) => {
        rafCallback = cb;
        return 123;
      })
    });

    const mockStream = createStreamPayloadMock();

    await service.start({ stream: mockStream, frameRate: 60 });

    await rafCallback();

    expect(mockGpuRendererService.captureFrame).toHaveBeenCalled();
    const mockDrawImage = mockCtx.drawImage;
    expect(mockDrawImage).toHaveBeenCalledWith(
      mockFrame,
      0, 0, 640, 576,
      0, 0, 640, 576
    );
    expect(mockFrame.close).toHaveBeenCalled();
  });

  it('should warn after 30 dropped frames', async () => {
    mockGpuRendererService.captureFrame.mockRejectedValue(new Error('Capture failed'));

    const mockCtx = createCanvasRenderingContextMock({ fillStyle: '' });
    const { mockCanvas } = createRecordingCanvasFixture({
      context: mockCtx
    });

    let rafCallback;
    installCanvasAndAnimationFrameMocks(mockCanvas, {
      requestAnimationFrame: vi.fn((cb) => {
        rafCallback = cb;
        return 123;
      })
    });

    const mockStream = createStreamPayloadMock();

    await service.start({ stream: mockStream, frameRate: 60 });

    for (let i = 0; i < 30; i++) {
      await rafCallback();
    }

    expect(mockEventBus.publish).toHaveBeenCalledWith('capture:recording-degraded', {
      reason: 'dropped_frames',
      droppedFrames: 30
    });
  });

  it('should expose captureFrame method that delegates to gpuRendererService', async () => {
    const mockFrame = createRecordingFrameMock();
    mockGpuRendererService.captureFrame.mockResolvedValue(mockFrame);

    const result = await service.captureFrame();

    expect(mockGpuRendererService.captureFrame).toHaveBeenCalled();
    expect(result).toBe(mockFrame);
  });

  it('should stop recording and clean up resources', async () => {
    const mockTrack = createMediaTrackMock();
    const { mockCanvas } = createRecordingCanvasFixture({
      recordingStream: createMediaStreamMock({ tracks: [mockTrack] })
    });

    const browserMocks = installCanvasAndAnimationFrameMocks(mockCanvas, {
      requestAnimationFrame: vi.fn(() => 123),
      cancelAnimationFrame: vi.fn()
    });

    const mockStream = createStreamPayloadMock();

    await service.start({ stream: mockStream, frameRate: 60 });

    service.stop();

    expect(browserMocks.cancelAnimationFrame).toHaveBeenCalledWith(123);
    expect(mockTrack.stop).toHaveBeenCalled();
    expect(service.isActive()).toBe(false);
  });

  it('should throw error when starting without stream', async () => {
    await expect(service.start({ stream: null, frameRate: 60 })).rejects.toThrow('No stream provided');
    expect(mockLogger.warn).toHaveBeenCalledWith('Cannot start GPU recording - no stream provided');
  });

  it('should throw error when starting while already recording', async () => {
    const { mockCanvas } = createRecordingCanvasFixture();

    installCanvasAndAnimationFrameMocks(mockCanvas, {
      requestAnimationFrame: vi.fn(() => 123)
    });

    const mockStream = createStreamPayloadMock();
    await service.start({ stream: mockStream, frameRate: 60 });

    await expect(service.start({ stream: mockStream, frameRate: 60 })).rejects.toThrow('GPU recording already active');
    expect(mockLogger.warn).toHaveBeenCalledWith('GPU recording already active');
  });

  it('should use default frame rate when not provided', async () => {
    const { mockCanvas } = createRecordingCanvasFixture();

    installCanvasAndAnimationFrameMocks(mockCanvas, {
      requestAnimationFrame: vi.fn()
    });

    const mockStream = createStreamPayloadMock();

    await service.start({ stream: mockStream });

    expect(mockCanvas.captureStream).toHaveBeenCalledWith(60);
  });

  it('should add audio tracks from source stream', async () => {
    const mockAudioTrack = createMediaTrackMock({
      id: 'audio-track',
      clone: vi.fn(() => ({ id: 'cloned-track' }))
    });
    const { mockCanvas, recordingStream: mockRecordingStream } = createRecordingCanvasFixture({
      context: createCanvasRenderingContextMock({ imageSmoothingEnabled: true }),
      recordingStream: createMediaStreamMock()
    });

    installCanvasAndAnimationFrameMocks(mockCanvas, {
      requestAnimationFrame: vi.fn()
    });

    const mockStream = createStreamPayloadMock({
      getAudioTracks: vi.fn(() => [mockAudioTrack])
    });

    await service.start({ stream: mockStream, frameRate: 60 });

    expect(mockAudioTrack.clone).toHaveBeenCalled();
    expect(mockRecordingStream.addTrack).toHaveBeenCalledWith({ id: 'cloned-track' });
  });

  it('should return 1:1 scale when frame matches canvas dimensions', () => {
    service._recordingWidth = 640;
    service._recordingHeight = 576;

    const result = service._calculateRecordingScale(640, 576);

    expect(result.scale).toBe(1);
    expect(result.needsClearing).toBe(false);
    expect(result.offsetX).toBe(0);
    expect(result.offsetY).toBe(0);
  });

  it('should calculate fractional downscaling for larger frames', () => {
    service._recordingWidth = 640;
    service._recordingHeight = 480;

    const result = service._calculateRecordingScale(1920, 1080);

    expect(result.scale).toBeLessThan(1);
  });

  it('should return cached scale params when frame dimensions unchanged', () => {
    service._recordingWidth = 640;
    service._recordingHeight = 576;

    const result1 = service._calculateRecordingScale(320, 288);
    const result2 = service._calculateRecordingScale(320, 288);

    expect(result1).toBe(result2);
  });

  it('should recalculate when frame dimensions change', () => {
    service._recordingWidth = 640;
    service._recordingHeight = 576;

    const result1 = service._calculateRecordingScale(320, 288);
    const result2 = service._calculateRecordingScale(640, 576);

    expect(result1).not.toBe(result2);
    expect(result1.scale).toBe(2);
    expect(result2.scale).toBe(1);
  });

  it('should do nothing when stopping while not recording', async () => {
    const animationFrameMock = trackMock(installAnimationFrameMock({
      cancelAnimationFrame: vi.fn()
    }));

    await service.stop();

    expect(animationFrameMock.cancelAnimationFrame).not.toHaveBeenCalled();
  });

  it('should dispose and cleanup resources', () => {
    trackMock(installAnimationFrameMock({
      cancelAnimationFrame: vi.fn()
    }));

    service.dispose();

    expect(mockLogger.info).toHaveBeenCalledWith('CaptureGpuRecordingService disposed');
  });

  it('should return recording stream via getter', async () => {
    const { mockCanvas } = createRecordingCanvasFixture();

    installCanvasAndAnimationFrameMocks(mockCanvas, {
      requestAnimationFrame: vi.fn()
    });

    const mockStream = createStreamPayloadMock();
    const recordingStream = await service.start({ stream: mockStream, frameRate: 60 });

    expect(service.getRecordingStream()).toBe(recordingStream);
  });

  it('should clear canvas only once when offsets are needed', async () => {
    const mockFrame = createRecordingFrameMock({ width: 320, height: 200 });
    mockGpuRendererService.captureFrame.mockResolvedValue(mockFrame);
    mockGpuRendererService.getTargetDimensions.mockReturnValue({ width: 640, height: 576 });

    const mockFillRect = vi.fn();
    const mockCtx = createCanvasRenderingContextMock({
      fillStyle: '',
      imageSmoothingEnabled: true,
      fillRect: mockFillRect
    });
    const { mockCanvas } = createRecordingCanvasFixture({
      context: mockCtx
    });

    let rafCallback;
    installCanvasAndAnimationFrameMocks(mockCanvas, {
      requestAnimationFrame: vi.fn((cb) => {
        rafCallback = cb;
        return 123;
      })
    });

    const mockStream = createStreamPayloadMock();
    await service.start({ stream: mockStream, frameRate: 60 });

    // First frame - should clear canvas
    await rafCallback();
    expect(mockFillRect).toHaveBeenCalledTimes(1);

    // Reset pending flag and call again
    mockGpuRendererService.captureFrame.mockResolvedValue(createRecordingFrameMock({ width: 320, height: 200 }));
    await rafCallback();
    // Should not clear again
    expect(mockFillRect).toHaveBeenCalledTimes(1);
  });

  it('should wait for in-flight capture on stop with draining', async () => {
    let captureResolve;
    const capturePromise = new Promise(resolve => {
      captureResolve = resolve;
    });
    mockGpuRendererService.captureFrame.mockReturnValue(capturePromise);

    const mockCtx = createCanvasRenderingContextMock({
      fillStyle: '',
      imageSmoothingEnabled: true
    });
    const { mockCanvas } = createRecordingCanvasFixture({
      context: mockCtx,
      recordingStream: createMediaStreamMock({
        tracks: [createMediaTrackMock()]
      })
    });

    let rafCallback;
    installCanvasAndAnimationFrameMocks(mockCanvas, {
      requestAnimationFrame: vi.fn((cb) => {
        rafCallback = cb;
        return 123;
      }),
      cancelAnimationFrame: vi.fn()
    });

    const mockStream = createStreamPayloadMock();
    await service.start({ stream: mockStream, frameRate: 60 });

    // Start a capture
    rafCallback();

    // Start stopping (should wait for capture)
    const stopPromise = service.stop();

    // Resolve the capture
    captureResolve({ width: 640, height: 576, close: vi.fn() });

    await stopPromise;

    expect(mockLogger.debug).toHaveBeenCalledWith('Waiting for in-flight capture to complete...');
  });
});
