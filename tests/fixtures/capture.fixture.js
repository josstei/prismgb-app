/**
 * Capture Fixtures
 *
 * Centralized test data for capture-related tests (screenshots, recordings).
 */

import { CHROMATIC_SPECS } from '../support/chromatic-device-specs.js';

/**
 * Screenshot filename patterns
 */
export const SCREENSHOT_PATTERNS = {
  prefix: 'prismgb-screenshot',
  extension: '.png',
  timestampFormat: 'YYYYMMDD-HHMMSS-mmm',
  example: 'prismgb-screenshot-20250118-143052-123.png',
};

/**
 * Recording filename patterns
 */
export const RECORDING_PATTERNS = {
  prefix: 'prismgb-recording',
  extension: '.webm',
  timestampFormat: 'YYYYMMDD-HHMMSS-mmm',
  example: 'prismgb-recording-20250118-143052-123.webm',
};

/**
 * Screenshot fixture
 */
export const SCREENSHOT_FIXTURE = {
  filename: 'prismgb-screenshot-20250118-143052-123.png',
  mimeType: 'image/png',
  width: CHROMATIC_SPECS.nativeWidth,
  height: CHROMATIC_SPECS.nativeHeight,
  blob: null, // Created dynamically in tests
};

/**
 * Recording fixture
 */
export const RECORDING_FIXTURE = {
  filename: 'prismgb-recording-20250118-143052-123.webm',
  mimeType: 'video/webm',
  duration: 10000, // 10 seconds
  fileSize: 1024 * 1024, // 1MB
  blob: null, // Created dynamically in tests
};

/**
 * MediaRecorder options fixture
 */
export const MEDIA_RECORDER_OPTIONS = {
  vp8: {
    mimeType: 'video/webm;codecs=vp8',
    videoBitsPerSecond: 2500000,
  },
  vp9: {
    mimeType: 'video/webm;codecs=vp9',
    videoBitsPerSecond: 2500000,
  },
  h264: {
    mimeType: 'video/mp4;codecs=h264',
    videoBitsPerSecond: 2500000,
  },
};

/**
 * Capture events fixture
 */
export const CAPTURE_EVENTS = {
  screenshotTriggered: {
    event: 'capture:screenshot-triggered',
    data: {},
  },
  screenshotReady: {
    event: 'capture:screenshot-ready',
    data: {
      filename: SCREENSHOT_FIXTURE.filename,
      blob: null, // Populated in test
    },
  },
  recordingStarted: {
    event: 'capture:recording-started',
    data: {},
  },
  recordingStopped: {
    event: 'capture:recording-stopped',
    data: {},
  },
  recordingReady: {
    event: 'capture:recording-ready',
    data: {
      filename: RECORDING_FIXTURE.filename,
      blob: null, // Populated in test
    },
  },
  recordingError: {
    event: 'capture:recording-error',
    data: {
      error: 'Recording failed',
      name: 'Error',
    },
  },
};

/**
 * UI capture events fixture
 */
export const UI_CAPTURE_EVENTS = {
  screenshotRequested: {
    event: 'ui:screenshot-requested',
    data: {},
  },
  recordingToggleRequested: {
    event: 'ui:recording-toggle-requested',
    data: {},
  },
  shutterFlash: {
    event: 'ui:shutter-flash',
    data: {},
  },
  recordButtonPop: {
    event: 'ui:record-button-pop',
    data: {},
  },
};

/**
 * Recording state fixture
 */
export const RECORDING_STATES = {
  inactive: 'inactive',
  recording: 'recording',
  paused: 'paused',
};

/**
 * Recording error fixtures
 */
export const RECORDING_ERRORS = {
  noStream: {
    error: new Error('No stream provided'),
    message: 'No stream provided',
    name: 'Error',
  },
  alreadyRecording: {
    error: new Error('Already recording'),
    message: 'Already recording',
    name: 'Error',
  },
  notRecording: {
    error: new Error('Not recording'),
    message: 'Not recording',
    name: 'Error',
  },
  quotaExceeded: {
    error: new Error('Disk full'),
    message: 'Disk full',
    name: 'QuotaExceededError',
  },
  codecNotSupported: {
    error: new Error('Codec not supported'),
    message: 'Codec not supported',
    name: 'NotSupportedError',
  },
};

/**
 * Recorded data chunks fixture
 */
export const RECORDED_CHUNKS = {
  empty: [],
  single: [{ size: 1000 }],
  multiple: [
    { size: 1000 },
    { size: 2000 },
    { size: 1500 },
    { size: 500 },
  ],
};

/**
 * Creates a mock screenshot blob
 * @param {Object} options - Blob options
 * @returns {Blob} Mock blob
 */
export function createScreenshotBlob(options = {}) {
  const { size = 50000, type = 'image/png' } = options;
  const data = new Uint8Array(size);
  return new Blob([data], { type });
}

/**
 * Creates a mock recording blob
 * @param {Object} options - Blob options
 * @returns {Blob} Mock blob
 */
export function createRecordingBlob(options = {}) {
  const { size = 1024 * 1024, type = 'video/webm' } = options;
  const data = new Uint8Array(size);
  return new Blob([data], { type });
}

/**
 * Creates mock recorded chunks
 * @param {number} count - Number of chunks
 * @param {number} avgSize - Average chunk size
 * @returns {Array} Array of mock data chunks
 */
export function createRecordedChunks(count = 5, avgSize = 1000) {
  return Array.from({ length: count }, () => ({
    size: avgSize + Math.floor(Math.random() * 500 - 250),
  }));
}

/**
 * Creates a capture event fixture with populated blob
 * @param {string} type - 'screenshot' or 'recording'
 * @returns {Object} Event fixture with blob
 */
export function createCaptureEventFixture(type) {
  if (type === 'screenshot') {
    return {
      ...CAPTURE_EVENTS.screenshotReady,
      data: {
        ...CAPTURE_EVENTS.screenshotReady.data,
        blob: createScreenshotBlob(),
      },
    };
  } else {
    return {
      ...CAPTURE_EVENTS.recordingReady,
      data: {
        ...CAPTURE_EVENTS.recordingReady.data,
        blob: createRecordingBlob(),
      },
    };
  }
}

export default {
  SCREENSHOT_PATTERNS,
  RECORDING_PATTERNS,
  SCREENSHOT_FIXTURE,
  RECORDING_FIXTURE,
  MEDIA_RECORDER_OPTIONS,
  CAPTURE_EVENTS,
  UI_CAPTURE_EVENTS,
  RECORDING_STATES,
  RECORDING_ERRORS,
  RECORDED_CHUNKS,
  createScreenshotBlob,
  createRecordingBlob,
  createRecordedChunks,
  createCaptureEventFixture,
};
