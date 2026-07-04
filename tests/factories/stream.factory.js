/**
 * Stream Factory
 *
 * Creates mock streaming-related instances for testing.
 * Includes StreamingService, streams, and render pipeline mocks.
 */

import { vi } from 'vitest';
import { createMediaStream, createDeviceInfo } from './device.factory.js';
import {
  CHROMATIC_SPECS,
  createMediaTrackMock as createDeviceMediaTrackMock,
  createChromaticStreamCapabilities,
  createMediaStream as createMediaStreamDouble,
} from '../devices/media.testkit.ts';

/**
 * Streaming service states
 */
export const StreamingState = {
  IDLE: 'idle',
  STARTING: 'starting',
  STREAMING: 'streaming',
  STOPPING: 'stopping',
  ERROR: 'error',
};

/**
 * Creates a mock StreamingService
 * @param {Object} options - Service options
 * @returns {Object} Mock StreamingService
 */
export function createStreamingService(options = {}) {
  const {
    initialState = StreamingState.IDLE,
  } = options;

  let state = initialState;
  let currentStream = null;
  let currentDeviceId = null;
  let currentCapabilities = null;

  const service = {
    /**
     * Start streaming from a device
     */
    start: vi.fn(async (deviceId) => {
      if (state === StreamingState.STREAMING) {
        throw new Error('Already streaming');
      }

      state = StreamingState.STARTING;
      currentDeviceId = deviceId;

      try {
        currentStream = createMediaStream({ deviceId });
        currentCapabilities = createStreamCapabilitiesMock();
        state = StreamingState.STREAMING;
        return currentStream;
      } catch (error) {
        state = StreamingState.ERROR;
        throw error;
      }
    }),

    /**
     * Stop streaming
     */
    stop: vi.fn(async () => {
      if (state !== StreamingState.STREAMING) {
        return;
      }

      state = StreamingState.STOPPING;

      if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
      }

      currentStream = null;
      currentDeviceId = null;
      currentCapabilities = null;
      state = StreamingState.IDLE;
    }),

    /**
     * Check if actively streaming
     */
    isActive: vi.fn(() => state === StreamingState.STREAMING),

    /**
     * Get current stream
     */
    getStream: vi.fn(() => currentStream),

    /**
     * Get current device ID
     */
    getCurrentDeviceId: vi.fn(() => currentDeviceId),

    /**
     * Get current capabilities
     */
    getCapabilities: vi.fn(() => currentCapabilities),

    // ==========================================
    // Test Helpers
    // ==========================================

    _getState() { return state; },
    _setState(s) { state = s; },
    _setStream(s) { currentStream = s; },
    _reset() {
      state = StreamingState.IDLE;
      currentStream = null;
      currentDeviceId = null;
      currentCapabilities = null;
      vi.clearAllMocks();
    },
  };

  return service;
}

/**
 * Creates a mock Canvas with 2D context
 * @param {Object} options - Canvas options
 * @returns {Object} Mock canvas
 */
export function createMockCanvas(options = {}) {
  const {
    width = CHROMATIC_SPECS.nativeWidth * 4,
    height = CHROMATIC_SPECS.nativeHeight * 4,
  } = options;

  const drawCalls = [];

  const ctx = {
    drawImage: vi.fn((...args) => {
      drawCalls.push({ method: 'drawImage', args });
    }),
    fillRect: vi.fn((...args) => {
      drawCalls.push({ method: 'fillRect', args });
    }),
    clearRect: vi.fn((...args) => {
      drawCalls.push({ method: 'clearRect', args });
    }),
    getImageData: vi.fn((x, y, w, h) => ({
      data: new Uint8ClampedArray(w * h * 4),
      width: w,
      height: h,
    })),
    putImageData: vi.fn(),
    imageSmoothingEnabled: false,
    fillStyle: '#000000',
    _drawCalls: drawCalls,
    _clearDrawCalls: () => { drawCalls.length = 0; },
  };

  const canvas = {
    width,
    height,
    getContext: vi.fn((type, opts) => {
      if (type === '2d') return ctx;
      return null;
    }),
    toBlob: vi.fn((callback, type, quality) => {
      const blob = new Blob(['mock-image'], { type: type || 'image/png' });
      setTimeout(() => callback(blob), 0);
    }),
    toDataURL: vi.fn((type, quality) => {
      return `data:${type || 'image/png'};base64,mockData`;
    }),
    _ctx: ctx,
  };

  return canvas;
}

/**
 * Creates a mock Video element
 * @param {Object} options - Video options
 * @returns {Object} Mock video element
 */
