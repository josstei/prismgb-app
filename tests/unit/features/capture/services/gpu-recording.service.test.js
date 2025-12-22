/**
 * GpuRecordingService Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GpuRecordingService } from '@features/capture/services/gpu-recording.service.js';

describe('GpuRecordingService', () => {
  let service;
  let mockGpuRendererService;
  let mockEventBus;
  let mockLogger;

  beforeEach(() => {
    mockGpuRendererService = {
      captureFrame: vi.fn(),
      getTargetDimensions: vi.fn(() => ({ width: 640, height: 576 }))
    };

    mockEventBus = {
      publish: vi.fn()
    };

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    service = new GpuRecordingService({
      gpuRendererService: mockGpuRendererService,
      eventBus: mockEventBus,
      loggerFactory: { create: vi.fn(() => mockLogger) }
    });
  });

  it('should start GPU recording with provided frame rate', async () => {
    const mockRecordingStream = {
      addTrack: vi.fn(),
      getTracks: vi.fn(() => [])
    };
    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ imageSmoothingEnabled: true })),
      captureStream: vi.fn(() => mockRecordingStream)
    };

    global.document = {
      createElement: vi.fn(() => mockCanvas)
    };
    global.requestAnimationFrame = vi.fn();

    const mockStream = { getAudioTracks: vi.fn(() => []) };

    await service.start({ stream: mockStream, frameRate: 50 });

    expect(mockCanvas.captureStream).toHaveBeenCalledWith(50);
    expect(service.isActive()).toBe(true);
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
    const mockFrame = { width: 640, height: 576, close: vi.fn() };
    mockGpuRendererService.captureFrame.mockResolvedValue(mockFrame);

    const mockDrawImage = vi.fn();
    const mockCtx = {
      drawImage: mockDrawImage,
      fillRect: vi.fn(),
      fillStyle: '',
      imageSmoothingEnabled: true
    };
    const mockRecordingStream = {
      addTrack: vi.fn(),
      getTracks: vi.fn(() => [])
    };
    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => mockCtx),
      captureStream: vi.fn(() => mockRecordingStream)
    };

    global.document = {
      createElement: vi.fn(() => mockCanvas)
    };

    let rafCallback;
    global.requestAnimationFrame = vi.fn((cb) => {
      rafCallback = cb;
      return 123;
    });

    const mockStream = { getAudioTracks: vi.fn(() => []) };

    await service.start({ stream: mockStream, frameRate: 60 });

    await rafCallback();

    expect(mockGpuRendererService.captureFrame).toHaveBeenCalled();
    expect(mockDrawImage).toHaveBeenCalledWith(
      mockFrame,
      0, 0, 640, 576,
      0, 0, 640, 576
    );
    expect(mockFrame.close).toHaveBeenCalled();
  });

  it('should warn after 30 dropped frames', async () => {
    mockGpuRendererService.captureFrame.mockRejectedValue(new Error('Capture failed'));

    const mockCtx = { drawImage: vi.fn(), fillRect: vi.fn(), fillStyle: '' };
    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => mockCtx),
      captureStream: vi.fn(() => ({ addTrack: vi.fn(), getTracks: vi.fn(() => []) }))
    };

    global.document = { createElement: vi.fn(() => mockCanvas) };

    let rafCallback;
    global.requestAnimationFrame = vi.fn((cb) => {
      rafCallback = cb;
      return 123;
    });

    const mockStream = { getAudioTracks: vi.fn(() => []) };

    await service.start({ stream: mockStream, frameRate: 60 });

    for (let i = 0; i < 30; i++) {
      await rafCallback();
    }

    expect(mockEventBus.publish).toHaveBeenCalledWith('ui:status-message', {
      message: 'Recording quality may be degraded - frames being dropped',
      type: 'warning'
    });
  });

  it('should stop recording and clean up resources', async () => {
    const mockTrack = { stop: vi.fn() };
    const mockRecordingStream = {
      addTrack: vi.fn(),
      getTracks: vi.fn(() => [mockTrack])
    };
    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ imageSmoothingEnabled: true })),
      captureStream: vi.fn(() => mockRecordingStream)
    };

    global.document = { createElement: vi.fn(() => mockCanvas) };
    global.requestAnimationFrame = vi.fn(() => 123);
    global.cancelAnimationFrame = vi.fn();

    const mockStream = { getAudioTracks: vi.fn(() => []) };

    await service.start({ stream: mockStream, frameRate: 60 });

    service.stop();

    expect(global.cancelAnimationFrame).toHaveBeenCalledWith(123);
    expect(mockTrack.stop).toHaveBeenCalled();
    expect(service.isActive()).toBe(false);
  });
});
