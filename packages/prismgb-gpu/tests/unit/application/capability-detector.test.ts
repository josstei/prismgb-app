import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectCapabilities } from '@/application/capability-detector';

describe('detectCapabilities', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should return capabilities object with required properties', async () => {
    const capabilities = await detectCapabilities();

    expect(capabilities).toHaveProperty('webgpu');
    expect(capabilities).toHaveProperty('webgl2');
    expect(capabilities).toHaveProperty('offscreenCanvas');
    expect(capabilities).toHaveProperty('transferControlToOffscreen');
    expect(capabilities).toHaveProperty('preferredAPI');
    expect(capabilities).toHaveProperty('maxTextureSize');
  });

  it('should have preferredAPI as one of valid values', async () => {
    const capabilities = await detectCapabilities();

    expect(['webgpu', 'webgl2', 'canvas2d']).toContain(capabilities.preferredAPI);
  });

  it('should have positive maxTextureSize', async () => {
    const capabilities = await detectCapabilities();

    expect(capabilities.maxTextureSize).toBeGreaterThan(0);
  });
});
