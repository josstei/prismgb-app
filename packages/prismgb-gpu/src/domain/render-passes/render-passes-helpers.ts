import { RenderPassContract } from './render-passes.contract';

type UniformSetterMethod = 'setUniform1i' | 'setUniform1f' | 'setUniform2f';

export interface WebGPUUniformMember {
  name: string;
  type: string;
  offsetBytes: number;
  byteLength: number;
}

export interface WebGPUUniformLayout {
  passId: string;
  uniformBlock: string;
  byteLength: number;
  members: readonly WebGPUUniformMember[];
}

export interface WebGLUniformBinding {
  name: string;
  method: UniformSetterMethod;
}

type WebGLTextureUniformBinding = Omit<WebGLUniformBinding, 'method'> & {
  method: 'setUniform1i';
};

export interface RenderPassHelpers {
  passId: string;
  order: number;
  alwaysEnabled?: boolean;
  enabledWhen?: string;
  webgpu: WebGPUUniformLayout;
  webgl: {
    samplerUniform: WebGLTextureUniformBinding;
    inputUniform: WebGLTextureUniformBinding;
    additionalUniforms: readonly WebGLUniformBinding[];
  };
}

const WEBGPU_UNIFORM_LAYOUTS: Record<string, WebGPUUniformLayout> = {
  upscale: {
    passId: 'pixel-upscale',
    uniformBlock: 'upscale',
    byteLength: 32,
    members: [
      { name: 'inputSize', type: 'vec2<f32>', offsetBytes: 0, byteLength: 8 },
      { name: 'outputSize', type: 'vec2<f32>', offsetBytes: 8, byteLength: 8 },
      { name: 'scaleFactor', type: 'f32', offsetBytes: 16, byteLength: 4 },
      { name: '_padding', type: 'f32', offsetBytes: 20, byteLength: 12 }
    ]
  },
  unsharp: {
    passId: 'unsharp-mask',
    uniformBlock: 'unsharp',
    byteLength: 16,
    members: [
      { name: 'texelSize', type: 'vec2<f32>', offsetBytes: 0, byteLength: 8 },
      { name: 'strength', type: 'f32', offsetBytes: 8, byteLength: 4 },
      { name: 'scaleFactor', type: 'f32', offsetBytes: 12, byteLength: 4 }
    ]
  },
  color: {
    passId: 'color-elevation',
    uniformBlock: 'color',
    byteLength: 32,
    members: [
      { name: 'gamma', type: 'f32', offsetBytes: 0, byteLength: 4 },
      { name: 'saturation', type: 'f32', offsetBytes: 4, byteLength: 4 },
      { name: 'greenBias', type: 'f32', offsetBytes: 8, byteLength: 4 },
      { name: 'brightness', type: 'f32', offsetBytes: 12, byteLength: 4 },
      { name: 'contrast', type: 'f32', offsetBytes: 16, byteLength: 4 },
      { name: '_padding1', type: 'f32', offsetBytes: 20, byteLength: 4 },
      { name: '_padding2', type: 'f32', offsetBytes: 24, byteLength: 4 },
      { name: '_padding3', type: 'f32', offsetBytes: 28, byteLength: 4 }
    ]
  },
  crt: {
    passId: 'crt-lcd',
    uniformBlock: 'crt',
    byteLength: 32,
    members: [
      { name: 'resolution', type: 'vec2<f32>', offsetBytes: 0, byteLength: 8 },
      { name: 'scaleFactor', type: 'f32', offsetBytes: 8, byteLength: 4 },
      { name: 'scanlineStrength', type: 'f32', offsetBytes: 12, byteLength: 4 },
      { name: 'pixelMaskStrength', type: 'f32', offsetBytes: 16, byteLength: 4 },
      { name: 'bloomStrength', type: 'f32', offsetBytes: 20, byteLength: 4 },
      { name: 'curvature', type: 'f32', offsetBytes: 24, byteLength: 4 },
      { name: 'vignetteStrength', type: 'f32', offsetBytes: 28, byteLength: 4 }
    ]
  }
};

const WEBGL_UNIFORM_BINDINGS: Record<
  string,
  {
    samplerUniform: WebGLTextureUniformBinding;
    inputUniform: WebGLTextureUniformBinding;
    additionalUniforms: readonly WebGLUniformBinding[];
  }
> = {
  upscale: {
    samplerUniform: { name: 'uSourceTex', method: 'setUniform1i' },
    inputUniform: { name: 'uSourceTex', method: 'setUniform1i' },
    additionalUniforms: [
      { name: 'uSourceSize', method: 'setUniform2f' },
      { name: 'uTargetSize', method: 'setUniform2f' },
      { name: 'uScaleFactor', method: 'setUniform1f' }
    ]
  },
  unsharp: {
    samplerUniform: { name: 'uInputTex', method: 'setUniform1i' },
    inputUniform: { name: 'uInputTex', method: 'setUniform1i' },
    additionalUniforms: [
      { name: 'uTexelSize', method: 'setUniform2f' },
      { name: 'uStrength', method: 'setUniform1f' },
      { name: 'uScaleFactor', method: 'setUniform1f' }
    ]
  },
  color: {
    samplerUniform: { name: 'uInputTex', method: 'setUniform1i' },
    inputUniform: { name: 'uInputTex', method: 'setUniform1i' },
    additionalUniforms: [
      { name: 'uGamma', method: 'setUniform1f' },
      { name: 'uSaturation', method: 'setUniform1f' },
      { name: 'uGreenBias', method: 'setUniform1f' },
      { name: 'uBrightness', method: 'setUniform1f' },
      { name: 'uContrast', method: 'setUniform1f' }
    ]
  },
  crt: {
    samplerUniform: { name: 'uInputTex', method: 'setUniform1i' },
    inputUniform: { name: 'uInputTex', method: 'setUniform1i' },
    additionalUniforms: [
      { name: 'uResolution', method: 'setUniform2f' },
      { name: 'uScaleFactor', method: 'setUniform1f' },
      { name: 'uScanlineStrength', method: 'setUniform1f' },
      { name: 'uPixelMaskStrength', method: 'setUniform1f' },
      { name: 'uBloomStrength', method: 'setUniform1f' },
      { name: 'uCurvature', method: 'setUniform1f' },
      { name: 'uVignetteStrength', method: 'setUniform1f' }
    ]
  }
};

export const RENDER_PASS_HELPERS: readonly RenderPassHelpers[] = RenderPassContract.passes.map(pass => {
  const layout = WEBGPU_UNIFORM_LAYOUTS[pass.uniformBlock];
  const webgl = WEBGL_UNIFORM_BINDINGS[pass.uniformBlock];

  if (!layout || !webgl) {
    throw new Error(`Missing helper definitions for pass '${pass.id}'`);
  }

  return {
    passId: pass.id,
    order: pass.order,
    alwaysEnabled: pass.alwaysEnabled,
    enabledWhen: pass.enabledWhen,
    webgpu: {
      ...layout,
      passId: pass.id
    },
    webgl
  };
});
