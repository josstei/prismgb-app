import {
  createCaptureStreamMock,
  createMediaTrackMock,
  createMockCanvas
} from '../../../../../factories/stream.factory.js';
import { createCanvasRenderingContextMock } from '../../../../../factories/system.factory.js';
import {
  createMediaBlobEventMock,
  createMediaRecorderMock,
  createMediaRecorderErrorEventMock
} from '../../../../../factories/capture.factory.js';
import { createEventBus } from '../../../../../factories/event-bus.factory.js';
import { createLoggerFactory } from '../../../../../factories/logger.factory.js';
/**
 * CaptureService Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CaptureService } from '@renderer/infrastructure/services/capture/capture.service';
import {
  installBlobMock,
  installDocumentCreateElementMock,
  installMediaRecorderMock
} from '../../../../../support/mocks/browser-api.installers.js';
import { createServiceHarness } from '../../../../../support/service.harness.js';
import { FilenameGenerator } from '@renderer/lib/filename-generator.utils';

describe('CaptureService', () => {
  let service;
  let mockEventBus;
  let mockLogger;
  let blobMock;
  let documentCreateElementMock;
  let mediaRecorderMock;

  beforeEach(() => {
    vi.spyOn(FilenameGenerator, 'forScreenshot').mockReturnValue('screenshot_2024-01-01_12-00-00.png');
    vi.spyOn(FilenameGenerator, 'forRecording').mockReturnValue('recording_2024-01-01_12-00-00.webm');

    const h = createServiceHarness(CaptureService, {
      eventBus: createEventBus(),
      loggerFactory: createLoggerFactory()
    });
    service = h.subject;
    mockLogger = h.logger;
    ({ eventBus: mockEventBus } = h.deps);

    mediaRecorderMock = installMediaRecorderMock();
    blobMock = installBlobMock();
  });

  afterEach(() => {
    documentCreateElementMock?.cleanup();
    documentCreateElementMock = null;
    blobMock.cleanup();
    mediaRecorderMock.cleanup();
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

      mockCtx = createCanvasRenderingContextMock();
      mockCanvas = createMockCanvas({ width: 0, height: 0 });
      mockCanvas.getContext = vi.fn(() => mockCtx);
      mockCanvas.toBlob = vi.fn((callback) => callback(new Blob(['test'], { type: 'image/png' })));

      // Create video elements using real document
      mockVideo = realDocument.createElement('video');
      Object.defineProperty(mockVideo, 'videoWidth', { value: 160, writable: true });
      Object.defineProperty(mockVideo, 'videoHeight', { value: 144, writable: true });

      mockVideoWithNoDims = realDocument.createElement('video');
      Object.defineProperty(mockVideoWithNoDims, 'videoWidth', { value: 0, writable: true });

      // Override document.createElement to return mockCanvas for 'canvas'
      // Use a wrapper that doesn't cause recursion
      const realCreateElement = realDocument.createElement.bind(realDocument);
      documentCreateElementMock = installDocumentCreateElementMock({
        createElement: vi.fn((tag) => {
          if (tag === 'canvas') {
            return mockCanvas;
          }
          return realCreateElement(tag);
        })
      });
    });

    it('closes an owned bitmap when screenshot drawing fails', async () => {
      class Bitmap {
        width = 160;
        height = 144;
        close = vi.fn();
      }
      vi.stubGlobal('ImageBitmap', Bitmap);
      try {
        const bitmap = new Bitmap();
        mockCtx.drawImage.mockImplementationOnce(() => { throw new Error('drawing failed'); });
        await expect(service.takeScreenshot(bitmap)).rejects.toThrow('drawing failed');
        expect(bitmap.close).toHaveBeenCalledTimes(1);
      } finally { vi.unstubAllGlobals(); }
    });

    it('captures the video dimensions and pixels in the named screenshot and publishes its result', async () => {
      const result = await service.takeScreenshot(mockVideo);

      expect(result.filename).toBe('screenshot_2024-01-01_12-00-00.png');
      expect(result.blob).toBeDefined();
      expect(mockCanvas.width).toBe(160);
      expect(mockCanvas.height).toBe(144);
      expect(mockCtx.drawImage).toHaveBeenCalledWith(mockVideo, 0, 0);
      expect(mockEventBus.publish).toHaveBeenCalledWith('capture:screenshot-ready', result);
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
      mockStream = createCaptureStreamMock({
        getVideoTracks: vi.fn(() => [createMediaTrackMock()]),
        getAudioTracks: vi.fn(() => [])
      });
    });

    it('should start recording with stream', async () => {
      await service.startRecording(mockStream);

      expect(service.isRecording).toBe(true);
      expect(service.mediaRecorder).not.toBeNull();
      expect(mockEventBus.publish).toHaveBeenCalledWith('capture:recording-started');
      expect(service.mediaRecorder.onerror).toEqual(expect.any(Function));
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
      mediaRecorderMock.isTypeSupported.mockImplementation((type) => !type.includes('vp8'));

      await service.startRecording(mockStream);

      expect(service.isRecording).toBe(true);
      expect(service.mediaRecorder.options.mimeType).toBe('video/webm;codecs=vp9');
    });

    it('should collect recorded chunks', async () => {
      await service.startRecording(mockStream);

      // Simulate data available
      const mockEvent = createMediaBlobEventMock({ data: { size: 100 } });
      service.mediaRecorder.ondataavailable(mockEvent);

      expect(service.recordedChunks).toContain(mockEvent.data);
    });

    it('should ignore empty data chunks', async () => {
      await service.startRecording(mockStream);

      // Simulate empty data
      service.mediaRecorder.ondataavailable(createMediaBlobEventMock({ data: { size: 0 } }));

      expect(service.recordedChunks).toHaveLength(0);
    });
  });

  describe('stopRecording', () => {
    let mockStream;

    beforeEach(async () => {
      mockStream = createCaptureStreamMock({
        getVideoTracks: vi.fn(() => [createMediaTrackMock()]),
        getAudioTracks: vi.fn(() => [])
      });
      await service.startRecording(mockStream);
    });

    it('flushes buffered data, stops the recorder and publishes the stopped state', async () => {
      const stopSpy = vi.spyOn(service.mediaRecorder, 'stop');
      const requestDataSpy = vi.spyOn(service.mediaRecorder, 'requestData');
      await service.stopRecording();

      expect(service.isRecording).toBe(false);
      expect(stopSpy).toHaveBeenCalled();
      expect(requestDataSpy).toHaveBeenCalled();
      expect(mockEventBus.publish).toHaveBeenCalledWith('capture:recording-stopped');
    });

    it('should continue stopping when recorder data flush fails', async () => {
      const stopSpy = vi.spyOn(service.mediaRecorder, 'stop');
      service.mediaRecorder.requestData.mockImplementation(() => {
        throw new Error('Flush failed');
      });

      await service.stopRecording();

      expect(stopSpy).toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to flush recording data before stop',
        expect.any(Error)
      );
    });

    it('is an idempotent drain when not recording', async () => {
      service.isRecording = false;

      await expect(service.stopRecording()).resolves.toBeUndefined();
    });

    it('joins a stop already in progress until final chunks have been saved', async () => {
      const recorder = service.mediaRecorder;
      recorder.stop.mockImplementation(() => { recorder.state = 'inactive'; });
      const saved = Promise.withResolvers<void>();
      mockEventBus.publishAsync.mockImplementation(() => saved.promise);
      const first = service.stopRecording();
      expect(service.isRecording).toBe(false);
      const drained = vi.fn();
      const second = service.stopRecording().then(drained);

      recorder.ondataavailable(createMediaBlobEventMock({ data: new Blob(['final chunk']) }));
      const stopped = recorder.onstop();
      await Promise.resolve();
      expect(mockEventBus.publishAsync).toHaveBeenCalledWith('capture:recording-ready', expect.any(Object));
      expect(drained).not.toHaveBeenCalled();

      saved.resolve();
      await Promise.all([first, second, stopped]);
      expect(recorder.stop).toHaveBeenCalledTimes(1);
      expect(drained).toHaveBeenCalledOnce();
    });

    it('rejects a rapid restart without discarding the recording still draining', async () => {
      blobMock.cleanup();
      const recorder = service.mediaRecorder;
      recorder.stop.mockImplementation(() => { recorder.state = 'inactive'; });
      const firstChunk = new Blob(['first']);
      recorder.ondataavailable(createMediaBlobEventMock({ data: firstChunk }));
      const stopping = service.stopRecording();
      await expect(service.startRecording(mockStream)).rejects.toThrow('Recording is stopping');
      expect(service.mediaRecorder).toBe(recorder);
      expect(service.recordedChunks).toEqual([firstChunk]);
      recorder.ondataavailable(createMediaBlobEventMock({ data: new Blob(['last']) }));
      recorder.onstop();
      await stopping;
      expect(mockEventBus.publishAsync).toHaveBeenCalledWith('capture:recording-ready', expect.objectContaining({
        blob: expect.objectContaining({ size: 9 })
      }));
      expect(service.mediaRecorder).toBeNull();
    });
  });

  describe('_handleRecordingStop', () => {
    beforeEach(() => {
      vi.spyOn(mockEventBus, 'publish');
    });

    it('should generate a formatted filename and emit capture:recording-ready event', async () => {
      service.recordedChunks = [{ size: 100 }];

      // Mock date to ensure consistent filename
      const mockDate = new Date('2024-01-01T12:00:00Z');
      vi.useFakeTimers();
      vi.setSystemTime(mockDate);

      await service._handleRecordingStop();

      expect(mockEventBus.publish).toHaveBeenCalledWith('capture:recording-ready', expect.objectContaining({
        filename: 'recording_2024-01-01_12-00-00.webm'
      }));
      expect(service.recordedChunks).toEqual([]);
    });

    it('should warn and return if no recorded data', async () => {
      service.recordedChunks = [];

      await service._handleRecordingStop();

      expect(mockLogger.warn).toHaveBeenCalledWith('No recorded data to save');
      expect(mockEventBus.publish).not.toHaveBeenCalledWith('capture:recording-ready', expect.anything());
    });

    it('should skip processing when disposing', async () => {
      await service.dispose();
      service.recordedChunks = [{ size: 100 }];

      await service._handleRecordingStop();

      expect(mockLogger.debug).toHaveBeenCalledWith('Skipping recording stop handler during dispose');
      expect(mockEventBus.publish).not.toHaveBeenCalledWith('capture:recording-ready', expect.anything());
    });
  });

  describe('_handleRecordingError', () => {
    it('should reset recording state and emit error event', () => {
      service.isRecording = true;
      service.recordedChunks = [{ size: 100 }];

      const mockEvent = createMediaRecorderErrorEventMock({
        error: { message: 'Disk full', name: 'QuotaExceededError' }
      });

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
    it('should stop recording if active', async () => {
      const mockStream = createCaptureStreamMock({
        getVideoTracks: vi.fn(() => []),
        getAudioTracks: vi.fn(() => [])
      });
      await service.startRecording(mockStream);
      const stopSpy = vi.spyOn(service.mediaRecorder, 'stop');

      await service.dispose();

      expect(stopSpy).toHaveBeenCalled();
    });

    it('should clear all state', async () => {
      service.isRecording = true;
      service.recordedChunks = [{ size: 100 }];
      const mockRecorder = createMediaRecorderMock();
      mockRecorder.state = 'inactive';
      service.mediaRecorder = mockRecorder;

      await service.dispose();

      expect(service.mediaRecorder).toBeNull();
      expect(service.recordedChunks).toEqual([]);
      expect(service.isRecording).toBe(false);
    });
  });

});
