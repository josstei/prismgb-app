import { describe, it, expect } from 'vitest';
import { computeRms, createEaseInCurve } from '@renderer/infrastructure/services/streaming/audio-gain.utils.js';

describe('audio-gain.utils', () => {
  it('computeRms returns 0 for an all-128 (silence) byte buffer', () => {
    const buf = new Uint8Array(64).fill(128);
    expect(computeRms(buf)).toBeCloseTo(0, 5);
  });

  it('createEaseInCurve spans start to end over the requested steps', () => {
    const curve = createEaseInCurve(0, 1, 5);
    expect(curve.length).toBe(5);
    expect(curve[0]).toBeCloseTo(0, 5);
    expect(curve[curve.length - 1]).toBeCloseTo(1, 5);
  });
});
