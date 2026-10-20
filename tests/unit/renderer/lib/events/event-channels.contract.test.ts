import { describe, expect, it } from 'vitest';
import { EventChannels } from '@renderer/lib/events/event-channels';

const channelValues = Object.values(EventChannels).flatMap((domain) => Object.values(domain));

describe('Event channel contract', () => {
  it('keeps all event channels unique', () => {
    expect(new Set(channelValues).size).toBe(channelValues.length);
  });

  it('enforces event naming format', () => {
    for (const eventName of channelValues) {
      expect(eventName).toMatch(/^[a-z]+:[a-z0-9-]+$/);
    }
  });
});
