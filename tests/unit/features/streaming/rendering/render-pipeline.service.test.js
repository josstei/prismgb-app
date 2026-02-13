/**
 * StreamingRenderPipelineService Unit Tests
 *
 * Tests the render pipeline service which uses Strategy pattern
 * for GPU/Canvas2D renderer selection via StreamingRendererFactory.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StreamingRenderPipelineService } from '@renderer/infrastructure/services/streaming/render-pipeline.service.ts';

describe('StreamingRenderPipelineService', () => {
  let service;
  let mockAppState;
  let mockStreamViewService;
  let mockCanvasRenderer;
  let mockCanvasLifecycleService;
  let mockStreamHealthService;
  let mockGpuRendererService;
  let mockCreateGpuRenderer;
  let mockCreateCanvasRenderer;
  let mockEventBus;
  let mockLogger;
  let mockGpuRendererAdapter;
  let mockCanvas2DRendererAdapter;
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
      cleanup: vi.fn(),
      hasContextFor: vi.fn().mockReturnValue(false)
    };

    mockCanvasLifecycleService = {
      initialize: vi.fn(),
      handleCanvasExpired: vi.fn(),
      handleFullscreenChange: vi.fn(),
      setupCanvasSize: vi.fn(),
      recreateCanvas: vi.fn(),
      cleanup: vi.fn()
    };

    mockStreamHealthService = {
      checkStreamHealth: vi.fn((videoEl, onHealthy) => {
        onHealthy({ frameTime: 100 });
      }),
      cleanup: vi.fn()
    };

    mockGpuRendererService = {
      initialize: vi.fn().mockResolvedValue(false),
      renderFrame: vi.fn().mockResolvedValue(undefined),
      setPreset: vi.fn(),
      getPresetId: vi.fn(() => 'vibrant'),
      isActive: vi.fn().mockReturnValue(false),
      isCanvasTransferred: vi.fn().mockReturnValue(false),
      terminateAndReset: vi.fn(),
      releaseGpuResources: vi.fn(),
      resize: vi.fn(),
      cleanup: vi.fn(),
      startRenderLoop: vi.fn(),
      stopRenderLoop: vi.fn()
    };

    // Create mock renderer adapters
    mockGpuRendererAdapter = {
      initialize: vi.fn().mockResolvedValue(true),
      renderFrame: vi.fn().mockResolvedValue(undefined),
      resize: vi.fn(),
      isActive: vi.fn().mockReturnValue(true),
      pause: vi.fn(),
      resume: vi.fn(),
      cleanup: vi.fn(),
      supportsPresets: vi.fn().mockReturnValue(true),
      getPresetId: vi.fn(() => 'vibrant'),
      setPreset: vi.fn(),
      setHiddenStateFn: vi.fn(),
      isCanvasTransferred: vi.fn().mockReturnValue(false),
      terminateAndReset: vi.fn(),
      releaseGpuResources: vi.fn(),
      handlePipelineStop: vi.fn()
    };

    mockCanvas2DRendererAdapter = {
      initialize: vi.fn().mockResolvedValue(true),
      renderFrame: vi.fn().mockResolvedValue(undefined),
      resize: vi.fn(),
      isActive: vi.fn().mockReturnValue(true),
      pause: vi.fn(),
      resume: vi.fn(),
      cleanup: vi.fn(),
      supportsPresets: vi.fn().mockReturnValue(false),
      getPresetId: vi.fn(() => null),
      setPreset: vi.fn(),
      setHiddenStateFn: vi.fn(),
      clearCanvas: vi.fn(),
      resetCanvasState: vi.fn(),
      handlePipelineStop: vi.fn()
    };

    // Mock renderer factory functions
    mockCreateGpuRenderer = vi.fn((context) => mockGpuRendererAdapter);
    mockCreateCanvasRenderer = vi.fn((context) => mockCanvas2DRendererAdapter);

    mockEventBus = {
      publish: vi.fn()
    };

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    service = new StreamingRenderPipelineService({
      appState: mockAppState,
      streamViewService: mockStreamViewService,
      canvasRenderer: mockCanvasRenderer,
      canvasLifecycleService: mockCanvasLifecycleService,
      streamHealthService: mockStreamHealthService,
      createGpuRenderer: mockCreateGpuRenderer,
      createCanvasRenderer: mockCreateCanvasRenderer,
      gpuRendererService: mockGpuRendererService,
      eventBus: mockEventBus,
      loggerFactory: { create: vi.fn(() => mockLogger) }
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('initialization', () => {
    it('initializes canvas lifecycle service', () => {
      service.initialize();
      expect(mockCanvasLifecycleService.initialize).toHaveBeenCalled();
    });
  });

  describe('startPipeline', () => {
    it('starts pipeline after stream health check', async () => {
      mockAppState.isStreaming = true;

      await service.startPipeline({ nativeResolution: { width: 160, height: 144 } });

      expect(mockStreamHealthService.checkStreamHealth).toHaveBeenCalled();
      expect(mockCreateCanvasRenderer).toHaveBeenCalled();
    });

    it('waits for healthy stream before starting rendering', async () => {
      mockAppState.isStreaming = true;

      await service.startPipeline({ nativeResolution: { width: 160, height: 144 } });

      expect(mockStreamHealthService.checkStreamHealth).toHaveBeenCalledWith(
        video,
        expect.any(Function),
        expect.any(Function),
        4000
      );
    });
  });

  describe('stopPipeline', () => {
    it('pauses active renderer and clears canvas', async () => {
      mockAppState.isStreaming = true;
      await service.startPipeline({ nativeResolution: { width: 160, height: 144 } });

      service.stopPipeline();

      expect(mockCanvas2DRendererAdapter.pause).toHaveBeenCalled();
    });

    it('terminates GPU renderer with memory snapshot events', async () => {
      service._performanceModeEnabled = false;
      mockAppState.isStreaming = true;
      await service.startPipeline({ nativeResolution: { width: 160, height: 144 }, supportsGPU: true });

      service.stopPipeline();

      expect(mockEventBus.publish).toHaveBeenCalledWith('performance:memory-snapshot-requested', {
        label: 'before gpu release'
      });
      expect(mockGpuRendererAdapter.terminateAndReset).toHaveBeenCalled();
    });

    it('calls handlePipelineStop on Canvas2D renderer', async () => {
      await service.startPipeline({ nativeResolution: { width: 160, height: 144 } });

      service.stopPipeline();

      expect(mockCanvas2DRendererAdapter.handlePipelineStop).toHaveBeenCalled();
    });

    it('calls handlePipelineStop on GPU renderer (no-op)', async () => {
      service._performanceModeEnabled = false;
      await service.startPipeline({ nativeResolution: { width: 160, height: 144 }, supportsGPU: true });

      service.stopPipeline();

      expect(mockGpuRendererAdapter.handlePipelineStop).toHaveBeenCalled();
    });
  });

  describe('handleCanvasExpired', () => {
    it('delegates to canvasLifecycleService', () => {
      service.handleCanvasExpired();
      expect(mockCanvasLifecycleService.handleCanvasExpired).toHaveBeenCalled();
    });
  });

  describe('handleFullscreenChange', () => {
    it('delegates to canvasLifecycleService', () => {
      service.handleFullscreenChange();
      expect(mockCanvasLifecycleService.handleFullscreenChange).toHaveBeenCalled();
    });
  });

  describe('handlePerformanceStateChanged', () => {
    it('ignores invalid state', () => {
      service.handlePerformanceStateChanged(null);
      service.handlePerformanceStateChanged({});
      service.handlePerformanceStateChanged({ hidden: 'invalid' });

      expect(mockCanvas2DRendererAdapter.pause).not.toHaveBeenCalled();
      expect(mockCanvas2DRendererAdapter.resume).not.toHaveBeenCalled();
    });

    it('ignores duplicate state', async () => {
      mockAppState.isStreaming = true;
      await service.startPipeline({ nativeResolution: { width: 160, height: 144 } });
      service._isHidden = true;

      service.handlePerformanceStateChanged({ hidden: true });

      expect(mockCanvas2DRendererAdapter.pause).not.toHaveBeenCalled();
    });

    it('pauses rendering when hidden', async () => {
      mockAppState.isStreaming = true;
      await service.startPipeline({ nativeResolution: { width: 160, height: 144 } });

      service.handlePerformanceStateChanged({ hidden: true });

      expect(mockCanvas2DRendererAdapter.pause).toHaveBeenCalled();
    });

    it('resumes rendering when visible', async () => {
      mockAppState.isStreaming = true;
      await service.startPipeline({ nativeResolution: { width: 160, height: 144 } });
      service._isHidden = true;

      service.handlePerformanceStateChanged({ hidden: false });

      expect(mockCanvas2DRendererAdapter.resume).toHaveBeenCalled();
    });
  });

  describe('handleRenderPresetChanged', () => {
    it('caches preset when performance mode enabled', () => {
      service._performanceModeEnabled = true;

      service.handleRenderPresetChanged('sharp');

      expect(service._userPresetId).toBe('sharp');
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'User selected sharp preset - cached (performance mode active)'
      );
    });

    it('sets preset on active renderer when supports presets', async () => {
      service._performanceModeEnabled = false;
      mockAppState.isStreaming = true;
      await service.startPipeline({ nativeResolution: { width: 160, height: 144 }, supportsGPU: true });

      service.handleRenderPresetChanged('vibrant');

      expect(mockGpuRendererAdapter.setPreset).toHaveBeenCalledWith('vibrant');
    });

    it('does nothing when renderer does not support presets', async () => {
      mockAppState.isStreaming = true;
      await service.startPipeline({ nativeResolution: { width: 160, height: 144 } });

      service.handleRenderPresetChanged('vibrant');

      expect(mockCanvas2DRendererAdapter.setPreset).not.toHaveBeenCalled();
    });
  });

  describe('handlePerformanceModeChanged', () => {
    describe('when enabled (true)', () => {
      it('caches preset and switches to Canvas2D mid-stream', async () => {
        service._performanceModeEnabled = false;
        mockAppState.isStreaming = true;
        await service.startPipeline({ nativeResolution: { width: 160, height: 144 }, supportsGPU: true });

        service.handlePerformanceModeChanged(true);

        expect(service._userPresetId).toBe('vibrant');
        expect(mockGpuRendererAdapter.terminateAndReset).toHaveBeenCalledWith(false);
        expect(mockLogger.info).toHaveBeenCalledWith(
          'Performance mode enabled mid-stream - switched to Canvas2D renderer'
        );
      });

      it('does not cache performance preset', async () => {
        mockGpuRendererAdapter.getPresetId.mockReturnValue('performance');
        service._performanceModeEnabled = false;
        mockAppState.isStreaming = true;
        await service.startPipeline({ nativeResolution: { width: 160, height: 144 }, supportsGPU: true });

        service.handlePerformanceModeChanged(true);

        expect(service._userPresetId).toBe(null);
      });

      it('terminates GPU when not streaming', async () => {
        service._performanceModeEnabled = false;
        mockAppState.isStreaming = true;
        await service.startPipeline({ nativeResolution: { width: 160, height: 144 }, supportsGPU: true });
        mockAppState.isStreaming = false;

        service.handlePerformanceModeChanged(true);

        expect(mockGpuRendererAdapter.terminateAndReset).toHaveBeenCalled();
        expect(mockLogger.info).toHaveBeenCalledWith(
          'Performance mode enabled - terminating GPU worker for Canvas2D on next stream'
        );
      });
    });

    describe('when disabled (false)', () => {
      it('restores user preset if GPU active', async () => {
        service._performanceModeEnabled = false;
        mockAppState.isStreaming = true;
        await service.startPipeline({ nativeResolution: { width: 160, height: 144 }, supportsGPU: true });
        service._performanceModeEnabled = true;
        service._userPresetId = 'vibrant';

        service.handlePerformanceModeChanged(false);

        expect(mockGpuRendererAdapter.setPreset).toHaveBeenCalledWith('vibrant');
        expect(mockLogger.info).toHaveBeenCalledWith(
          'Performance mode disabled - restored vibrant preset'
        );
        expect(service._userPresetId).toBe(null);
      });

      it('switches to GPU mid-stream when Canvas2D active', async () => {
        mockAppState.isStreaming = true;
        await service.startPipeline({ nativeResolution: { width: 160, height: 144 } });
        service._performanceModeEnabled = true;

        const switchSpy = vi.spyOn(service, '_switchToGPUMidStream').mockResolvedValue(undefined);

        service.handlePerformanceModeChanged(false);

        expect(switchSpy).toHaveBeenCalled();
      });

      it('recreates canvas when Canvas2D was active but not streaming', async () => {
        mockAppState.isStreaming = true;
        await service.startPipeline({ nativeResolution: { width: 160, height: 144 } });
        service._performanceModeEnabled = true;
        mockAppState.isStreaming = false;

        service.handlePerformanceModeChanged(false);

        expect(mockCanvasLifecycleService.recreateCanvas).toHaveBeenCalled();
        expect(mockCanvasLifecycleService.setupCanvasSize).toHaveBeenCalled();
      });
    });
  });

  describe('_startRendering', () => {
    it('selects renderer type internally', async () => {
      const selectSpy = vi.spyOn(service, '_selectRendererType');
      await service._startRendering({ nativeResolution: { width: 160, height: 144 } });

      expect(selectSpy).toHaveBeenCalled();
    });

    it('creates Canvas2D renderer when performance mode enabled', async () => {
      service._performanceModeEnabled = true;

      await service._startRendering({ nativeResolution: { width: 160, height: 144 } });

      expect(mockCreateCanvasRenderer).toHaveBeenCalledWith(expect.any(Object));
      expect(service._activeRendererType).toBe('canvas2d');
    });

    it('creates GPU renderer when GPU available', async () => {
      service._performanceModeEnabled = false;

      await service._startRendering({ nativeResolution: { width: 160, height: 144 }, supportsGPU: true });

      expect(mockCreateGpuRenderer).toHaveBeenCalledWith(expect.any(Object));
      expect(service._activeRendererType).toBe('gpu');
    });

    it('falls back to Canvas2D when GPU initialization fails', async () => {
      service._performanceModeEnabled = false;
      mockGpuRendererAdapter.initialize.mockResolvedValue(false);

      await service._startRendering({ nativeResolution: { width: 160, height: 144 }, supportsGPU: true });

      expect(mockLogger.warn).toHaveBeenCalledWith('GPU renderer not available, falling back to Canvas2D');
      expect(service._activeRendererType).toBe('canvas2d');
    });

    it('falls back to Canvas2D when GPU throws error', async () => {
      service._performanceModeEnabled = false;
      mockGpuRendererAdapter.initialize.mockRejectedValue(new Error('GPU init failed'));

      await service._startRendering({ nativeResolution: { width: 160, height: 144 }, supportsGPU: true });

      expect(mockLogger.warn).toHaveBeenCalledWith('GPU renderer initialization failed:', 'GPU init failed');
      expect(service._activeRendererType).toBe('canvas2d');
    });

    it('uses default resolution when not provided', async () => {
      await service._startRendering({});

      expect(mockCanvasLifecycleService.setupCanvasSize).toHaveBeenCalledWith(
        { width: 160, height: 144 },
        false
      );
    });

    it('recreates canvas when switching from Canvas2D to GPU', async () => {
      // First start with Canvas2D
      await service._startRendering({ nativeResolution: { width: 160, height: 144 } });
      expect(service._activeRendererType).toBe('canvas2d');

      // Now try GPU
      service._performanceModeEnabled = false;
      await service._startRendering({ nativeResolution: { width: 160, height: 144 }, supportsGPU: true });

      expect(mockCanvasLifecycleService.recreateCanvas).toHaveBeenCalled();
    });
  });

  describe('_switchToGPUMidStream', () => {
    beforeEach(async () => {
      mockAppState.isStreaming = true;
      await service.startPipeline({ nativeResolution: { width: 160, height: 144 } });
    });

    it('pauses current renderer and recreates canvas', async () => {
      await service._switchToGPUMidStream();

      expect(mockCanvas2DRendererAdapter.pause).toHaveBeenCalled();
      expect(mockCanvasLifecycleService.recreateCanvas).toHaveBeenCalled();
    });

    it('switches to GPU successfully', async () => {
      await service._switchToGPUMidStream();

      expect(mockCreateGpuRenderer).toHaveBeenCalledWith(expect.any(Object));
      expect(mockGpuRendererAdapter.resume).toHaveBeenCalled();
    });

    it('restores cached preset after switching', async () => {
      service._userPresetId = 'vibrant';

      await service._switchToGPUMidStream();

      expect(mockGpuRendererAdapter.setPreset).toHaveBeenCalledWith('vibrant');
      expect(service._userPresetId).toBe(null);
    });

    it('falls back to Canvas2D if GPU fails', async () => {
      mockGpuRendererAdapter.initialize.mockRejectedValue(new Error('GPU init failed'));

      await service._switchToGPUMidStream();

      expect(mockLogger.warn).toHaveBeenCalledWith('Could not switch to GPU mid-stream, continuing with Canvas2D');
      expect(service._activeRendererType).toBe('canvas2d');
    });
  });

  describe('_waitForHealthyStream', () => {
    it('resolves when stream is healthy', async () => {
      await expect(service._waitForHealthyStream(video)).resolves.toBeUndefined();
      expect(mockEventBus.publish).toHaveBeenCalledWith('stream:health-ok', { frameTime: 100 });
    });

    it('rejects when stream times out', async () => {
      mockStreamHealthService.checkStreamHealth.mockImplementation((videoEl, onHealthy, onError) => {
        onError({ reason: 'timeout' });
      });

      await expect(service._waitForHealthyStream(video))
        .rejects.toThrow('No frames received: timeout');

      expect(mockLogger.warn).toHaveBeenCalledWith('Stream unhealthy: timeout');
      expect(mockEventBus.publish).toHaveBeenCalledWith('stream:health-timeout', { reason: 'timeout' });
    });
  });

  describe('cleanup', () => {
    it('resets state and calls all cleanup methods', async () => {
      mockAppState.isStreaming = true;
      await service.startPipeline({ nativeResolution: { width: 160, height: 144 } });
      service._performanceModeEnabled = true;
      service._userPresetId = 'vibrant';

      service.cleanup();

      expect(service._performanceModeEnabled).toBe(false);
      expect(service._userPresetId).toBe(null);
      expect(service._activeRenderer).toBe(null);
      expect(service._activeRendererType).toBe(null);

      expect(mockCanvas2DRendererAdapter.pause).toHaveBeenCalled();
      expect(mockCanvas2DRendererAdapter.cleanup).toHaveBeenCalled();
      expect(mockCanvasRenderer.cleanup).toHaveBeenCalled();
      expect(mockCanvasLifecycleService.cleanup).toHaveBeenCalled();
      expect(mockStreamHealthService.cleanup).toHaveBeenCalled();
    });

    it('does not fail when no active renderer', () => {
      expect(() => service.cleanup()).not.toThrow();
      expect(mockCanvasRenderer.cleanup).toHaveBeenCalled();
    });
  });

  describe('_handleVisible', () => {
    it('resumes active renderer when streaming', async () => {
      mockAppState.isStreaming = true;
      await service.startPipeline({ nativeResolution: { width: 160, height: 144 } });

      service._handleVisible();

      expect(mockCanvas2DRendererAdapter.resume).toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith('canvas2d rendering resumed (window visible)');
    });

    it('does nothing when not streaming', () => {
      mockAppState.isStreaming = false;

      service._handleVisible();

      expect(mockCanvas2DRendererAdapter.resume).not.toHaveBeenCalled();
    });

    it('does nothing when no active renderer', () => {
      mockAppState.isStreaming = true;

      service._handleVisible();

      expect(mockCanvas2DRendererAdapter.resume).not.toHaveBeenCalled();
    });
  });

  describe('_handleHidden', () => {
    it('pauses active renderer when streaming', async () => {
      mockAppState.isStreaming = true;
      await service.startPipeline({ nativeResolution: { width: 160, height: 144 } });

      service._handleHidden();

      expect(mockCanvas2DRendererAdapter.pause).toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith('canvas2d rendering paused (window hidden)');
    });

    it('does nothing when not streaming', () => {
      mockAppState.isStreaming = false;

      service._handleHidden();

      expect(mockCanvas2DRendererAdapter.pause).not.toHaveBeenCalled();
    });

    it('does nothing when no active renderer', () => {
      mockAppState.isStreaming = true;

      service._handleHidden();

      expect(mockCanvas2DRendererAdapter.pause).not.toHaveBeenCalled();
    });
  });
});
