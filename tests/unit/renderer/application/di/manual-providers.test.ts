import { describe, it, expect } from 'vitest';
import { manualProviders } from '@renderer/application/di/manual-providers';

describe('manualProviders registry', () => {
  it('exposes exactly the seven non-standard-construction tokens', () => {
    expect(Object.keys(manualProviders).sort()).toEqual(
      [
        'canvasRenderLoopService',
        'devicePreferenceStore',
        'deviceStatusPort',
        'mediaDevicesPort',
        'storageService',
        'streamingRendererFactory',
        'uiComponentRegistry'
      ].sort()
    );
  });

  it('does NOT contain promoted standard-construction tokens', () => {
    expect(manualProviders.animationCache).toBeUndefined();
  });

  it('every entry is a factory function taking a resolver', () => {
    for (const provider of Object.values(manualProviders)) {
      expect(typeof provider).toBe('function');
    }
  });
});
