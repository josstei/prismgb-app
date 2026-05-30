import { describe, expect, it } from 'vitest';
import { TypedRegistryFactory } from '@shared/registry/typed-registry.factory';
import type { RegistryEntry } from '@shared/registry/typed-registry.factory';

describe('TypedRegistryFactory', () => {
  it('registers a factory and creates values with args', () => {
    const registry = new TypedRegistryFactory<string, { kind: string }, [string]>();
    registry.register('greet', (name) => `hi ${name}`, { kind: 'fn' });
    expect(registry.create('greet', 'ada')).toBe('hi ada');
    expect(registry.getMetadata('greet')).toEqual({ kind: 'fn' });
  });

  it('throws when registering without an id', () => {
    const registry = new TypedRegistryFactory<string>();
    expect(() => registry.register('', () => 'x', {})).toThrow('Registry entry id is required');
  });

  it('registers a constant value via registerValue', () => {
    const registry = new TypedRegistryFactory<number>();
    registry.registerValue('answer', 42, {});
    expect(registry.create('answer')).toBe(42);
  });

  it('registers many entries at once', () => {
    const registry = new TypedRegistryFactory<string, Record<string, unknown>, []>();
    const entries: RegistryEntry<string, Record<string, unknown>, []>[] = [
      { id: 'a', factory: () => 'A', metadata: {} },
      { id: 'b', factory: () => 'B', metadata: {} }
    ];
    registry.registerMany(entries);
    expect(registry.listIds()).toEqual(['a', 'b']);
    expect(registry.create('a')).toBe('A');
  });

  it('throws when creating an unknown id', () => {
    const registry = new TypedRegistryFactory<string>();
    expect(() => registry.create('missing')).toThrow('No registry entry found for id: missing');
  });

  it('reports membership and undefined metadata for absent ids', () => {
    const registry = new TypedRegistryFactory<string>();
    registry.registerValue('present', 'v', {});
    expect(registry.has('present')).toBe(true);
    expect(registry.has('absent')).toBe(false);
    expect(registry.getMetadata('absent')).toBeUndefined();
  });

  it('unregisters known ids and returns false for unknown ids', () => {
    const registry = new TypedRegistryFactory<string>();
    registry.registerValue('temp', 'v', {});
    expect(registry.unregister('temp')).toBe(true);
    expect(registry.has('temp')).toBe(false);
    expect(registry.unregister('never-registered')).toBe(false);
  });

  it('clears all entries', () => {
    const registry = new TypedRegistryFactory<string>();
    registry.registerValue('one', '1', {});
    registry.registerValue('two', '2', {});
    registry.clear();
    expect(registry.listIds()).toEqual([]);
    expect(registry.has('one')).toBe(false);
  });
});
