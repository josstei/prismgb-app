/**
 * Settings Factory
 *
 * Creates settings doubles from the canonical definitions.
 */

import { vi } from 'vitest';
import { SettingsDefinitions } from '@renderer/lib/settings.definitions.js';

/** @typedef {import('@renderer/infrastructure/services/settings/settings.service').SettingsService} SettingsService */

/**
 * Creates a mock SettingsService.
 *
 * @param {{ values?: Record<string, unknown> } & Record<string, any>} [overrides={}] - Initial setting values plus mock method overrides.
 * @returns {import('vitest').Mocked<SettingsService>} A strongly-typed mock SettingsService.
 */
export function createSettingsServiceMock(overrides = {}) {
  const { values: overrideValues = {}, ...methodOverrides } = /** @type {any} */ (overrides);
  const values = {
    ...Object.fromEntries(SettingsDefinitions.definitions.map((definition) => [definition.name, definition.default])),
    ...overrideValues
  };
  const read = (name) => values[name];
  return /** @type {any} */ ({
    getSetting: vi.fn(read),
    getLaunchOnLogin: vi.fn(async () => Boolean(read('launchOnLogin'))),
    setLaunchOnLogin: vi.fn(async (enabled) => { values.launchOnLogin = enabled; return true; }),
    setSetting: vi.fn((name, value) => {
      values[name] = value;
      return true;
    }),
    ...methodOverrides
  });
}
