/**
 * StreamingOrchestrator Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { StreamingOrchestrator } from '@features/streaming/services/streaming.orchestrator.js';

describe('StreamingOrchestrator', () => {
  let orchestrator;
  let mockStreamingService;
  let mockAppState;
  let mockUIController;
  let mockEventBus;
  let mockLogger;
  let mockCanvasRenderer;
  let mockViewportManager;
  let mockVisibilityHandler;
  let mockStreamHealthMonitor;
  let mockGPURendererService;

  beforeEach(() => {
    vi.useFakeTimers();

    mockStreamingService = {
      start: vi.fn().mockResolvedValue({}),
      stop: vi.fn(),
      getStream: vi.fn(),
      isActive: vi.fn()
    };

    mockAppState = {
      isStreaming: false,
      deviceConnected: false,
      cinematicModeEnabled: false,
      setStreaming: vi.fn()
    };

    mockUIController = {
      updateStatusMessage: vi.fn(),
      showErrorOverlay: vi.fn(),
      setStreamingMode: vi.fn(),
      updateStreamInfo: vi.fn(),
      updateOverlayMessage: vi.fn(),
      elements: {
        streamVideo: {
          srcObject: null,
          readyState: 4,
          pause: vi.fn(),
          load: vi.fn(),
          addEventListener: vi.fn(),
          requestVideoFrameCallback: vi.fn(),
          HAVE_CURRENT_DATA: 2,
          HAVE_ENOUGH_DATA: 4
        },
        streamCanvas: {
          width: 0,
          height: 0,
          style: {},
          getContext: vi.fn(() => ({
            drawImage: vi.fn(),
            fillRect: vi.fn(),
            fillStyle: ''
          }))
        }
      }
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

    mockCanvasRenderer = {
      startRendering: vi.fn(),
      stopRendering: vi.fn(),
      clearCanvas: vi.fn(),
      resize: vi.fn(),
      cleanup: vi.fn()
    };

    mockViewportManager = {
      initialize: vi.fn(),
      calculateDimensions: vi.fn(() => ({ width: 160, height: 144, scale: 1 })),
      cleanup: vi.fn(),
      _resizeObserver: null
    };

    mockVisibilityHandler = {
      initialize: vi.fn(),
      isHidden: vi.fn(() => false),
      cleanup: vi.fn()
    };

    mockStreamHealthMonitor = {
      startMonitoring: vi.fn((video, onHealthy) => {
        // Immediately call onHealthy to simulate healthy stream
        onHealthy({ frameTime: 100 });
      }),
      stopMonitoring: vi.fn(),
      isMonitoring: vi.fn(() => false),
      cleanup: vi.fn()
    };

    mockGPURendererService = {
      initialize: vi.fn().mockResolvedValue(false),
      renderFrame: vi.fn().mockResolvedValue(undefined),
      setPreset: vi.fn(),
      isActive: vi.fn().mockReturnValue(false),
      isCanvasTransferred: vi.fn().mockReturnValue(false),
      terminateAndReset: vi.fn(),
      releaseResources: vi.fn(),
      cleanup: vi.fn()
    };

    // Mock document
    document.addEventListener = vi.fn();
    document.removeEventListener = vi.fn();
    // Use Object.defineProperty to mock read-only document.hidden
    Object.defineProperty(document, 'hidden', {
      value: false,
      writable: true,
      configurable: true
    });
    Object.defineProperty(document, 'body', {
      value: { classList: { add: vi.fn(), remove: vi.fn() } },
      writable: true,
      configurable: true
    });

    // Mock window
    window.cancelAnimationFrame = vi.fn();
    window.requestAnimationFrame = vi.fn((cb) => {
      return 1;
    });

    // Mock HTMLVideoElement prototype for requestVideoFrameCallback check
    if (!HTMLVideoElement.prototype.requestVideoFrameCallback) {
      HTMLVideoElement.prototype.requestVideoFrameCallback = vi.fn();
    }

    orchestrator = new StreamingOrchestrator({
      streamingService: mockStreamingService,
      appState: mockAppState,
      uiController: mockUIController,
      canvasRenderer: mockCanvasRenderer,
      viewportManager: mockViewportManager,
      visibilityHandler: mockVisibilityHandler,
      streamHealthMonitor: mockStreamHealthMonitor,
      gpuRendererService: mockGPURendererService,
      eventBus: mockEventBus,
      loggerFactory: { create: vi.fn(() => mockLogger) }
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize subscriptions array', () => {
      expect(orchestrator._subscriptions).toEqual([]);
    });

    it('should initialize currentCapabilities as null', () => {
      expect(orchestrator._currentCapabilities).toBeNull();
    });

    it('should initialize specialized managers', () => {
      expect(orchestrator._canvasRenderer).toBeDefined();
      expect(orchestrator._viewportManager).toBeDefined();
      expect(orchestrator._visibilityHandler).toBeDefined();
    });
  });

  describe('onInitialize', () => {
    it('should wire stream events', async () => {
      await orchestrator.onInitialize();

      expect(mockEventBus.subscribe).toHaveBeenCalledWith('stream:started', expect.any(Function));
      expect(mockEventBus.subscribe).toHaveBeenCalledWith('stream:stopped', expect.any(Function));
      expect(mockEventBus.subscribe).toHaveBeenCalledWith('stream:error', expect.any(Function));
    });

    it('should wire device events', async () => {
      await orchestrator.onInitialize();

      expect(mockEventBus.subscribe).toHaveBeenCalledWith('device:disconnected-during-session', expect.any(Function));
    });

    it('should initialize visibility handler', async () => {
      // Mock the initialize method
      const initializeSpy = vi.spyOn(orchestrator._visibilityHandler, 'initialize');

      await orchestrator.onInitialize();

      expect(initializeSpy).toHaveBeenCalled();
    });
  });

  describe('start', () => {
    it('should start streaming when device connected', async () => {
      mockAppState.deviceConnected = true;

      await orchestrator.start('device-1');

      expect(mockStreamingService.start).toHaveBeenCalledWith('device-1');
    });

    it('should warn when device not connected', async () => {
      mockAppState.deviceConnected = false;

      await orchestrator.start();

      expect(mockLogger.warn).toHaveBeenCalledWith('Cannot start stream - device not connected');
      // UI updates are now done via events
      expect(mockEventBus.publish).toHaveBeenCalledWith('ui:status-message', {
        message: 'Please connect your device first',
        type: 'warning'
      });
    });

    it('should handle start error', async () => {
      mockAppState.deviceConnected = true;
      const error = new Error('Start failed');
      mockStreamingService.start.mockRejectedValue(error);

      await orchestrator.start();

      expect(mockLogger.error).toHaveBeenCalled();
      // UI updates are now done via events
      expect(mockEventBus.publish).toHaveBeenCalledWith('ui:overlay-error', { message: 'Start failed' });
    });
  });

  describe('stop', () => {
    it('should stop streaming service', () => {
      orchestrator.stop();

      expect(mockStreamingService.stop).toHaveBeenCalled();
    });
  });

  describe('getStream', () => {
    it('should return stream from service', () => {
      const mockStream = { id: 'stream-1' };
      mockStreamingService.getStream.mockReturnValue(mockStream);

      expect(orchestrator.getStream()).toBe(mockStream);
    });
  });

  describe('isActive', () => {
    it('should return active state from service', () => {
      mockStreamingService.isActive.mockReturnValue(true);
      expect(orchestrator.isActive()).toBe(true);

      mockStreamingService.isActive.mockReturnValue(false);
      expect(orchestrator.isActive()).toBe(false);
    });
  });

  describe('_handleStreamStarted', () => {
    const mockData = {
      stream: { id: 'stream-1' },
      settings: { video: { width: 160, height: 144, frameRate: 60 } },
      capabilities: { canvasScale: 4, nativeResolution: { width: 160, height: 144 } }
    };

    it('should assign stream to video element', () => {
      orchestrator._handleStreamStarted(mockData);

      expect(mockUIController.elements.streamVideo.srcObject).toBe(mockData.stream);
    });

    it('should update UI for streaming mode', () => {
      orchestrator._handleStreamStarted(mockData);

      // UI updates are now done via events
      expect(mockEventBus.publish).toHaveBeenCalledWith('ui:streaming-mode', { enabled: true });
    });

    it('should update stream info', () => {
      orchestrator._handleStreamStarted(mockData);

      // UI updates are now done via events
      expect(mockEventBus.publish).toHaveBeenCalledWith('ui:stream-info', { settings: mockData.settings.video });
    });

    // Note: Cinematic mode class is now applied by StreamControlsComponent,
    // not by StreamingOrchestrator. See StreamControlsComponent.setCinematicMode()
  });

  describe('_handleStreamStopped', () => {
    it('should stop canvas rendering', () => {
      orchestrator._handleStreamStopped();

      expect(mockCanvasRenderer.stopRendering).toHaveBeenCalled();
    });

    it('should clear video srcObject', () => {
      mockUIController.elements.streamVideo.srcObject = { id: 'stream' };

      orchestrator._handleStreamStopped();

      expect(mockUIController.elements.streamVideo.srcObject).toBeNull();
      expect(mockUIController.elements.streamVideo.pause).toHaveBeenCalled();
      expect(mockUIController.elements.streamVideo.load).toHaveBeenCalled();
    });

    it('should update UI', () => {
      mockAppState.deviceConnected = true;

      orchestrator._handleStreamStopped();

      // UI updates are now done via events
      expect(mockEventBus.publish).toHaveBeenCalledWith('ui:streaming-mode', { enabled: false });
      expect(mockEventBus.publish).toHaveBeenCalledWith('ui:overlay-message', { deviceConnected: true });
    });
  });

  describe('_handleStreamError', () => {
    it('should log and show error', () => {
      const error = new Error('Stream error');

      orchestrator._handleStreamError(error);

      expect(mockLogger.error).toHaveBeenCalledWith('Stream error:', error);
      // UI updates are now done via events
      expect(mockEventBus.publish).toHaveBeenCalledWith('ui:status-message', { message: 'Error: Stream error', type: 'error' });
      expect(mockEventBus.publish).toHaveBeenCalledWith('ui:overlay-error', { message: 'Stream error' });
    });
  });

  describe('_handleDeviceDisconnectedDuringStream', () => {
    it('should stop streaming when streaming is active', () => {
      mockAppState.isStreaming = true;

      orchestrator._handleDeviceDisconnectedDuringStream();

      expect(mockStreamingService.stop).toHaveBeenCalled();
    });

    it('should not stop when not streaming', () => {
      mockAppState.isStreaming = false;

      orchestrator._handleDeviceDisconnectedDuringStream();

      expect(mockStreamingService.stop).not.toHaveBeenCalled();
    });
  });

  describe('_handleHidden', () => {
    it('should stop rendering when streaming', () => {
      mockAppState.isStreaming = true;

      orchestrator._handleHidden();

      expect(mockCanvasRenderer.stopRendering).toHaveBeenCalled();
    });

    it('should do nothing when not streaming', () => {
      mockAppState.isStreaming = false;

      orchestrator._handleHidden();

      expect(mockCanvasRenderer.stopRendering).not.toHaveBeenCalled();
    });
  });

  describe('_handleVisible', () => {
    it('should resume rendering when streaming (Canvas2D fallback)', async () => {
      mockAppState.isStreaming = true;
      orchestrator._currentCapabilities = { nativeResolution: { width: 160, height: 144 } };
      orchestrator._useGPURenderer = false;

      orchestrator._handleVisible();

      // Wait for async _startCanvasRendering to complete
      await vi.runAllTimersAsync();

      expect(mockCanvasRenderer.startRendering).toHaveBeenCalled();
    });

    it('should resume GPU rendering when streaming with GPU renderer', () => {
      mockAppState.isStreaming = true;
      orchestrator._currentCapabilities = { nativeResolution: { width: 160, height: 144 } };
      orchestrator._useGPURenderer = true;

      orchestrator._handleVisible();

      // GPU render loop is started via requestVideoFrameCallback, not direct mock call
      expect(orchestrator._gpuRenderLoopActive).toBe(true);
    });

    it('should do nothing when not streaming', () => {
      mockAppState.isStreaming = false;

      orchestrator._handleVisible();

      expect(mockCanvasRenderer.startRendering).not.toHaveBeenCalled();
    });
  });

  describe('onCleanup', () => {
    it('should cleanup all managers', async () => {
      const canvasRendererCleanupSpy = vi.spyOn(orchestrator._canvasRenderer, 'cleanup');
      const viewportCleanupSpy = vi.spyOn(orchestrator._viewportManager, 'cleanup');
      const visibilityCleanupSpy = vi.spyOn(orchestrator._visibilityHandler, 'cleanup');
      const streamHealthCleanupSpy = vi.spyOn(orchestrator._streamHealthMonitor, 'cleanup');

      await orchestrator.onCleanup();

      expect(canvasRendererCleanupSpy).toHaveBeenCalled();
      expect(viewportCleanupSpy).toHaveBeenCalled();
      expect(visibilityCleanupSpy).toHaveBeenCalled();
      expect(streamHealthCleanupSpy).toHaveBeenCalled();
    });

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

    it('should stop streaming if active', async () => {
      mockStreamingService.isActive.mockReturnValue(true);

      await orchestrator.onCleanup();

      expect(mockStreamingService.stop).toHaveBeenCalled();
    });

    it('should not stop streaming if not active', async () => {
      mockStreamingService.isActive.mockReturnValue(false);

      await orchestrator.onCleanup();

      expect(mockStreamingService.stop).not.toHaveBeenCalled();
    });
  });

  describe('_recreateCanvas', () => {
    it('should create new canvas element with same attributes', () => {
      const oldCanvas = {
        id: 'streamCanvas',
        className: 'stream-canvas',
        style: { cssText: 'width: 480px; height: 432px;' },
        width: 960,
        height: 864,
        parentElement: {
          replaceChild: vi.fn()
        },
        addEventListener: vi.fn()
      };
      mockUIController.elements.streamCanvas = oldCanvas;

      orchestrator._recreateCanvas();

      expect(oldCanvas.parentElement.replaceChild).toHaveBeenCalled();
      const newCanvas = oldCanvas.parentElement.replaceChild.mock.calls[0][0];
      expect(newCanvas.id).toBe('streamCanvas');
      expect(newCanvas.className).toBe('stream-canvas');
      expect(mockUIController.elements.streamCanvas).toBe(newCanvas);
    });

    it('should do nothing if canvas is null', () => {
      mockUIController.elements.streamCanvas = null;

      orchestrator._recreateCanvas();

      expect(mockLogger.info).not.toHaveBeenCalledWith(expect.stringContaining('recreated'));
    });

    it('should do nothing if canvas has no parent', () => {
      mockUIController.elements.streamCanvas = {
        id: 'streamCanvas',
        parentElement: null
      };

      orchestrator._recreateCanvas();

      expect(mockLogger.info).not.toHaveBeenCalledWith(expect.stringContaining('recreated'));
    });

    it('should attach click handler to new canvas', () => {
      const oldCanvas = {
        id: 'streamCanvas',
        className: 'stream-canvas',
        style: { cssText: '' },
        width: 960,
        height: 864,
        parentElement: {
          replaceChild: vi.fn()
        }
      };
      mockUIController.elements.streamCanvas = oldCanvas;

      orchestrator._recreateCanvas();

      const newCanvas = mockUIController.elements.streamCanvas;
      expect(newCanvas.onclick).toBeDefined();
    });
  });

  describe('Idle Release Timer', () => {
    it('should call terminateAndReset after idle timeout when GPU renderer active', async () => {
      orchestrator._useGPURenderer = true;
      mockAppState.isStreaming = false;

      orchestrator._startIdleReleaseTimer();
      vi.advanceTimersByTime(30000);

      expect(mockGPURendererService.terminateAndReset).toHaveBeenCalled();
      expect(orchestrator._useGPURenderer).toBe(false);
    });

    it('should not call terminateAndReset if still streaming', async () => {
      orchestrator._useGPURenderer = true;
      mockAppState.isStreaming = true;

      orchestrator._startIdleReleaseTimer();
      vi.advanceTimersByTime(30000);

      expect(mockGPURendererService.terminateAndReset).not.toHaveBeenCalled();
    });

    it('should not call terminateAndReset if GPU renderer not active', async () => {
      orchestrator._useGPURenderer = false;
      mockAppState.isStreaming = false;

      orchestrator._startIdleReleaseTimer();
      vi.advanceTimersByTime(30000);

      expect(mockGPURendererService.terminateAndReset).not.toHaveBeenCalled();
    });

    it('should clear existing timer when starting new one', () => {
      orchestrator._startIdleReleaseTimer();
      const firstTimeout = orchestrator._idleReleaseTimeout;

      orchestrator._startIdleReleaseTimer();
      const secondTimeout = orchestrator._idleReleaseTimeout;

      expect(firstTimeout).not.toBe(secondTimeout);
    });

    it('should clear timer on clearIdleReleaseTimer', () => {
      orchestrator._startIdleReleaseTimer();
      expect(orchestrator._idleReleaseTimeout).not.toBeNull();

      orchestrator._clearIdleReleaseTimer();
      expect(orchestrator._idleReleaseTimeout).toBeNull();
    });
  });

});
