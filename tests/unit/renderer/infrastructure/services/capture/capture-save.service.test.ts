// @ts-nocheck
/**
 * CaptureSaveService Unit Tests
 * Tests the save coordination for recordings and screenshots with optional transcoding
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CaptureSaveService } from '@renderer/infrastructure/services/capture/capture-save.service';
import { EventChannels } from '@platform/events';
import { downloadFile } from '@renderer/lib/file-download.utils';

vi.mock('@renderer/lib/file-download.utils.ts', () => ({
  downloadFile: vi.fn()
}));

import {
  createEventBus,
  createLoggerFactory,
  createTranscodeServiceMock,
  createSettingsServiceMock
} from '../../../../../factories/index.js';

describe('CaptureSaveService', () => {
  let service;
  let mockEventBus;
  let mockSettingsService;
  let mockTranscodeService;
  let mockLogger;
  let mockLoggerFactory;

  beforeEach(() => {
    mockEventBus = createEventBus();

    mockSettingsService = createSettingsServiceMock({
      values: {
        recordingFormat: 'webm'
      }
    });

    mockTranscodeService = createTranscodeServiceMock({
      isAvailable: vi.fn().mockReturnValue(true),
      transcode: vi.fn().mockResolvedValue({ status: 'ok', value: { jobId: 'job-123' } })
    });

    mockLoggerFactory = createLoggerFactory();
    mockLogger = mockLoggerFactory.create('CaptureSaveService');

    downloadFile.mockResolvedValue();

    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Constructor', () => {
    it('should store required dependencies', () => {
      service = new CaptureSaveService(mockEventBus, mockSettingsService, mockTranscodeService, mockLoggerFactory);

      expect(service.eventBus).toBe(mockEventBus);
      expect(service.settingsService).toBe(mockSettingsService);
      expect(service.transcodeService).toBe(mockTranscodeService);
    });

  });

  describe('saveRecording', () => {
    beforeEach(() => {
      service = new CaptureSaveService(mockEventBus, mockSettingsService, mockTranscodeService, mockLoggerFactory);
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

    describe('when transcoding is not available', () => {
      it('should use direct save regardless of format', async () => {
        mockSettingsService.setSetting('recordingFormat', 'mp4');
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
        mockSettingsService.setSetting('recordingFormat', 'mp4');
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
        mockSettingsService.setSetting('recordingFormat', 'mov');
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
          expect.objectContaining({ interrupted: false })
        );
      });

      it('should pass interrupted flag and inputArgs when recording was interrupted', async () => {
        mockSettingsService.setSetting('recordingFormat', 'mp4');
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
      service = new CaptureSaveService(mockEventBus, mockSettingsService, mockTranscodeService, mockLoggerFactory);
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
      service = new CaptureSaveService(mockEventBus, mockSettingsService, mockTranscodeService, mockLoggerFactory);
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
    it('should log disposal', async () => {
      service = new CaptureSaveService(mockEventBus, mockSettingsService, mockTranscodeService, mockLoggerFactory);

      await service.dispose();

      expect(mockLogger.info).toHaveBeenCalledWith('CaptureSaveService disposed');
    });
  });
});
