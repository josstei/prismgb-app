/**
 * Update Factory
 *
 * Creates mock auto-update config and services for testing.
 * Extracted from tests/factories/index.js as part of the factory-split refactor.
 */

export function createUpdateConfigMock(overrides = {}) {
  return {
    isDevelopment: false,
    version: '1.0.0',
    ...overrides
  };
}
