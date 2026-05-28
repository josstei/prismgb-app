/**
 * Streaming Pipeline Factory
 *
 * Creates mock services and adapters for the renderer streaming pipeline:
 * render loops, GPU pipeline, canvas lifecycle, viewport, and acquisition coordination.
 * Extracted from tests/factories/index.js as part of the factory-split refactor.
 */

import { vi } from 'vitest';
import { createMockCanvas, createMockVideo } from './stream.factory.js';
import { createMockElement } from './ui.factory.js';

/**
 * Creates a mock StreamLifecycle.
 *
 * @param {Object} [overrides={}] - Mock overrides.
 * @returns {Object} Mock StreamLifecycle.
 */
export function createStreamLifecycleMock(overrides = {}) {
  return {
    acquireStream: vi.fn(() => Promise.resolve({ id: 'mock-stream' })),
    releaseStream: vi.fn(() => Promise.resolve()),
    getStreamInfo: vi.fn(),
    ...overrides
  };
}

/**
 * Creates a mock WorkerInstance.
 *
 * @param {Object} [overrides={}] - Mock overrides.
 * @returns {Object} Mock WorkerInstance.
 */
export function createWorkerInstanceMock(overrides = {}) {
  return {
    postMessage: vi.fn(),
    terminate: vi.fn(),
    onmessage: null,
    onerror: null,
    ...overrides
  };
}

/**
 * Creates a mock AcquisitionCoordinator.
 *
 * @param {Object} [overrides={}] - Mock overrides.
 * @returns {Object} Mock AcquisitionCoordinator.
 */
export function createAcquisitionCoordinatorMock(overrides = {}) {
  return {
    acquire: vi.fn(),
    ...overrides
  };
}

/**
 * Creates a mock FallbackStrategy.
 *
 * @param {Object} [overrides={}] - Mock overrides.
 * @returns {Object} Mock FallbackStrategy.
 */
export function createFallbackStrategyMock(overrides = {}) {
  return {
    initialize: vi.fn(),
    hasMore: vi.fn(),
    getNext: vi.fn(),
    ...overrides
  };
}

/**
 * Creates a mock StreamingViewController.
 *
 * @param {Object} [overrides={}] - Mock overrides.
 * @returns {Object} Mock StreamingViewController.
 */
export function createStreamingViewControllerMock(overrides = {}) {
  const {
    streamVideo,
    streamCanvas,
    elements,
    setStreamCanvas,
    ...componentOverrides
  } = overrides;

  const mergedElements = {
    streamVideo: streamVideo ?? createMockVideo(),
    streamCanvas: streamCanvas ?? createMockCanvas(),
    ...elements,
  };

  return {
    elements: mergedElements,
    setStreamCanvas: setStreamCanvas ?? vi.fn((canvas) => {
      mergedElements.streamCanvas = canvas;
    }),
    ...componentOverrides
  };
}

/**
 * @typedef {import('@renderer/infrastructure/services/streaming/audio-pipeline.service').StreamingAudioPipelineService} StreamingAudioPipelineService
 */

/**
 * Creates a mock StreamingAudioPipelineService.
 *
 * @param {Partial<import('vitest').Mocked<StreamingAudioPipelineService>>} [overrides={}] - Mock property and overrides.
 * @returns {import('vitest').Mocked<StreamingAudioPipelineService>} A strongly-typed mock StreamingAudioPipelineService.
 */
export function createStreamingAudioPipelineServiceMock(overrides = {}) {
  return /** @type {any} */ ({
    start: vi.fn().mockResolvedValue(true),
    stop: vi.fn(),
    ...overrides
  });
}

/**
 * @typedef {import('@renderer/infrastructure/services/streaming/streaming-view.service').StreamingViewService} StreamingViewService
 */

/**
 * Creates a mock StreamingViewService.
 *
 * @param {Partial<import('vitest').Mocked<StreamingViewService>>} [overrides={}] - Mock property and overrides.
 * @returns {import('vitest').Mocked<StreamingViewService>} A strongly-typed mock StreamingViewService.
 */
