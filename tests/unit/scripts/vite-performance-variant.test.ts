import { describe, expect, it } from 'vitest';
import {
  createPerformanceBuildDefines,
  createPerformanceVariant,
  createViteConfig,
  getPerformanceVariantFromEnvironment
} from '../../../vite.config.js';

describe('performance Vite variant definitions', () => {
  it('applies one closed variant definition to main, preload, and renderer builds', () => {
    const definitions = createPerformanceBuildDefines({ harness: true, instrumentation: false });

    expect(definitions.main).toEqual({
      __APP_VERSION__: expect.any(String),
      __PRISMGB_PERF_HARNESS__: 'true',
      __PRISMGB_PERF_INSTRUMENTATION__: 'false'
    });
    expect(definitions.preload).toEqual(definitions.main);
    expect(definitions.renderer).toEqual(definitions.main);
    expect(Object.isFrozen(definitions)).toBe(true);
    expect(Object.isFrozen(definitions.main)).toBe(true);
  });

  it('rejects unsupported instrumentation and environment flag combinations', () => {
    expect(() => createPerformanceVariant({ harness: false, instrumentation: true })).toThrow(/requires the harness build/);
    expect(() => getPerformanceVariantFromEnvironment({ PRISMGB_PERF_HARNESS_BUILD: 'yes' })).toThrow(/must be 0 or 1/);
  });

  it('keeps the renderer define at the top level so worker chunks inherit it', () => {
    const config = createViteConfig({ harness: true, instrumentation: true });

    expect(config.define).toMatchObject({
      __PRISMGB_PERF_HARNESS__: 'true',
      __PRISMGB_PERF_INSTRUMENTATION__: 'true'
    });
    expect(config.worker).toEqual({ format: 'es' });
    expect(config.worker).not.toHaveProperty('define');
  });
});
