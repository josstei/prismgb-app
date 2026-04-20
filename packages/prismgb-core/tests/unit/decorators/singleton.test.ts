import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { container } from 'tsyringe';
import { Singleton } from '../../../src/decorators/singleton';

describe('@Singleton decorator', () => {
  it('returns the same instance across resolutions', () => {
    @Singleton()
    class Service {
      readonly id = Math.random();
    }

    const a = container.resolve(Service);
    const b = container.resolve(Service);
    expect(a).toBe(b);
    expect(a.id).toBe(b.id);
  });
});
