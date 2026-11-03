import type { PipelineUniforms } from './uniforms';

type UniformField = {
  readonly name: string;
} & (
  | { readonly type: 'f32'; readonly read: (uniforms: PipelineUniforms) => number }
  | { readonly type: 'vec2<f32>'; readonly read: (uniforms: PipelineUniforms) => readonly [number, number] }
);

type WebGpuUniformMember = UniformField & { readonly offsetBytes: number };

export type WebGpuUniformLayout = {
  readonly byteLength: number;
  readonly members: readonly WebGpuUniformMember[];
  readonly wgsl: string;
};

export type RenderPassDefinition = {
  readonly id: string;
  readonly isEnabled: (uniforms: PipelineUniforms) => boolean;
  readonly webgpuShader: string;
  readonly uniforms: WebGpuUniformLayout;
  readonly sampler: 'nearest' | 'linear';
};

/** The existing shaders use only scalars and vec2s, whose size equals alignment. */
function uniformLayout(structName: string, fields: readonly UniformField[]): WebGpuUniformLayout {
  let offset = 0;
  let alignment = 4;
  const members = fields.map((field) => {
    const size = field.type === 'f32' ? 4 : 8;
    alignment = Math.max(alignment, size);
    offset = Math.ceil(offset / size) * size;
    const member = { ...field, offsetBytes: offset };
    offset += size;
    return member;
  });

  return {
    byteLength: Math.ceil(offset / alignment) * alignment,
    members,
    wgsl: `struct ${structName} {\n${fields.map((field) => `  ${field.name}: ${field.type},`).join('\n')}\n}`
  };
}

/** Ordered pass definitions own both shader structs and CPU packing. */
export const PASS_SPECS: readonly RenderPassDefinition[] = [
  {
    id: 'pixel-upscale',
    isEnabled: () => true,
    webgpuShader: 'pixel-upscale.wgsl',
    uniforms: uniformLayout('UpscaleUniforms', [
      { name: 'sourceSize', type: 'vec2<f32>', read: (u) => u.upscale.inputSize },
      { name: 'targetSize', type: 'vec2<f32>', read: (u) => u.upscale.outputSize },
      { name: 'scaleFactor', type: 'f32', read: (u) => u.upscale.scaleFactor },
      { name: '_padding', type: 'f32', read: () => 0 }
    ]),
    sampler: 'nearest'
  },
  {
    id: 'unsharp-mask',
    isEnabled: (u) => u.unsharp.enabled && u.unsharp.strength > 0,
    webgpuShader: 'unsharp-mask.wgsl',
    uniforms: uniformLayout('UnsharpUniforms', [
      { name: 'texelSize', type: 'vec2<f32>', read: (u) => u.unsharp.texelSize },
      { name: 'strength', type: 'f32', read: (u) => u.unsharp.strength },
      { name: 'scaleFactor', type: 'f32', read: (u) => u.unsharp.scaleFactor }
    ]),
    sampler: 'linear'
  },
  {
    id: 'color-elevation',
    isEnabled: (u) => u.color.enabled,
    webgpuShader: 'color-elevation.wgsl',
    uniforms: uniformLayout('ColorUniforms', [
      { name: 'gamma', type: 'f32', read: (u) => u.color.gamma },
      { name: 'saturation', type: 'f32', read: (u) => u.color.saturation },
      { name: 'greenBias', type: 'f32', read: (u) => u.color.greenBias },
      { name: 'brightness', type: 'f32', read: (u) => u.color.brightness },
      { name: 'contrast', type: 'f32', read: (u) => u.color.contrast },
      { name: '_padding1', type: 'f32', read: () => 0 },
      { name: '_padding2', type: 'f32', read: () => 0 },
      { name: '_padding3', type: 'f32', read: () => 0 }
    ]),
    sampler: 'linear'
  },
  {
    id: 'crt-lcd',
    isEnabled: (u) => u.crt.scanlineStrength > 0 || u.crt.pixelMaskStrength > 0
      || u.crt.bloomStrength > 0 || u.crt.curvature > 0 || u.crt.vignetteStrength > 0,
    webgpuShader: 'crt-lcd.wgsl',
    uniforms: uniformLayout('CRTUniforms', [
      { name: 'resolution', type: 'vec2<f32>', read: (u) => u.crt.resolution },
      { name: 'scaleFactor', type: 'f32', read: (u) => u.crt.scaleFactor },
      { name: 'scanlineStrength', type: 'f32', read: (u) => u.crt.scanlineStrength },
      { name: 'pixelMaskStrength', type: 'f32', read: (u) => u.crt.pixelMaskStrength },
      { name: 'bloomStrength', type: 'f32', read: (u) => u.crt.bloomStrength },
      { name: 'curvature', type: 'f32', read: (u) => u.crt.curvature },
      { name: 'vignetteStrength', type: 'f32', read: (u) => u.crt.vignetteStrength }
    ]),
    sampler: 'linear'
  }
];
