import { describe, it, expect } from 'vitest';
import * as core from '@prismgb/core';
import { Service } from '@prismgb/core';

describe('@Service decorator (build-time marker)', () => {
  it('returns the class unchanged', () => {
    class Example {}
    const decorated = Service({ token: 'example' })(Example as never);
    expect(decorated).toBe(Example);
  });

  it('writes no runtime metadata onto the class', () => {
    class Example {}
    Service({ token: 'example', disposal: 'dispose' })(Example as never);
    expect((Example as Record<string, unknown>).serviceMetadata).toBeUndefined();
  });

  it('no longer exports an Inject decorator', () => {
    expect((core as Record<string, unknown>).Inject).toBeUndefined();
  });
});
