import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { OnDestroy } from '../../../src/decorators/on-destroy';
import { getOnDestroyMethods } from '../../../src/metadata/lifecycle-metadata';

describe('@OnDestroy decorator', () => {
  it('marks a method as a destroy hook', () => {
    class Foo {
      @OnDestroy()
      stop() {}
    }
    expect(getOnDestroyMethods(Foo)).toEqual(['stop']);
  });

  it('returns empty array for undecorated class', () => {
    class Plain {}
    expect(getOnDestroyMethods(Plain)).toEqual([]);
  });
});
