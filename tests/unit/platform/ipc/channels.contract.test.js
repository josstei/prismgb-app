import { describe, it, expect } from 'vitest';
import { IPC_CHANNELS as channelsJson } from '@platform/ipc';

function flattenChannelValues(node) {
  const values = [];
  for (const value of Object.values(node)) {
    if (typeof value === 'string') {
      values.push(value);
    } else if (value && typeof value === 'object') {
      values.push(...flattenChannelValues(value));
    }
  }
  return values;
}

describe('IPC channel contracts', () => {
  it('uses unique channel keys across all namespaces', () => {
    const values = flattenChannelValues(channelsJson);
    expect(new Set(values).size).toBe(values.length);
  });

  it('enforces channel naming format', () => {
    const values = flattenChannelValues(channelsJson);
    for (const channel of values) {
      expect(channel).toMatch(/^[a-z][a-z-]*:[a-z-]+$/);
    }
  });
});
