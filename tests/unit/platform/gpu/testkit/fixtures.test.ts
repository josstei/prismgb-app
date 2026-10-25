import { describe, expect, it } from 'vitest';
import {
  createPipelineUniformsFixture,
  createRenderCapabilitiesFixture,
  createRenderPresetFixture
} from '@platform/gpu/testkit';

describe('platform/gpu/testkit/fixtures', () => {
  it('creates overridable domain fixtures from final GPU types', () => {
    expect(createRenderCapabilitiesFixture({ preferredBackend: 'webgpu', webgpu: true })).toEqual(
      expect.objectContaining({
        preferredBackend: 'webgpu',
        webgpu: true
      })
    );
    expect(createRenderPresetFixture({ color: { enabled: false } }).color.enabled).toBe(false);
    expect(createPipelineUniformsFixture({ upscale: { scaleFactor: 2 } }).upscale).toEqual({
      inputSize: [160, 144],
      outputSize: [640, 576],
      scaleFactor: 2
    });
  });

});
