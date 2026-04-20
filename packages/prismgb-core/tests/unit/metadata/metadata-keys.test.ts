import { describe, it, expect } from 'vitest';
import { METADATA_KEYS } from '../../../src/metadata/metadata-keys';

describe('METADATA_KEYS', () => {
  it('exposes all required keys as unique symbols', () => {
    const keys = METADATA_KEYS;
    expect(typeof keys.SERVICE).toBe('symbol');
    expect(typeof keys.MODULE).toBe('symbol');
    expect(typeof keys.RPC_METHODS).toBe('symbol');
    expect(typeof keys.WORKER_METHODS).toBe('symbol');
    expect(typeof keys.SUBSCRIBE_HANDLERS).toBe('symbol');
    expect(typeof keys.PUSH_PROPERTIES).toBe('symbol');
    expect(typeof keys.ON_INIT).toBe('symbol');
    expect(typeof keys.ON_DESTROY).toBe('symbol');
  });

  it('all keys are distinct', () => {
    const values = Object.values(METADATA_KEYS);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  it('symbol descriptions are namespaced to @prismgb/core', () => {
    expect(METADATA_KEYS.SERVICE.description).toBe('prismgb:service');
    expect(METADATA_KEYS.MODULE.description).toBe('prismgb:module');
    expect(METADATA_KEYS.RPC_METHODS.description).toBe('prismgb:rpc-methods');
  });
});
