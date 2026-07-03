import { createRendererDeviceRuntimeMock } from './device.factory.js';
import { createEventBus } from './event-bus.factory.js';
import { createLoggerFactory } from './logger.factory.js';
import { createDeviceMediaAcquirerMock } from './stream.factory.js';

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