export function createMockVideo(options = {}) {
  const {
    width = CHROMATIC_SPECS.nativeWidth,
    height = CHROMATIC_SPECS.nativeHeight,
    ...videoOverrides
  } = options;

  let srcObject = null;
  const eventListeners = new Map();

  const video = {
    get videoWidth() { return width; },
    get videoHeight() { return height; },
    get srcObject() { return srcObject; },
    set srcObject(v) { srcObject = v; },
    readyState: 4,
    HAVE_NOTHING: 0,
    HAVE_METADATA: 1,
    HAVE_CURRENT_DATA: 2,
    HAVE_FUTURE_DATA: 3,
    HAVE_ENOUGH_DATA: 4,

    play: vi.fn().mockResolvedValue(),
    pause: vi.fn(),
    load: vi.fn(),

    addEventListener: vi.fn((event, handler) => {
      if (!eventListeners.has(event)) {
        eventListeners.set(event, []);
      }
      eventListeners.get(event).push(handler);
    }),

    removeEventListener: vi.fn((event, handler) => {
      const handlers = eventListeners.get(event);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index > -1) handlers.splice(index, 1);
      }
    }),

    requestVideoFrameCallback: vi.fn((callback) => {
      return setTimeout(() => callback(performance.now(), {}), 16);
    }),

    cancelVideoFrameCallback: vi.fn((id) => {
      clearTimeout(id);
    }),

    ...videoOverrides,

    // Test helpers
    _triggerEvent(event, data) {
      const handlers = eventListeners.get(event) || [];
      handlers.forEach(h => h(data));
    },
    _eventListeners: eventListeners,
    _reset() {
      srcObject = null;
      eventListeners.clear();
      vi.clearAllMocks();
    },
  };

  return video;
}

export function createStreamPayloadMock(overrides = {}) {
  const {
    id = `stream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    getAudioTracks = vi.fn(() => []),
    ...streamOverrides
  } = overrides;

  return {
    id,
    getAudioTracks,
    ...streamOverrides
  };
}

export function createStreamStartedPayloadMock(overrides = {}) {
  const {
    stream = createCaptureStreamMock(),
    device = createDeviceInfo(),
    settings = {
      video: {
        width: CHROMATIC_SPECS.nativeWidth,
        height: CHROMATIC_SPECS.nativeHeight,
        frameRate: CHROMATIC_SPECS.defaultFrameRate
      }
    },
    capabilities = createStreamCapabilitiesMock({
      canvasScale: 4,
      nativeResolution: {
        width: CHROMATIC_SPECS.nativeWidth,
        height: CHROMATIC_SPECS.nativeHeight
      }
    }),
    ...payloadOverrides
  } = overrides;

  return {
    stream,
    device,
    settings,
    capabilities,
    ...payloadOverrides
  };
}

export function createSupportedDevicePayloadMock(overrides = {}) {
  const {
    device = createDeviceInfo(),
    ...payloadOverrides
  } = overrides;

  return {
    device,
    ...payloadOverrides
  };
}

export function createMediaTrackMock(overrides = {}) {
  return createDeviceMediaTrackMock(overrides);
}

export function createMediaStreamMock(overrides = {}) {
  const tracks = Array.isArray(overrides.tracks) ? [...overrides.tracks] : [];
  const { tracks: _tracks, ...streamOverrides } = overrides;
  const stream = createMediaStreamDouble({ ...streamOverrides, tracks });

  return {
    ...stream,
    ...streamOverrides
  };
}

export function createCaptureStreamMock(overrides = {}) {
  const {
    tracks = [],
    videoTracks = [],
    audioTracks = [],
    getVideoTracks = vi.fn(() => [...videoTracks]),
    getAudioTracks = vi.fn(() => [...audioTracks]),
    ...streamOverrides
  } = overrides;

  const baseTracks = tracks.length > 0 ? [...tracks] : [...videoTracks, ...audioTracks];

  return {
    ...createMediaStreamMock({ ...streamOverrides, tracks: baseTracks }),
    getVideoTracks,
    getAudioTracks,
    ...streamOverrides
  };
}

export function createStreamCapabilitiesMock(overrides = {}) {
  return createChromaticStreamCapabilities(overrides);
}

export function createDeviceMediaAcquirerMock(overrides = {}) {
  const stream = createCaptureStreamMock();
  const capabilities = createStreamCapabilitiesMock({
    hasAudio: false,
    hasVideo: true,
    audioSupport: true,
    fallbackStrategy: 'audio-simple'
  });

  return {
    acquire: vi.fn(async () => ({
      stream,
      strategy: 'full',
      capabilities
    })),
    release: vi.fn().mockResolvedValue(undefined),
    getStreamInfo: vi.fn(() => null),
    ...overrides
  };
}

