import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { container } from 'tsyringe';
import { Injectable } from '../../../src/decorators/injectable';

describe('@Injectable decorator', () => {
  it('marks class as tsyringe-injectable', () => {
    @Injectable()
    class Foo {}
    const instance = container.resolve(Foo);
    expect(instance).toBeInstanceOf(Foo);
  });

  it('supports constructor dependency injection by type', () => {
    @Injectable()
    class Dep {
      readonly value = 42;
    }

    @Injectable()
    class Consumer {
      constructor(public readonly dep: Dep) {}
    }

    const instance = container.resolve(Consumer);
    expect(instance.dep).toBeInstanceOf(Dep);
    expect(instance.dep.value).toBe(42);
  });
});
