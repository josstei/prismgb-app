/**
 * Dependencies Factory
 *
 * Creates composite dependency mock sets for testing orchestrators and services.
 * Extracted from tests/factories/index.js as part of the factory-split refactor.
 */

import { createAppState } from './app-state.factory.js';
import {
  createDeviceService,
  createAdapterFactory,
  createDeviceServiceMock
} from './device.factory.js';
import { createEventBus } from './event-bus.factory.js';
import { createLoggerFactory } from './logger.factory.js';
import { createStreamingService } from './stream.factory.js';
import { createUIController } from './ui.factory.js';

/**
 * Creates mock dependencies for a streaming service.
 *
 * @param {Object} [overrides={}] - Mock dependency overrides.
 * @returns {Object} A set of mock streaming service dependencies.
 */
export function createStreamingServiceDependencies(overrides = {}) {
  return {
    deviceService: createDeviceServiceMock(),
    eventBus: createEventBus(),
    loggerFactory: createLoggerFactory(),
    adapterFactory: createAdapterFactory(),
    ipcClient: {},
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
 * Creates dependencies suitable for streaming tests.
 *
 * @param {Object} [overrides={}] - Override specific dependencies.
 * @returns {Object} Mock streaming dependencies.
 */
export function createStreamingDependencies(overrides = {}) {
  const deps = createMockDependencies();
  deps.appState._forceSet('deviceConnected', true);
  deps.appState._forceSet('selectedDeviceId', 'mock-chromatic-device');
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