export function createStreamingViewServiceMock(overrides = {}) {
  return /** @type {any} */ ({
    setMuted: vi.fn(),
    attachMutedStream: vi.fn(),
    clearStream: vi.fn(),
    getCanvas: vi.fn(),
    getVideo: vi.fn(),
    getCanvasContainer: vi.fn(),
    getCanvasSection: vi.fn(),
    setCanvas: vi.fn(),
    updateOverlayMessage: vi.fn(),
    ...overrides,
  });
}

/**
 * Creates a mock StreamingViewElements.
 *
 * @param {Object} [overrides={}] - Mock overrides.
 * @returns {Object} Mock StreamingViewElements.
 */
export function createStreamingViewElementsMock(overrides = {}) {
  const {
    streamVideo = {},
    streamCanvas = {},
    ...rest
  } = overrides;
  const baseStreamVideo = createMockElement('video');
  const baseStreamCanvas = createMockElement('canvas');

  return {
    streamVideo: {
      ...baseStreamVideo,
      ...streamVideo
    },
    streamCanvas: {
      ...baseStreamCanvas,
      ...streamCanvas
    },
    ...rest,
  };
}

/**
 * @typedef {import('@renderer/infrastructure/services/streaming/canvas-render-loop.service').StreamingCanvasRenderLoopService} StreamingCanvasRenderLoopService
 */

/**
 * Creates a mock CanvasRenderLoopService.
 *
 * @param {Partial<import('vitest').Mocked<StreamingCanvasRenderLoopService>>} [overrides={}] - Mock overrides.
 * @returns {import('vitest').Mocked<StreamingCanvasRenderLoopService>} A strongly-typed mock CanvasRenderLoopService.
 */
export function createCanvasRenderLoopServiceMock(overrides = {}) {
  return /** @type {any} */ ({
    isActive: vi.fn(() => false),
    startRendering: vi.fn(),
    stopRendering: vi.fn(),
    clearCanvas: vi.fn(),
    resize: vi.fn(),
    resetCanvasState: vi.fn(),
    cleanup: vi.fn(),
    hasContextFor: vi.fn().mockReturnValue(false),
    ...overrides
  });
}

/**
 * @typedef {import('@renderer/infrastructure/services/streaming/viewport.service').StreamingViewportService} StreamingViewportService
 */

/**
 * Creates a mock ViewportService.
 *
 * @param {Partial<import('vitest').Mocked<StreamingViewportService>>} [overrides={}] - Mock overrides.
 * @returns {import('vitest').Mocked<StreamingViewportService>} A strongly-typed mock ViewportService.
 */
export function createViewportServiceMock(overrides = {}) {
  return /** @type {any} */ ({
    calculateDimensions: vi.fn(() => ({ width: 640, height: 576 })),
    initialize: vi.fn(),
    isInitialized: vi.fn().mockReturnValue(false),
    forceResize: vi.fn(),
    resetDimensions: vi.fn(),
    cleanup: vi.fn(),
    _resizeObserver: null,
    ...overrides
  });
}

/**
 * @typedef {import('@renderer/infrastructure/services/streaming/health.service').StreamingHealthService} StreamingHealthService
 */

/**
 * Creates a mock HealthService.
 *
 * @param {Partial<import('vitest').Mocked<StreamingHealthService>>} [overrides={}] - Mock overrides.
 * @returns {import('vitest').Mocked<StreamingHealthService>} A strongly-typed mock HealthService.
 */
export function createStreamHealthServiceMock(overrides = {}) {
  return /** @type {any} */ ({
    checkStreamHealth: vi.fn((videoEl, onHealthy) => {
      onHealthy({ frameTime: 100 });
    }),
    cleanup: vi.fn(),
    ...overrides
  });
}

/**
 * @typedef {import('@renderer/infrastructure/services/streaming/gpu-render-loop.service').StreamingGpuRenderLoopService} StreamingGpuRenderLoopService
 */

