/**
 * Update Factory
 *
 * Creates mock auto-update config and services for testing.
 * Extracted from tests/factories/index.js as part of the factory-split refactor.
 */

import { vi } from 'vitest';

export function createUpdateConfigMock(overrides = {}) {
  return {
    isDevelopment: false,
    version: '1.0.0',
    ...overrides
  };
}

/**
 * @typedef {import('@renderer/infrastructure/services/update.service').UpdateService} UpdateService
 */

/**
 * Creates a mock UpdateService.
 *
 * @param {Partial<import('vitest').Mocked<UpdateService>>} [overrides={}] - Mock property and method overrides.
 * @returns {import('vitest').Mocked<UpdateService>} A strongly-typed mock UpdateService.
 */
export function createUpdateServiceMock(overrides = {}) {
  return /** @type {any} */ ({
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    installUpdate: vi.fn(),
    getStatus: vi.fn(),
    ...overrides
  });
}

/**
 * @typedef {import('@renderer/infrastructure/services/update-ui.service').UpdateUiService} UpdateUiService
 */

/**
 * Creates a mock UpdateUiService.
 *
 * @param {Partial<import('vitest').Mocked<UpdateUiService>>} [overrides={}] - Mock property overrides.
 * @returns {import('vitest').Mocked<UpdateUiService>} A strongly-typed mock UpdateUiService.
 */
export function createUpdateUiServiceMock(overrides = {}) {
  return /** @type {any} */ ({
    initialize: vi.fn(),
    dispose: vi.fn(),
    ...overrides
  });
}
