/**
 * CaptureSaveService Unit Tests
 * Tests the save coordination for recordings and screenshots with optional transcoding
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CaptureSaveService } from '@renderer/infrastructure/services/capture/capture-save.service';
import { EventChannels } from '@platform/events';

import {
  createEventBus,
  createLoggerFactory,
  createTranscodeServiceMock,
  createSettingsServiceMock
} from '../../../../../factories/index.js';

type CaptureSaveServiceDependencies = {
  eventBus: ReturnType<typeof createEventBus>;
  settingsService: ReturnType<typeof createSettingsServiceMock>;
  transcodeService: ReturnType<typeof createTranscodeServiceMock>;
};

describe('CaptureSaveService', () => {
  const downloadFile = vi.fn<(blob: Blob, filename: string) => Promise<void>>();
  let service: CaptureSaveService;
  let mockEventBus: ReturnType<typeof createEventBus>;
  let mockSettingsService: ReturnType<typeof createSettingsServiceMock>;
  let mockTranscodeService: ReturnType<typeof createTranscodeServiceMock>;
  let mockLogger: ReturnType<ReturnType<typeof createLoggerFactory>['create']>;
  let mockLoggerFactory: ReturnType<typeof createLoggerFactory>;

  function serviceDependencies(): CaptureSaveServiceDependencies {
    return service as unknown as CaptureSaveServiceDependencies;
  }

  beforeEach(() => {
    mockEventBus = createEventBus();

    mockSettingsService = createSettingsServiceMock({
      values: {
        recordingFormat: 'webm'
      }
    });

    mockTranscodeService = createTranscodeServiceMock({
      transcode: vi.fn().mockResolvedValue({ status: 'ok', value: { jobId: 'job-123' } })
    });

    mockLoggerFactory = createLoggerFactory();
    mockLogger = mockLoggerFactory.create('CaptureSaveService');

    vi.mocked(downloadFile).mockResolvedValue();

    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Constructor', () => {
    it('should store required dependencies', () => {
      service = new CaptureSaveService({ downloadFile, eventBus: mockEventBus, settingsService: mockSettingsService, transcodeService: mockTranscodeService, loggerFactory: mockLoggerFactory });

      expect(serviceDependencies().eventBus).toBe(mockEventBus);
      expect(serviceDependencies().settingsService).toBe(mockSettingsService);
      expect(serviceDependencies().transcodeService).toBe(mockTranscodeService);
    });

  });

  describe('saveRecording', () => {
    beforeEach(() => {
      service = new CaptureSaveService({ downloadFile, eventBus: mockEventBus, settingsService: mockSettingsService, transcodeService: mockTranscodeService, loggerFactory: mockLoggerFactory });
    });

    describe('when format is webm', () => {
      it('should use direct save', async () => {
        mockSettingsService.setSetting('recordingFormat', 'webm');
        const mockBlob = new Blob(['test data'], { type: 'video/webm' });

        const result = await service.saveRecording(mockBlob, 'recording.webm');

        expect(result).toEqual({ success: true, transcoded: false });
        expect(downloadFile).toHaveBeenCalledWith(mockBlob, 'recording.webm');
        expect(mockTranscodeService.transcode).not.toHaveBeenCalled();
      });

      it('should log format preference', async () => {
        mockSettingsService.setSetting('recordingFormat', 'webm');
        const mockBlob = new Blob(['test data'], { type: 'video/webm' });

        await service.saveRecording(mockBlob, 'recording.webm');

        expect(mockLogger.info).toHaveBeenCalledWith('Saving recording with format preference: webm');
      });
    });

    describe('when format requires transcoding', () => {
      it('should call transcodeService for mp4', async () => {
        mockSettingsService.setSetting('recordingFormat', 'mp4');
        const mockBlob = new Blob(['test data'], { type: 'video/webm' });

        await service.saveRecording(mockBlob, 'recording.webm');

        expect(mockTranscodeService.transcode).toHaveBeenCalledWith(
          mockBlob,
          'mp4',
          'recording',
          {}
        );
      });

      it('should call transcodeService for mov', async () => {
        mockSettingsService.setSetting('recordingFormat', 'mov');
        const mockBlob = new Blob(['test data'], { type: 'video/webm' });

        await service.saveRecording(mockBlob, 'recording.webm');

        expect(mockTranscodeService.transcode).toHaveBeenCalledWith(
          mockBlob,
          'mov',
          'recording',
          {}
        );
      });

      it('should return transcoded true on success', async () => {
        mockSettingsService.setSetting('recordingFormat', 'mp4');
        const mockBlob = new Blob(['test data'], { type: 'video/webm' });

        const result = await service.saveRecording(mockBlob, 'recording.webm');

        expect(result).toEqual({ success: true, transcoded: true });
      });

      it('should handle transcode failure', async () => {
        mockSettingsService.setSetting('recordingFormat', 'mp4');
        mockTranscodeService.transcode.mockResolvedValue({
          status: 'error',
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
        mockSettingsService.setSetting('recordingFormat', 'mp4');
        mockTranscodeService.transcode.mockRejectedValue(new Error('Network error'));
        const mockBlob = new Blob(['test data'], { type: 'video/webm' });

        const result = await service.saveRecording(mockBlob, 'recording.webm');

        expect(result).toEqual({ success: false, error: 'Network error' });
        expect(mockLogger.error).toHaveBeenCalledWith('Transcode and save failed', expect.any(Error));
      });

      it('should extract base name correctly from filename', async () => {
        mockSettingsService.setSetting('recordingFormat', 'mp4');
        const mockBlob = new Blob(['test data'], { type: 'video/webm' });

        await service.saveRecording(mockBlob, 'my-recording-2024-01-15.webm');

        expect(mockTranscodeService.transcode).toHaveBeenCalledWith(
          mockBlob,
          'mp4',
          'my-recording-2024-01-15',
          {}
        );
      });

      it('should pass recovery inputArgs when recording was interrupted', async () => {
        mockSettingsService.setSetting('recordingFormat', 'mp4');
        const mockBlob = new Blob(['test data'], { type: 'video/webm' });

        await service.saveRecording(mockBlob, 'recording.webm', { interrupted: true });

        expect(mockTranscodeService.transcode).toHaveBeenCalledWith(
          mockBlob,
          'mp4',
          'recording',
          {
            inputArgs: ['-fflags', '+genpts', '-err_detect', 'ignore_err'],
          }
        );
      });
    });
  });

  describe('saveScreenshot', () => {
    beforeEach(() => {
      service = new CaptureSaveService({ downloadFile, eventBus: mockEventBus, settingsService: mockSettingsService, transcodeService: mockTranscodeService, loggerFactory: mockLoggerFactory });
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
      service = new CaptureSaveService({ downloadFile, eventBus: mockEventBus, settingsService: mockSettingsService, transcodeService: mockTranscodeService, loggerFactory: mockLoggerFactory });
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
      vi.mocked(downloadFile).mockRejectedValue(new Error('Blob too large'));

      const result = await service.saveRecording(mockBlob, 'file.webm');

      expect(result).toEqual({ success: false, error: 'Blob too large' });
      expect(mockLogger.error).toHaveBeenCalledWith('Direct save failed', expect.any(Error));
    });
  });

  describe('dispose', () => {
    it('should log disposal', async () => {
      service = new CaptureSaveService({ downloadFile, eventBus: mockEventBus, settingsService: mockSettingsService, transcodeService: mockTranscodeService, loggerFactory: mockLoggerFactory });

      await service.dispose();

      expect(mockLogger.info).toHaveBeenCalledWith('CaptureSaveService disposed');
    });
  });
});
