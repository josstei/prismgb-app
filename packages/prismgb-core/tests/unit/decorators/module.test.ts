import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { Module } from '../../../src/decorators/module';
import { getModuleMetadata } from '../../../src/metadata/module-metadata';

describe('@Module decorator', () => {
  it('stores providers array on decorated class', () => {
    class ServiceA {}
    class ServiceB {}
    @Module({ providers: [ServiceA, ServiceB] })
    class MyModule {}
    const meta = getModuleMetadata(MyModule);
    expect(meta).toEqual({
      providers: [ServiceA, ServiceB],
      imports: []
    });
  });

  it('stores imports array on decorated class', () => {
    class OtherModule {}
    @Module({ providers: [], imports: [OtherModule] })
    class MyModule {}
    const meta = getModuleMetadata(MyModule);
    expect(meta?.imports).toEqual([OtherModule]);
  });

  it('defaults imports to empty array when omitted', () => {
    @Module({ providers: [] })
    class MyModule {}
    const meta = getModuleMetadata(MyModule);
    expect(meta?.imports).toEqual([]);
  });

  it('returns undefined for undecorated class', () => {
    class Plain {}
    expect(getModuleMetadata(Plain)).toBeUndefined();
  });

  it('throws if providers is not an array', () => {
    expect(() => {
      // @ts-expect-error testing invalid input
      @Module({ providers: 'nope' })
      class Bad {}
      void Bad;
    }).toThrow(/providers must be an array/);
  });
});
