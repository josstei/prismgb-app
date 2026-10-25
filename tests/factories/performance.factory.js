/**
 * Performance Factory
 *
 * Creates mock performance state adapters and services for testing.
 */

import { vi } from 'vitest';

export function createVisibilityAdapterMock(overrides = {}) {
  let callbackRef = null;
  const adapter = {
    isHidden: vi.fn(() => false),
    onVisibilityChange: vi.fn((callback) => {
      callbackRef = callback;
      return vi.fn();
    }),
    dispose: vi.fn(),
    get callbackRef() {
      return callbackRef;
    },
    ...overrides
  };
  return adapter;
}

export function createUserActivityAdapterMock(overrides = {}) {
  let callbackRef = null;
  const adapter = {
    onActivity: vi.fn((callback) => {
      callbackRef = callback;
      return vi.fn();
    }),
    dispose: vi.fn(),
    get callbackRef() {
      return callbackRef;
    },
    ...overrides
  };
  return adapter;
}

export function createReducedMotionAdapterMock(overrides = {}) {
  let callbackRef = null;
  const adapter = {
    prefersReducedMotion: vi.fn(() => false),
    onChange: vi.fn((callback) => {
      callbackRef = callback;
      return vi.fn();
    }),
    get callbackRef() {
      return callbackRef;
    },
    ...overrides
  };
  return adapter;
}

/**
 * @typedef {import('@renderer/infrastructure/services/performance/performance-state.service').PerformanceStateService} PerformanceStateService
 */

/**
 * Creates a mock PerformanceStateService.
 *
 * @param {Partial<import('vitest').Mocked<PerformanceStateService>>} [overrides={}] - Mock overrides.
 * @returns {import('vitest').Mocked<PerformanceStateService>} A strongly-typed mock PerformanceStateService.
 */
export function createPerformanceStateServiceMock(overrides = {}) {
  return /** @type {any} */ ({
    initialize: vi.fn(),
    setPerformanceModeEnabled: vi.fn(() => true),
    setStreaming: vi.fn(),
    dispose: vi.fn(),
    ...overrides
  });
}
