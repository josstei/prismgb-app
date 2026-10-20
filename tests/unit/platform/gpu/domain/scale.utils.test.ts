import { describe, expect, it } from 'vitest';
import { calculateScaleFactor } from '../../../../../src/platform/gpu/domain/scale.utils';

describe('calculateScaleFactor', () => {
  it.each([
    { output: [640, 576], expected: 4 },
    { output: [480, 432], expected: 3 },
    { output: [320, 288], expected: 2 },
    { output: [800, 432], expected: 3 },
    { output: [100, 100], expected: 1 },
    { output: [0, 0], expected: 1 }
  ])('scales 160x144 into $output by $expected', ({ output, expected }) => {
    expect(calculateScaleFactor(160, 144, output[0], output[1])).toBe(expected);
  });
});
