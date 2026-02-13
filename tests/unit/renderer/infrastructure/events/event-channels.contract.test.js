import { describe, expect, it } from 'vitest';
import { EventChannels } from '@renderer/common/config/event-channels';

function flattenEventValues(node) {
  const values = [];
  for (const value of Object.values(node)) {
    if (typeof value === 'string') {
      values.push(value);
      continue;
    }

    if (value && typeof value === 'object') {
      values.push(...flattenEventValues(value));
    }
  }

  return values;
}

describe('Renderer event channel contract', () => {
  it('defines the full notes event channel set', () => {
    expect(EventChannels.NOTES).toEqual({
      NOTE_CREATED: 'notes:note-created',
      NOTE_UPDATED: 'notes:note-updated',
      NOTE_DELETED: 'notes:note-deleted'
    });
  });

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
});
