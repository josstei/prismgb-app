import { describe, expect, it } from 'vitest';
import { EventChannels } from '@shared/events/event-channels.ts';
import { EVENT_PAYLOAD_CHANNELS } from '@shared/events/event-payloads.ts';
import eventManifest from '@shared/events/event.manifest.json';

function collectLeafChannels(value) {
  if (typeof value === 'string') {
    return [value];
  }

  return Object.values(value).flatMap((entry) => collectLeafChannels(entry));
}

describe('event payload contracts', () => {
  it('tracks every EventChannels leaf at runtime', () => {
    expect(new Set(EVENT_PAYLOAD_CHANNELS)).toEqual(new Set(collectLeafChannels(EventChannels)));
  });

  it('derives renderer payload channels from event manifest', () => {
    const rendererManifestChannels = eventManifest.scopes
      .find((scope) => scope.scope === 'renderer')
      .events
      .map((entry) => entry.value);

    expect(EVENT_PAYLOAD_CHANNELS).toEqual(rendererManifestChannels);
  });
});
