/**
 * Performance Baseline Tests
 *
 * Validates that key operations meet performance baselines.
 * These tests help detect performance regressions.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  checkBaseline,
  assertBaseline,
  createPerformanceReport,
  formatReport,
  PerformanceBaselines,
} from './baseline.config.js';
import {
  createAppState,
  createDeviceAdapter,
  createDeviceService,
  createEventBus,
  createLoggerFactory,
  createMockDependencies,
  DeviceState,
  createChromaticWithFSM,
} from '../factories/index.js';
import { ResolutionCalculator } from '../utilities/ResolutionCalculator.js';
import { AnimationCache } from '@shared/utils/performance-cache.utils.js';

/**
 * Measure execution time of a function
 */
async function measure(fn, iterations = 100) {
  const times = [];

  // Warmup
  for (let i = 0; i < 10; i++) {
    await fn();
  }

  // Measure
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }

  return {
    min: Math.min(...times),
    max: Math.max(...times),
    avg: times.reduce((a, b) => a + b, 0) / times.length,
    median: times.sort((a, b) => a - b)[Math.floor(times.length / 2)],
  };
}

describe('Performance Baselines', () => {
  describe('Resolution Calculations', () => {
    let calc;

    beforeEach(() => {
      ResolutionCalculator.clearCache();
      calc = new ResolutionCalculator(160, 144);
    });

    it('should meet baseline for cached resolution calculation', async () => {
      // Prime cache
      calc.calculateScaled(4);

      const result = await measure(() => {
        calc.calculateScaled(4);
      });

      assertBaseline('resolution-calc-cached', result.avg);
    });

    it('should meet baseline for uncached resolution calculation', async () => {
      const result = await measure(() => {
        ResolutionCalculator.clearCache();
        calc.calculateScaled(4);
      }, 50);

      assertBaseline('resolution-calc-uncached', result.avg);
    });
  });

  describe('Cache Operations', () => {
    let cache;

    beforeEach(() => {
      cache = new AnimationCache();
    });

    afterEach(() => {
      cache.cancelAllAnimations();
    });

    it('should meet baseline for cache set operations', async () => {
      const result = await measure(() => {
        cache.set(`key-${Math.random()}`, { value: Math.random() });
      });

      assertBaseline('cache-set', result.avg);
    });

    it('should meet baseline for cache get (hit)', async () => {
      cache.set('test-key', { value: 'test' });

      const result = await measure(() => {
        cache.get('test-key');
      });

      assertBaseline('cache-get-hit', result.avg);
    });
  });

  describe('Event Bus Operations', () => {
    let eventBus;

    beforeEach(() => {
      eventBus = createEventBus();
    });

    afterEach(() => {
      eventBus._reset();
    });

    it('should meet baseline for event publish', async () => {
      eventBus.subscribe('test:event', () => {});

      const result = await measure(() => {
        eventBus.publish('test:event', { data: 'test' });
      });

      assertBaseline('eventbus-publish', result.avg);
    });

    it('should meet baseline for event subscribe', async () => {
      const result = await measure(() => {
        const unsub = eventBus.subscribe(`event-${Math.random()}`, () => {});
        unsub();
      });

      assertBaseline('eventbus-subscribe', result.avg);
    });

    it('should meet baseline for 100 publishes batch', async () => {
      eventBus.subscribe('batch:event', () => {});

      const result = await measure(() => {
        for (let i = 0; i < 100; i++) {
          eventBus.publish('batch:event', { i });
        }
      }, 10);

      assertBaseline('eventbus-100-publishes', result.avg);
    });
  });

  describe('Device Operations', () => {
    let device;

    beforeEach(() => {
      device = createChromaticWithFSM();
    });

    afterEach(() => {
      device.reset();
    });

    it('should meet baseline for device state transition', async () => {
      await device.connect();

      const result = await measure(() => {
        device._forceState(DeviceState.CONNECTED);
        device._forceState(DeviceState.DISCONNECTED);
        device._forceState(DeviceState.CONNECTED);
      }, 50);

      assertBaseline('device-state-transition', result.avg);
    });
  });

  describe('Factory Creation', () => {
    it('should meet baseline for mock dependencies creation', async () => {
      const result = await measure(() => {
        createMockDependencies();
      }, 50);

      assertBaseline('factory-creation', result.avg);
    });

    it('should meet baseline for individual factory creation', async () => {
      const factories = [
        () => createEventBus(),
        () => createAppState(),
        () => createLoggerFactory(),
        () => createDeviceService(),
      ];

      for (const factory of factories) {
        const result = await measure(factory, 50);
        // Should be fast
        expect(result.avg).toBeLessThan(2);
      }
    });
  });
});

describe('Performance Report Generation', () => {
  it('should create accurate performance report', () => {
    const measurements = {
      'resolution-calc-cached': 0.03,  // Pass
      'cache-set': 0.1,                 // Might fail (baseline 0.02)
      'eventbus-publish': 0.04,         // Pass
    };

    const report = createPerformanceReport(measurements);

    expect(report.version).toBeDefined();
    expect(report.date).toBeDefined();
    expect(report.summary.total).toBe(3);
    expect(typeof report.passed).toBe('boolean');
  });

  it('should format report correctly', () => {
    const measurements = {
      'resolution-calc-cached': 0.03,
      'eventbus-publish': 0.04,
    };

    const report = createPerformanceReport(measurements);
    const formatted = formatReport(report);

    expect(formatted).toContain('PERFORMANCE REPORT');
    expect(formatted).toContain('resolution-calc-cached');
    expect(formatted).toContain('eventbus-publish');
  });

  it('should identify failing metrics', () => {
    const measurements = {
      'resolution-calc-cached': 10, // Way over baseline
    };

    const report = createPerformanceReport(measurements);

    expect(report.passed).toBe(false);
    expect(report.failures).toContain('resolution-calc-cached');
  });
});

describe('Baseline Validation Utilities', () => {
  it('should correctly check baseline pass', () => {
    const result = checkBaseline('resolution-calc-cached', 0.03);
    expect(result.pass).toBe(true);
  });

  it('should correctly check baseline fail', () => {
    const result = checkBaseline('resolution-calc-cached', 1.0);
    expect(result.pass).toBe(false);
    expect(result.variance).toBeGreaterThan(0);
  });

  it('should handle unknown metrics gracefully', () => {
    const result = checkBaseline('unknown-metric', 100);
    expect(result.pass).toBe(true);
    expect(result.warning).toBeDefined();
  });

  it('should throw on baseline assertion failure', () => {
    expect(() => {
      assertBaseline('resolution-calc-cached', 100);
    }).toThrow('Performance regression');
  });

  it('should not throw on baseline assertion pass', () => {
    expect(() => {
      assertBaseline('resolution-calc-cached', 0.01);
    }).not.toThrow();
  });
});