/**
 * Creates a mock GpuRenderLoopService.
 *
 * @param {Partial<import('vitest').Mocked<StreamingGpuRenderLoopService>>} [overrides={}] - Mock overrides.
 * @returns {import('vitest').Mocked<StreamingGpuRenderLoopService>} A strongly-typed mock GpuRenderLoopService.
 */
export function createGpuRenderLoopServiceMock(overrides = {}) {
  return /** @type {any} */ ({
    start: vi.fn(),
    stop: vi.fn(),
    ...overrides
  });
}

/**
 * Creates a mock GpuWorkerManager.
 *
 * @param {Object} [overrides={}] - Mock overrides.
 * @returns {Object} Mock GpuWorkerManager.
 */
export function createGpuWorkerManagerMock(overrides = {}) {
  return {
    isReady: vi.fn(() => false),
    isCanvasTransferred: vi.fn(() => false),
    getCapabilities: vi.fn(() => null),
    initialize: vi.fn().mockResolvedValue(true),
    sendCommand: vi.fn(),
    onMessage: vi.fn(() => vi.fn()),
    releaseResources: vi.fn(),
    terminate: vi.fn(),
    ...overrides
  };
}

/**
 * Creates a mock GpuFrameBuffer.
 *
 * @param {Object} [overrides={}] - Mock overrides.
 * @returns {Object} Mock GpuFrameBuffer.
 */
export function createGpuFrameBufferMock(overrides = {}) {
  return {
    enqueue: vi.fn(() => true),
    dequeue: vi.fn(() => null),
    isFull: vi.fn(() => false),
    flush: vi.fn(),
    getMetrics: vi.fn(() => ({ queued: 0, dropped: 0, avgLatency: 0 })),
    resetMetrics: vi.fn(),
    getCapacity: vi.fn(() => 3),
    getSize: vi.fn(() => 0),
    ...overrides
  };
}

/**
 * Creates a mock StreamingRendererFactory.
 *
 * @param {Object} [overrides={}] - Mock overrides.
 * @returns {Object} Mock StreamingRendererFactory.
 */
export function createStreamingRendererFactoryMock(overrides = {}) {
  return {
    selectRendererType: vi.fn(() => 'canvas2d'),
    createRenderer: vi.fn(),
    hasRenderer: vi.fn().mockReturnValue(true),
    getRegisteredTypes: vi.fn(() => ['gpu', 'canvas2d']),
    ...overrides
  };
}

/**
 * Creates a mock RendererAdapter.
 *
 * @param {Object} [overrides={}] - Mock overrides.
 * @returns {Object} Mock RendererAdapter.
 */
export function createRendererAdapterMock(overrides = {}) {
  return {
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
    isCanvasTransferred: vi.fn().mockReturnValue(false),
    terminateAndReset: vi.fn(),
    releaseGpuResources: vi.fn(),
    clearCanvas: vi.fn(),
    resetCanvasState: vi.fn(),
    handlePipelineStop: vi.fn(),
    ...overrides
  };
}

/**
 * @typedef {import('@renderer/infrastructure/services/streaming/gpu-renderer.service').StreamingGpuRendererService} StreamingGpuRendererService
 */

/**
 * Creates a mock GpuRendererService.
 *
 * @param {Partial<import('vitest').Mocked<StreamingGpuRendererService>>} [overrides={}] - Mock overrides.
 * @returns {import('vitest').Mocked<StreamingGpuRendererService>} A strongly-typed mock GpuRendererService.
 */
export function createGpuRendererServiceMock(overrides = {}) {
  return /** @type {any} */ ({
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
    captureFrame: vi.fn(),
    getTargetDimensions: vi.fn(() => ({ width: 640, height: 576 })),
    ...overrides
  });
}

/**
 * Creates a mock StreamViewService.
 *
 * @param {Object} [overrides={}] - Mock overrides.
 * @returns {Object} Mock StreamViewService.
 */
export function createStreamViewServiceMock(overrides = {}) {
  return {
    getCanvas: vi.fn(),
    getVideo: vi.fn(),
    getCanvasContainer: vi.fn(),
    getCanvasSection: vi.fn(),
    setCanvas: vi.fn(),
    attachMutedStream: vi.fn(),
    clearStream: vi.fn(),
    setMuted: vi.fn(),
    ...overrides
  };
}

