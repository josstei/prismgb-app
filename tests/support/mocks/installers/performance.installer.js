// @ts-nocheck
import { vi } from 'vitest';
import { createCleanupStack } from '../runtime-property.installers.js';

/**
 * Canonical performance API installer.
 */
export function installPerformanceApiMock() {
  const stack = createCleanupStack();

  const performanceNow = performance.now.bind(performance);
  let now = 0;
  const marks = new Map();
  const measures = [];

  const mockPerformance = {
    now: vi.fn(() => {
      const value = now;
      now += 1;
      return value;
    }),
    mark: vi.fn((name) => {
      marks.set(name, performanceNow());
    }),
    measure: vi.fn((name, startMark, endMark) => {
      const start = marks.get(startMark) || 0;
      const end = marks.get(endMark) || performanceNow();
      measures.push({ name, duration: end - start, startMark, endMark, start, end });
    }),
    getEntriesByName: vi.fn((name) => {
      return measures.filter((measure) => measure.name === name);
    }),
    clearMarks: vi.fn(() => marks.clear()),
    clearMeasures: vi.fn(() => {
      measures.length = 0;
    }),
  };

  const previousPerformance = globalThis.performance;

  vi.stubGlobal('performance', {
    ...globalThis.performance,
    ...mockPerformance,
  });

  stack.add(() => {
    vi.stubGlobal('performance', previousPerformance);
  });

  return {
    ...stack,
    performance: mockPerformance,
  };
}
