import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { OnInit } from '../../../src/decorators/on-init';
import { getOnInitMethods } from '../../../src/metadata/lifecycle-metadata';

describe('@OnInit decorator', () => {
  it('marks a method as an init hook', () => {
    class Foo {
      @OnInit()
      start() {}
    }
    expect(getOnInitMethods(Foo)).toEqual(['start']);
  });

  it('supports multiple @OnInit methods on same class', () => {
    class Foo {
      @OnInit()
      one() {}
      @OnInit()
      two() {}
    }
    expect(getOnInitMethods(Foo).sort()).toEqual(['one', 'two']);
  });

  it('returns empty array for undecorated class', () => {
    class Plain {}
    expect(getOnInitMethods(Plain)).toEqual([]);
  });
});
