/**
 * Streaming Pipeline Factory
 *
 * Creates mock services for the renderer streaming pipeline:
 * render loops, GPU pipeline, canvas lifecycle, and viewport.
 * Extracted from tests/factories/index.js as part of the factory-split refactor.
 */

import { vi } from 'vitest';
import { createMockCanvas, createMockVideo } from './stream.factory.js';
import { createMockElement } from './ui.factory.js';

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
 * @typedef {import('@renderer/infrastructure/services/platform/viewport.service').StreamingViewportService} StreamingViewportService
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
 * @typedef {import('@renderer/infrastructure/services/platform/health.service').StreamingHealthService} StreamingHealthService
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
 * Creates a mock GpuRendererService (the target-dimensions provider consumed by the recording service).
 *
 * @param {Object} [overrides={}] - Mock overrides.
 * @returns {Object} Mock GpuRendererService.
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
 * @typedef {import('@renderer/infrastructure/services/streaming/streaming-render.service').StreamingRenderService} StreamingRenderService
 */

/**
 * Creates a mock StreamingRenderService.
 *
 * @param {Partial<import('vitest').Mocked<StreamingRenderService>>} [overrides={}] - Mock overrides.
 * @returns {import('vitest').Mocked<StreamingRenderService>} A strongly-typed mock StreamingRenderService.
 */
export function createStreamingRenderServiceMock(overrides = {}) {
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
