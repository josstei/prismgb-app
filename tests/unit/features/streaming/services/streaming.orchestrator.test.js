/**
 * StreamingOrchestrator Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { StreamingOrchestrator } from '@renderer/features/streaming/services/streaming.orchestrator.js';

describe('StreamingOrchestrator', () => {
  let orchestrator;
  let mockStreamingService;
  let mockAppState;
  let mockStreamViewService;
  let mockEventBus;
  let mockLogger;
  let mockRenderPipelineService;

  beforeEach(() => {
    mockStreamingService = {
      start: vi.fn().mockResolvedValue({}),
      stop: vi.fn(),
      getStream: vi.fn(),
      isActive: vi.fn()
    };

    mockAppState = {
      isStreaming: false,
      deviceConnected: false
    };

    mockStreamViewService = {
      attachStream: vi.fn(),
      clearStream: vi.fn()
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

    mockRenderPipelineService = {
      initialize: vi.fn(),
      handleCanvasExpired: vi.fn(),
      handlePerformanceStateChanged: vi.fn(),
      handleRenderPresetChanged: vi.fn(),
      handlePerformanceModeChanged: vi.fn(),
      startPipeline: vi.fn().mockResolvedValue(undefined),
      stopPipeline: vi.fn(),
      cleanup: vi.fn()
    };

    orchestrator = new StreamingOrchestrator({
      streamingService: mockStreamingService,
      appState: mockAppState,
      streamViewService: mockStreamViewService,
      renderPipelineService: mockRenderPipelineService,
      eventBus: mockEventBus,
      loggerFactory: { create: vi.fn(() => mockLogger) }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('onInitialize', () => {
    it('should wire stream and device events', async () => {
      await orchestrator.onInitialize();

      expect(mockEventBus.subscribe).toHaveBeenCalledWith('stream:started', expect.any(Function));
      expect(mockEventBus.subscribe).toHaveBeenCalledWith('stream:stopped', expect.any(Function));
      expect(mockEventBus.subscribe).toHaveBeenCalledWith('stream:error', expect.any(Function));
      expect(mockEventBus.subscribe).toHaveBeenCalledWith('performance:render-mode-changed', expect.any(Function));
      expect(mockEventBus.subscribe).toHaveBeenCalledWith('performance:state-changed', expect.any(Function));
      expect(mockEventBus.subscribe).toHaveBeenCalledWith('device:disconnected-during-session', expect.any(Function));
      expect(mockEventBus.subscribe).toHaveBeenCalledWith('render:canvas-expired', expect.any(Function));
      expect(mockRenderPipelineService.initialize).toHaveBeenCalled();
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

    it('should assign stream to video element', async () => {
      await orchestrator._handleStreamStarted(mockData);

      expect(mockStreamViewService.attachStream).toHaveBeenCalledWith(mockData.stream);
    });

    it('should update UI and start render pipeline', async () => {
      await orchestrator._handleStreamStarted(mockData);

      expect(mockEventBus.publish).toHaveBeenCalledWith('ui:streaming-mode', { enabled: true });
      expect(mockEventBus.publish).toHaveBeenCalledWith('ui:stream-info', { settings: mockData.settings.video });
      expect(mockRenderPipelineService.startPipeline).toHaveBeenCalledWith(mockData.capabilities);
      expect(mockEventBus.publish).toHaveBeenCalledWith('ui:status-message', { message: 'Streaming from camera' });
    });

    it('should handle unhealthy stream', async () => {
      const error = new Error('No frames received');
      mockRenderPipelineService.startPipeline.mockRejectedValue(error);

      await orchestrator._handleStreamStarted(mockData);

      expect(mockEventBus.publish).toHaveBeenCalledWith('ui:status-message', {
        message: 'Device not sending video. Is it powered on?',
        type: 'warning'
      });
      expect(mockEventBus.publish).toHaveBeenCalledWith('ui:overlay-error', {
        message: 'Device not sending video. Please ensure the device is powered on.'
      });
      expect(mockStreamingService.stop).toHaveBeenCalled();
    });
  });

  describe('_handleStreamStopped', () => {
    it('should stop render pipeline and clear video', () => {
      orchestrator._handleStreamStopped();

      expect(mockRenderPipelineService.stopPipeline).toHaveBeenCalled();
      expect(mockStreamViewService.clearStream).toHaveBeenCalled();
    });

    it('should update UI', () => {
      mockAppState.deviceConnected = true;

      orchestrator._handleStreamStopped();

      expect(mockEventBus.publish).toHaveBeenCalledWith('ui:streaming-mode', { enabled: false });
      expect(mockEventBus.publish).toHaveBeenCalledWith('ui:overlay-message', { deviceConnected: true });
    });
  });

  describe('_handleStreamError', () => {
    it('should log and show error', () => {
      const error = new Error('Stream error');

      orchestrator._handleStreamError(error);

      expect(mockLogger.error).toHaveBeenCalledWith('Stream error:', error);
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

  describe('Performance event handling', () => {
    it('should delegate performance mode changes', () => {
      orchestrator._handlePerformanceModeChanged(true);
      expect(mockRenderPipelineService.handlePerformanceModeChanged).toHaveBeenCalledWith(true);
    });

    it('should delegate render preset changes', () => {
      orchestrator._handleRenderPresetChanged('vibrant');
      expect(mockRenderPipelineService.handleRenderPresetChanged).toHaveBeenCalledWith('vibrant');
    });

    it('should delegate performance state changes', () => {
      const state = { hidden: true };
      orchestrator._handlePerformanceStateChanged(state);
      expect(mockRenderPipelineService.handlePerformanceStateChanged).toHaveBeenCalledWith(state);
    });
  });

  describe('onCleanup', () => {
    it('should cleanup render pipeline and stop streaming if active', async () => {
      mockStreamingService.isActive.mockReturnValue(true);

      await orchestrator.onCleanup();

      expect(mockRenderPipelineService.cleanup).toHaveBeenCalled();
      expect(mockStreamingService.stop).toHaveBeenCalled();
    });
  });
});
