import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { Rpc } from '../../../src/decorators/rpc';
import { getRpcMetadata } from '../../../src/metadata/rpc-metadata';

describe('@Rpc decorator', () => {
  it('marks a method as an RPC endpoint', () => {
    class Service {
      @Rpc()
      async listItems(): Promise<string[]> {
        return [];
      }
    }
    const meta = getRpcMetadata(Service);
    expect(meta).toHaveLength(1);
    expect(meta[0].methodName).toBe('listItems');
    expect(meta[0].schema).toBeUndefined();
    expect(meta[0].name).toBeUndefined();
  });

  it('accepts optional schema and name', () => {
    const schema = z.object({ id: z.string() });
    class Service {
      @Rpc({ schema, name: 'getItemById' })
      async getItem(input: { id: string }): Promise<string> {
        return input.id;
      }
    }
    const meta = getRpcMetadata(Service);
    expect(meta).toHaveLength(1);
    expect(meta[0].methodName).toBe('getItem');
    expect(meta[0].schema).toBe(schema);
    expect(meta[0].name).toBe('getItemById');
  });

  it('collects multiple @Rpc methods on same class', () => {
    class Service {
      @Rpc()
      async one() { return 1; }
      @Rpc()
      async two() { return 2; }
    }
    const meta = getRpcMetadata(Service);
    expect(meta.map(m => m.methodName).sort()).toEqual(['one', 'two']);
  });

  it('returns empty array for class without @Rpc methods', () => {
    class Plain {}
    expect(getRpcMetadata(Plain)).toEqual([]);
  });
});
