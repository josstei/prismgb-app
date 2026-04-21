import { describe, it, expect } from 'vitest';
import type { PrismgbModule, ModuleSurface } from '../../../src/manifest/prismgb-module';

describe('PrismgbModule type', () => {
  it('accepts a minimal valid manifest', () => {
    const manifest: PrismgbModule = {
      name: '@prismgb/gpu',
      version: '1.0.0',
      surfaces: ['shared', 'renderer']
    };
    expect(manifest.name).toBe('@prismgb/gpu');
    expect(manifest.surfaces).toContain('shared');
  });

  it('accepts a full manifest with all surfaces', () => {
    const manifest: PrismgbModule = {
      name: '@prismgb/devices',
      version: '1.0.0',
      surfaces: ['shared', 'main', 'renderer', 'worker'],
      main: async () => ({ default: class {} as never }),
      renderer: async () => ({ default: class {} as never }),
      worker: async () => ({ default: class {} as never }),
      events: { contract: './shared/contracts/events.contract' },
      rpc: { contract: './shared/contracts/rpc.contract' }
    };
    expect(manifest.surfaces).toHaveLength(4);
  });

  it('surface values are the canonical set', () => {
    const surfaces: ModuleSurface[] = ['shared', 'main', 'renderer', 'worker'];
    expect(surfaces).toEqual(['shared', 'main', 'renderer', 'worker']);
  });
});
