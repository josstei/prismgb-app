/**
 * CaptureOrchestrator Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CaptureOrchestrator } from '@features/capture/services/capture.orchestrator.js';

describe('CaptureOrchestrator', () => {
  let orchestrator;
  let mockCaptureService;
  let mockAppState;
  let mockUIController;
  let mockGpuRendererService;
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
      currentStream: null
    };

    mockUIController = {
      updateStatusMessage: vi.fn(),
      triggerShutterFlash: vi.fn(),
      triggerButtonFeedback: vi.fn(),
      triggerRecordButtonPop: vi.fn(),
      triggerRecordButtonPress: vi.fn(),
      elements: {
        streamVideo: { id: 'streamVideo' },
        streamCanvas: { id: 'streamCanvas' },
        recordBtn: { classList: { add: vi.fn(), remove: vi.fn() } }
      }
    };

    mockGpuRendererService = {
      isActive: vi.fn(() => false),
      captureFrame: vi.fn()
    };

    mockCanvasRenderer = {
      isActive: vi.fn(() => false)
    };

    mockEventBus = {
      publish: vi.fn(),
      subscribe: vi.fn(() => vi.fn()) // Returns unsubscribe function
    };

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    // Mock window and document for file saving
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
      uiController: mockUIController,
      gpuRendererService: mockGpuRendererService,
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
    it('should wire capture events', async () => {
      await orchestrator.onInitialize();

      expect(mockEventBus.subscribe).toHaveBeenCalledTimes(5);
      expect(mockEventBus.subscribe).toHaveBeenCalledWith('capture:screenshot-ready', expect.any(Function));
      expect(mockEventBus.subscribe).toHaveBeenCalledWith('capture:recording-started', expect.any(Function));
      expect(mockEventBus.subscribe).toHaveBeenCalledWith('capture:recording-stopped', expect.any(Function));
      expect(mockEventBus.subscribe).toHaveBeenCalledWith('capture:recording-ready', expect.any(Function));
      expect(mockEventBus.subscribe).toHaveBeenCalledWith('capture:recording-error', expect.any(Function));
    });

    it('should store subscription unsubscribe functions', async () => {
      await orchestrator.onInitialize();

      expect(orchestrator._subscriptions).toHaveLength(5);
    });
  });

  describe('takeScreenshot', () => {
    it('should capture from video element when no rendering pipeline active', async () => {
      mockAppState.isStreaming = true;
      mockGpuRendererService.isActive.mockReturnValue(false);
      mockCanvasRenderer.isActive.mockReturnValue(false);

      await orchestrator.takeScreenshot();

      expect(mockCaptureService.takeScreenshot).toHaveBeenCalledWith(mockUIController.elements.streamVideo);
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

      expect(mockCaptureService.takeScreenshot).toHaveBeenCalledWith(mockUIController.elements.streamCanvas);
    });

    it('should trigger visual feedback when streaming', async () => {
      mockAppState.isStreaming = true;

      await orchestrator.takeScreenshot();

      // Visual feedback is now done via events
      expect(mockEventBus.publish).toHaveBeenCalledWith('ui:shutter-flash');
      expect(mockEventBus.publish).toHaveBeenCalledWith('ui:button-feedback', {
        elementKey: 'screenshotBtn',
        className: 'capturing',
        duration: 200
      });
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
      // Error status is now done via events
      expect(mockEventBus.publish).toHaveBeenCalledWith('ui:status-message', { message: 'Error taking screenshot', type: 'error' });
    });
  });

  describe('toggleRecording', () => {
    it('should start recording with raw stream when GPU renderer inactive', async () => {
      const mockStream = { id: 'stream-1' };
      mockAppState.currentStream = mockStream;

      await orchestrator.toggleRecording();

      expect(mockCaptureService.startRecording).toHaveBeenCalledWith(mockStream);
    });

    it('should start GPU recording when GPU renderer is active', async () => {
      const mockAudioTrack = { clone: vi.fn(() => ({ id: 'cloned-audio' })) };
      const mockStream = {
        id: 'stream-1',
        getAudioTracks: vi.fn(() => [mockAudioTrack])
      };
      mockAppState.currentStream = mockStream;
      mockAppState.currentCapabilities = { frameRate: 60 };
      mockGpuRendererService.isActive.mockReturnValue(true);
      mockGpuRendererService._targetWidth = 640;
      mockGpuRendererService._targetHeight = 576;

      const mockCanvas = {
        width: 0,
        height: 0,
        getContext: vi.fn(() => ({ drawImage: vi.fn() })),
        captureStream: vi.fn(() => ({
          addTrack: vi.fn(),
          getTracks: vi.fn(() => [])
        }))
      };
      global.document.createElement = vi.fn(() => mockCanvas);
      global.requestAnimationFrame = vi.fn();

      await orchestrator.toggleRecording();

      expect(mockCanvas.width).toBe(640);
      expect(mockCanvas.height).toBe(576);
      expect(mockCanvas.captureStream).toHaveBeenCalledWith(60);
      expect(mockCaptureService.startRecording).toHaveBeenCalled();
    });

    it('should stop recording when already recording', async () => {
      mockCaptureService.isRecording = true;

      await orchestrator.toggleRecording();

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

    it('should use default frame rate when capabilities not available', async () => {
      const mockStream = {
        id: 'stream-1',
        getAudioTracks: vi.fn(() => [])
      };
      mockAppState.currentStream = mockStream;
      mockAppState.currentCapabilities = null;
      mockGpuRendererService.isActive.mockReturnValue(true);

      const mockCanvas = {
        width: 0,
        height: 0,
        getContext: vi.fn(() => ({ drawImage: vi.fn() })),
        captureStream: vi.fn(() => ({
          addTrack: vi.fn(),
          getTracks: vi.fn(() => [])
        }))
      };
      global.document.createElement = vi.fn(() => mockCanvas);
      global.requestAnimationFrame = vi.fn();

      await orchestrator.toggleRecording();

      expect(mockCanvas.captureStream).toHaveBeenCalledWith(60);
    });

    it('should use default dimensions when GPU renderer dimensions not set', async () => {
      const mockStream = {
        id: 'stream-1',
        getAudioTracks: vi.fn(() => [])
      };
      mockAppState.currentStream = mockStream;
      mockGpuRendererService.isActive.mockReturnValue(true);
      mockGpuRendererService._targetWidth = undefined;
      mockGpuRendererService._targetHeight = undefined;

      const mockCanvas = {
        width: 0,
        height: 0,
        getContext: vi.fn(() => ({ drawImage: vi.fn() })),
        captureStream: vi.fn(() => ({
          addTrack: vi.fn(),
          getTracks: vi.fn(() => [])
        }))
      };
      global.document.createElement = vi.fn(() => mockCanvas);
      global.requestAnimationFrame = vi.fn();

      await orchestrator.toggleRecording();

      expect(mockCanvas.width).toBe(640);
      expect(mockCanvas.height).toBe(576);
    });
  });

  describe('GPU Recording Frame Loop', () => {
    it('should capture and draw frames during GPU recording', async () => {
      const mockFrame = { close: vi.fn() };
      mockGpuRendererService.captureFrame.mockResolvedValue(mockFrame);

      const mockDrawImage = vi.fn();
      const mockCtx = { drawImage: mockDrawImage };
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

      global.document.createElement = vi.fn(() => mockCanvas);

      let rafCallback;
      global.requestAnimationFrame = vi.fn((cb) => {
        rafCallback = cb;
        return 123;
      });

      mockAppState.currentStream = { id: 'stream-1', getAudioTracks: () => [] };
      mockGpuRendererService.isActive.mockReturnValue(true);

      await orchestrator.toggleRecording();

      expect(rafCallback).toBeDefined();

      await rafCallback();

      expect(mockGpuRendererService.captureFrame).toHaveBeenCalled();
      expect(mockDrawImage).toHaveBeenCalledWith(mockFrame, 0, 0);
      expect(mockFrame.close).toHaveBeenCalled();
    });

    it('should skip frame capture when already pending', async () => {
      const mockCtx = { drawImage: vi.fn() };
      const mockCanvas = {
        width: 0,
        height: 0,
        getContext: vi.fn(() => mockCtx),
        captureStream: vi.fn(() => ({
          addTrack: vi.fn(),
          getTracks: vi.fn(() => [])
        }))
      };

      global.document.createElement = vi.fn(() => mockCanvas);

      let rafCallback;
      global.requestAnimationFrame = vi.fn((cb) => {
        rafCallback = cb;
        return 123;
      });

      mockAppState.currentStream = { id: 'stream-1', getAudioTracks: () => [] };
      mockGpuRendererService.isActive.mockReturnValue(true);

      await orchestrator.toggleRecording();

      orchestrator._capturePending = true;
      mockGpuRendererService.captureFrame.mockClear();

      rafCallback();

      expect(mockGpuRendererService.captureFrame).not.toHaveBeenCalled();
    });

    it('should handle frame capture errors gracefully', async () => {
      mockGpuRendererService.captureFrame.mockRejectedValue(new Error('Capture failed'));

      const mockCtx = { drawImage: vi.fn() };
      const mockCanvas = {
        width: 0,
        height: 0,
        getContext: vi.fn(() => mockCtx),
        captureStream: vi.fn(() => ({
          addTrack: vi.fn(),
          getTracks: vi.fn(() => [])
        }))
      };

      global.document.createElement = vi.fn(() => mockCanvas);

      let rafCallback;
      global.requestAnimationFrame = vi.fn((cb) => {
        rafCallback = cb;
        return 123;
      });

      mockAppState.currentStream = { id: 'stream-1', getAudioTracks: () => [] };
      mockGpuRendererService.isActive.mockReturnValue(true);

      await orchestrator.toggleRecording();

      await rafCallback();

      expect(mockLogger.debug).toHaveBeenCalledWith('Frame capture skipped:', 'Capture failed');
      expect(mockCtx.drawImage).not.toHaveBeenCalled();
    });

    it('should stop frame loop when not GPU recording', async () => {
      const mockCtx = { drawImage: vi.fn() };
      const mockCanvas = {
        width: 0,
        height: 0,
        getContext: vi.fn(() => mockCtx),
        captureStream: vi.fn(() => ({
          addTrack: vi.fn(),
          getTracks: vi.fn(() => [])
        }))
      };

      global.document.createElement = vi.fn(() => mockCanvas);

      let rafCallback;
      global.requestAnimationFrame = vi.fn((cb) => {
        rafCallback = cb;
        return 123;
      });

      mockAppState.currentStream = { id: 'stream-1', getAudioTracks: () => [] };
      mockGpuRendererService.isActive.mockReturnValue(true);

      await orchestrator.toggleRecording();

      orchestrator._isGpuRecording = false;

      await rafCallback();

      expect(mockGpuRendererService.captureFrame).not.toHaveBeenCalled();
    });
  });

  describe('GPU Recording Cleanup', () => {
    it('should cancel animation frame on cleanup', () => {
      global.cancelAnimationFrame = vi.fn();
      orchestrator._recordingFrameId = 123;

      orchestrator._cleanupGpuRecording();

      expect(global.cancelAnimationFrame).toHaveBeenCalledWith(123);
      expect(orchestrator._recordingFrameId).toBeNull();
    });

    it('should stop all tracks on recording stream', () => {
      const mockTrack1 = { stop: vi.fn() };
      const mockTrack2 = { stop: vi.fn() };
      orchestrator._recordingStream = {
        getTracks: () => [mockTrack1, mockTrack2]
      };

      orchestrator._cleanupGpuRecording();

      expect(mockTrack1.stop).toHaveBeenCalled();
      expect(mockTrack2.stop).toHaveBeenCalled();
      expect(orchestrator._recordingStream).toBeNull();
    });

    it('should reset all GPU recording state', () => {
      orchestrator._recordingCanvas = {};
      orchestrator._recordingCtx = {};
      orchestrator._isGpuRecording = true;
      orchestrator._capturePending = true;

      orchestrator._cleanupGpuRecording();

      expect(orchestrator._recordingCanvas).toBeNull();
      expect(orchestrator._recordingCtx).toBeNull();
      expect(orchestrator._isGpuRecording).toBe(false);
      expect(orchestrator._capturePending).toBe(false);
    });

    it('should handle cleanup when no resources exist', () => {
      orchestrator._recordingFrameId = null;
      orchestrator._recordingStream = null;

      expect(() => orchestrator._cleanupGpuRecording()).not.toThrow();
    });

    it('should cleanup GPU recording on recording error', async () => {
      await orchestrator.onInitialize();

      orchestrator._isGpuRecording = true;
      orchestrator._recordingCanvas = {};

      const errorHandler = mockEventBus.subscribe.mock.calls.find(
        call => call[0] === 'capture:recording-error'
      )[1];

      errorHandler({ error: 'Test error' });

      expect(orchestrator._isGpuRecording).toBe(false);
      expect(orchestrator._recordingCanvas).toBeNull();
    });
  });

  describe('Event Handlers', () => {
    beforeEach(async () => {
      await orchestrator.onInitialize();
    });

    describe('_handleScreenshotReady', () => {
      it('should save file and update UI', () => {
        const data = {
          blob: new Blob(['test']),
          filename: 'screenshot.png'
        };

        orchestrator._handleScreenshotReady(data);

        expect(window.URL.createObjectURL).toHaveBeenCalled();
        expect(document.createElement).toHaveBeenCalledWith('a');
        // UI updates are now done via events
        expect(mockEventBus.publish).toHaveBeenCalledWith('ui:status-message', { message: 'Screenshot saved!' });
      });
    });

    describe('_handleRecordingStarted', () => {
      it('should update UI for recording state', () => {
        orchestrator._handleRecordingStarted();

        // UI updates are now done via events
        expect(mockEventBus.publish).toHaveBeenCalledWith('ui:status-message', { message: 'Recording started' });
        expect(mockEventBus.publish).toHaveBeenCalledWith('ui:recording-state', { active: true });
      });

      it('should trigger visual feedback', () => {
        orchestrator._handleRecordingStarted();

        // Visual feedback is now done via events
        expect(mockEventBus.publish).toHaveBeenCalledWith('ui:record-button-pop');
      });
    });

    describe('_handleRecordingStopped', () => {
      it('should update UI for stopped state', () => {
        orchestrator._handleRecordingStopped();

        // UI updates are now done via events
        expect(mockEventBus.publish).toHaveBeenCalledWith('ui:recording-state', { active: false });
      });

      it('should trigger visual feedback', () => {
        orchestrator._handleRecordingStopped();

        // Visual feedback is now done via events
        expect(mockEventBus.publish).toHaveBeenCalledWith('ui:record-button-press');
      });
    });

    describe('_handleRecordingReady', () => {
      it('should save file and update UI', () => {
        const data = {
          blob: new Blob(['test']),
          filename: 'recording.webm'
        };

        orchestrator._handleRecordingReady(data);

        expect(window.URL.createObjectURL).toHaveBeenCalled();
        // UI updates are now done via events
        expect(mockEventBus.publish).toHaveBeenCalledWith('ui:status-message', { message: 'Recording saved!' });
      });
    });

    describe('_handleRecordingError', () => {
      it('should reset UI and show error message', () => {
        const data = {
          error: 'Disk full',
          name: 'QuotaExceededError'
        };

        orchestrator._handleRecordingError(data);

        expect(mockLogger.error).toHaveBeenCalledWith('Recording error:', 'Disk full');
        expect(mockEventBus.publish).toHaveBeenCalledWith('ui:recording-state', { active: false });
        expect(mockEventBus.publish).toHaveBeenCalledWith('ui:status-message', {
          message: 'Recording failed: Disk full',
          type: 'error'
        });
      });
    });
  });

  describe('onCleanup', () => {
    it('should unsubscribe all subscriptions via cleanup()', async () => {
      // Subscription cleanup now happens in BaseOrchestrator.cleanup()
      const unsubscribe1 = vi.fn();
      const unsubscribe2 = vi.fn();
      orchestrator._subscriptions = [unsubscribe1, unsubscribe2];

      await orchestrator.cleanup();

      expect(unsubscribe1).toHaveBeenCalled();
      expect(unsubscribe2).toHaveBeenCalled();
      expect(orchestrator._subscriptions).toEqual([]);
    });

    it('should stop recording if active', async () => {
      mockCaptureService.getRecordingState.mockReturnValue(true);

      await orchestrator.onCleanup();

      expect(mockCaptureService.stopRecording).toHaveBeenCalled();
    });

    it('should not stop recording if not active', async () => {
      mockCaptureService.getRecordingState.mockReturnValue(false);

      await orchestrator.onCleanup();

      expect(mockCaptureService.stopRecording).not.toHaveBeenCalled();
    });

    it('should handle stopRecording error', async () => {
      mockCaptureService.getRecordingState.mockReturnValue(true);
      mockCaptureService.stopRecording.mockRejectedValue(new Error('Stop failed'));

      await orchestrator.onCleanup();

      expect(mockLogger.error).toHaveBeenCalledWith('Error stopping recording during cleanup:', expect.any(Error));
    });

    it('should handle non-function subscriptions', async () => {
      orchestrator._subscriptions = [null, undefined, 'not a function'];

      await expect(orchestrator.onCleanup()).resolves.not.toThrow();
    });
  });
});
