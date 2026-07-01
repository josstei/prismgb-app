import { vi } from 'vitest';

import { createAppState } from './app-state.factory.js';
import { createRendererDeviceRuntimeMock } from './device.factory.js';
import { createEventBus } from './event-bus.factory.js';
import { createLoggerFactory } from './logger.factory.js';
import {
  createDeviceMediaAcquirerMock,
  createMockCanvas,
  createMockVideo,
  createStreamingService
} from './stream.factory.js';

function createLeanUiController() {
  const elements = {
    streamCanvas: createMockCanvas(),
    streamVideo: createMockVideo(),
    streamOverlay: { hidden: false },
    overlayMessage: { textContent: '', dataset: {} },
    deviceStatus: { textContent: '' },
    streamInfo: { textContent: '' },
    recordBtn: {
      disabled: false,
      classList: {
        add: vi.fn(),
        remove: vi.fn()
      }
    }
  };

  return {
    elements,
    setStreamingMode: vi.fn((isStreaming) => {
      elements.streamOverlay.hidden = isStreaming;
    }),
    updateOverlayMessage: vi.fn((message, type = 'info') => {
      elements.overlayMessage.textContent = message;
      elements.overlayMessage.dataset.type = type;
    }),
    showErrorOverlay: vi.fn((message) => {
      elements.overlayMessage.textContent = message;
      elements.overlayMessage.dataset.type = 'error';
      elements.streamOverlay.hidden = false;
    }),
    updateDeviceStatus: vi.fn((status) => {
      elements.deviceStatus.textContent = status;
    }),
    updateStreamInfo: vi.fn((info) => {
      elements.streamInfo.textContent = info;
    }),
    setRecordButtonEnabled: vi.fn((enabled) => {
      elements.recordBtn.disabled = !enabled;
    }),
    setRecordingState: vi.fn((isRecording) => {
      const method = isRecording ? 'add' : 'remove';
      elements.recordBtn.classList[method]('recording');
    }),
    _getElement: (name) => elements[name],
    _setElement: (name, element) => {
      elements[name] = element;
    },
    _reset: vi.fn()
  };
}

/**
 * Creates mock dependencies for a streaming service.
 *
 * @param {Object} [overrides={}] - Mock dependency overrides.
 * @returns {Object} A set of mock streaming service dependencies.
 */
export function createStreamingServiceDependencies(overrides = {}) {
  return {
    rendererDeviceRuntime: createRendererDeviceRuntimeMock(),
    deviceMediaAcquirer: createDeviceMediaAcquirerMock(),
    eventBus: createEventBus({ recordEvents: false }),
    loggerFactory: createLoggerFactory({ recordLogs: false }),
    ...overrides
  };
}

/**
 * Creates all standard dependencies for testing orchestrators/services.
 *
 * @param {Object} [overrides={}] - Override specific dependencies.
 * @returns {Object} All mock dependencies.
 */
export function createMockDependencies(overrides = {}) {
  return {
    eventBus: createEventBus({ recordEvents: false }),
    loggerFactory: createLoggerFactory({ recordLogs: false }),
    appState: createAppState({ trackChanges: false }),
    uiController: createLeanUiController(),
    streamingService: createStreamingService(),
    rendererDeviceRuntime: createRendererDeviceRuntimeMock(),
    deviceMediaAcquirer: createDeviceMediaAcquirerMock(),
    ...overrides,
  };
}

/**
 * Creates dependencies suitable for streaming tests.
 *
 * @param {Object} [overrides={}] - Override specific dependencies.
 * @returns {Object} Mock streaming dependencies.
 */
export function createStreamingDependencies(overrides = {}) {
  const deps = createMockDependencies();
  deps.appState._forceSet('deviceConnected', true);
  deps.appState._forceSet('selectedDeviceId', 'chromatic-video-device');
  return { ...deps, ...overrides };
}

/**
 * Creates dependencies suitable for capture tests.
 *
 * @param {Object} [overrides={}] - Override specific dependencies.
 * @returns {Object} Mock capture dependencies.
 */
export function createCaptureDependencies(overrides = {}) {
  const deps = createMockDependencies();
  deps.appState._forceSet('isStreaming', true);
  deps.appState._forceSet('deviceConnected', true);
  return { ...deps, ...overrides };
}
