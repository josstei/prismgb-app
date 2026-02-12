/**
 * CaptureSaveService Unit Tests
 * Tests the save coordination for recordings and screenshots with optional transcoding
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CaptureSaveService } from '@renderer/infrastructure/services/capture/capture-save.service.ts';
import { EventChannels } from '@renderer/infrastructure/events/event-channels.config.js';
import { downloadFile } from '@renderer/application/lib/file-download.utils';

vi.mock('@renderer/application/lib/file-download.utils', () => ({
  downloadFile: vi.fn()
}));

describe('CaptureSaveService', () => {
  let service;
  let mockEventBus;
  let mockSettingsService;
  let mockTranscodeService;
  let mockLogger;
  let mockLoggerFactory;

  beforeEach(() => {
    // Create mock EventBus
    mockEventBus = {
      subscribe: vi.fn(),
      publish: vi.fn()
    };

    // Create mock SettingsService
    mockSettingsService = {
      getRecordingFormat: vi.fn().mockReturnValue('webm')
    };

    // Create mock TranscodeService
    mockTranscodeService = {
      isAvailable: vi.fn().mockReturnValue(true),
      transcode: vi.fn().mockResolvedValue({ success: true, jobId: 'job-123' })
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

    downloadFile.mockResolvedValue();

    // Mock DOM APIs
    global.URL = {
      createObjectURL: vi.fn().mockReturnValue('blob:test-url'),
      revokeObjectURL: vi.fn()
    };

    global.document = {
      createElement: vi.fn().mockReturnValue({
        href: '',
        download: '',
        click: vi.fn(),
        style: {}
      }),
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn()
      }
    };

    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete global.URL;
    delete global.document;
  });

  describe('Constructor', () => {
    it('should store required dependencies', () => {
      service = new CaptureSaveService({
        eventBus: mockEventBus,
        settingsService: mockSettingsService,
        transcodeService: mockTranscodeService,
        loggerFactory: mockLoggerFactory
      });

      expect(service.eventBus).toBe(mockEventBus);
      expect(service.settingsService).toBe(mockSettingsService);
      expect(service.transcodeService).toBe(mockTranscodeService);
    });

    it('should create logger from loggerFactory', () => {
      service = new CaptureSaveService({
        eventBus: mockEventBus,
        settingsService: mockSettingsService,
        transcodeService: mockTranscodeService,
        loggerFactory: mockLoggerFactory
      });

      expect(mockLoggerFactory.create).toHaveBeenCalledWith('CaptureSaveService');
    });
  });

  describe('saveRecording', () => {
    beforeEach(() => {
      service = new CaptureSaveService({
        eventBus: mockEventBus,
        settingsService: mockSettingsService,
        transcodeService: mockTranscodeService,
        loggerFactory: mockLoggerFactory
      });
    });

    describe('when format is webm', () => {
      it('should use direct save', async () => {
        mockSettingsService.getRecordingFormat.mockReturnValue('webm');
        const mockBlob = new Blob(['test data'], { type: 'video/webm' });

        const result = await service.saveRecording(mockBlob, 'recording.webm');

        expect(result).toEqual({ success: true, transcoded: false });
        expect(downloadFile).toHaveBeenCalledWith(mockBlob, 'recording.webm');
        expect(mockTranscodeService.transcode).not.toHaveBeenCalled();
      });

      it('should log format preference', async () => {
        mockSettingsService.getRecordingFormat.mockReturnValue('webm');
        const mockBlob = new Blob(['test data'], { type: 'video/webm' });

        await service.saveRecording(mockBlob, 'recording.webm');

        expect(mockLogger.info).toHaveBeenCalledWith('Saving recording with format preference: webm');
      });
    });

    describe('when transcoding is not available', () => {
      it('should use direct save regardless of format', async () => {
        mockSettingsService.getRecordingFormat.mockReturnValue('mp4');
        mockTranscodeService.isAvailable.mockReturnValue(false);
        const mockBlob = new Blob(['test data'], { type: 'video/webm' });

        const result = await service.saveRecording(mockBlob, 'recording.webm');

        expect(result).toEqual({ success: true, transcoded: false });
        expect(downloadFile).toHaveBeenCalledWith(mockBlob, 'recording.webm');
        expect(mockTranscodeService.transcode).not.toHaveBeenCalled();
      });
    });

    describe('when format requires transcoding', () => {
      it('should call transcodeService for mp4', async () => {
        mockSettingsService.getRecordingFormat.mockReturnValue('mp4');
        const mockBlob = new Blob(['test data'], { type: 'video/webm' });

        await service.saveRecording(mockBlob, 'recording.webm');

        expect(mockTranscodeService.transcode).toHaveBeenCalledWith(
          mockBlob,
          'mp4',
          'recording',
          expect.objectContaining({ interrupted: false })
        );
      });

      it('should call transcodeService for mov', async () => {
        mockSettingsService.getRecordingFormat.mockReturnValue('mov');
        const mockBlob = new Blob(['test data'], { type: 'video/webm' });

        await service.saveRecording(mockBlob, 'recording.webm');

        expect(mockTranscodeService.transcode).toHaveBeenCalledWith(
          mockBlob,
          'mov',
          'recording',
          expect.objectContaining({ interrupted: false })
        );
      });

      it('should return transcoded true on success', async () => {
        mockSettingsService.getRecordingFormat.mockReturnValue('mp4');
        const mockBlob = new Blob(['test data'], { type: 'video/webm' });

        const result = await service.saveRecording(mockBlob, 'recording.webm');

        expect(result).toEqual({ success: true, transcoded: true });
      });

      it('should handle transcode failure', async () => {
        mockSettingsService.getRecordingFormat.mockReturnValue('mp4');
        mockTranscodeService.transcode.mockResolvedValue({
          success: false,
          error: 'FFmpeg not found'
        });
        const mockBlob = new Blob(['test data'], { type: 'video/webm' });

        const result = await service.saveRecording(mockBlob, 'recording.webm');

        expect(result).toEqual({ success: false, error: 'FFmpeg not found' });
        expect(mockEventBus.publish).toHaveBeenCalledWith(
          EventChannels.UI.STATUS_MESSAGE,
          {
            message: 'Conversion failed: FFmpeg not found',
            type: 'error'
          }
        );
      });

      it('should handle transcode exception', async () => {
        mockSettingsService.getRecordingFormat.mockReturnValue('mp4');
        mockTranscodeService.transcode.mockRejectedValue(new Error('Network error'));
        const mockBlob = new Blob(['test data'], { type: 'video/webm' });

        const result = await service.saveRecording(mockBlob, 'recording.webm');

        expect(result).toEqual({ success: false, error: 'Network error' });
        expect(mockLogger.error).toHaveBeenCalledWith('Transcode and save failed', expect.any(Error));
      });

      it('should extract base name correctly from filename', async () => {
        mockSettingsService.getRecordingFormat.mockReturnValue('mp4');
        const mockBlob = new Blob(['test data'], { type: 'video/webm' });

        await service.saveRecording(mockBlob, 'my-recording-2024-01-15.webm');

        expect(mockTranscodeService.transcode).toHaveBeenCalledWith(
          mockBlob,
          'mp4',
          'my-recording-2024-01-15',
          expect.objectContaining({ interrupted: false })
        );
      });

      it('should pass interrupted flag and inputArgs when recording was interrupted', async () => {
        mockSettingsService.getRecordingFormat.mockReturnValue('mp4');
        const mockBlob = new Blob(['test data'], { type: 'video/webm' });

        await service.saveRecording(mockBlob, 'recording.webm', { interrupted: true });

        expect(mockTranscodeService.transcode).toHaveBeenCalledWith(
          mockBlob,
          'mp4',
          'recording',
          {
            inputArgs: ['-fflags', '+genpts', '-err_detect', 'ignore_err'],
            interrupted: true
          }
        );
      });
    });
  });

  describe('saveScreenshot', () => {
    beforeEach(() => {
      service = new CaptureSaveService({
        eventBus: mockEventBus,
        settingsService: mockSettingsService,
        transcodeService: mockTranscodeService,
        loggerFactory: mockLoggerFactory
      });
    });

    it('should use direct save', async () => {
      const mockBlob = new Blob(['image data'], { type: 'image/png' });

      const result = await service.saveScreenshot(mockBlob, 'screenshot.png');

      expect(result).toEqual({ success: true, transcoded: false });
      expect(downloadFile).toHaveBeenCalledWith(mockBlob, 'screenshot.png');
      expect(mockTranscodeService.transcode).not.toHaveBeenCalled();
    });
  });

  describe('_directSave', () => {
    beforeEach(() => {
      service = new CaptureSaveService({
        eventBus: mockEventBus,
        settingsService: mockSettingsService,
        transcodeService: mockTranscodeService,
        loggerFactory: mockLoggerFactory
      });
    });

    it('should call downloadFile', async () => {
      const mockBlob = new Blob(['test'], { type: 'video/webm' });

      await service.saveRecording(mockBlob, 'file.webm');

      expect(downloadFile).toHaveBeenCalledWith(mockBlob, 'file.webm');
    });

    it('should log success', async () => {
      const mockBlob = new Blob(['test'], { type: 'video/webm' });

      await service.saveRecording(mockBlob, 'file.webm');

      expect(mockLogger.info).toHaveBeenCalledWith('Direct save completed: file.webm');
    });

    it('should handle errors', async () => {
      const mockBlob = new Blob(['test'], { type: 'video/webm' });
      downloadFile.mockRejectedValue(new Error('Blob too large'));

      const result = await service.saveRecording(mockBlob, 'file.webm');

      expect(result).toEqual({ success: false, error: 'Blob too large' });
      expect(mockLogger.error).toHaveBeenCalledWith('Direct save failed', expect.any(Error));
    });
  });

  describe('dispose', () => {
    it('should log disposal', () => {
      service = new CaptureSaveService({
        eventBus: mockEventBus,
        settingsService: mockSettingsService,
        transcodeService: mockTranscodeService,
        loggerFactory: mockLoggerFactory
      });

      service.dispose();

      expect(mockLogger.info).toHaveBeenCalledWith('CaptureSaveService disposed');
    });
  });
});
