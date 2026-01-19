/**
 * Test Utils Index
 *
 * Central export for all test utilities.
 */

// Global sandbox utilities
export {
  createGlobalSandbox,
  createDocumentSandbox,
  createNavigatorSandbox,
  createPerformanceSandbox,
  useSandbox,
} from './global-sandbox.js';

// Lazy mock utilities
export {
  lazyMock,
  clearMock,
  clearAllMocks,
  resetAllMocks,
  getCacheSize,
  isMockCached,
  getMediaDevicesMock,
  getCanvasMock,
  getAnimationFrameMock,
  getVideoElementMock,
  getPerformanceMock,
  getMediaStreamMock,
  getMediaStreamTrackMock,
  installCleanupHooks,
  runCleanup,
} from './lazy-mocks.js';

/**
 * Wait for a condition to be true
 * @param {Function} condition - Condition function (can be async)
 * @param {Object} options - Wait options
 * @returns {Promise<boolean>}
 */
export async function waitFor(condition, { timeout = 5000, interval = 50 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await condition()) return true;
    await new Promise(r => setTimeout(r, interval));
  }
  throw new Error(`waitFor timeout after ${timeout}ms`);
}

/**
 * Create a deferred promise for async testing
 */
export function createDeferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Delay execution for specified milliseconds
 */
export function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Flush all pending promises
 */
export function flushPromises() {
  return new Promise(resolve => setImmediate(resolve));
}

/**
 * Measure execution time of a function
 */
export async function measureTime(fn, iterations = 1) {
  const times = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }

  return {
    min: Math.min(...times),
    max: Math.max(...times),
    avg: times.reduce((a, b) => a + b, 0) / times.length,
    total: times.reduce((a, b) => a + b, 0),
    iterations,
    times,
  };
}

/**
 * Creates a mock event
 */
export function createMockEvent(type, props = {}) {
  return {
    type,
    target: null,
    currentTarget: null,
    preventDefault: () => {},
    stopPropagation: () => {},
    ...props,
  };
}
