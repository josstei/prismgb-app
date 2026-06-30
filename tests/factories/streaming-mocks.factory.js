// @ts-nocheck
/**
 * Streaming Mocks Bridge
 *
 * Central exports for integration/performance workflow mock utilities.
 */

import { CHROMATIC_SPECS } from '../devices/media.testkit.ts';

export { CHROMATIC_SPECS };

import { createUIController as createMockUIController } from './ui.factory.js';
export { createMockUIController };

export {
  createMockVideoTrack,
  createMockStream,
  createMockDeviceInfo,
  MockDevice,
  MockDeviceManager,
} from '../devices/media.testkit.ts';

/**
 * Performance testing utilities
 */
export const performanceUtils = {
  /**
   * Measure execution time of a function
   */
  measureTime: async (fn, iterations = 1) => {
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
  },

  /**
   * Measure memory usage (if available)
   */
  measureMemory: () => {
    if (performance.memory) {
      return {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
      };
    }
    return null;
  },

  /**
   * Create a deferred promise for async testing
   */
  createDeferred: () => {
    let resolve, reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  },

  /**
   * Wait for condition with timeout
   */
  waitFor: async (condition, { timeout = 5000, interval = 50 } = {}) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await condition()) return true;
      await new Promise(r => setTimeout(r, interval));
    }
    throw new Error(`waitFor timeout after ${timeout}ms`);
  },
};
