/**
 * Stream Fixtures
 *
 * Centralized test data for stream-related tests.
 */

import { CHROMATIC_SPECS } from '../mocks/MockDevice.js';
import { CHROMATIC_DEVICE, CHROMATIC_STREAM_SETTINGS } from './devices.fixture.js';

/**
 * Standard stream fixture for Chromatic
 */
export const CHROMATIC_STREAM = {
  id: 'test-stream-chromatic-001',
  active: true,
  device: CHROMATIC_DEVICE,
  settings: CHROMATIC_STREAM_SETTINGS,
};

/**
 * Stream constraints fixture
 */
export const STREAM_CONSTRAINTS = {
  video: {
    deviceId: { exact: CHROMATIC_DEVICE.deviceId },
    width: { exact: CHROMATIC_SPECS.nativeWidth },
    height: { exact: CHROMATIC_SPECS.nativeHeight },
    frameRate: { ideal: CHROMATIC_SPECS.defaultFrameRate },
  },
  audio: false,
};

/**
 * Minimal constraints fixture
 */
export const MINIMAL_CONSTRAINTS = {
  video: {
    deviceId: { exact: CHROMATIC_DEVICE.deviceId },
  },
  audio: false,
};

/**
 * High frame rate constraints
 */
export const HIGH_FRAMERATE_CONSTRAINTS = {
  video: {
    deviceId: { exact: CHROMATIC_DEVICE.deviceId },
    width: { exact: CHROMATIC_SPECS.nativeWidth },
    height: { exact: CHROMATIC_SPECS.nativeHeight },
    frameRate: { exact: 60 },
  },
  audio: false,
};

/**
 * Canvas dimensions for different scales
 */
export const CANVAS_DIMENSIONS = {
  scale1: {
    width: CHROMATIC_SPECS.nativeWidth,
    height: CHROMATIC_SPECS.nativeHeight,
  },
  scale2: {
    width: CHROMATIC_SPECS.nativeWidth * 2,
    height: CHROMATIC_SPECS.nativeHeight * 2,
  },
  scale4: {
    width: CHROMATIC_SPECS.nativeWidth * 4,
    height: CHROMATIC_SPECS.nativeHeight * 4,
  },
  scale8: {
    width: CHROMATIC_SPECS.nativeWidth * 8,
    height: CHROMATIC_SPECS.nativeHeight * 8,
  },
};

/**
 * Default canvas dimensions (4x scale)
 */
export const DEFAULT_CANVAS = CANVAS_DIMENSIONS.scale4;

/**
 * Render options fixtures
 */
export const RENDER_OPTIONS = {
  sharp: {
    imageSmoothingEnabled: false,
    desynchronized: true,
    alpha: false,
  },
  smooth: {
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high',
    desynchronized: true,
    alpha: false,
  },
  balanced: {
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'medium',
    desynchronized: true,
    alpha: false,
  },
};

/**
 * Stream lifecycle events fixture
 */
export const STREAM_EVENTS = {
  starting: {
    event: 'stream:starting',
    data: { deviceId: CHROMATIC_DEVICE.deviceId },
  },
  started: {
    event: 'stream:started',
    data: {
      stream: CHROMATIC_STREAM,
      device: CHROMATIC_DEVICE,
      capabilities: {
        nativeResolution: {
          width: CHROMATIC_SPECS.nativeWidth,
          height: CHROMATIC_SPECS.nativeHeight,
        },
      },
    },
  },
  stopped: {
    event: 'stream:stopped',
    data: {},
  },
  error: {
    event: 'stream:error',
    data: {
      error: new Error('Stream failed'),
      operation: 'start',
      deviceId: CHROMATIC_DEVICE.deviceId,
    },
  },
};

/**
 * Performance metrics fixture
 */
export const PERFORMANCE_METRICS = {
  targetFps: 60,
  actualFps: 58.5,
  frameTime: 16.67,
  droppedFrames: 2,
  totalFrames: 3600,
  renderTime: 2.5,
};

/**
 * Creates a custom stream fixture
 * @param {Object} overrides - Properties to override
 * @returns {Object} Stream fixture
 */
export function createStreamFixture(overrides = {}) {
  return {
    ...CHROMATIC_STREAM,
    id: `test-stream-${Date.now()}`,
    ...overrides,
  };
}

/**
 * Creates stream constraints with custom device
 * @param {string} deviceId - Device ID
 * @param {Object} overrides - Additional constraint overrides
 * @returns {Object} Constraints object
 */
export function createConstraintsFixture(deviceId, overrides = {}) {
  return {
    video: {
      ...STREAM_CONSTRAINTS.video,
      deviceId: { exact: deviceId },
      ...overrides,
    },
    audio: false,
  };
}

export default {
  CHROMATIC_STREAM,
  STREAM_CONSTRAINTS,
  MINIMAL_CONSTRAINTS,
  HIGH_FRAMERATE_CONSTRAINTS,
  CANVAS_DIMENSIONS,
  DEFAULT_CANVAS,
  RENDER_OPTIONS,
  STREAM_EVENTS,
  PERFORMANCE_METRICS,
  createStreamFixture,
  createConstraintsFixture,
};
