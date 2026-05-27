/**
 * Test Factories Index
 *
 * Central export for all test factories.
 * Use these factories instead of inline mocks for consistency.
 */

import { createAppState } from './app-state.factory.js';
import { createDeviceService, createAdapterFactory } from './device.factory.js';
import { createEventBus } from './event-bus.factory.js';
import { createLoggerFactory } from './logger.factory.js';
import { createStreamingService } from './stream.factory.js';
import { createStorageService } from './storage.factory.js';
import { createUIController } from './ui.factory.js';
import { SettingsService } from '@renderer/infrastructure/services/settings/settings.service.ts';
import { SettingsDefinitions } from '@shared/features/settings/settings.definitions.js';
import { vi } from 'vitest';

// EventBus factories
export {
  createEventBus,
  createContractValidatingEventBus,
} from './event-bus.factory.js';

// Logger factories
export {
  createLogger,
  createLoggerFactory,
  LogLevels,
} from './logger.factory.js';

// Device factories
export {
  createDeviceInfo,
  createVideoTrack,
  createMediaStream,
  createDeviceAdapter,
  createDeviceService,
  createAdapterFactory,
  AdapterState,
} from './device.factory.js';

// Stream factories
export {
  createStreamingService,
  createRenderPipeline,
  createMockCanvas,
  createMockVideo,
  StreamingState,
} from './stream.factory.js';

// Storage factories
export {
  createStorageService,
} from './storage.factory.js';

export function createSettingsServiceHarness(overrides = {}) {
  const eventBus = overrides.eventBus ?? createEventBus();
  const loggerFactory = overrides.loggerFactory ?? createLoggerFactory();
  const storageService = overrides.storageService ?? createStorageService(overrides.initialValues);
  const service = new SettingsService({ eventBus, loggerFactory, storageService });
  return { service, eventBus, loggerFactory, storageService, storage: storageService, logger: loggerFactory._getLogger('SettingsService') };
}

export function createSettingsServiceMock(overrides = {}) {
  const { values: overrideValues = {}, ...methodOverrides } = overrides;
  const values = {
    ...Object.fromEntries(SettingsDefinitions.definitions.map((definition) => [definition.name, definition.default])),
    ...overrideValues
  };
  const read = (name) => values[name];
  return {
    getNumberSetting: vi.fn((name) => Number(read(name))),
    getBooleanSetting: vi.fn((name) => read(name) === true || read(name) === 'true'),
    getStringSetting: vi.fn((name) => String(read(name))),
    setSetting: vi.fn((name, value) => {
      values[name] = value;
      return true;
    }),
    ...methodOverrides
  };
}

// AppState factories
export {
  createAppState,
  createStreamingAppState,
  createRecordingAppState,
  DEFAULT_STATE,
} from './app-state.factory.js';

// UI factories
export {
  createMockElement,
  createMockButton,
  createMockInput,
  createUIController,
  createCaptureEffects,
  createButtonFeedback,
} from './ui.factory.js';

/**
 * Creates all standard dependencies for testing orchestrators/services
 * @param {Object} overrides - Override specific dependencies
 * @returns {Object} All mock dependencies
 */
export function createMockDependencies(overrides = {}) {
  return {
    eventBus: createEventBus(),
    loggerFactory: createLoggerFactory(),
    appState: createAppState(),
    uiController: createUIController(),
    streamingService: createStreamingService(),
    deviceService: createDeviceService(),
    adapterFactory: createAdapterFactory(),
    ...overrides,
  };
}

/**
 * Creates dependencies suitable for streaming tests
 */
export function createStreamingDependencies(overrides = {}) {
  const deps = createMockDependencies();
  deps.appState._forceSet('deviceConnected', true);
  deps.appState._forceSet('selectedDeviceId', 'mock-chromatic-device');
  return { ...deps, ...overrides };
}

/**
 * Creates dependencies suitable for capture tests
 */
export function createCaptureDependencies(overrides = {}) {
  const deps = createMockDependencies();
  deps.appState._forceSet('isStreaming', true);
  deps.appState._forceSet('deviceConnected', true);
  return { ...deps, ...overrides };
}
