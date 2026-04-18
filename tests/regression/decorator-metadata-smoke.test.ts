import 'reflect-metadata';
import { describe, it, expect } from 'vitest';

class FakeDep {}

function injectable(): ClassDecorator {
  return () => {};
}

@injectable()
class Consumer {
  constructor(public readonly dep: FakeDep) {}
}

describe('decorator metadata emission', () => {
  it('emits design:paramtypes metadata for decorated classes', () => {
    const paramTypes = Reflect.getMetadata('design:paramtypes', Consumer);
    expect(paramTypes).toBeDefined();
    expect(Array.isArray(paramTypes)).toBe(true);
    expect(paramTypes).toHaveLength(1);
    expect(paramTypes[0]).toBe(FakeDep);
  });
});
