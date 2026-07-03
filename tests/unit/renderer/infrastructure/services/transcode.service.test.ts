import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

vi.mock('@renderer/infrastructure/ipc/trpc-client', async () => {
  const { createTrpcClientMock } = await import('../../../../support/mocks/trpc-client.mock');
  return { trpcClient: createTrpcClientMock() };
});

import { TranscodeService } from '@renderer/infrastructure/services/transcode/transcode.service';
import { EventChannels } from '@platform/events';
import { trpcClient } from '@renderer/infrastructure/ipc/trpc-client';
import { emitTrpcData, getTrpcUnsubscribe } from '../../../../support/mocks/trpc-client.mock';
import { createEventBus, createLoggerFactory } from '../../../../factories/index.js';

describe('TranscodeService', () => {
  let service;
  let mockEventBus;
  let mockLogger;
  let mockLoggerFactory;

  beforeEach(() => {
    mockEventBus = createEventBus();
    mockLoggerFactory = createLoggerFactory();
    mockLogger = mockLoggerFactory.create('TranscodeService');

    vi.clearAllMocks();

    vi.mocked(trpcClient.transcode.start.mutate).mockResolvedValue({ success: true, jobId: 'job-123' });
    vi.mocked(trpcClient.transcode.cancel.mutate).mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should store eventBus', () => {
      service = new TranscodeService(mockEventBus, mockLoggerFactory);

      expect(service.eventBus).toBe(mockEventBus);
    });

    it('should create logger from loggerFactory', () => {
      service = new TranscodeService(mockEventBus, mockLoggerFactory);

      expect(mockLoggerFactory.create).toHaveBeenCalledWith('TranscodeService');
      expect(service.logger).toBe(mockLogger);
    });

    it('should initialize state properties', () => {
      service = new TranscodeService(mockEventBus, mockLoggerFactory);

      expect(service._isTranscoding).toBe(false);
      expect(service._activeJobId).toBeNull();
      expect(service._initialized).toBe(false);
    });
  });

  describe('initialize', () => {
    beforeEach(() => {
      service = new TranscodeService(mockEventBus, mockLoggerFactory);
    });

    it('should subscribe to tRPC push events', () => {
      service.initialize();

      expect(trpcClient.transcode.onProgress.subscribe).toHaveBeenCalledWith(undefined, { onData: expect.any(Function) });
      expect(trpcClient.transcode.onCompleted.subscribe).toHaveBeenCalledWith(undefined, { onData: expect.any(Function) });
      expect(trpcClient.transcode.onError.subscribe).toHaveBeenCalledWith(undefined, { onData: expect.any(Function) });
      expect(trpcClient.transcode.onCancelled.subscribe).toHaveBeenCalledWith(undefined, { onData: expect.any(Function) });
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

    it('should store a tRPC event bridge', () => {
      service.initialize();
      expect(service.disposables.size).toBe(1);
    });

    it('should warn and skip if already initialized', () => {
      service.initialize();
      mockLogger.warn.mockClear();

      service.initialize();

      expect(mockLogger.warn).toHaveBeenCalledWith('TranscodeService already initialized');
      expect(trpcClient.transcode.onProgress.subscribe).toHaveBeenCalledTimes(1);
    });
  });

  describe('transcode', () => {
    beforeEach(() => {
      service = new TranscodeService(mockEventBus, mockLoggerFactory);
      service.initialize();
    });

    it('should convert blob and call transcode.start.mutate', async () => {
      const mockBlob = new Blob(['test data'], { type: 'video/webm' });

      await service.transcode(mockBlob, 'mp4', 'output-name');

      expect(trpcClient.transcode.start.mutate).toHaveBeenCalledWith({
        inputBuffer: expect.any(ArrayBuffer),
        format: 'mp4',
        outputFilename: 'output-name',
        inputArgs: undefined,
        interrupted: false
      });
    });

    it('should pass inputArgs and interrupted flag when provided', async () => {
      const mockBlob = new Blob(['test data'], { type: 'video/webm' });
      const inputArgs = ['-fflags', '+genpts', '-err_detect', 'ignore_err'];

      await service.transcode(mockBlob, 'mp4', 'output-name', { inputArgs, interrupted: true });

      expect(trpcClient.transcode.start.mutate).toHaveBeenCalledWith({
        inputBuffer: expect.any(ArrayBuffer),
        format: 'mp4',
        outputFilename: 'output-name',
        inputArgs,
        interrupted: true
      });
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

    it('should return result from the tRPC call', async () => {
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

    it('should handle tRPC errors gracefully', async () => {
      vi.mocked(trpcClient.transcode.start.mutate).mockRejectedValue(new Error('FFmpeg not found'));
      const mockBlob = new Blob(['test data'], { type: 'video/webm' });

      const result = await service.transcode(mockBlob, 'mp4');

      expect(result).toEqual({ success: false, error: 'FFmpeg not found' });
      expect(mockLogger.error).toHaveBeenCalledWith('Transcode failed', expect.any(Error));
    });

    it('should not set state if the tRPC call returns failure', async () => {
      vi.mocked(trpcClient.transcode.start.mutate).mockResolvedValue({ success: false, error: 'Invalid format' });
      const mockBlob = new Blob(['test data'], { type: 'video/webm' });

      await service.transcode(mockBlob, 'mp4');

      expect(service._isTranscoding).toBe(false);
      expect(service._activeJobId).toBeNull();
    });
  });

  describe('cancel', () => {
    beforeEach(() => {
      service = new TranscodeService(mockEventBus, mockLoggerFactory);
      service.initialize();
    });

    it('should call transcode.cancel.mutate with active job id', async () => {
      const mockBlob = new Blob(['test data'], { type: 'video/webm' });
      await service.transcode(mockBlob, 'mp4');

      await service.cancel();

      expect(trpcClient.transcode.cancel.mutate).toHaveBeenCalledWith({ jobId: 'job-123' });
    });

    it('should return error if no transcoding in progress', async () => {
      const result = await service.cancel();

      expect(result).toEqual({ success: false, error: 'No transcoding in progress' });
      expect(mockLogger.warn).toHaveBeenCalledWith('No transcoding in progress to cancel');
    });

    it('should handle tRPC errors gracefully', async () => {
      vi.mocked(trpcClient.transcode.cancel.mutate).mockRejectedValue(new Error('Cancel failed'));
      const mockBlob = new Blob(['test data'], { type: 'video/webm' });
      await service.transcode(mockBlob, 'mp4');

      const result = await service.cancel();

      expect(result).toEqual({ success: false, error: 'Cancel failed' });
      expect(mockLogger.error).toHaveBeenCalledWith('Cancel transcode failed', expect.any(Error));
    });
  });

  describe('isTranscoding', () => {
    beforeEach(() => {
      service = new TranscodeService(mockEventBus, mockLoggerFactory);
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
    it('should return true', () => {
      service = new TranscodeService(mockEventBus, mockLoggerFactory);

      expect(service.isAvailable()).toBe(true);
    });
  });

  describe('tRPC Push Event Handlers', () => {
    beforeEach(() => {
      service = new TranscodeService(mockEventBus, mockLoggerFactory);

      service.initialize();
    });

    describe('_handleProgress', () => {
      it('should publish progress event', () => {
        const progressData = { percent: 50, timeRemaining: 10 };
        emitTrpcData(trpcClient.transcode.onProgress, progressData);

        expect(mockEventBus.publish).toHaveBeenCalledWith(
          EventChannels.TRANSCODE.PROGRESS,
          progressData
        );
      });
    });

    describe('_handleCompleted', () => {
      it('should publish completed event', () => {
        const completedData = { outputPath: '/path/to/file.mp4', duration: 5000 };
        emitTrpcData(trpcClient.transcode.onCompleted, completedData);

        expect(mockEventBus.publish).toHaveBeenCalledWith(
          EventChannels.TRANSCODE.COMPLETED,
          completedData
        );
      });

      it('should reset transcoding state', async () => {
        const mockBlob = new Blob(['test data'], { type: 'video/webm' });
        await service.transcode(mockBlob, 'mp4');
        expect(service._isTranscoding).toBe(true);

        emitTrpcData(trpcClient.transcode.onCompleted, {});

        expect(service._isTranscoding).toBe(false);
        expect(service._activeJobId).toBeNull();
      });

      it('should log completion', () => {
        const completedData = { outputPath: '/path/to/file.mp4' };
        emitTrpcData(trpcClient.transcode.onCompleted, completedData);

        expect(mockLogger.info).toHaveBeenCalledWith('Transcode completed', completedData);
      });
    });

    describe('_handleError', () => {
      it('should publish error event', () => {
        const errorData = { message: 'Encoding failed', code: 'ENCODER_ERROR' };
        emitTrpcData(trpcClient.transcode.onError, errorData);

        expect(mockEventBus.publish).toHaveBeenCalledWith(
          EventChannels.TRANSCODE.ERROR,
          errorData
        );
      });

      it('should reset transcoding state', async () => {
        const mockBlob = new Blob(['test data'], { type: 'video/webm' });
        await service.transcode(mockBlob, 'mp4');

        emitTrpcData(trpcClient.transcode.onError, { message: 'Failed' });

        expect(service._isTranscoding).toBe(false);
        expect(service._activeJobId).toBeNull();
      });

      it('should log error', () => {
        const errorData = { message: 'Failed' };
        emitTrpcData(trpcClient.transcode.onError, errorData);

        expect(mockLogger.error).toHaveBeenCalledWith('Transcode error', errorData);
      });
    });

    describe('_handleCancelled', () => {
      it('should publish cancelled event', () => {
        const cancelledData = { jobId: 'job-123' };
        emitTrpcData(trpcClient.transcode.onCancelled, cancelledData);

        expect(mockEventBus.publish).toHaveBeenCalledWith(
          EventChannels.TRANSCODE.CANCELLED,
          cancelledData
        );
      });

      it('should reset transcoding state', async () => {
        const mockBlob = new Blob(['test data'], { type: 'video/webm' });
        await service.transcode(mockBlob, 'mp4');

        emitTrpcData(trpcClient.transcode.onCancelled, {});

        expect(service._isTranscoding).toBe(false);
        expect(service._activeJobId).toBeNull();
      });

      it('should log cancellation', () => {
        const cancelledData = { jobId: 'job-123' };
        emitTrpcData(trpcClient.transcode.onCancelled, cancelledData);

        expect(mockLogger.info).toHaveBeenCalledWith('Transcode cancelled', cancelledData);
      });
    });
  });

  describe('dispose', () => {
    beforeEach(() => {
      service = new TranscodeService(mockEventBus, mockLoggerFactory);
    });

    it('should unsubscribe all bridge-owned tRPC subscriptions', () => {
      service.initialize();
      const unsubscribeProgress = getTrpcUnsubscribe(trpcClient.transcode.onProgress);
      const unsubscribeCompleted = getTrpcUnsubscribe(trpcClient.transcode.onCompleted);

      service.dispose();

      expect(unsubscribeProgress).toHaveBeenCalled();
      expect(unsubscribeCompleted).toHaveBeenCalled();
    });

    it('should clear the event bridge on dispose', () => {
      service.initialize();
      expect(service.disposables.size).toBe(1);

      service.dispose();

      expect(service.disposables.size).toBe(0);
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
  });
});
