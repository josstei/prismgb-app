/**
 * CaptureService Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CaptureService } from '@renderer/features/capture/services/capture.service.js';

// Mock FilenameGenerator
vi.mock('../../../../../src/shared/utils/filename-generator.js', () => ({
  default: {
    forScreenshot: vi.fn(() => 'screenshot_2024-01-01_12-00-00.png'),
    forRecording: vi.fn(() => 'recording_2024-01-01_12-00-00.webm')
  }
}));

describe('CaptureService', () => {
  let service;
  let mockEventBus;
  let mockLogger;
  let mockLoggerFactory;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    };

    mockLoggerFactory = {
      create: vi.fn(() => mockLogger)
    };

    mockEventBus = {
      publish: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn()
    };

    service = new CaptureService({
      eventBus: mockEventBus,
      loggerFactory: mockLoggerFactory
    });

    // Mock MediaRecorder
    global.MediaRecorder = class MockMediaRecorder {
      constructor(stream, options) {
        this.stream = stream;
        this.options = options;
        this.state = 'inactive';
        this.ondataavailable = null;
        this.onstop = null;
      }
      start() { this.state = 'recording'; }
      stop() { this.state = 'inactive'; }
    };
    global.MediaRecorder.isTypeSupported = vi.fn(() => true);

    // Mock Blob
    global.Blob = class MockBlob {
      constructor(parts, options) {
        this.parts = parts;
        this.type = options?.type || 'application/octet-stream';
        this.size = 1000;
      }
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should create service with initial state', () => {
      expect(service.isRecording).toBe(false);
      expect(service.mediaRecorder).toBeNull();
      expect(service.recordedChunks).toEqual([]);
      expect(service._isDisposing).toBe(false);
    });
  });

  describe('takeScreenshot', () => {
    let mockVideo;
    let mockVideoWithNoDims;
    let mockCanvas;
    let mockCtx;
    let realDocument;

    beforeEach(() => {
      // Save real document reference before any mocking
      realDocument = global.document;

      mockCtx = {
        drawImage: vi.fn()
      };

      mockCanvas = {
        width: 0,
        height: 0,
        getContext: vi.fn(() => mockCtx),
        toBlob: vi.fn((callback) => callback(new Blob(['test'], { type: 'image/png' })))
      };

      // Create video elements using real document
      mockVideo = realDocument.createElement('video');
      Object.defineProperty(mockVideo, 'videoWidth', { value: 160, writable: true });
      Object.defineProperty(mockVideo, 'videoHeight', { value: 144, writable: true });

      mockVideoWithNoDims = realDocument.createElement('video');
      Object.defineProperty(mockVideoWithNoDims, 'videoWidth', { value: 0, writable: true });

      // Override document.createElement to return mockCanvas for 'canvas'
      // Use a wrapper that doesn't cause recursion
      const realCreateElement = realDocument.createElement.bind(realDocument);
      global.document = {
        ...realDocument,
        createElement: vi.fn((tag) => {
          if (tag === 'canvas') {
            return mockCanvas;
          }
          return realCreateElement(tag);
        })
      };
    });

    it('should capture screenshot from video element', async () => {
      const result = await service.takeScreenshot(mockVideo);

      expect(result.filename).toBe('screenshot_2024-01-01_12-00-00.png');
      expect(result.blob).toBeDefined();
    });

    it('should set canvas dimensions from video', async () => {
      await service.takeScreenshot(mockVideo);

      expect(mockCanvas.width).toBe(160);
      expect(mockCanvas.height).toBe(144);
    });

    it('should draw video to canvas', async () => {
      await service.takeScreenshot(mockVideo);

      expect(mockCtx.drawImage).toHaveBeenCalledWith(mockVideo, 0, 0);
    });

    it('should emit capture:screenshot-ready event', async () => {
      await service.takeScreenshot(mockVideo);

      expect(mockEventBus.publish).toHaveBeenCalledWith('capture:screenshot-ready', expect.objectContaining({
        filename: 'screenshot_2024-01-01_12-00-00.png'
      }));
    });

    it('should throw for null source', async () => {
      await expect(service.takeScreenshot(null)).rejects.toThrow('Invalid source');
      expect(mockLogger.warn).toHaveBeenCalledWith('Cannot take screenshot - no source provided');
    });

    it('should throw for video without dimensions', async () => {
      await expect(service.takeScreenshot(mockVideoWithNoDims)).rejects.toThrow('Invalid video element');
    });

    it('should throw for unsupported source type', async () => {
      await expect(service.takeScreenshot({ notAVideo: true })).rejects.toThrow('Invalid source type');
    });

    it('should throw if blob creation fails', async () => {
      mockCanvas.toBlob = vi.fn((callback) => callback(null));

      await expect(service.takeScreenshot(mockVideo)).rejects.toThrow('Failed to create screenshot blob');
    });
  });

  describe('startRecording', () => {
    let mockStream;

    beforeEach(() => {
      mockStream = {
        getVideoTracks: vi.fn(() => [{ stop: vi.fn() }]),
        getAudioTracks: vi.fn(() => [])
      };
    });

    it('should start recording with stream', async () => {
      await service.startRecording(mockStream);

      expect(service.isRecording).toBe(true);
      expect(service.mediaRecorder).not.toBeNull();
    });

    it('should emit capture:recording-started event', async () => {
      await service.startRecording(mockStream);

      expect(mockEventBus.publish).toHaveBeenCalledWith('capture:recording-started');
    });

    it('should throw for missing stream', async () => {
      await expect(service.startRecording(null)).rejects.toThrow('No stream provided');
      expect(mockLogger.warn).toHaveBeenCalledWith('Cannot start recording - no stream provided');
    });

    it('should throw if already recording', async () => {
      await service.startRecording(mockStream);

      await expect(service.startRecording(mockStream)).rejects.toThrow('Already recording');
    });

    it('should fallback to vp9 if vp8 not supported', async () => {
      global.MediaRecorder.isTypeSupported = vi.fn((type) => !type.includes('vp8'));

      await service.startRecording(mockStream);

      expect(service.isRecording).toBe(true);
      expect(service.mediaRecorder.options.mimeType).toBe('video/webm;codecs=vp9');
    });

    it('should collect recorded chunks', async () => {
      await service.startRecording(mockStream);

      // Simulate data available
      const mockEvent = { data: { size: 100 } };
      service.mediaRecorder.ondataavailable(mockEvent);

      expect(service.recordedChunks).toContain(mockEvent.data);
    });

    it('should ignore empty data chunks', async () => {
      await service.startRecording(mockStream);

      // Simulate empty data
      service.mediaRecorder.ondataavailable({ data: { size: 0 } });

      expect(service.recordedChunks).toHaveLength(0);
    });
  });

  describe('stopRecording', () => {
    let mockStream;

    beforeEach(async () => {
      mockStream = {
        getVideoTracks: vi.fn(() => [{ stop: vi.fn() }]),
        getAudioTracks: vi.fn(() => [])
      };
      await service.startRecording(mockStream);
    });

    it('should stop recording', async () => {
      const stopSpy = vi.spyOn(service.mediaRecorder, 'stop');
      await service.stopRecording();

      expect(service.isRecording).toBe(false);
      expect(stopSpy).toHaveBeenCalled();
    });

    it('should emit capture:recording-stopped event', async () => {
      await service.stopRecording();

      expect(mockEventBus.publish).toHaveBeenCalledWith('capture:recording-stopped');
    });

    it('should throw if not recording', async () => {
      service.isRecording = false;

      await expect(service.stopRecording()).rejects.toThrow('Not recording');
    });
  });

  describe('toggleRecording', () => {
    let mockStream;

    beforeEach(() => {
      mockStream = {
        getVideoTracks: vi.fn(() => [{ stop: vi.fn() }]),
        getAudioTracks: vi.fn(() => [])
      };
    });

    it('should start recording when not recording', async () => {
      await service.toggleRecording(mockStream);

      expect(service.isRecording).toBe(true);
    });

    it('should stop recording when recording', async () => {
      await service.startRecording(mockStream);
      await service.toggleRecording(mockStream);

      expect(service.isRecording).toBe(false);
    });
  });

  describe('getRecordingState', () => {
    it('should return false when not recording', () => {
      expect(service.getRecordingState()).toBe(false);
    });

    it('should return true when recording', async () => {
      const mockStream = { getVideoTracks: vi.fn(() => []), getAudioTracks: vi.fn(() => []) };
      await service.startRecording(mockStream);

      expect(service.getRecordingState()).toBe(true);
    });
  });

  describe('_handleRecordingStop', () => {
    it('should emit capture:recording-ready with blob and filename', () => {
      service.recordedChunks = [{ size: 100 }, { size: 200 }];

      service._handleRecordingStop();

      expect(mockEventBus.publish).toHaveBeenCalledWith('capture:recording-ready', expect.objectContaining({
        filename: 'recording_2024-01-01_12-00-00.webm'
      }));
    });

    it('should clear recorded chunks after handling', () => {
      service.recordedChunks = [{ size: 100 }];

      service._handleRecordingStop();

      expect(service.recordedChunks).toEqual([]);
    });

    it('should warn and return if no recorded data', () => {
      service.recordedChunks = [];

      service._handleRecordingStop();

      expect(mockLogger.warn).toHaveBeenCalledWith('No recorded data to save');
      expect(mockEventBus.publish).not.toHaveBeenCalledWith('capture:recording-ready', expect.anything());
    });

    it('should skip processing when disposing', () => {
      service.recordedChunks = [{ size: 100 }];
      service._isDisposing = true;

      service._handleRecordingStop();

      expect(mockLogger.debug).toHaveBeenCalledWith('Skipping recording stop handler during dispose');
      expect(mockEventBus.publish).not.toHaveBeenCalledWith('capture:recording-ready', expect.anything());
    });
  });

  describe('_handleRecordingError', () => {
    it('should reset recording state and emit error event', () => {
      service.isRecording = true;
      service.recordedChunks = [{ size: 100 }];

      const mockEvent = {
        error: { message: 'Disk full', name: 'QuotaExceededError' }
      };

      service._handleRecordingError(mockEvent);

      expect(service.isRecording).toBe(false);
      expect(service.recordedChunks).toEqual([]);
      expect(mockEventBus.publish).toHaveBeenCalledWith('capture:recording-error', {
        error: 'Disk full',
        name: 'QuotaExceededError'
      });
    });

    it('should handle error event without error property', () => {
      service.isRecording = true;

      service._handleRecordingError({});

      expect(service.isRecording).toBe(false);
      expect(mockEventBus.publish).toHaveBeenCalledWith('capture:recording-error', {
        error: 'Recording failed',
        name: 'Error'
      });
    });
  });

  describe('dispose', () => {
    it('should set disposing flag', () => {
      service.dispose();

      expect(service._isDisposing).toBe(true);
    });

    it('should stop recording if active', async () => {
      const mockStream = { getVideoTracks: vi.fn(() => []), getAudioTracks: vi.fn(() => []) };
      await service.startRecording(mockStream);
      const stopSpy = vi.spyOn(service.mediaRecorder, 'stop');

      service.dispose();

      expect(stopSpy).toHaveBeenCalled();
    });

    it('should clear all state', () => {
      service.isRecording = true;
      service.recordedChunks = [{ size: 100 }];
      service.mediaRecorder = { stop: vi.fn() };

      service.dispose();

      expect(service.mediaRecorder).toBeNull();
      expect(service.recordedChunks).toEqual([]);
      expect(service.isRecording).toBe(false);
    });
  });

  describe('onerror handler', () => {
    it('should set up onerror handler on MediaRecorder', async () => {
      const mockStream = { getVideoTracks: vi.fn(() => []), getAudioTracks: vi.fn(() => []) };
      await service.startRecording(mockStream);

      expect(service.mediaRecorder.onerror).toBeDefined();
      expect(typeof service.mediaRecorder.onerror).toBe('function');
    });
  });
});
