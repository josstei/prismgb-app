import { describe, expect, it } from 'vitest';
import { RenderPassManifest, RENDER_PASS_DEFINITIONS } from '@/domain/render-passes';
import { loadWebGpuShaders } from '@/infrastructure/shaders';

describe('render-pass manifest', () => {
  it('marks the render-pass manifest as enforced runtime ownership', () => {
    expect(RenderPassManifest.mode).toBe('enforced');

    for (const pass of RenderPassManifest.passes) {
      expect(pass.enabledWhen).toEqual(expect.objectContaining({ kind: expect.any(String) }));
      expect(typeof pass.enabledWhen).not.toBe('string');
    }
  });

  it('orders definitions by manifest pass order', () => {
    const contractOrder = [...RenderPassManifest.passes].sort((left, right) => left.order - right.order);

    expect(RENDER_PASS_DEFINITIONS).toHaveLength(RenderPassManifest.passes.length);
    expect(RENDER_PASS_DEFINITIONS.map((pass) => pass.id)).toEqual(contractOrder.map((pass) => pass.id));
  });

  it('keeps shader file routing aligned with backend shader loaders', () => {
    const webgpuShaders = Object.keys(loadWebGpuShaders().byFileName).sort();
    const passBasedWebGPUFiles = RenderPassManifest.passes.map((pass) => pass.webgpuShader).sort();

    expect(webgpuShaders).toEqual(passBasedWebGPUFiles);
  });
});
