import { describe, it, expect } from 'vitest';
import { manualProviders } from '@renderer/application/di/manual-providers';

describe('manualProviders registry', () => {
  it('exposes exactly the nine non-standard-construction tokens', () => {
    expect(Object.keys(manualProviders).sort()).toEqual(
      [
        'adapterFactory',
        'canvasRenderLoopService',
        'deviceChangeDebounceAdapter',
        'deviceIpcAdapter',
        'deviceStatusProvider',
        'ipcClient',
        'storageService',
        'streamingRendererFactory',
        'uiComponentRegistry'
      ].sort()
    );
  });

  it('does NOT contain the promoted standard-construction tokens', () => {
    expect(manualProviders.gpuFrameBuffer).toBeUndefined();
    expect(manualProviders.animationCache).toBeUndefined();
  });

  it('every entry is a factory function taking a resolver', () => {
    for (const provider of Object.values(manualProviders)) {
      expect(typeof provider).toBe('function');
    }
  });
});
