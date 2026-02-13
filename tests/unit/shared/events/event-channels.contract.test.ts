import { describe, expect, it } from 'vitest';
import { EventChannels as SharedEventChannels } from '@renderer/common/config/event-channels';
import { EventChannels as CompatibilityEventChannels } from '@renderer/common/config/event-channels';

function flattenEventValues(node: unknown): string[] {
  const values: string[] = [];

  if (!node || typeof node !== 'object') {
    return values;
  }

  for (const value of Object.values(node)) {
    if (typeof value === 'string') {
      values.push(value);
      continue;
    }

    values.push(...flattenEventValues(value));
  }

  return values;
}

describe('Shared event channel contract', () => {
  it('keeps shared and compatibility exports aligned', () => {
    expect(CompatibilityEventChannels).toEqual(SharedEventChannels);
  });

  it('keeps all event channels unique', () => {
    const values = flattenEventValues(SharedEventChannels);
    expect(new Set(values).size).toBe(values.length);
  });

  it('enforces event naming format', () => {
    const values = flattenEventValues(SharedEventChannels);
    for (const eventName of values) {
      expect(eventName).toMatch(/^[a-z]+:[a-z0-9-]+$/);
    }
  });
});
