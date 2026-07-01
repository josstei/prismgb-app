import { describe, expect, it } from 'vitest';
import { getEnabledRenderPasses } from '@/application/render-pass-enablement';
import { buildUniforms } from '@/application/uniform-builder';
import { getPreset } from '@/application/preset-catalog';
import { WEBGPU_RENDER_PASSES } from '@/infrastructure/webgpu.uniforms';

describe('render-pass enablement', () => {
  it('resolves enabled passes from representative presets', () => {
    const cases: Array<{ presetId: string; expectedPassIds: string[] }> = [
      { presetId: 'performance', expectedPassIds: ['pixel-upscale'] },
      { presetId: 'vibrant', expectedPassIds: ['pixel-upscale', 'unsharp-mask', 'color-elevation'] },
      { presetId: 'pixel', expectedPassIds: ['pixel-upscale', 'color-elevation', 'crt-lcd'] },
      { presetId: 'vintage', expectedPassIds: ['pixel-upscale', 'color-elevation', 'crt-lcd'] },
      { presetId: 'hi-def', expectedPassIds: ['pixel-upscale', 'unsharp-mask', 'color-elevation'] }
    ];

    for (const { presetId, expectedPassIds } of cases) {
      const preset = getPreset(presetId)!;
      const uniforms = buildUniforms({
        preset,
        nativeWidth: 160,
        nativeHeight: 144,
        outputWidth: 640,
        outputHeight: 576,
        brightness: 1
      });

      expect(getEnabledRenderPasses(WEBGPU_RENDER_PASSES, uniforms, preset).map((pass) => pass.passId)).toEqual(expectedPassIds);
    }
  });
});
