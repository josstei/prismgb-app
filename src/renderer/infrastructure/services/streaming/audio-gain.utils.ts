export function computeRms(buffer: Uint8Array): number {
  if (!buffer || buffer.length === 0) return 0;

  let sum = 0;
  for (const sample of buffer) {
    const value = (sample - 128) / 128;
    sum += value * value;
  }
  return Math.sqrt(sum / buffer.length);
}

export function createEaseInCurve(startValue: number, endValue: number, steps: number): Float32Array {
  const curve = new Float32Array(steps);
  for (let i = 0; i < steps; i += 1) {
    // Ease-in cubic: t^3 - slow start, accelerates toward end
    const t = i / (steps - 1);
    const eased = t * t * t;
    curve[i] = startValue + (endValue - startValue) * eased;
  }
  return curve;
}
