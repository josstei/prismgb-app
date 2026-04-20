import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { Service } from '../../../src/decorators/service';
import { getServiceMetadata } from '../../../src/metadata/service-metadata';

describe('@Service decorator', () => {
  it('stores runs=main metadata on decorated class', () => {
    @Service({ runs: 'main' })
    class Foo {}
    expect(getServiceMetadata(Foo)).toEqual({ runs: 'main' });
  });

  it('stores runs=renderer metadata on decorated class', () => {
    @Service({ runs: 'renderer' })
    class Bar {}
    expect(getServiceMetadata(Bar)).toEqual({ runs: 'renderer' });
  });

  it('stores runs=worker metadata on decorated class', () => {
    @Service({ runs: 'worker' })
    class Baz {}
    expect(getServiceMetadata(Baz)).toEqual({ runs: 'worker' });
  });

  it('returns undefined for undecorated class', () => {
    class Plain {}
    expect(getServiceMetadata(Plain)).toBeUndefined();
  });

  it('throws on invalid runs value', () => {
    expect(() => {
      // @ts-expect-error testing invalid input
      @Service({ runs: 'invalid' })
      class Bad {}
      void Bad;
    }).toThrow(/runs must be one of 'main', 'renderer', 'worker'/);
  });
});
