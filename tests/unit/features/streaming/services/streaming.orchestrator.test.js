/**
 * StreamingOrchestrator Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { StreamingOrchestrator } from '@renderer/application/orchestrators/streaming.orchestrator.ts';

describe('StreamingOrchestrator', () => {
  let orchestrator;
  let mockStreamingService;
  let mockAppState;
  let mockStreamingViewService;
  let mockEventBus;
  let mockLogger;
  let mockStreamingRenderPipelineService;
  let mockCaptureGpuRecordingService;
  let mockSettingsService;

  beforeEach(() => {
    mockStreamingService = {
      start: vi.fn().mockResolvedValue({}),
      stop: vi.fn().mockResolvedValue(),
      getStream: vi.fn(),
      isActive: vi.fn()
    };

    mockAppState = {
      isStreaming: false,
      deviceConnected: false
    };

    mockStreamingViewService = {
      attachMutedStream: vi.fn(),
      clearStream: vi.fn(),
      setMuted: vi.fn()
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

    mockStreamingRenderPipelineService = {
      initialize: vi.fn(),
      handleCanvasExpired: vi.fn(),
      handlePerformanceStateChanged: vi.fn(),
      handleRenderPresetChanged: vi.fn(),
      handlePerformanceModeChanged: vi.fn(),
      handleFullscreenChange: vi.fn(),
      startPipeline: vi.fn().mockResolvedValue(undefined),
      stopPipeline: vi.fn(),
      cleanup: vi.fn()
    };

    mockCaptureGpuRecordingService = {
      isActive: vi.fn().mockReturnValue(false),
      stop: vi.fn()
    };

    mockSettingsService = {
      getBooleanSetting: vi.fn().mockReturnValue(false)
    };

    orchestrator = new StreamingOrchestrator({
      streamingService: mockStreamingService,
      appState: mockAppState,
      streamViewService: mockStreamingViewService,
      renderPipelineService: mockStreamingRenderPipelineService,
      gpuRecordingService: mockCaptureGpuRecordingService,
      settingsService: mockSettingsService,
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
      expect(mockEventBus.subscribe).toHaveBeenCalledWith('device:supported-device-available', expect.any(Function));
      expect(mockEventBus.subscribe).toHaveBeenCalledWith('render:canvas-expired', expect.any(Function));
      expect(mockStreamingRenderPipelineService.initialize).toHaveBeenCalled();
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
      device: { deviceId: 'test-device-id', label: 'Test Device', kind: 'videoinput' },
      settings: { video: { width: 160, height: 144, frameRate: 60 } },
      capabilities: { canvasScale: 4, nativeResolution: { width: 160, height: 144 } }
    };

    it('should assign stream to video element', async () => {
      await orchestrator._handleStreamStarted(mockData);

      expect(mockStreamingViewService.attachMutedStream).toHaveBeenCalledWith(mockData.stream);
    });

    it('should update UI and start render pipeline', async () => {
      await orchestrator._handleStreamStarted(mockData);

      expect(mockEventBus.publish).toHaveBeenCalledWith('ui:streaming-mode', { enabled: true });
      expect(mockEventBus.publish).toHaveBeenCalledWith('ui:stream-info', { settings: mockData.settings.video });
      expect(mockStreamingRenderPipelineService.startPipeline).toHaveBeenCalledWith(mockData.capabilities);
      expect(mockEventBus.publish).toHaveBeenCalledWith('ui:status-message', { message: 'Streaming from camera' });
    });

    it('should handle unhealthy stream', async () => {
      const error = new Error('No frames received');
      mockStreamingRenderPipelineService.startPipeline.mockRejectedValue(error);

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

      expect(mockStreamingRenderPipelineService.stopPipeline).toHaveBeenCalled();
      expect(mockStreamingViewService.clearStream).toHaveBeenCalled();
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

  describe('_handleSupportedDeviceAvailable', () => {
    const mockDeviceData = {
      device: { deviceId: 'test-device-id', label: 'Test Device', kind: 'videoinput' }
    };

    it('should auto-start stream when device becomes available and setting enabled', async () => {
      mockStreamingService.isActive.mockReturnValue(false);
      mockSettingsService.getBooleanSetting.mockReturnValue(true);

      await orchestrator._handleSupportedDeviceAvailable(mockDeviceData);

      expect(mockLogger.info).toHaveBeenCalledWith('Auto-starting stream - device available: Test Device');
      expect(mockStreamingService.start).toHaveBeenCalledWith('test-device-id');
    });

    it('should bypass appState.deviceConnected check (browser enumeration is source of truth)', async () => {
      mockAppState.deviceConnected = false;
      mockStreamingService.isActive.mockReturnValue(false);
      mockSettingsService.getBooleanSetting.mockReturnValue(true);

      await orchestrator._handleSupportedDeviceAvailable(mockDeviceData);

      expect(mockStreamingService.start).toHaveBeenCalledWith('test-device-id');
    });

    it('should not auto-start when setting disabled', async () => {
      mockStreamingService.isActive.mockReturnValue(false);
      mockSettingsService.getBooleanSetting.mockReturnValue(false);

      await orchestrator._handleSupportedDeviceAvailable(mockDeviceData);

      expect(mockStreamingService.start).not.toHaveBeenCalled();
    });

    it('should not auto-start when streaming service is active', async () => {
      mockStreamingService.isActive.mockReturnValue(true);
      mockSettingsService.getBooleanSetting.mockReturnValue(true);

      await orchestrator._handleSupportedDeviceAvailable(mockDeviceData);

      expect(mockStreamingService.start).not.toHaveBeenCalled();
    });

    it('should handle rapid duplicate device available events gracefully', async () => {
      mockStreamingService.isActive.mockReturnValue(false);
      mockSettingsService.getBooleanSetting.mockReturnValue(true);

      await orchestrator._handleSupportedDeviceAvailable(mockDeviceData);

      mockStreamingService.isActive.mockReturnValue(true);

      await orchestrator._handleSupportedDeviceAvailable(mockDeviceData);

      expect(mockStreamingService.start).toHaveBeenCalledTimes(1);
    });

    it('should handle start error gracefully', async () => {
      mockStreamingService.isActive.mockReturnValue(false);
      mockSettingsService.getBooleanSetting.mockReturnValue(true);
      mockStreamingService.start.mockRejectedValue(new Error('Start failed'));

      await orchestrator._handleSupportedDeviceAvailable(mockDeviceData);

      expect(mockLogger.error).toHaveBeenCalledWith('Failed to auto-start stream:', expect.any(Error));
      expect(mockEventBus.publish).toHaveBeenCalledWith('ui:overlay-error', { message: 'Start failed' });
    });
  });

  describe('Performance event handling', () => {
    it('should delegate performance mode changes', () => {
      orchestrator._handlePerformanceModeChanged(true);
      expect(mockStreamingRenderPipelineService.handlePerformanceModeChanged).toHaveBeenCalledWith(true);
    });

    it('should delegate render preset changes', () => {
      orchestrator._handleRenderPresetChanged('vibrant');
      expect(mockStreamingRenderPipelineService.handleRenderPresetChanged).toHaveBeenCalledWith('vibrant');
    });

    it('should delegate performance state changes', () => {
      const state = { hidden: true };
      orchestrator._handlePerformanceStateChanged(state);
      expect(mockStreamingRenderPipelineService.handlePerformanceStateChanged).toHaveBeenCalledWith(state);
    });

    it('should delegate window resized to render pipeline', () => {
      orchestrator._handleWindowResized();
      expect(mockStreamingRenderPipelineService.handleFullscreenChange).toHaveBeenCalled();
    });
  });

  describe('onCleanup', () => {
    it('should cleanup render pipeline and stop streaming if active', async () => {
      mockStreamingService.isActive.mockReturnValue(true);

      await orchestrator.onCleanup();

      expect(mockStreamingRenderPipelineService.cleanup).toHaveBeenCalled();
      expect(mockStreamingService.stop).toHaveBeenCalled();
    });
  });
});
