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
      getRecordingState: vi.fn(),
      stopRecording: vi.fn()
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

      // Should subscribe to 4 events
      expect(mockEventBus.subscribe).toHaveBeenCalledTimes(4);
      expect(mockEventBus.subscribe).toHaveBeenCalledWith('capture:screenshot-ready', expect.any(Function));
      expect(mockEventBus.subscribe).toHaveBeenCalledWith('capture:recording-started', expect.any(Function));
      expect(mockEventBus.subscribe).toHaveBeenCalledWith('capture:recording-stopped', expect.any(Function));
      expect(mockEventBus.subscribe).toHaveBeenCalledWith('capture:recording-ready', expect.any(Function));
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
    it('should get stream and call toggleRecording', async () => {
      const mockStream = { id: 'stream-1' };
      mockAppState.currentStream = mockStream;

      await orchestrator.toggleRecording();

      expect(mockCaptureService.toggleRecording).toHaveBeenCalledWith(mockStream);
    });

    it('should show error on failure', async () => {
      mockAppState.currentStream = { id: 'stream-1' };
      mockCaptureService.toggleRecording.mockRejectedValue(new Error('Recording failed'));

      await orchestrator.toggleRecording();

      expect(mockLogger.error).toHaveBeenCalled();
      // Error status is now done via events
      expect(mockEventBus.publish).toHaveBeenCalledWith('ui:status-message', { message: 'Error with recording', type: 'error' });
    });

    it('should warn when trying to start recording without stream', async () => {
      mockAppState.currentStream = null;

      await orchestrator.toggleRecording();

      expect(mockLogger.warn).toHaveBeenCalledWith('Cannot start recording - no active stream');
      expect(mockEventBus.publish).toHaveBeenCalledWith('ui:status-message', { message: 'Cannot record - not streaming', type: 'error' });
      expect(mockCaptureService.toggleRecording).not.toHaveBeenCalled();
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
