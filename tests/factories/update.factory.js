/**
 * Update Factory
 *
 * Creates mock auto-update config and services for testing.
 */

export function createUpdateConfigMock(overrides = {}) {
  return {
    isDevelopment: false,
    version: '1.0.0',
    ...overrides
  };
}
