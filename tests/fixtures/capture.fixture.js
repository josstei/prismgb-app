/**
 * Capture Fixtures
 *
 * Centralized test data for capture-related tests (screenshots, recordings).
 */

import { CHROMATIC_SPECS } from '../devices/media.testkit.ts';

/**
 * Screenshot fixture
 */
const SCREENSHOT_FIXTURE = {
  filename: 'prismgb-screenshot-20250118-143052-123.png',
  mimeType: 'image/png',
  width: CHROMATIC_SPECS.nativeWidth,
  height: CHROMATIC_SPECS.nativeHeight,
  blob: null, // Created dynamically in tests
};

/**
 * Recording fixture
 */
const RECORDING_FIXTURE = {
  filename: 'prismgb-recording-20250118-143052-123.webm',
  mimeType: 'video/webm',
  duration: 10000, // 10 seconds
  fileSize: 1024 * 1024, // 1MB
  blob: null, // Created dynamically in tests
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