/**
 * Creates a mock WorkerPipeline.
 *
 * @param {Object} [overrides={}] - Mock overrides.
 * @returns {Object} Mock WorkerPipeline.
 */
export function createWorkerPipelineMock(overrides = {}) {
  return {
    render: vi.fn(),
    resize: vi.fn(),
    captureFrame: vi.fn(async () => ({ id: 'captured-frame', close: vi.fn() })),
    getStats: vi.fn(() => ({
      fps: 60,
      frameTime: 16.0,
      framesRendered: 10,
      framesDropped: 0
    })),
    dispose: vi.fn(async () => {}),
    setPreset: vi.fn(),
    setBrightness: vi.fn(),
    ...overrides
  };
}

/**
 * Creates a mock CanvasRenderPipeline.
 *
 * @param {Object} [overrides={}] - Mock overrides.
 * @returns {Object} Mock CanvasRenderPipeline.
 */
export function createCanvasRenderPipelineMock(overrides = {}) {
  return {
    renderFrame: vi.fn(),
    resize: vi.fn(),
    clearFrame: vi.fn(),
    dispose: vi.fn(async () => undefined),
    ...overrides
  };
}

/**
 * @typedef {import('@renderer/infrastructure/services/streaming/streaming.service').StreamingService} StreamingService
 */

/**
 * Creates a mock StreamingService facade.
 *
 * @param {Partial<import('vitest').Mocked<StreamingService>>} [overrides={}] - Mock overrides.
 * @returns {import('vitest').Mocked<StreamingService>} A strongly-typed mock StreamingService facade.
 */
export function createStreamingServiceFacadeMock(overrides = {}) {
  return /** @type {any} */ ({
    start: vi.fn().mockResolvedValue({}),
    stop: vi.fn().mockResolvedValue(),
    getStream: vi.fn(),
    isActive: vi.fn(),
    ...overrides
  });
}

/**
 * @typedef {import('@renderer/infrastructure/services/streaming/render-pipeline.service').StreamingRenderPipelineService} StreamingRenderPipelineService
 */

/**
 * Creates a mock StreamingRenderPipelineService.
 *
 * @param {Partial<import('vitest').Mocked<StreamingRenderPipelineService>>} [overrides={}] - Mock overrides.
 * @returns {import('vitest').Mocked<StreamingRenderPipelineService>} A strongly-typed mock StreamingRenderPipelineService.
 */
export function createStreamingRenderPipelineServiceMock(overrides = {}) {
  return /** @type {any} */ ({
    initialize: vi.fn(),
    handleCanvasExpired: vi.fn(),
    handlePerformanceStateChanged: vi.fn(),
    handleRenderPresetChanged: vi.fn(),
    handlePerformanceModeChanged: vi.fn(),
    handleFullscreenChange: vi.fn(),
    startPipeline: vi.fn().mockResolvedValue(undefined),
    stopPipeline: vi.fn(),
    cleanup: vi.fn(),
    ...overrides
  });
}

/**
 * @typedef {import('@renderer/infrastructure/services/streaming/canvas-lifecycle.service').StreamingCanvasLifecycleService} StreamingCanvasLifecycleService
 */

/**
 * Creates a mock CanvasLifecycleService.
 *
 * @param {Partial<import('vitest').Mocked<StreamingCanvasLifecycleService>>} [overrides={}] - Mock overrides.
 * @returns {import('vitest').Mocked<StreamingCanvasLifecycleService>} A strongly-typed mock CanvasLifecycleService.
 */
export function createCanvasLifecycleServiceMock(overrides = {}) {
  return /** @type {any} */ ({
    initialize: vi.fn(),
    handleCanvasExpired: vi.fn(),
    handleFullscreenChange: vi.fn(),
    setupCanvasSize: vi.fn(),
    recreateCanvas: vi.fn(),
    cleanup: vi.fn(),
    ...overrides
  });
}
