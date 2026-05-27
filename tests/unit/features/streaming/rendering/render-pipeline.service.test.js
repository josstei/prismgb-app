/**
 * StreamingRenderPipelineService Unit Tests
 *
 * Tests the render pipeline service which uses Strategy pattern
 * for GPU/Canvas2D renderer selection via StreamingRendererFactory.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StreamingRenderPipelineService } from '@renderer/infrastructure/services/streaming/render-pipeline.service.ts';
import {
  createAppState,
  createCanvasLifecycleServiceMock,
  createCanvasRenderLoopServiceMock,
  createEventBus,
  createGpuRenderLoopServiceMock,
  createGpuRendererServiceMock,
  createLoggerFactory,
  createRendererAdapterMock,
  createStreamingRendererFactoryMock,
  createStreamingViewServiceMock,
  createStreamHealthServiceMock
} from '../../../../factories/index.js';

describe('StreamingRenderPipelineService', () => {
  let service;
  let mockAppState;
  let mockStreamViewService;
  let mockCanvasRenderer;
  let mockCanvasLifecycleService;
  let mockStreamHealthService;
  let mockGpuRendererService;
  let mockGpuRenderLoopService;
  let mockStreamingRendererFactory;
  let mockEventBus;
  let mockLogger;
  let mockLoggerFactory;
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

    mockAppState = createAppState();

    mockStreamViewService = createStreamingViewServiceMock({
      getCanvas: vi.fn(() => canvas),
      getVideo: vi.fn(() => video),
      getCanvasContainer: vi.fn(() => container),
      getCanvasSection: vi.fn(() => section),
      setCanvas: vi.fn()
    });

    mockCanvasRenderer = createCanvasRenderLoopServiceMock({
      hasContextFor: vi.fn().mockReturnValue(false)
    });

    mockCanvasLifecycleService = createCanvasLifecycleServiceMock();
    mockStreamHealthService = createStreamHealthServiceMock();
    mockGpuRendererService = createGpuRendererServiceMock();
    mockGpuRenderLoopService = createGpuRenderLoopServiceMock();

    // Create mock renderer adapters
    mockGpuRendererAdapter = createRendererAdapterMock({
      isActive: vi.fn().mockReturnValue(true),
      supportsPresets: vi.fn().mockReturnValue(true),
      getPresetId: vi.fn(() => 'vibrant')
    });

    mockCanvas2DRendererAdapter = createRendererAdapterMock({
      supportsPresets: vi.fn().mockReturnValue(false),
      getPresetId: vi.fn(() => null)
    });

    // Mock the factory
    mockStreamingRendererFactory = createStreamingRendererFactoryMock({
      createRenderer: vi.fn((type) => {
        if (type === 'gpu') return mockGpuRendererAdapter;
        return mockCanvas2DRendererAdapter;
      })
    });

    mockEventBus = createEventBus();
    mockLoggerFactory = createLoggerFactory();

    service = new StreamingRenderPipelineService({
      appState: mockAppState,
      streamViewService: mockStreamViewService,
      canvasRenderLoopService: mockCanvasRenderer,
      canvasLifecycleService: mockCanvasLifecycleService,
      streamHealthService: mockStreamHealthService,
      streamingRendererFactory: mockStreamingRendererFactory,
      gpuRendererService: mockGpuRendererService,
      gpuRenderLoopService: mockGpuRenderLoopService,
      eventBus: mockEventBus,
      loggerFactory: mockLoggerFactory
    });
    mockLogger = mockLoggerFactory._getLogger('StreamingRenderPipelineService');
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
      mockAppState.setStreaming(true);

      await service.startPipeline({ nativeResolution: { width: 160, height: 144 } });

      expect(mockStreamHealthService.checkStreamHealth).toHaveBeenCalled();
      expect(mockStreamingRendererFactory.createRenderer).toHaveBeenCalled();
    });

    it('waits for healthy stream before starting rendering', async () => {
      mockAppState.setStreaming(true);

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
      mockAppState.setStreaming(true);
      await service.startPipeline({ nativeResolution: { width: 160, height: 144 } });

      service.stopPipeline();

      expect(mockCanvas2DRendererAdapter.pause).toHaveBeenCalled();
    });

    it('terminates GPU renderer with memory snapshot events', async () => {
      mockStreamingRendererFactory.selectRendererType.mockReturnValue('gpu');
      mockAppState.setStreaming(true);
      await service.startPipeline({ nativeResolution: { width: 160, height: 144 } });

      service.stopPipeline();

      expect(mockEventBus.publish).toHaveBeenCalledWith('performance:memory-snapshot-requested', {
        label: 'before gpu release'
      });
      expect(mockGpuRendererAdapter.terminateAndReset).toHaveBeenCalled();
    });

    it('calls handlePipelineStop on Canvas2D renderer', async () => {
      mockStreamingRendererFactory.selectRendererType.mockReturnValue('canvas2d');
      await service.startPipeline({ nativeResolution: { width: 160, height: 144 } });

      service.stopPipeline();

      expect(mockCanvas2DRendererAdapter.handlePipelineStop).toHaveBeenCalled();
    });

    it('calls handlePipelineStop on GPU renderer (no-op)', async () => {
      mockStreamingRendererFactory.selectRendererType.mockReturnValue('gpu');
      await service.startPipeline({ nativeResolution: { width: 160, height: 144 } });

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
      mockAppState.setStreaming(true);
      await service.startPipeline({ nativeResolution: { width: 160, height: 144 } });
      service._isHidden = true;

      service.handlePerformanceStateChanged({ hidden: true });

      expect(mockCanvas2DRendererAdapter.pause).not.toHaveBeenCalled();
    });

    it('pauses rendering when hidden', async () => {
      mockAppState.setStreaming(true);
      await service.startPipeline({ nativeResolution: { width: 160, height: 144 } });

      service.handlePerformanceStateChanged({ hidden: true });

      expect(mockCanvas2DRendererAdapter.pause).toHaveBeenCalled();
    });

    it('resumes rendering when visible', async () => {
      mockAppState.setStreaming(true);
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
      mockStreamingRendererFactory.selectRendererType.mockReturnValue('gpu');
      mockAppState.setStreaming(true);
      await service.startPipeline({ nativeResolution: { width: 160, height: 144 } });
      service._performanceModeEnabled = false;

      service.handleRenderPresetChanged('vibrant');

      expect(mockGpuRendererAdapter.setPreset).toHaveBeenCalledWith('vibrant');
    });

    it('does nothing when renderer does not support presets', async () => {
      mockAppState.setStreaming(true);
      await service.startPipeline({ nativeResolution: { width: 160, height: 144 } });
      service._performanceModeEnabled = false;

      service.handleRenderPresetChanged('vibrant');

      expect(mockCanvas2DRendererAdapter.setPreset).not.toHaveBeenCalled();
    });
  });

  describe('handlePerformanceModeChanged', () => {
    describe('when enabled (true)', () => {
      it('caches preset and switches to Canvas2D mid-stream', async () => {
        mockStreamingRendererFactory.selectRendererType.mockReturnValue('gpu');
        mockAppState.setStreaming(true);
        await service.startPipeline({ nativeResolution: { width: 160, height: 144 } });

        await service.handlePerformanceModeChanged(true);

        expect(service._userPresetId).toBe('vibrant');
        expect(mockGpuRendererAdapter.terminateAndReset).toHaveBeenCalledWith(false);
        expect(mockLogger.info).toHaveBeenCalledWith(
          'Performance mode enabled mid-stream - switched to Canvas2D renderer'
        );
      });

      it('does not cache performance preset', async () => {
        mockGpuRendererAdapter.getPresetId.mockReturnValue('performance');
        mockStreamingRendererFactory.selectRendererType.mockReturnValue('gpu');
        mockAppState.setStreaming(true);
        await service.startPipeline({ nativeResolution: { width: 160, height: 144 } });

        await service.handlePerformanceModeChanged(true);

        expect(service._userPresetId).toBe(null);
      });

      it('terminates GPU when not streaming', async () => {
        mockStreamingRendererFactory.selectRendererType.mockReturnValue('gpu');
        mockAppState.setStreaming(true);
        await service.startPipeline({ nativeResolution: { width: 160, height: 144 } });
        mockAppState.setStreaming(false);

        await service.handlePerformanceModeChanged(true);

        expect(mockGpuRendererAdapter.terminateAndReset).toHaveBeenCalled();
        expect(mockLogger.info).toHaveBeenCalledWith(
          'Performance mode enabled - terminating GPU worker for Canvas2D on next stream'
        );
      });
    });

    describe('when disabled (false)', () => {
      it('restores user preset if GPU active', async () => {
        mockStreamingRendererFactory.selectRendererType.mockReturnValue('gpu');
        mockAppState.setStreaming(true);
        await service.startPipeline({ nativeResolution: { width: 160, height: 144 } });
        service._performanceModeEnabled = true;
        service._userPresetId = 'vibrant';

        await service.handlePerformanceModeChanged(false);

        expect(mockGpuRendererAdapter.setPreset).toHaveBeenCalledWith('vibrant');
        expect(mockLogger.info).toHaveBeenCalledWith(
          'Performance mode disabled - restored vibrant preset'
        );
        expect(service._userPresetId).toBe(null);
      });

      it('switches to GPU mid-stream when Canvas2D active', async () => {
        mockAppState.setStreaming(true);
        await service.startPipeline({ nativeResolution: { width: 160, height: 144 } });
        service._performanceModeEnabled = true;

        const switchSpy = vi.spyOn(service, '_switchToGPUMidStream').mockResolvedValue(undefined);

        await service.handlePerformanceModeChanged(false);

        expect(switchSpy).toHaveBeenCalled();
      });

      it('recreates canvas when Canvas2D was active but not streaming', async () => {
        mockAppState.setStreaming(true);
        await service.startPipeline({ nativeResolution: { width: 160, height: 144 } });
        service._performanceModeEnabled = true;
        mockAppState.setStreaming(false);

        await service.handlePerformanceModeChanged(false);

        expect(mockCanvasLifecycleService.recreateCanvas).toHaveBeenCalled();
        expect(mockCanvasLifecycleService.setupCanvasSize).toHaveBeenCalled();
      });
    });
  });

  describe('_startRendering', () => {
    it('selects renderer type via factory', async () => {
      await service._startRendering({ nativeResolution: { width: 160, height: 144 } });

      expect(mockStreamingRendererFactory.selectRendererType).toHaveBeenCalled();
    });

    it('creates Canvas2D renderer when selected', async () => {
      mockStreamingRendererFactory.selectRendererType.mockReturnValue('canvas2d');

      await service._startRendering({ nativeResolution: { width: 160, height: 144 } });

      expect(mockStreamingRendererFactory.createRenderer).toHaveBeenCalledWith('canvas2d', expect.any(Object));
      expect(service._activeRendererType).toBe('canvas2d');
    });

    it('creates GPU renderer when selected', async () => {
      mockStreamingRendererFactory.selectRendererType.mockReturnValue('gpu');

      await service._startRendering({ nativeResolution: { width: 160, height: 144 } });

      expect(mockStreamingRendererFactory.createRenderer).toHaveBeenCalledWith('gpu', expect.any(Object));
      expect(service._activeRendererType).toBe('gpu');
    });

    it('falls back to Canvas2D when GPU initialization fails', async () => {
      mockStreamingRendererFactory.selectRendererType.mockReturnValue('gpu');
      mockGpuRendererAdapter.initialize.mockResolvedValue(false);

      await service._startRendering({ nativeResolution: { width: 160, height: 144 } });

      expect(mockLogger.warn).toHaveBeenCalledWith('GPU renderer not available, falling back to Canvas2D');
      expect(service._activeRendererType).toBe('canvas2d');
    });

    it('falls back to Canvas2D when GPU throws error', async () => {
      mockStreamingRendererFactory.selectRendererType.mockReturnValue('gpu');
      mockGpuRendererAdapter.initialize.mockRejectedValue(new Error('GPU init failed'));

      await service._startRendering({ nativeResolution: { width: 160, height: 144 } });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'GPU renderer initialization failed, falling back to Canvas2D:',
        'GPU init failed'
      );
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
      mockStreamingRendererFactory.selectRendererType.mockReturnValue('gpu');
      await service._startRendering({ nativeResolution: { width: 160, height: 144 } });

      expect(mockCanvasLifecycleService.recreateCanvas).toHaveBeenCalled();
    });
  });

  describe('_switchToGPUMidStream', () => {
    beforeEach(async () => {
      mockAppState.setStreaming(true);
      await service.startPipeline({ nativeResolution: { width: 160, height: 144 } });
    });

    it('pauses current renderer and recreates canvas', async () => {
      await service._switchToGPUMidStream();

      expect(mockCanvas2DRendererAdapter.pause).toHaveBeenCalled();
      expect(mockCanvasLifecycleService.recreateCanvas).toHaveBeenCalled();
    });

    it('switches to GPU successfully', async () => {
      await service._switchToGPUMidStream();

      expect(mockStreamingRendererFactory.createRenderer).toHaveBeenCalledWith('gpu', expect.any(Object));
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

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'GPU initialization failed mid-stream, staying on Canvas2D:',
        'GPU init failed'
      );
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
      mockAppState.setStreaming(true);
      await service.startPipeline({ nativeResolution: { width: 160, height: 144 } });
      service._performanceModeEnabled = true;
      service._userPresetId = 'vibrant';

      await service.cleanup();

      expect(service._performanceModeEnabled).toBe(false);
      expect(service._userPresetId).toBe(null);
      expect(service._activeRenderer).toBe(null);
      expect(service._activeRendererType).toBe(null);

      expect(mockCanvas2DRendererAdapter.pause).toHaveBeenCalled();
      expect(mockCanvas2DRendererAdapter.cleanup).toHaveBeenCalled();
      expect(mockCanvasRenderer.cleanup).not.toHaveBeenCalled();
      expect(mockCanvasLifecycleService.cleanup).toHaveBeenCalled();
      expect(mockStreamHealthService.cleanup).toHaveBeenCalled();
    });

    it('does not fail when no active renderer', async () => {
      await expect(service.cleanup()).resolves.toBeUndefined();
      expect(mockCanvasRenderer.cleanup).toHaveBeenCalled();
    });
  });

  describe('_handleVisible', () => {
    it('resumes active renderer when streaming', async () => {
      mockAppState.setStreaming(true);
      await service.startPipeline({ nativeResolution: { width: 160, height: 144 } });

      service._handleVisible();

      expect(mockCanvas2DRendererAdapter.resume).toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith('canvas2d rendering resumed (window visible)');
    });

    it('does nothing when not streaming', () => {
      mockAppState.setStreaming(false);

      service._handleVisible();

      expect(mockCanvas2DRendererAdapter.resume).not.toHaveBeenCalled();
    });

    it('does nothing when no active renderer', () => {
      mockAppState.setStreaming(true);

      service._handleVisible();

      expect(mockCanvas2DRendererAdapter.resume).not.toHaveBeenCalled();
    });
  });

  describe('_handleHidden', () => {
    it('pauses active renderer when streaming', async () => {
      mockAppState.setStreaming(true);
      await service.startPipeline({ nativeResolution: { width: 160, height: 144 } });

      service._handleHidden();

      expect(mockCanvas2DRendererAdapter.pause).toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith('canvas2d rendering paused (window hidden)');
    });

    it('does nothing when not streaming', () => {
      mockAppState.setStreaming(false);

      service._handleHidden();

      expect(mockCanvas2DRendererAdapter.pause).not.toHaveBeenCalled();
    });

    it('does nothing when no active renderer', () => {
      mockAppState.setStreaming(true);

      service._handleHidden();

      expect(mockCanvas2DRendererAdapter.pause).not.toHaveBeenCalled();
    });
  });
});
