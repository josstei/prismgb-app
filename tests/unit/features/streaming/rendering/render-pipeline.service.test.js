/**
 * RenderPipelineService Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RenderPipelineService } from '@features/streaming/rendering/render-pipeline.service.js';

describe('RenderPipelineService', () => {
  let service;
  let mockAppState;
  let mockUIController;
  let mockCanvasRenderer;
  let mockViewportManager;
  let mockStreamHealthMonitor;
  let mockGPURendererService;
  let mockEventBus;
  let mockLogger;

  beforeEach(() => {
    const section = document.createElement('section');
    const container = document.createElement('div');
    const canvas = document.createElement('canvas');
    const video = document.createElement('video');
    video.requestVideoFrameCallback = vi.fn();
    video.cancelVideoFrameCallback = vi.fn();

    container.appendChild(canvas);
    section.appendChild(container);
    document.body.appendChild(section);

    mockAppState = {
      isStreaming: false
    };

    mockUIController = {
      elements: {
        streamCanvas: canvas,
        streamVideo: video
      }
    };

    mockCanvasRenderer = {
      startRendering: vi.fn(),
      stopRendering: vi.fn(),
      clearCanvas: vi.fn(),
      resize: vi.fn(),
      resetCanvasState: vi.fn(),
      cleanup: vi.fn()
    };

    mockViewportManager = {
      initialize: vi.fn(),
      calculateDimensions: vi.fn(() => ({ width: 160, height: 144, scale: 1 })),
      resetDimensions: vi.fn(),
      cleanup: vi.fn(),
      _resizeObserver: null
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
      uiController: mockUIController,
      canvasRenderer: mockCanvasRenderer,
      viewportManager: mockViewportManager,
      streamHealthMonitor: mockStreamHealthMonitor,
      gpuRendererService: mockGPURendererService,
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

  it('releases GPU resources on stop when GPU renderer active', () => {
    mockAppState.isStreaming = false;
    service._useGPURenderer = true;

    service.stopPipeline();

    expect(mockEventBus.publish).toHaveBeenCalledWith('performance:memory-snapshot-requested', {
      label: 'before gpu release'
    });
    expect(mockGPURendererService.releaseResources).toHaveBeenCalled();
    expect(mockCanvasRenderer.clearCanvas).toHaveBeenCalled();
  });

  it('terminates GPU worker after idle timeout', () => {
    vi.useFakeTimers();
    mockAppState.isStreaming = false;
    service._useGPURenderer = true;

    service.stopPipeline();
    vi.advanceTimersByTime(16000);

    expect(mockGPURendererService.terminateAndReset).toHaveBeenCalled();
    expect(service._useGPURenderer).toBe(false);
  });
});
