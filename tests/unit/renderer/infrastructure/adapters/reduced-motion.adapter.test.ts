import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReducedMotionAdapter } from '@renderer/infrastructure/adapters/reduced-motion.adapter.js';
import { installMatchMediaMock } from '../../../../support/mocks/browser-api.installers.js';

describe('ReducedMotionAdapter', () => {
  const adapter = new ReducedMotionAdapter();
  let query: EventTarget & { matches: boolean };
  let matchMedia: ReturnType<typeof installMatchMediaMock>;
  let releases: Array<() => void>;
  beforeEach(() => {
    query = Object.assign(new EventTarget(), { matches: false });
    matchMedia = installMatchMediaMock({ mediaQuery: query });
    releases = [];
  });
  afterEach(() => {
    releases.forEach((release) => release());
    matchMedia.cleanup();
  });

  it('reads and observes the reduced-motion preference', () => {
    const callback = vi.fn();
    expect(adapter.prefersReducedMotion()).toBe(false);
    releases.push(adapter.onChange(callback));
    query.matches = true;
    query.dispatchEvent(Object.assign(new Event('change'), { matches: true }));
    expect(adapter.prefersReducedMotion()).toBe(true);
    expect(callback).toHaveBeenCalledWith(true);
    expect(matchMedia.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
  });

  it('releases concurrent subscriptions independently and repeatedly', () => {
    const first = vi.fn();
    const second = vi.fn();
    const releaseFirst = adapter.onChange(first);
    releases.push(releaseFirst, adapter.onChange(second));
    releaseFirst();
    query.dispatchEvent(Object.assign(new Event('change'), { matches: true }));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
    releaseFirst();
    query.dispatchEvent(Object.assign(new Event('change'), { matches: false }));
    expect(second).toHaveBeenCalledTimes(2);
  });

  it('cleans up the original query when later subscriptions use another source', () => {
    const firstQuery = query;
    const first = vi.fn();
    const second = vi.fn();
    const releaseFirst = adapter.onChange(first);
    query = Object.assign(new EventTarget(), { matches: true });
    matchMedia.matchMedia.mockReturnValue(query);
    releases.push(releaseFirst, adapter.onChange(second));
    releaseFirst();
    firstQuery.dispatchEvent(Object.assign(new Event('change'), { matches: true }));
    query.dispatchEvent(Object.assign(new Event('change'), { matches: false }));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(false);
  });
});
