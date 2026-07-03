/**
 * CaptureOrchestrator Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CaptureOrchestrator } from '@renderer/application/orchestrators/capture.orchestrator';
import {
  createAppState,
  createEventBus,
  createLoggerFactory,
  createCaptureGpuRecordingServiceMock,
  createCaptureSaveServiceMock,
  createCaptureServiceMock,
  createBitmapMock,
  createStreamingViewServiceMock,
  createStreamingViewElementsMock,
  createStreamPayloadMock,
  createTranscodeServiceMock
} from '../../../../factories/index.js';

describe('CaptureOrchestrator', () => {
  let orchestrator;
  let mockCaptureService;
  let mockAppState;
  let mockStreamingViewService;
  let mockStreamingRenderService;
  let mockCaptureGpuRecordingService;
  let mockTranscodeService;
  let mockCaptureSaveService;
  let mockEventBus;
  let mockLogger;
  let mockLoggerFactory;

  beforeEach(() => {
    mockCaptureService = createCaptureServiceMock();

    mockAppState = createAppState();
    mockAppState.currentStream = null;
    mockAppState.currentCapabilities = null;

    // Mock stream view elements
    const mockStreamingViewElements = createStreamingViewElementsMock({
      streamVideo: { id: 'streamVideo' },
      streamCanvas: { id: 'streamCanvas' },
    });

    mockStreamingViewService = createStreamingViewServiceMock({
      getCanvas: vi.fn(() => mockStreamingViewElements.streamCanvas),
      getVideo: vi.fn(() => mockStreamingViewElements.streamVideo),
      attachMutedStream: vi.fn(),
      clearStream: vi.fn(),
      setMuted: vi.fn()
    });

    // Store element references for test assertions
    mockStreamingViewService._elements = mockStreamingViewElements;

    mockStreamingRenderService = {
      isActive: vi.fn(() => false),
      captureFrame: vi.fn(),
      getTargetDimensions: vi.fn(() => ({ width: 640, height: 576 })),
      isCanvasTransferred: vi.fn(() => false),
      resize: vi.fn(),
      resetCanvasState: vi.fn()
    };

    mockCaptureGpuRecordingService = createCaptureGpuRecordingServiceMock();

    mockTranscodeService = createTranscodeServiceMock({
      isTranscoding: vi.fn(() => false)
    });

    mockCaptureSaveService = createCaptureSaveServiceMock();

    mockEventBus = createEventBus();
    mockLoggerFactory = createLoggerFactory();

    orchestrator = new CaptureOrchestrator(
      mockCaptureService,
      mockAppState,
      mockStreamingViewService,
      mockStreamingRenderService,
      mockCaptureGpuRecordingService,
      mockTranscodeService,
      mockCaptureSaveService,
      mockEventBus,
      mockLoggerFactory
    );
    mockLogger = mockLoggerFactory._getLogger('CaptureOrchestrator');
  });

  describe('Constructor', () => {
    it('should initialize with empty subscriptions', () => {
      expect(orchestrator._lifecycle.disposables.size).toBe(0);
    });
  });

  describe('onInitialize', () => {
    it('should wire capture error events and UI command events', async () => {
      await orchestrator.initialize();

      expect(mockEventBus.subscribe).toHaveBeenCalledTimes(5);
      expect(mockEventBus.subscribe).toHaveBeenCalledWith('capture:recording-error', expect.any(Function));
      expect(mockEventBus.subscribe).toHaveBeenCalledWith('capture:recording-ready', expect.any(Function));
      expect(mockEventBus.subscribe).toHaveBeenCalledWith('stream:stopped', expect.any(Function));
      expect(mockEventBus.subscribe).toHaveBeenCalledWith('ui:screenshot-requested', expect.any(Function));
      expect(mockEventBus.subscribe).toHaveBeenCalledWith('ui:recording-toggle-requested', expect.any(Function));
    });

    it('should store subscription unsubscribe functions', async () => {
      await orchestrator.initialize();

      expect(orchestrator._lifecycle.disposables.size).toBe(5);
    });
  });

  describe('takeScreenshot', () => {
    it('should capture from video element when no rendering pipeline active', async () => {
      mockAppState.setStreaming(true);
      mockStreamingRenderService.isActive.mockReturnValue(false);

      await orchestrator.takeScreenshot();

      expect(mockCaptureService.takeScreenshot).toHaveBeenCalledWith(mockStreamingViewService._elements.streamVideo);
    });

    it('should capture from rendering session when active', async () => {
      mockAppState.setStreaming(true);
      mockStreamingRenderService.isActive.mockReturnValue(true);
      const mockBitmap = createBitmapMock();
      mockStreamingRenderService.captureFrame.mockResolvedValue(mockBitmap);

      await orchestrator.takeScreenshot();

      expect(mockStreamingRenderService.captureFrame).toHaveBeenCalled();
      expect(mockCaptureService.takeScreenshot).toHaveBeenCalledWith(mockBitmap);
    });

    it('should trigger visual feedback when streaming', async () => {
      mockAppState.setStreaming(true);

      await orchestrator.takeScreenshot();

      expect(mockEventBus.publish).toHaveBeenCalledWith('capture:screenshot-triggered');
    });

    it('should warn when not streaming', async () => {
      mockAppState.setStreaming(false);

      await orchestrator.takeScreenshot();

      expect(mockLogger.warn).toHaveBeenCalledWith('Cannot take screenshot - not streaming');
      expect(mockCaptureService.takeScreenshot).not.toHaveBeenCalled();
    });

    it('should show error on screenshot failure', async () => {
      mockAppState.setStreaming(true);
      mockCaptureService.takeScreenshot.mockRejectedValue(new Error('Screenshot failed'));

      await orchestrator.takeScreenshot();

      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockEventBus.publish).toHaveBeenCalledWith('ui:status-message', { message: 'Error taking screenshot', type: 'error' });
    });
  });

  describe('toggleRecording', () => {
    it('should start recording with raw stream when GPU renderer inactive', async () => {
      const mockStream = createStreamPayloadMock({ id: 'stream-1', getAudioTracks: vi.fn(() => []) });
      mockAppState.currentStream = mockStream;

      await orchestrator.toggleRecording();

      expect(mockCaptureService.startRecording).toHaveBeenCalledWith(mockStream);
      expect(mockCaptureGpuRecordingService.start).not.toHaveBeenCalled();
    });

    it('should start GPU recording when GPU renderer is active', async () => {
      const mockStream = createStreamPayloadMock({
        id: 'stream-1',
        getAudioTracks: vi.fn(() => [])
      });
      mockAppState.currentStream = mockStream;
      mockAppState.currentCapabilities = { frameRate: 75 };
      mockStreamingRenderService.isActive.mockReturnValue(true);

      await orchestrator.toggleRecording();

      expect(mockCaptureGpuRecordingService.start).toHaveBeenCalledWith({
        stream: mockStream,
        frameRate: 75
      });
      expect(mockCaptureService.startRecording).toHaveBeenCalledWith({ id: 'gpu-stream' });
    });

    it('should use default frame rate when capabilities not available', async () => {
      const mockStream = createStreamPayloadMock({
        id: 'stream-1',
        getAudioTracks: vi.fn(() => [])
      });
      mockAppState.currentStream = mockStream;
      mockAppState.currentCapabilities = null;
      mockStreamingRenderService.isActive.mockReturnValue(true);

      await orchestrator.toggleRecording();

      expect(mockCaptureGpuRecordingService.start).toHaveBeenCalledWith({
        stream: mockStream,
        frameRate: 60
      });
    });

    it('should stop recording when already recording', async () => {
      mockCaptureService.isRecording = true;

      await orchestrator.toggleRecording();

      expect(mockCaptureGpuRecordingService.stop).toHaveBeenCalled();
      expect(mockCaptureService.stopRecording).toHaveBeenCalled();
      expect(mockCaptureService.startRecording).not.toHaveBeenCalled();
    });

    it('should stop recording when getRecordingState returns true', async () => {
      mockCaptureService.isRecording = false;
      mockCaptureService.getRecordingState.mockReturnValue(true);

      await orchestrator.toggleRecording();

      expect(mockCaptureService.stopRecording).toHaveBeenCalled();
    });

    it('should show error on failure', async () => {
      mockAppState.currentStream = createStreamPayloadMock({ id: 'stream-1' });
      mockCaptureService.startRecording.mockRejectedValue(new Error('Recording failed'));

      await orchestrator.toggleRecording();

      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockEventBus.publish).toHaveBeenCalledWith('ui:status-message', { message: 'Error with recording', type: 'error' });
    });

    it('should warn when trying to start recording without stream', async () => {
      mockAppState.currentStream = null;

      await orchestrator.toggleRecording();

      expect(mockLogger.warn).toHaveBeenCalledWith('Cannot start recording - no active stream');
      expect(mockEventBus.publish).toHaveBeenCalledWith('ui:status-message', { message: 'Cannot record - not streaming', type: 'error' });
      expect(mockCaptureService.toggleRecording).not.toHaveBeenCalled();
    });

    it('should handle stop recording error gracefully', async () => {
      mockCaptureService.isRecording = true;
      mockCaptureService.stopRecording.mockRejectedValue(new Error('Stop failed'));

      await orchestrator.toggleRecording();

      expect(mockLogger.error).toHaveBeenCalledWith('Failed to stop recording:', 'Stop failed');
    });
  });

  describe('Event Handlers', () => {
    beforeEach(async () => {
      await orchestrator.initialize();
    });

    it('should cleanup GPU recording on recording error', () => {
      const errorHandler = mockEventBus.subscribe.mock.calls.find(
        call => call[0] === 'capture:recording-error'
      )[1];

      errorHandler({ error: 'Test error' });

      expect(mockCaptureGpuRecordingService.stop).toHaveBeenCalled();
    });

    it('should stop recording when stream stops', async () => {
      mockCaptureService.isRecording = true;

      const streamStoppedHandler = mockEventBus.subscribe.mock.calls.find(
        call => call[0] === 'stream:stopped'
      )[1];

      await streamStoppedHandler();

      expect(mockLogger.info).toHaveBeenCalledWith('Stream stopped - stopping active recording');
      expect(mockCaptureGpuRecordingService.stop).toHaveBeenCalled();
      expect(mockCaptureService.stopRecording).toHaveBeenCalled();
    });

    it('should not stop recording when stream stops if not recording', async () => {
      mockCaptureService.isRecording = false;
      mockCaptureService.getRecordingState.mockReturnValue(false);

      const streamStoppedHandler = mockEventBus.subscribe.mock.calls.find(
        call => call[0] === 'stream:stopped'
      )[1];

      await streamStoppedHandler();

      expect(mockCaptureGpuRecordingService.stop).not.toHaveBeenCalled();
      expect(mockCaptureService.stopRecording).not.toHaveBeenCalled();
    });

    it('should stop recording when stream stops using getRecordingState', async () => {
      mockCaptureService.isRecording = false;
      mockCaptureService.getRecordingState.mockReturnValue(true);

      const streamStoppedHandler = mockEventBus.subscribe.mock.calls.find(
        call => call[0] === 'stream:stopped'
      )[1];

      await streamStoppedHandler();

      expect(mockCaptureGpuRecordingService.stop).toHaveBeenCalled();
      expect(mockCaptureService.stopRecording).toHaveBeenCalled();
    });
  });

  describe('_getCaptureSource', () => {
    it('should return session frame when rendering session is active', async () => {
      mockStreamingRenderService.isActive.mockReturnValue(true);
      const mockBitmap = createBitmapMock();
      mockStreamingRenderService.captureFrame.mockResolvedValue(mockBitmap);

      const source = await orchestrator._getCaptureSource();

      expect(source).toBe(mockBitmap);
      expect(mockLogger.debug).toHaveBeenCalledWith('Capturing screenshot from renderer session');
    });

    it('should return video element when no rendering session is active', async () => {
      mockStreamingRenderService.isActive.mockReturnValue(false);

      const source = await orchestrator._getCaptureSource();

      expect(source).toBe(mockStreamingViewService._elements.streamVideo);
      expect(mockLogger.debug).toHaveBeenCalledWith('Capturing screenshot from video element (no rendering pipeline)');
    });
  });

  describe('onCleanup', () => {
    it('should stop recording if active', async () => {
      mockCaptureService.getRecordingState.mockReturnValue(true);

      await orchestrator.onCleanup();

      expect(mockCaptureService.stopRecording).toHaveBeenCalled();
    });

    it('should handle stopRecording error', async () => {
      mockCaptureService.getRecordingState.mockReturnValue(true);
      mockCaptureService.stopRecording.mockRejectedValue(new Error('Stop failed'));

      await orchestrator.onCleanup();

      expect(mockLogger.error).toHaveBeenCalledWith('Failed to stop recording:', 'Stop failed');
    });

    it('should stop GPU recording on cleanup', async () => {
      await orchestrator.onCleanup();

      expect(mockCaptureGpuRecordingService.stop).toHaveBeenCalled();
    });
  });

  describe('_handleRecordingReady', () => {
    it('should call captureSaveService.saveRecording with blob and filename', async () => {
      const mockBlob = new Blob(['test'], { type: 'video/webm' });
      const filename = 'recording-2025-01-15-10-30-45.webm';

      await orchestrator._handleRecordingReady({ blob: mockBlob, filename });

      expect(mockCaptureSaveService.saveRecording).toHaveBeenCalledWith(
        mockBlob,
        filename,
        expect.objectContaining({ interrupted: false })
      );
    });

    it('should pass interrupted: true when recording was stopped due to stream interruption', async () => {
      await orchestrator.initialize();
      mockCaptureService.isRecording = true;

      const streamStoppedHandler = mockEventBus.subscribe.mock.calls.find(
        call => call[0] === 'stream:stopped'
      )[1];
      await streamStoppedHandler();

      const mockBlob = new Blob(['test'], { type: 'video/webm' });
      const filename = 'recording.webm';

      await orchestrator._handleRecordingReady({ blob: mockBlob, filename });

      expect(mockCaptureSaveService.saveRecording).toHaveBeenCalledWith(
        mockBlob,
        filename,
        { interrupted: true }
      );
    });

    it('should publish status message for direct save (non-transcoded)', async () => {
      const mockBlob = new Blob(['test'], { type: 'video/webm' });
      const filename = 'recording.webm';
      mockCaptureSaveService.saveRecording.mockResolvedValue({ success: true, transcoded: false });

      await orchestrator._handleRecordingReady({ blob: mockBlob, filename });

      expect(mockEventBus.publish).toHaveBeenCalledWith('ui:status-message', { message: 'Recording saved!' });
    });

    it('should not publish status message when transcoding (handled by captureSaveService)', async () => {
      const mockBlob = new Blob(['test'], { type: 'video/webm' });
      const filename = 'recording.webm';
      mockCaptureSaveService.saveRecording.mockResolvedValue({ success: true, transcoded: true });

      await orchestrator._handleRecordingReady({ blob: mockBlob, filename });

      expect(mockEventBus.publish).not.toHaveBeenCalledWith('ui:status-message', { message: 'Recording saved!' });
    });

    it('should publish error status when save returns unsuccessful result', async () => {
      const mockBlob = new Blob(['test'], { type: 'video/webm' });
      const filename = 'recording.webm';
      mockCaptureSaveService.saveRecording.mockResolvedValue({ success: false, error: 'Blob too large' });

      await orchestrator._handleRecordingReady({ blob: mockBlob, filename });

      expect(mockEventBus.publish).toHaveBeenCalledWith('ui:status-message', {
        message: 'Failed to save recording. Please try again.',
        type: 'error'
      });
    });

    it('should log error and publish error status when save fails', async () => {
      const mockBlob = new Blob(['test'], { type: 'video/webm' });
      const filename = 'recording.webm';
      const error = new Error('Save failed');
      mockCaptureSaveService.saveRecording.mockRejectedValue(error);

      await orchestrator._handleRecordingReady({ blob: mockBlob, filename });

      expect(mockLogger.error).toHaveBeenCalledWith('Failed to save recording:', 'Save failed');
      expect(mockEventBus.publish).toHaveBeenCalledWith('ui:status-message', {
        message: 'Failed to save recording. Please try again.',
        type: 'error'
      });
    });
  });
});
