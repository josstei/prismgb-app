import { SettingsService } from '@renderer/infrastructure/services/settings/settings.service';
import { createEventBus } from '../factories/event-bus.factory.js';
import { createLoggerFactory } from '../factories/logger.factory.js';
import { createStorageService } from '../factories/storage.factory.js';

/** Construct the real service only in tests that exercise its implementation. */
export function createSettingsServiceHarness(overrides = {}) {
  const eventBus = overrides.eventBus ?? createEventBus();
  const loggerFactory = overrides.loggerFactory ?? createLoggerFactory();
  const storageService = overrides.storageService ?? createStorageService(overrides.initialValues);
  const service = new SettingsService({ eventBus, loggerFactory, storageService });
  return { service, eventBus, loggerFactory, storageService, storage: storageService, logger: loggerFactory._getLogger('SettingsService') };
}
