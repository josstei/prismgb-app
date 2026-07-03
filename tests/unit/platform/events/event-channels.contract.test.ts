import { describe, expect, expectTypeOf, it } from 'vitest';
import { EventChannels } from '@platform/events';
import type { MainEventChannel } from '@platform/events';

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

describe('Event channel contract', () => {
  it('keeps all event channels unique', () => {
    const values = flattenEventValues(EventChannels);
    expect(new Set(values).size).toBe(values.length);
  });

  it('enforces event naming format', () => {
    const values = flattenEventValues(EventChannels);
    for (const eventName of values) {
      expect(eventName).toMatch(/^[a-z]+:[a-z0-9-]+$/);
    }
  });

  it('defines the full notes event channel set', () => {
    expect(EventChannels.NOTES).toEqual({
      NOTE_CREATED: 'notes:note-created',
      NOTE_UPDATED: 'notes:note-updated',
      NOTE_DELETED: 'notes:note-deleted'
    });
  });

  it('keeps main event channel type narrowed to manifest values', () => {
    expectTypeOf<MainEventChannel>().toEqualTypeOf<
      'device:connection-changed' | 'device:check-error' | 'update:state-changed'
    >();
  });
});
