/**
 * TranscodeService (Renderer) Unit Tests
 * Tests the bridge between window.transcodeAPI and EventBus
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TranscodeService } from '@renderer/infrastructure/services/transcode/transcode.service.ts';
import { EventChannels } from '@shared/events/event-channels.js';

describe('TranscodeService', () => {
  let service;
  let mockEventBus;
  let mockLogger;
  let mockLoggerFactory;
  let mockTranscodeAPI;

  beforeEach(() => {
    // Create mock EventBus
    mockEventBus = {
      subscribe: vi.fn(),
      publish: vi.fn()
    };

    // Create mock logger
    mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    mockLoggerFactory = {
      create: vi.fn(() => mockLogger)
    };

    // Create mock transcodeAPI
    mockTranscodeAPI = {
      start: vi.fn().mockResolvedValue({ success: true, jobId: 'job-123' }),
      cancel: vi.fn().mockResolvedValue({ success: true }),
      getStatus: vi.fn().mockResolvedValue({ isTranscoding: false }),
      onProgress: vi.fn().mockReturnValue(vi.fn()),
      onCompleted: vi.fn().mockReturnValue(vi.fn()),
      onError: vi.fn().mockReturnValue(vi.fn()),
      onCancelled: vi.fn().mockReturnValue(vi.fn())
    };

    // Set up window.transcodeAPI
    global.window = { transcodeAPI: mockTranscodeAPI };

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete global.window;
  });

  describe('Constructor', () => {
    it('should store eventBus', () => {
      service = new TranscodeService({
        eventBus: mockEventBus,
        loggerFactory: mockLoggerFactory
      });

      expect(service.eventBus).toBe(mockEventBus);
    });

    it('should create logger from loggerFactory', () => {
      service = new TranscodeService({
        eventBus: mockEventBus,
        loggerFactory: mockLoggerFactory
      });

      expect(mockLoggerFactory.create).toHaveBeenCalledWith('TranscodeService');
      expect(service.logger).toBe(mockLogger);
    });

    it('should initialize state properties', () => {
      service = new TranscodeService({
        eventBus: mockEventBus,
        loggerFactory: mockLoggerFactory
      });

      expect(service._isTranscoding).toBe(false);
      expect(service._activeJobId).toBeNull();
      expect(service._eventBridge).toBeNull();
      expect(service._initialized).toBe(false);
    });
  });

  describe('initialize', () => {
    beforeEach(() => {
      service = new TranscodeService({
        eventBus: mockEventBus,
        loggerFactory: mockLoggerFactory
      });
    });

    it('should subscribe to IPC events', () => {
      service.initialize();

      expect(mockTranscodeAPI.onProgress).toHaveBeenCalledWith(expect.any(Function));
      expect(mockTranscodeAPI.onCompleted).toHaveBeenCalledWith(expect.any(Function));
      expect(mockTranscodeAPI.onError).toHaveBeenCalledWith(expect.any(Function));
      expect(mockTranscodeAPI.onCancelled).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should set initialized flag', () => {
      service.initialize();
      expect(service._initialized).toBe(true);
    });

    it('should log initialization', () => {
      service.initialize();
      expect(mockLogger.info).toHaveBeenCalledWith('Initializing TranscodeService');
      expect(mockLogger.info).toHaveBeenCalledWith('TranscodeService initialized');
    });

    it('should store a preload event bridge', () => {
      service.initialize();
      expect(service._eventBridge.size).toBe(4);
    });

    it('should warn and skip if already initialized', () => {
      service.initialize();
      mockLogger.warn.mockClear();

      service.initialize();

      expect(mockLogger.warn).toHaveBeenCalledWith('TranscodeService already initialized');
      expect(mockTranscodeAPI.onProgress).toHaveBeenCalledTimes(1);
    });

    it('should warn and skip if transcodeAPI is not available', () => {
      global.window = {};
      service = new TranscodeService({
        eventBus: mockEventBus,
        loggerFactory: mockLoggerFactory
      });

      service.initialize();

      expect(mockLogger.warn).toHaveBeenCalledWith('transcodeAPI not available - transcoding disabled');
      expect(service._initialized).toBe(false);
    });
  });

  describe('transcode', () => {
    beforeEach(() => {
      service = new TranscodeService({
        eventBus: mockEventBus,
        loggerFactory: mockLoggerFactory
      });
      service.initialize();
    });

    it('should convert blob and call transcodeAPI.start', async () => {
      const mockBlob = new Blob(['test data'], { type: 'video/webm' });

      await service.transcode(mockBlob, 'mp4', 'output-name');

      expect(mockTranscodeAPI.start).toHaveBeenCalledWith(
        expect.any(ArrayBuffer),
        'mp4',
        'output-name',
        expect.objectContaining({ interrupted: false })
      );
    });

    it('should pass inputArgs and interrupted flag when provided', async () => {
      const mockBlob = new Blob(['test data'], { type: 'video/webm' });
      const inputArgs = ['-fflags', '+genpts', '-err_detect', 'ignore_err'];

      await service.transcode(mockBlob, 'mp4', 'output-name', { inputArgs, interrupted: true });

      expect(mockTranscodeAPI.start).toHaveBeenCalledWith(
        expect.any(ArrayBuffer),
        'mp4',
        'output-name',
        { inputArgs, interrupted: true }
      );
    });

    it('should publish STARTED event on success', async () => {
      const mockBlob = new Blob(['test data'], { type: 'video/webm' });

      await service.transcode(mockBlob, 'mp4');

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.TRANSCODE.STARTED,
        { jobId: 'job-123', format: 'mp4' }
      );
    });

    it('should set transcoding state on success', async () => {
      const mockBlob = new Blob(['test data'], { type: 'video/webm' });

      await service.transcode(mockBlob, 'mp4');

      expect(service._isTranscoding).toBe(true);
      expect(service._activeJobId).toBe('job-123');
    });

    it('should return result from API', async () => {
      const mockBlob = new Blob(['test data'], { type: 'video/webm' });

      const result = await service.transcode(mockBlob, 'mp4');

      expect(result).toEqual({ success: true, jobId: 'job-123' });
    });

    it('should reject if already transcoding', async () => {
      const mockBlob = new Blob(['test data'], { type: 'video/webm' });

      await service.transcode(mockBlob, 'mp4');
      const result = await service.transcode(mockBlob, 'mov');

      expect(result).toEqual({ success: false, error: 'Transcoding already in progress' });
      expect(mockLogger.warn).toHaveBeenCalledWith('Transcoding already in progress');
    });

    it('should handle API errors gracefully', async () => {
      mockTranscodeAPI.start.mockRejectedValue(new Error('FFmpeg not found'));
      const mockBlob = new Blob(['test data'], { type: 'video/webm' });

      const result = await service.transcode(mockBlob, 'mp4');

      expect(result).toEqual({ success: false, error: 'FFmpeg not found' });
      expect(mockLogger.error).toHaveBeenCalledWith('Transcode failed', expect.any(Error));
    });

    it('should return error if transcodeAPI is not available', async () => {
      global.window = {};
      service = new TranscodeService({
        eventBus: mockEventBus,
        loggerFactory: mockLoggerFactory
      });
      const mockBlob = new Blob(['test data'], { type: 'video/webm' });

      const result = await service.transcode(mockBlob, 'mp4');

      expect(result).toEqual({ success: false, error: 'Transcoding not available' });
    });

    it('should not set state if API returns failure', async () => {
      mockTranscodeAPI.start.mockResolvedValue({ success: false, error: 'Invalid format' });
      const mockBlob = new Blob(['test data'], { type: 'video/webm' });

      await service.transcode(mockBlob, 'mp4');

      expect(service._isTranscoding).toBe(false);
      expect(service._activeJobId).toBeNull();
    });
  });

  describe('cancel', () => {
    beforeEach(() => {
      service = new TranscodeService({
        eventBus: mockEventBus,
        loggerFactory: mockLoggerFactory
      });
      service.initialize();
    });

    it('should call transcodeAPI.cancel with active job id', async () => {
      const mockBlob = new Blob(['test data'], { type: 'video/webm' });
      await service.transcode(mockBlob, 'mp4');

      await service.cancel();

      expect(mockTranscodeAPI.cancel).toHaveBeenCalledWith('job-123');
    });

    it('should return error if no transcoding in progress', async () => {
      const result = await service.cancel();

      expect(result).toEqual({ success: false, error: 'No transcoding in progress' });
      expect(mockLogger.warn).toHaveBeenCalledWith('No transcoding in progress to cancel');
    });

    it('should return error if transcodeAPI is not available', async () => {
      global.window = {};
      service = new TranscodeService({
        eventBus: mockEventBus,
        loggerFactory: mockLoggerFactory
      });

      const result = await service.cancel();

      expect(result).toEqual({ success: false, error: 'Transcoding not available' });
    });
  });

  describe('isTranscoding', () => {
    beforeEach(() => {
      service = new TranscodeService({
        eventBus: mockEventBus,
        loggerFactory: mockLoggerFactory
      });
    });

    it('should return false initially', () => {
      expect(service.isTranscoding()).toBe(false);
    });

    it('should return true during transcoding', async () => {
      service.initialize();
      const mockBlob = new Blob(['test data'], { type: 'video/webm' });
      await service.transcode(mockBlob, 'mp4');

      expect(service.isTranscoding()).toBe(true);
    });
  });

  describe('isAvailable', () => {
    it('should return true when transcodeAPI exists', () => {
      service = new TranscodeService({
        eventBus: mockEventBus,
        loggerFactory: mockLoggerFactory
      });

      expect(service.isAvailable()).toBe(true);
    });

    it('should return false when transcodeAPI is missing', () => {
      global.window = {};
      service = new TranscodeService({
        eventBus: mockEventBus,
        loggerFactory: mockLoggerFactory
      });

      expect(service.isAvailable()).toBe(false);
    });
  });

  describe('IPC Event Handlers', () => {
    let progressHandler;
    let completedHandler;
    let errorHandler;
    let cancelledHandler;

    beforeEach(() => {
      service = new TranscodeService({
        eventBus: mockEventBus,
        loggerFactory: mockLoggerFactory
      });

      // Capture the handlers when initialize is called
      mockTranscodeAPI.onProgress.mockImplementation((handler) => {
        progressHandler = handler;
        return vi.fn();
      });
      mockTranscodeAPI.onCompleted.mockImplementation((handler) => {
        completedHandler = handler;
        return vi.fn();
      });
      mockTranscodeAPI.onError.mockImplementation((handler) => {
        errorHandler = handler;
        return vi.fn();
      });
      mockTranscodeAPI.onCancelled.mockImplementation((handler) => {
        cancelledHandler = handler;
        return vi.fn();
      });

      service.initialize();
    });

    describe('_handleProgress', () => {
      it('should publish progress event', () => {
        const progressData = { percent: 50, timeRemaining: 10 };
        progressHandler(progressData);

        expect(mockEventBus.publish).toHaveBeenCalledWith(
          EventChannels.TRANSCODE.PROGRESS,
          progressData
        );
      });
    });

    describe('_handleCompleted', () => {
      it('should publish completed event', () => {
        const completedData = { outputPath: '/path/to/file.mp4', duration: 5000 };
        completedHandler(completedData);

        expect(mockEventBus.publish).toHaveBeenCalledWith(
          EventChannels.TRANSCODE.COMPLETED,
          completedData
        );
      });

      it('should reset transcoding state', async () => {
        const mockBlob = new Blob(['test data'], { type: 'video/webm' });
        await service.transcode(mockBlob, 'mp4');
        expect(service._isTranscoding).toBe(true);

        completedHandler({});

        expect(service._isTranscoding).toBe(false);
        expect(service._activeJobId).toBeNull();
      });

      it('should log completion', () => {
        const completedData = { outputPath: '/path/to/file.mp4' };
        completedHandler(completedData);

        expect(mockLogger.info).toHaveBeenCalledWith('Transcode completed', completedData);
      });
    });

    describe('_handleError', () => {
      it('should publish error event', () => {
        const errorData = { message: 'Encoding failed', code: 'ENCODER_ERROR' };
        errorHandler(errorData);

        expect(mockEventBus.publish).toHaveBeenCalledWith(
          EventChannels.TRANSCODE.ERROR,
          errorData
        );
      });

      it('should reset transcoding state', async () => {
        const mockBlob = new Blob(['test data'], { type: 'video/webm' });
        await service.transcode(mockBlob, 'mp4');

        errorHandler({ message: 'Failed' });

        expect(service._isTranscoding).toBe(false);
        expect(service._activeJobId).toBeNull();
      });

      it('should log error', () => {
        const errorData = { message: 'Failed' };
        errorHandler(errorData);

        expect(mockLogger.error).toHaveBeenCalledWith('Transcode error', errorData);
      });
    });

    describe('_handleCancelled', () => {
      it('should publish cancelled event', () => {
        const cancelledData = { jobId: 'job-123' };
        cancelledHandler(cancelledData);

        expect(mockEventBus.publish).toHaveBeenCalledWith(
          EventChannels.TRANSCODE.CANCELLED,
          cancelledData
        );
      });

      it('should reset transcoding state', async () => {
        const mockBlob = new Blob(['test data'], { type: 'video/webm' });
        await service.transcode(mockBlob, 'mp4');

        cancelledHandler({});

        expect(service._isTranscoding).toBe(false);
        expect(service._activeJobId).toBeNull();
      });

      it('should log cancellation', () => {
        const cancelledData = { jobId: 'job-123' };
        cancelledHandler(cancelledData);

        expect(mockLogger.info).toHaveBeenCalledWith('Transcode cancelled', cancelledData);
      });
    });
  });

  describe('dispose', () => {
    beforeEach(() => {
      service = new TranscodeService({
        eventBus: mockEventBus,
        loggerFactory: mockLoggerFactory
      });
    });

    it('should dispose all bridge-owned unsubscribe functions', () => {
      const cleanup1 = vi.fn();
      const cleanup2 = vi.fn();
      mockTranscodeAPI.onProgress.mockReturnValue(cleanup1);
      mockTranscodeAPI.onCompleted.mockReturnValue(cleanup2);

      service.initialize();
      service.dispose();

      expect(cleanup1).toHaveBeenCalled();
      expect(cleanup2).toHaveBeenCalled();
    });

    it('should clear event bridge reference', () => {
      service.initialize();
      service.dispose();

      expect(service._eventBridge).toBeNull();
    });

    it('should reset state', () => {
      service.initialize();
      service.dispose();

      expect(service._isTranscoding).toBe(false);
      expect(service._activeJobId).toBeNull();
      expect(service._initialized).toBe(false);
    });

    it('should log disposal', () => {
      service.initialize();
      service.dispose();

      expect(mockLogger.info).toHaveBeenCalledWith('TranscodeService disposed');
    });

    it('should handle a missing event bridge gracefully', () => {
      service.initialize();
      service._eventBridge = null;

      expect(() => service.dispose()).not.toThrow();
    });

    it('should be safe when transcodeAPI is missing', () => {
      global.window = {};
      service = new TranscodeService({
        eventBus: mockEventBus,
        loggerFactory: mockLoggerFactory
      });

      expect(() => service.dispose()).not.toThrow();
    });
  });
});
