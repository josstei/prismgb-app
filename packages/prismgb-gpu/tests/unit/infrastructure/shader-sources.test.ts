import { describe, expect, it } from 'vitest';
import { RenderPassManifest } from '@/domain/render-passes';
import { loadWebGL2Shaders, loadWebGPUShaders } from '@/infrastructure/shader-sources';

describe('shader sources', () => {
  it('composes each WebGPU fragment source with the shared fullscreen vertex prelude', () => {
    const shaders = loadWebGPUShaders().byFileName;

    for (const pass of RenderPassManifest.passes) {
      const source = shaders[pass.webgpuShader];

      expect(source).toBeTruthy();
      expect(source.match(/struct VertexOutput/g)).toHaveLength(1);
      expect(source.match(/fn vertexMain/g)).toHaveLength(1);
      expect(source).toContain('fn fragmentMain(input: VertexOutput)');
    }
  });

  it('keeps WebGL2 shader sources backend-local and includes utility shaders', () => {
    const shaders = loadWebGL2Shaders().byFileName;

    expect(Object.keys(shaders).sort()).toEqual([
      'color-elevation.frag.glsl',
      'common.vert.glsl',
      'crt-lcd.frag.glsl',
      'pixel-upscale.frag.glsl',
      'unsharp-mask.frag.glsl'
    ]);
  });
});
