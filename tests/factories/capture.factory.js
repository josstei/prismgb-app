/**
 * Capture Factory
 *
 * Creates mock capture services (screenshot, recording, transcode),
 * MediaRecorder primitives, and capture UI controllers/toasts.
 * Extracted from tests/factories/index.js as part of the factory-split refactor.
 */

import { vi } from 'vitest';

/**
 * Creates a mock RecordingFrame.
 *
 * @param {Object} [overrides={}] - Mock overrides.
 * @returns {Object} Mock RecordingFrame.
 */
export function createRecordingFrameMock(overrides = {}) {
  return {
    width: 640,
    height: 576,
    close: vi.fn(),
    ...overrides
  };
}

/**
 * Creates a mock MediaBlobEvent.
 *
 * @param {Object} [overrides={}] - Mock overrides.
 * @returns {Object} Mock MediaBlobEvent.
 */
export function createMediaBlobEventMock(overrides = {}) {
  return {
    data: { size: 0, ...overrides.data },
    ...overrides,
  };
}

/**
 * Creates a mock MediaRecorder.
 *
 * @param {Object} [overrides={}] - Mock overrides.
 * @returns {Object} Mock MediaRecorder.
 */
export function createMediaRecorderMock(overrides = {}) {
  const listeners = {};
  let ondataavailable = vi.fn();
  let onerror = vi.fn();
  let onstop = vi.fn();

  const mock = {
    start: vi.fn(),
    stop: vi.fn(() => {
      mock.dispatchEvent({ type: 'stop' });
    }),
    pause: vi.fn(),
    resume: vi.fn(),
    requestData: vi.fn(),
    addEventListener: vi.fn((event, cb) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(cb);
    }),
    removeEventListener: vi.fn((event, cb) => {
      if (listeners[event]) {
        const index = listeners[event].indexOf(cb);
        if (index > -1) listeners[event].splice(index, 1);
      }
    }),
    dispatchEvent: vi.fn((eventObj) => {
      const type = eventObj.type;
      const list = listeners[type] || [];
      list.forEach(l => l(eventObj));
    }),
    ...overrides,
  };

  Object.defineProperty(mock, 'ondataavailable', {
    get() {
      return (event) => {
        const list = listeners['dataavailable'] || [];
        list.forEach(l => l(event));
        if (ondataavailable) ondataavailable(event);
      };
    },
    set(cb) {
      ondataavailable = cb;
    },
    configurable: true
  });

  Object.defineProperty(mock, 'onerror', {
    get() {
      return (event) => {
        const list = listeners['error'] || [];
        list.forEach(l => l(event));
        if (onerror) onerror(event);
      };
    },
    set(cb) {
      onerror = cb;
    },
    configurable: true
  });

  Object.defineProperty(mock, 'onstop', {
    get() {
      return (event) => {
        const list = listeners['stop'] || [];
        list.forEach(l => l(event));
        if (onstop) onstop(event);
      };
    },
    set(cb) {
      onstop = cb;
    },
    configurable: true
  });

  return mock;
}

/**
 * Creates a mock MediaRecorderErrorEvent.
 *
 * @param {Object} [overrides={}] - Mock overrides.
 * @returns {Object} Mock MediaRecorderErrorEvent.
 */
export function createMediaRecorderErrorEventMock(overrides = {}) {
  return {
    error: {
      message: 'Recording failed',
      name: 'RecordingError',
      ...overrides.error,
    },
    ...overrides,
  };
}

/**
 * Creates a mock CaptureUIController.
 *
 * @param {Object} [overrides={}] - Mock overrides.
 * @returns {Object} Mock CaptureUIController.
 */
export function createCaptureUIControllerMock(overrides = {}) {
  return {
    triggerDownload: vi.fn(),
    ...overrides
  };
}

/**
 * @typedef {import('@renderer/infrastructure/services/transcode/transcode.service').TranscodeService} TranscodeService
 */

/**
 * Creates a mock TranscodeService.
 *
 * @param {Partial<import('vitest').Mocked<TranscodeService>>} [overrides={}] - Mock property and method overrides.
 * @returns {import('vitest').Mocked<TranscodeService>} A strongly-typed mock TranscodeService.
 */
export function createTranscodeServiceMock(overrides = {}) {
  return /** @type {any} */ ({
    transcode: vi.fn(),
    cancel: vi.fn(),
    getStatus: vi.fn(),
    ...overrides
  });
}

/**
 * @typedef {import('@renderer/infrastructure/services/capture/capture.service').CaptureService} CaptureService
 */

/**
 * Creates a mock CaptureService.
 *
 * @param {Partial<import('vitest').Mocked<CaptureService>>} [overrides={}] - Mock property and method overrides.
 * @returns {import('vitest').Mocked<CaptureService>} A strongly-typed mock CaptureService.
 */
export function createCaptureServiceMock(overrides = {}) {
  return /** @type {any} */ ({
    takeScreenshot: vi.fn(),
    toggleRecording: vi.fn(),
    startRecording: vi.fn(),
    getRecordingState: vi.fn(),
    stopRecording: vi.fn(),
    isRecording: false,
    ...overrides
  });
}

/**
 * @typedef {import('@renderer/infrastructure/services/gpu/gpu-recording.service').CaptureGpuRecordingService} CaptureGpuRecordingService
 */

/**
 * Creates a mock CaptureGpuRecordingService.
 *
 * @param {Partial<import('vitest').Mocked<CaptureGpuRecordingService>>} [overrides={}] - Mock property and method overrides.
 * @returns {import('vitest').Mocked<CaptureGpuRecordingService>} A strongly-typed mock CaptureGpuRecordingService.
 */
export function createCaptureGpuRecordingServiceMock(overrides = {}) {
  return /** @type {any} */ ({
    start: vi.fn(async () => ({ id: 'gpu-stream' })),
    stop: vi.fn(),
    isActive: vi.fn().mockReturnValue(false),
    ...overrides
  });
}

/**
 * @typedef {import('@renderer/infrastructure/services/capture/capture-save.service').CaptureSaveService} CaptureSaveService
 */

/**
 * Creates a mock CaptureSaveService.
 *
 * @param {Partial<import('vitest').Mocked<CaptureSaveService>>} [overrides={}] - Mock property and method overrides.
 * @returns {import('vitest').Mocked<CaptureSaveService>} A strongly-typed mock CaptureSaveService.
 */
export function createCaptureSaveServiceMock(overrides = {}) {
  return /** @type {any} */ ({
    saveRecording: vi.fn().mockResolvedValue({ success: true, transcoded: false }),
    ...overrides
  });
}

