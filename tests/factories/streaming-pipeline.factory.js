/**
 * Streaming Pipeline Factory
 *
 * Creates mock services for the renderer streaming pipeline:
 * render loops, GPU capture, audio, and view state.
 * Extracted from tests/factories/index.js as part of the factory-split refactor.
 */

import { vi } from 'vitest';
import { createMockCanvas, createMockVideo } from './stream.factory.js';
import { createMockElement } from './ui.factory.js';

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
    streamVideo: Object.assign(baseStreamVideo, streamVideo),
    streamCanvas: Object.assign(baseStreamCanvas, streamCanvas),
    ...rest,
  };
}

/**
 * Creates a mock GpuRendererService (the target-dimensions provider consumed by the recording service).
 *
 * @param {Object} [overrides={}] - Mock overrides.
 * @returns {Object} Mock GpuRendererService.
 */
export function createGpuRendererServiceMock(overrides = {}) {
  return /** @type {any} */ ({
    isActive: vi.fn().mockReturnValue(false),
    captureFrame: vi.fn(),
    getTargetDimensions: vi.fn(() => ({ width: 640, height: 576 })),
    ...overrides
  });
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
