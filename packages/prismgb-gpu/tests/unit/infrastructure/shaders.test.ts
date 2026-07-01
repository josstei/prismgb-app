import { describe, expect, it } from 'vitest';
import { RenderPassManifest } from '@/domain/render-passes';
import { loadWebGpuShaders } from '@/infrastructure/shaders';

describe('shaders', () => {
  it('composes each WebGPU fragment source with the shared fullscreen vertex prelude', () => {
    const shaders = loadWebGpuShaders().byFileName;

    for (const pass of RenderPassManifest.passes) {
      const source = shaders[pass.webgpuShader];

      expect(source).toBeTruthy();
      expect(source.match(/struct VertexOutput/g)).toHaveLength(1);
      expect(source.match(/fn vertexMain/g)).toHaveLength(1);
      expect(source).toContain('fn fragmentMain(input: VertexOutput)');
    }
  });
});
