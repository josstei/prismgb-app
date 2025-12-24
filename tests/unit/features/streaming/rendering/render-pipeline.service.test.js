/**
 * RenderPipelineService Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RenderPipelineService } from '@renderer/features/streaming/rendering/render-pipeline.service.js';

describe('RenderPipelineService', () => {
  let service;
  let mockAppState;
  let mockStreamViewService;
  let mockCanvasRenderer;
  let mockCanvasLifecycleService;
  let mockStreamHealthMonitor;
  let mockGPURendererService;
  let mockGpuRenderLoopService;
  let mockEventBus;
  let mockLogger;
  let canvas;
  let video;

  beforeEach(() => {
    const section = document.createElement('section');
    const container = document.createElement('div');
    canvas = document.createElement('canvas');
    video = document.createElement('video');
    video.requestVideoFrameCallback = vi.fn();
    video.cancelVideoFrameCallback = vi.fn();

    container.appendChild(canvas);
    section.appendChild(container);
    document.body.appendChild(section);

    mockAppState = {
      isStreaming: false
    };

    mockStreamViewService = {
      getCanvas: vi.fn(() => canvas),
      getVideo: vi.fn(() => video),
      getCanvasContainer: vi.fn(() => container),
      getCanvasSection: vi.fn(() => section),
      setCanvas: vi.fn()
    };

    mockCanvasRenderer = {
      startRendering: vi.fn(),
      stopRendering: vi.fn(),
      clearCanvas: vi.fn(),
      resize: vi.fn(),
      resetCanvasState: vi.fn(),
      cleanup: vi.fn()
    };

    mockCanvasLifecycleService = {
      initialize: vi.fn(),
      handleCanvasExpired: vi.fn(),
      setupCanvasSize: vi.fn(),
      recreateCanvas: vi.fn(),
      cleanup: vi.fn()
    };

    mockStreamHealthMonitor = {
      startMonitoring: vi.fn((videoEl, onHealthy) => {
        onHealthy({ frameTime: 100 });
      }),
      cleanup: vi.fn()
    };

    mockGPURendererService = {
      initialize: vi.fn().mockResolvedValue(false),
      renderFrame: vi.fn().mockResolvedValue(undefined),
      setPreset: vi.fn(),
      getPresetId: vi.fn(() => 'vibrant'),
      isActive: vi.fn().mockReturnValue(false),
      isCanvasTransferred: vi.fn().mockReturnValue(false),
      terminateAndReset: vi.fn(),
      releaseResources: vi.fn(),
      resize: vi.fn(),
      cleanup: vi.fn()
    };

    mockGpuRenderLoopService = {
      start: vi.fn(),
      stop: vi.fn()
    };

    mockEventBus = {
      publish: vi.fn()
    };

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    service = new RenderPipelineService({
      appState: mockAppState,
      streamViewService: mockStreamViewService,
      canvasRenderer: mockCanvasRenderer,
      canvasLifecycleService: mockCanvasLifecycleService,
      streamHealthMonitor: mockStreamHealthMonitor,
      gpuRendererService: mockGPURendererService,
      gpuRenderLoopService: mockGpuRenderLoopService,
      eventBus: mockEventBus,
      loggerFactory: { create: vi.fn(() => mockLogger) }
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('starts pipeline after stream health check', async () => {
    mockAppState.isStreaming = true;

    await service.startPipeline({ nativeResolution: { width: 160, height: 144 } });

    expect(mockStreamHealthMonitor.startMonitoring).toHaveBeenCalled();
    expect(mockCanvasRenderer.startRendering).toHaveBeenCalled();
  });

  it('pauses and resumes rendering on visibility changes', async () => {
    mockAppState.isStreaming = true;
    service._currentCapabilities = { nativeResolution: { width: 160, height: 144 } };

    service.handlePerformanceStateChanged({ hidden: true });
    expect(mockCanvasRenderer.stopRendering).toHaveBeenCalled();

    service.handlePerformanceStateChanged({ hidden: false });
    await Promise.resolve();
    expect(mockCanvasRenderer.startRendering).toHaveBeenCalled();
  });

  it('switches to Canvas2D when performance mode enabled mid-stream', () => {
    mockAppState.isStreaming = true;
    service._useGPURenderer = true;
    mockGPURendererService.isActive.mockReturnValue(true);
    service._currentCapabilities = { nativeResolution: { width: 160, height: 144 } };

    service.handlePerformanceModeChanged(true);

    expect(mockGPURendererService.terminateAndReset).toHaveBeenCalledWith(false);
    expect(mockCanvasRenderer.startRendering).toHaveBeenCalled();
  });

  it('terminates GPU and clears canvas on stop when GPU renderer active', () => {
    mockAppState.isStreaming = false;
    service._useGPURenderer = true;

    service.stopPipeline();

    expect(mockEventBus.publish).toHaveBeenCalledWith('performance:memory-snapshot-requested', {
      label: 'before gpu release'
    });
    expect(mockGPURendererService.terminateAndReset).toHaveBeenCalled();
    expect(mockCanvasRenderer.clearCanvas).toHaveBeenCalled();
  });

  it('terminates GPU immediately on stop (no idle delay)', () => {
    mockAppState.isStreaming = false;
    service._useGPURenderer = true;

    service.stopPipeline();

    expect(mockGPURendererService.terminateAndReset).toHaveBeenCalled();
    expect(service._useGPURenderer).toBe(false);
  });

  describe('handleCanvasExpired', () => {
    it('delegates to canvasLifecycleService', () => {
      service.handleCanvasExpired();

      expect(mockCanvasLifecycleService.handleCanvasExpired).toHaveBeenCalled();
    });
  });

  describe('handleRenderPresetChanged', () => {
    it('when performance mode disabled and GPU active - sets GPU preset', () => {
      service._performanceModeEnabled = false;
      service._useGPURenderer = true;
      mockGPURendererService.isActive.mockReturnValue(true);

      service.handleRenderPresetChanged('vibrant');

      expect(mockGPURendererService.setPreset).toHaveBeenCalledWith('vibrant');
    });

    it('when performance mode enabled - caches preset without applying', () => {
      service._performanceModeEnabled = true;

      service.handleRenderPresetChanged('sharp');

      expect(service._userPresetId).toBe('sharp');
      expect(mockGPURendererService.setPreset).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'User selected sharp preset - cached (performance mode active)'
      );
    });
  });

  describe('handlePerformanceModeChanged', () => {
    it('when disabled (false) - restores user preset if GPU active', () => {
      service._performanceModeEnabled = true;
      service._useGPURenderer = true;
      service._userPresetId = 'vibrant';
      mockGPURendererService.isActive.mockReturnValue(true);

      service.handlePerformanceModeChanged(false);

      expect(mockGPURendererService.setPreset).toHaveBeenCalledWith('vibrant');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Performance mode disabled - restored vibrant preset'
      );
      expect(service._userPresetId).toBe(null);
    });

    it('when disabled (false) - calls _switchToGPUMidStream when Canvas2D active during streaming', async () => {
      service._performanceModeEnabled = true;
      service._canvas2dContextCreated = true;
      service._useGPURenderer = false;
      mockAppState.isStreaming = true;

      const switchSpy = vi.spyOn(service, '_switchToGPUMidStream').mockResolvedValue(undefined);

      service.handlePerformanceModeChanged(false);

      expect(switchSpy).toHaveBeenCalled();
    });

    it('when disabled (false) - recreates canvas when Canvas2D was active but not streaming', () => {
      service._performanceModeEnabled = true;
      service._canvas2dContextCreated = true;
      service._useGPURenderer = false;
      mockAppState.isStreaming = false;

      service.handlePerformanceModeChanged(false);

      expect(mockCanvasLifecycleService.recreateCanvas).toHaveBeenCalled();
      expect(mockCanvasLifecycleService.setupCanvasSize).toHaveBeenCalled();
      expect(service._canvas2dContextCreated).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Performance mode disabled - recreating canvas for GPU (Canvas2D context was active)'
      );
    });
  });

  describe('_startCanvasRendering', () => {
    it('GPU renderer success path - initializes and starts GPU rendering', async () => {
      mockGPURendererService.initialize.mockResolvedValue(true);

      await service._startCanvasRendering({ nativeResolution: { width: 160, height: 144 } });

      expect(mockGPURendererService.initialize).toHaveBeenCalledWith(
        canvas,
        { width: 160, height: 144 }
      );
      expect(service._useGPURenderer).toBe(true);
      expect(mockGpuRenderLoopService.start).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Using GPU renderer for HD rendering');
    });

    it('GPU renderer error path - catches initialization error and falls back to Canvas2D', async () => {
      mockGPURendererService.initialize.mockRejectedValue(new Error('GPU init failed'));

      await service._startCanvasRendering({ nativeResolution: { width: 160, height: 144 } });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'GPU renderer initialization failed, falling back to Canvas2D:',
        'GPU init failed'
      );
      expect(service._useGPURenderer).toBe(false);
      expect(mockCanvasRenderer.startRendering).toHaveBeenCalled();
    });

    it('Canvas transferred but GPU failed - logs error and does not start Canvas2D', async () => {
      mockGPURendererService.initialize.mockResolvedValue(false);
      mockGPURendererService.isCanvasTransferred.mockReturnValue(true);

      await service._startCanvasRendering({ nativeResolution: { width: 160, height: 144 } });

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Canvas control was transferred to GPU renderer and cannot be recovered for Canvas2D fallback. Video will play but without rendering pipeline.'
      );
      expect(mockCanvasRenderer.startRendering).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('resets state and calls all cleanup methods', () => {
      service._performanceModeEnabled = true;
      service._userPresetId = 'vibrant';
      service._canvas2dContextCreated = true;
      service._useGPURenderer = true;

      service.cleanup();

      expect(service._performanceModeEnabled).toBe(false);
      expect(service._userPresetId).toBe(null);
      expect(service._canvas2dContextCreated).toBe(false);
      expect(service._useGPURenderer).toBe(false);

      expect(mockGpuRenderLoopService.stop).toHaveBeenCalled();
      expect(mockGPURendererService.cleanup).toHaveBeenCalled();
      expect(mockCanvasRenderer.cleanup).toHaveBeenCalled();
      expect(mockCanvasLifecycleService.cleanup).toHaveBeenCalled();
      expect(mockStreamHealthMonitor.cleanup).toHaveBeenCalled();
    });
  });

  describe('_handleVisible', () => {
    it('with GPU renderer - starts GPU render loop', () => {
      mockAppState.isStreaming = true;
      service._useGPURenderer = true;
      service._isHidden = true;

      service._handleVisible();

      expect(mockGpuRenderLoopService.start).toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith('GPU rendering resumed (window visible)');
    });

    it('with Canvas2D renderer - starts canvas rendering', async () => {
      mockAppState.isStreaming = true;
      service._useGPURenderer = false;
      service._isHidden = true;
      service._currentCapabilities = { nativeResolution: { width: 160, height: 144 } };

      service._handleVisible();
      await Promise.resolve();

      expect(mockCanvasRenderer.startRendering).toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith('Canvas rendering resumed (window visible)');
    });
  });

  describe('_handleHidden', () => {
    it('with GPU renderer - stops GPU render loop', () => {
      mockAppState.isStreaming = true;
      service._useGPURenderer = true;

      service._handleHidden();

      expect(mockGpuRenderLoopService.stop).toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith('GPU rendering paused (window hidden)');
    });

    it('with Canvas2D renderer - stops canvas rendering', () => {
      mockAppState.isStreaming = true;
      service._useGPURenderer = false;

      service._handleHidden();

      expect(mockCanvasRenderer.stopRendering).toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith('Canvas rendering paused (window hidden)');
    });
  });

  describe('_waitForHealthyStream', () => {
    it('rejection path - stream timeout or error', async () => {
      mockStreamHealthMonitor.startMonitoring.mockImplementation((videoEl, onHealthy, onError) => {
        onError({ reason: 'timeout' });
      });

      await expect(service._waitForHealthyStream(video))
        .rejects.toThrow('No frames received: timeout');

      expect(mockLogger.warn).toHaveBeenCalledWith('Stream unhealthy: timeout');
      expect(mockEventBus.publish).toHaveBeenCalledWith('stream:health-timeout', { reason: 'timeout' });
    });
  });


  describe('_switchToGPUMidStream', () => {
    it('success path - switches to GPU renderer mid-stream', async () => {
      mockGPURendererService.initialize.mockResolvedValue(true);
      service._canvas2dContextCreated = true;

      await service._switchToGPUMidStream();

      expect(mockCanvasRenderer.stopRendering).toHaveBeenCalled();
      expect(mockCanvasLifecycleService.recreateCanvas).toHaveBeenCalled();
      expect(service._canvas2dContextCreated).toBe(false);
      expect(mockGPURendererService.initialize).toHaveBeenCalled();
      expect(service._useGPURenderer).toBe(true);
      expect(mockGpuRenderLoopService.start).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Performance mode disabled mid-stream - switched to GPU renderer');
    });

    it('success path with user preset - restores cached preset', async () => {
      mockGPURendererService.initialize.mockResolvedValue(true);
      service._userPresetId = 'vibrant';
      service._canvas2dContextCreated = true;

      await service._switchToGPUMidStream();

      expect(mockGPURendererService.setPreset).toHaveBeenCalledWith('vibrant');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Performance mode disabled mid-stream - switched to GPU with vibrant preset'
      );
      expect(service._userPresetId).toBe(null);
    });

    it('failure path - falls back to Canvas2D if GPU fails', async () => {
      mockGPURendererService.initialize.mockRejectedValue(new Error('GPU init failed'));
      service._canvas2dContextCreated = false;

      await service._switchToGPUMidStream();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'GPU initialization failed mid-stream, staying on Canvas2D:',
        'GPU init failed'
      );
      expect(service._canvas2dContextCreated).toBe(true);
      expect(mockCanvasRenderer.startRendering).toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Could not switch to GPU mid-stream, continuing with Canvas2D'
      );
    });

    it('failure path - GPU returns false instead of throwing', async () => {
      mockGPURendererService.initialize.mockResolvedValue(false);
      service._canvas2dContextCreated = false;

      await service._switchToGPUMidStream();

      expect(service._canvas2dContextCreated).toBe(true);
      expect(mockCanvasRenderer.startRendering).toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Could not switch to GPU mid-stream, continuing with Canvas2D'
      );
    });
  });

  describe('additional edge cases', () => {
    it('handlePerformanceStateChanged - ignores invalid state', () => {
      service.handlePerformanceStateChanged(null);
      service.handlePerformanceStateChanged({});
      service.handlePerformanceStateChanged({ hidden: 'invalid' });

      expect(mockCanvasRenderer.stopRendering).not.toHaveBeenCalled();
      expect(mockCanvasRenderer.startRendering).not.toHaveBeenCalled();
    });

    it('handlePerformanceStateChanged - ignores duplicate state', () => {
      service._isHidden = true;

      service.handlePerformanceStateChanged({ hidden: true });

      expect(mockCanvasRenderer.stopRendering).not.toHaveBeenCalled();
    });

    it('handleRenderPresetChanged - does nothing when GPU not active', () => {
      service._performanceModeEnabled = false;
      service._useGPURenderer = true;
      mockGPURendererService.isActive.mockReturnValue(false);

      service.handleRenderPresetChanged('vibrant');

      expect(mockGPURendererService.setPreset).not.toHaveBeenCalled();
    });

    it('handlePerformanceModeChanged(true) - terminates GPU when not streaming', () => {
      mockAppState.isStreaming = false;
      service._useGPURenderer = true;

      service.handlePerformanceModeChanged(true);

      expect(mockGPURendererService.terminateAndReset).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Performance mode enabled - terminating GPU worker for Canvas2D on next stream'
      );
      expect(service._useGPURenderer).toBe(false);
    });

    it('handlePerformanceModeChanged(true) mid-stream - caches current preset if not performance', () => {
      mockAppState.isStreaming = true;
      service._useGPURenderer = true;
      mockGPURendererService.isActive.mockReturnValue(true);
      mockGPURendererService.getPresetId.mockReturnValue('vibrant');

      service.handlePerformanceModeChanged(true);

      expect(service._userPresetId).toBe('vibrant');
    });

    it('handlePerformanceModeChanged(true) mid-stream - does not cache performance preset', () => {
      mockAppState.isStreaming = true;
      service._useGPURenderer = true;
      mockGPURendererService.isActive.mockReturnValue(true);
      mockGPURendererService.getPresetId.mockReturnValue('performance');

      service.handlePerformanceModeChanged(true);

      expect(service._userPresetId).toBe(null);
    });

    it('handlePerformanceModeChanged(false) - does nothing if GPU not active', () => {
      service._performanceModeEnabled = true;
      service._useGPURenderer = true;
      service._userPresetId = 'vibrant';
      mockGPURendererService.isActive.mockReturnValue(false);

      service.handlePerformanceModeChanged(false);

      expect(mockGPURendererService.setPreset).not.toHaveBeenCalled();
    });

    it('_startCanvasRendering - performance mode with Canvas2D', async () => {
      service._performanceModeEnabled = true;
      mockGPURendererService.isCanvasTransferred.mockReturnValue(false);

      await service._startCanvasRendering({ nativeResolution: { width: 160, height: 144 } });

      expect(service._useGPURenderer).toBe(false);
      expect(service._canvas2dContextCreated).toBe(true);
      expect(mockCanvasRenderer.startRendering).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Performance mode active - using Canvas2D renderer');
    });

    it('_startCanvasRendering - resumes already active GPU renderer', async () => {
      service._useGPURenderer = true;
      mockGPURendererService.isActive.mockReturnValue(true);

      await service._startCanvasRendering({ nativeResolution: { width: 160, height: 144 } });

      expect(mockGpuRenderLoopService.start).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Resuming GPU renderer (already initialized)');
    });

    it('_startCanvasRendering - uses default resolution when not provided', async () => {
      await service._startCanvasRendering({});

      expect(mockCanvasLifecycleService.setupCanvasSize).toHaveBeenCalledWith(
        { width: 160, height: 144 },
        false
      );
    });

    it('stopPipeline - with Canvas2D renderer', () => {
      service._useGPURenderer = false;

      service.stopPipeline();

      expect(mockCanvasRenderer.stopRendering).toHaveBeenCalled();
      expect(mockCanvasRenderer.clearCanvas).toHaveBeenCalled();
    });

    it('stopPipeline - does not clear canvas when transferred to GPU', () => {
      service._useGPURenderer = true;
      mockGPURendererService.isCanvasTransferred.mockReturnValue(true);

      service.stopPipeline();

      expect(mockCanvasRenderer.clearCanvas).not.toHaveBeenCalled();
    });

    it('_handleVisible - does nothing when not streaming', () => {
      mockAppState.isStreaming = false;
      service._useGPURenderer = true;

      service._handleVisible();

      expect(mockGpuRenderLoopService.start).not.toHaveBeenCalled();
    });

    it('_handleHidden - does nothing when not streaming', () => {
      mockAppState.isStreaming = false;
      service._useGPURenderer = true;

      service._handleHidden();

      expect(mockGpuRenderLoopService.stop).not.toHaveBeenCalled();
    });

    it('cleanup - does not fail when GPU not active', () => {
      service._useGPURenderer = false;

      expect(() => service.cleanup()).not.toThrow();
      expect(mockCanvasRenderer.cleanup).toHaveBeenCalled();
    });
  });
});
