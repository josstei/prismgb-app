import { describe, expect, it } from 'vitest';
import { EventChannels, type TypedEventBusLike } from '@platform/events';

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

});

function checkPayloadContracts(bus: TypedEventBusLike): void {
  bus.publish(EventChannels.SETTINGS.VOLUME_CHANGED, 0.5);
  bus.publish(EventChannels.DEVICE.DISCONNECTED, undefined);
  // @ts-expect-error Numeric settings cannot publish a string.
  bus.publish(EventChannels.SETTINGS.VOLUME_CHANGED, '0.5');
  // @ts-expect-error Notes must use the canonical stored note contract.
  bus.publish(EventChannels.NOTES.NOTE_CREATED, { id: 'incomplete' });
  // @ts-expect-error Removed main-process events are not renderer events.
  bus.publish('device:check-error', { error: 'failed' });
}

it('checks event payload contracts during TypeScript validation', () => {
  expect(checkPayloadContracts).toBeTypeOf('function');
});
