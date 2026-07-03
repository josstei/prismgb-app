/**
 * Performance Factory
 *
 * Creates mock performance adapters, states, and metrics services for testing.
 * Extracted from tests/factories/index.js as part of the factory-split refactor.
 */

import { vi } from 'vitest';


export function createPerformanceMetricsAdapterMock(overrides = {}) {
  return {
    isAvailable: vi.fn(() => false),
    getProcessMetrics: vi.fn(),
    ...overrides
  };
}

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
    setCapabilities: vi.fn(),
    setStreaming: vi.fn(),
    dispose: vi.fn(),
    ...overrides
  });
}

/**
 * @typedef {import('@renderer/infrastructure/services/performance/performance-metrics.service').PerformanceMetricsService} PerformanceMetricsService
 */

/**
 * Creates a mock PerformanceMetricsService.
 *
 * @param {Partial<import('vitest').Mocked<PerformanceMetricsService>>} [overrides={}] - Mock overrides.
 * @returns {import('vitest').Mocked<PerformanceMetricsService>} A strongly-typed mock PerformanceMetricsService.
 */
export function createPerformanceMetricsServiceMock(overrides = {}) {
  return /** @type {any} */ ({
    requestSnapshot: vi.fn(),
    startPeriodicSnapshots: vi.fn(),
    stopPeriodicSnapshots: vi.fn(),
    clearPendingRequests: vi.fn(),
    ...overrides
  });
}

/**
 * @typedef {import('@renderer/infrastructure/services/performance/performance-animation.service').PerformanceAnimationService} PerformanceAnimationService
 */

/**
 * Creates a mock PerformanceAnimationService.
 *
 * @param {Partial<import('vitest').Mocked<PerformanceAnimationService>>} [overrides={}] - Mock overrides.
 * @returns {import('vitest').Mocked<PerformanceAnimationService>} A strongly-typed mock PerformanceAnimationService.
 */
export function createPerformanceAnimationServiceMock(overrides = {}) {
  return /** @type {any} */ ({
    setPerformanceState: vi.fn(() => ({
      idle: false,
      hidden: false,
      animationsOff: false
    })),
    ...overrides
  });
}

export function createBodyClassManagerMock(overrides = {}) {
  return {
    setIdle: vi.fn(),
    setHidden: vi.fn(),
    setAnimationsOff: vi.fn(),
    ...overrides
  };
}

export function createProcessMetricsMock(overrides = {}) {
  return {
    success: false,
    totalMB: '0.0',
    processes: [{ type: 'Renderer', memoryMB: '0.0' }],
    ...overrides
  };
}
