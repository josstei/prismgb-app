import { describe, expect, it } from 'vitest';
import {
  isDimensions,
  isStreamingCapabilities
} from '@renderer/infrastructure/services/streaming/streaming.contract';

describe('streaming contracts', () => {
  it('guards dimension shapes', () => {
    expect(isDimensions({ width: 160, height: 144 } as unknown)).toBe(true);
    expect(isDimensions({ width: 160 } as unknown)).toBe(false);
    expect(isDimensions(null)).toBe(false);
  });

  it('guards capability shapes read from untyped state', () => {
    expect(isStreamingCapabilities({ nativeResolution: { width: 160, height: 144 } } as unknown)).toBe(true);
    expect(isStreamingCapabilities({} as unknown)).toBe(true);
    expect(isStreamingCapabilities({ nativeResolution: { width: 160 } } as unknown)).toBe(false);
    expect(isStreamingCapabilities(null)).toBe(false);
  });
});
