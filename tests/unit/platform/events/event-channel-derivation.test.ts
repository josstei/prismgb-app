/**
 * Type-math coverage for the generic manifest-scope -> channel-map derivation
 * mechanism (mapped/template-literal types, Extract-based scope narrowing).
 */
import { describe, it, expect, expectTypeOf } from 'vitest';
import { deriveEventChannelMap, type EventChannelMap } from '../../../../src/platform/events/event-channel-derivation.js';

const sampleEvents = [
  { domain: 'device', name: 'status-changed', value: 'device:status-changed' },
  { domain: 'device', name: 'supported-device-available', value: 'device:supported-device-available' },
  { domain: 'ui', name: 'record-button-pop', value: 'ui:record-button-pop' }
] as const;

type SampleEvent = (typeof sampleEvents)[number];
type SampleChannelMap = EventChannelMap<SampleEvent>;

describe('deriveEventChannelMap', () => {
  it('groups events by SCREAMING_SNAKE domain and name, preserving literal channel values', () => {
    const channels = deriveEventChannelMap(sampleEvents);

    expect(channels).toEqual({
      DEVICE: {
        STATUS_CHANGED: 'device:status-changed',
        SUPPORTED_DEVICE_AVAILABLE: 'device:supported-device-available'
      },
      UI: {
        RECORD_BUTTON_POP: 'ui:record-button-pop'
      }
    });

    expectTypeOf<SampleChannelMap['DEVICE']['STATUS_CHANGED']>().toEqualTypeOf<'device:status-changed'>();
    expectTypeOf<SampleChannelMap['DEVICE']['SUPPORTED_DEVICE_AVAILABLE']>().toEqualTypeOf<'device:supported-device-available'>();
    expectTypeOf<SampleChannelMap['UI']['RECORD_BUTTON_POP']>().toEqualTypeOf<'ui:record-button-pop'>();
  });

  it('rejects manifest events missing the domain/name/value shape at compile time', () => {
    function attemptInvalidShape(): void {
      // @ts-expect-error deriveEventChannelMap requires domain/name/value on every entry
      deriveEventChannelMap([{ domain: 'device' }] as const);
    }

    expect(attemptInvalidShape).toBeTypeOf('function');
  });

  it('keeps derived channel groups readonly, matching the as-const manifest contract', () => {
    const channels = deriveEventChannelMap(sampleEvents);

    // @ts-expect-error derived channel leaves are readonly
    channels.DEVICE.STATUS_CHANGED = 'device:mutated';
  });
});
