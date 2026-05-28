import { describe, expect, it } from 'vitest';
import { EventChannels, EVENT_PAYLOAD_CHANNELS, getEventManifestScopeValues } from '@prismgb/events';

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
    const rendererManifestChannels = getEventManifestScopeValues('renderer');

    expect(EVENT_PAYLOAD_CHANNELS).toEqual(rendererManifestChannels);
  });
});
