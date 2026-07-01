import { describe, expect, it } from 'vitest';
import { RenderPassManifest, RENDER_PASS_DEFINITIONS } from '@/domain/render-passes';
import { loadWebGlShaders, loadWebGpuShaders } from '@/infrastructure/shaders';

function extractWebGLUniformNames(shaderSource: string): string[] {
  const sourceWithoutComments = shaderSource.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...sourceWithoutComments.matchAll(/^\s*uniform\s+\w+\s+(\w+)\s*;/gm)]
    .map((match) => match[1])
    .sort();
}

function contractWebGLBindings(pass: typeof RenderPassManifest.passes[number]) {
  return [
    pass.webgl2Uniforms.texture,
    ...pass.webgl2Uniforms.additional
  ];
}

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
    const webgl2Shaders = Object.keys(loadWebGlShaders().byFileName).sort();
    const passBasedWebGLFiles = [...new Set(
      RenderPassManifest.passes.flatMap((pass) => [pass.webgl2VertexShader, pass.webgl2FragmentShader])
    )].sort();
    const passBasedWebGPUFiles = RenderPassManifest.passes.map((pass) => pass.webgpuShader).sort();
    const utilityShaderFiles = [...new Set(RenderPassManifest.utilityShaders.map((shader) => shader.file))].sort();

    expect(webgpuShaders).toEqual(passBasedWebGPUFiles);
    expect(webgl2Shaders).toEqual([...new Set([...passBasedWebGLFiles, ...utilityShaderFiles])].sort());
  });

  it('keeps manifest WebGL uniform names aligned with GLSL declarations', () => {
    const webgl2Shaders = loadWebGlShaders().byFileName;

    for (const pass of RenderPassManifest.passes) {
      const shaderSource = webgl2Shaders[pass.webgl2FragmentShader];
      expect(shaderSource).toBeTruthy();

      const declaredUniforms = extractWebGLUniformNames(shaderSource);
      const manifestUniforms = contractWebGLBindings(pass).map((binding) => binding.name).sort();

      expect(manifestUniforms).toEqual(declaredUniforms);
    }
  });
});
