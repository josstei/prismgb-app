/**
 * CaptureOrchestrator Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CaptureOrchestrator } from '@renderer/features/capture/services/capture.orchestrator.js';

describe('CaptureOrchestrator', () => {
  let orchestrator;
  let mockCaptureService;
  let mockAppState;
  let mockStreamViewService;
  let mockGpuRendererService;
  let mockGpuRecordingService;
  let mockCanvasRenderer;
  let mockEventBus;
  let mockLogger;

  beforeEach(() => {
    mockCaptureService = {
      takeScreenshot: vi.fn(),
      toggleRecording: vi.fn(),
      startRecording: vi.fn(),
      getRecordingState: vi.fn(),
      stopRecording: vi.fn(),
      isRecording: false
    };

    mockAppState = {
      isStreaming: false,
      currentStream: null,
      currentCapabilities: null
    };

    // Mock stream view elements
    const mockStreamVideo = { id: 'streamVideo' };
    const mockStreamCanvas = { id: 'streamCanvas' };

    mockStreamViewService = {
      getCanvas: vi.fn(() => mockStreamCanvas),
      getVideo: vi.fn(() => mockStreamVideo),
      attachStream: vi.fn(),
      clearStream: vi.fn(),
      setMuted: vi.fn()
    };

    // Store element references for test assertions
    mockStreamViewService._elements = {
      streamVideo: mockStreamVideo,
      streamCanvas: mockStreamCanvas
    };

    mockGpuRendererService = {
      isActive: vi.fn(() => false),
      captureFrame: vi.fn(),
      getTargetDimensions: vi.fn(() => ({ width: 640, height: 576 }))
    };

    mockGpuRecordingService = {
      start: vi.fn(async () => ({ id: 'gpu-stream' })),
      stop: vi.fn()
    };

    mockCanvasRenderer = {
      isActive: vi.fn(() => false)
    };

    mockEventBus = {
      publish: vi.fn(),
      subscribe: vi.fn(() => vi.fn())
    };

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    global.window = {
      URL: {
        createObjectURL: vi.fn(() => 'blob:url'),
        revokeObjectURL: vi.fn()
      }
    };
    global.document = {
      createElement: vi.fn(() => ({
        href: '',
        download: '',
        click: vi.fn()
      })),
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn()
      }
    };

    orchestrator = new CaptureOrchestrator({
      captureService: mockCaptureService,
      appState: mockAppState,
      streamViewService: mockStreamViewService,
      gpuRendererService: mockGpuRendererService,
      gpuRecordingService: mockGpuRecordingService,
      canvasRenderer: mockCanvasRenderer,
      eventBus: mockEventBus,
      loggerFactory: { create: vi.fn(() => mockLogger) }
    });
  });

  describe('Constructor', () => {
    it('should initialize with empty subscriptions', () => {
      expect(orchestrator._subscriptions).toEqual([]);
    });
  });

  describe('onInitialize', () => {
    it('should wire capture error events and UI command events', async () => {
      await orchestrator.onInitialize();

      expect(mockEventBus.subscribe).toHaveBeenCalledTimes(4);
      expect(mockEventBus.subscribe).toHaveBeenCalledWith('capture:recording-error', expect.any(Function));
      expect(mockEventBus.subscribe).toHaveBeenCalledWith('stream:stopped', expect.any(Function));
      expect(mockEventBus.subscribe).toHaveBeenCalledWith('ui:screenshot-requested', expect.any(Function));
      expect(mockEventBus.subscribe).toHaveBeenCalledWith('ui:recording-toggle-requested', expect.any(Function));
    });

    it('should store subscription unsubscribe functions', async () => {
      await orchestrator.onInitialize();

      expect(orchestrator._subscriptions).toHaveLength(4);
    });
  });

  describe('takeScreenshot', () => {
    it('should capture from video element when no rendering pipeline active', async () => {
      mockAppState.isStreaming = true;
      mockGpuRendererService.isActive.mockReturnValue(false);
      mockCanvasRenderer.isActive.mockReturnValue(false);

      await orchestrator.takeScreenshot();

      expect(mockCaptureService.takeScreenshot).toHaveBeenCalledWith(mockStreamViewService._elements.streamVideo);
    });

    it('should capture from GPU renderer when GPU is active', async () => {
      mockAppState.isStreaming = true;
      mockGpuRendererService.isActive.mockReturnValue(true);
      const mockBitmap = { width: 160, height: 144 };
      mockGpuRendererService.captureFrame.mockResolvedValue(mockBitmap);

      await orchestrator.takeScreenshot();

      expect(mockGpuRendererService.captureFrame).toHaveBeenCalled();
      expect(mockCaptureService.takeScreenshot).toHaveBeenCalledWith(mockBitmap);
    });

    it('should capture from canvas when Canvas2D rendering is active', async () => {
      mockAppState.isStreaming = true;
      mockGpuRendererService.isActive.mockReturnValue(false);
      mockCanvasRenderer.isActive.mockReturnValue(true);

      await orchestrator.takeScreenshot();

      expect(mockCaptureService.takeScreenshot).toHaveBeenCalledWith(mockStreamViewService._elements.streamCanvas);
    });

    it('should trigger visual feedback when streaming', async () => {
      mockAppState.isStreaming = true;

      await orchestrator.takeScreenshot();

      expect(mockEventBus.publish).toHaveBeenCalledWith('capture:screenshot-triggered');
    });

    it('should warn when not streaming', async () => {
      mockAppState.isStreaming = false;

      await orchestrator.takeScreenshot();

      expect(mockLogger.warn).toHaveBeenCalledWith('Cannot take screenshot - not streaming');
      expect(mockCaptureService.takeScreenshot).not.toHaveBeenCalled();
    });

    it('should show error on screenshot failure', async () => {
      mockAppState.isStreaming = true;
      mockCaptureService.takeScreenshot.mockRejectedValue(new Error('Screenshot failed'));

      await orchestrator.takeScreenshot();

      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockEventBus.publish).toHaveBeenCalledWith('ui:status-message', { message: 'Error taking screenshot', type: 'error' });
    });
  });

  describe('toggleRecording', () => {
    it('should start recording with raw stream when GPU renderer inactive', async () => {
      const mockStream = { id: 'stream-1' };
      mockAppState.currentStream = mockStream;

      await orchestrator.toggleRecording();

      expect(mockCaptureService.startRecording).toHaveBeenCalledWith(mockStream);
      expect(mockGpuRecordingService.start).not.toHaveBeenCalled();
    });

    it('should start GPU recording when GPU renderer is active', async () => {
      const mockStream = { id: 'stream-1', getAudioTracks: vi.fn(() => []) };
      mockAppState.currentStream = mockStream;
      mockAppState.currentCapabilities = { frameRate: 75 };
      mockGpuRendererService.isActive.mockReturnValue(true);

      await orchestrator.toggleRecording();

      expect(mockGpuRecordingService.start).toHaveBeenCalledWith({
        stream: mockStream,
        frameRate: 75
      });
      expect(mockCaptureService.startRecording).toHaveBeenCalledWith({ id: 'gpu-stream' });
    });

    it('should use default frame rate when capabilities not available', async () => {
      const mockStream = { id: 'stream-1', getAudioTracks: vi.fn(() => []) };
      mockAppState.currentStream = mockStream;
      mockAppState.currentCapabilities = null;
      mockGpuRendererService.isActive.mockReturnValue(true);

      await orchestrator.toggleRecording();

      expect(mockGpuRecordingService.start).toHaveBeenCalledWith({
        stream: mockStream,
        frameRate: 60
      });
    });

    it('should stop recording when already recording', async () => {
      mockCaptureService.isRecording = true;

      await orchestrator.toggleRecording();

      expect(mockGpuRecordingService.stop).toHaveBeenCalled();
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
      mockAppState.currentStream = { id: 'stream-1' };
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

      expect(mockLogger.error).toHaveBeenCalledWith('Failed to stop recording:', expect.any(Error));
    });
  });

  describe('Event Handlers', () => {
    beforeEach(async () => {
      await orchestrator.onInitialize();
    });

    it('should cleanup GPU recording on recording error', () => {
      const errorHandler = mockEventBus.subscribe.mock.calls.find(
        call => call[0] === 'capture:recording-error'
      )[1];

      errorHandler({ error: 'Test error' });

      expect(mockGpuRecordingService.stop).toHaveBeenCalled();
    });

    it('should stop recording when stream stops', async () => {
      mockCaptureService.isRecording = true;

      const streamStoppedHandler = mockEventBus.subscribe.mock.calls.find(
        call => call[0] === 'stream:stopped'
      )[1];

      await streamStoppedHandler();

      expect(mockLogger.info).toHaveBeenCalledWith('Stream stopped - stopping active recording');
      expect(mockGpuRecordingService.stop).toHaveBeenCalled();
      expect(mockCaptureService.stopRecording).toHaveBeenCalled();
    });

    it('should not stop recording when stream stops if not recording', async () => {
      mockCaptureService.isRecording = false;
      mockCaptureService.getRecordingState.mockReturnValue(false);

      const streamStoppedHandler = mockEventBus.subscribe.mock.calls.find(
        call => call[0] === 'stream:stopped'
      )[1];

      await streamStoppedHandler();

      expect(mockGpuRecordingService.stop).not.toHaveBeenCalled();
      expect(mockCaptureService.stopRecording).not.toHaveBeenCalled();
    });

    it('should stop recording when stream stops using getRecordingState', async () => {
      mockCaptureService.isRecording = false;
      mockCaptureService.getRecordingState.mockReturnValue(true);

      const streamStoppedHandler = mockEventBus.subscribe.mock.calls.find(
        call => call[0] === 'stream:stopped'
      )[1];

      await streamStoppedHandler();

      expect(mockGpuRecordingService.stop).toHaveBeenCalled();
      expect(mockCaptureService.stopRecording).toHaveBeenCalled();
    });
  });

  describe('_getCaptureSource', () => {
    it('should return GPU frame when GPU renderer is active', async () => {
      mockGpuRendererService.isActive.mockReturnValue(true);
      const mockBitmap = { width: 160, height: 144 };
      mockGpuRendererService.captureFrame.mockResolvedValue(mockBitmap);

      const source = await orchestrator._getCaptureSource();

      expect(source).toBe(mockBitmap);
      expect(mockLogger.debug).toHaveBeenCalledWith('Capturing screenshot from GPU renderer');
    });

    it('should return canvas when Canvas2D is active but GPU is not', async () => {
      mockGpuRendererService.isActive.mockReturnValue(false);
      mockCanvasRenderer.isActive.mockReturnValue(true);

      const source = await orchestrator._getCaptureSource();

      expect(source).toBe(mockStreamViewService._elements.streamCanvas);
      expect(mockLogger.debug).toHaveBeenCalledWith('Capturing screenshot from Canvas2D renderer');
    });

    it('should return video element when no rendering pipeline is active', async () => {
      mockGpuRendererService.isActive.mockReturnValue(false);
      mockCanvasRenderer.isActive.mockReturnValue(false);

      const source = await orchestrator._getCaptureSource();

      expect(source).toBe(mockStreamViewService._elements.streamVideo);
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

      expect(mockLogger.error).toHaveBeenCalledWith('Error stopping recording during cleanup:', expect.any(Error));
    });

    it('should stop GPU recording on cleanup', async () => {
      await orchestrator.onCleanup();

      expect(mockGpuRecordingService.stop).toHaveBeenCalled();
    });
  });
});
