export interface UpscaleUniforms {
  inputSize: [number, number];
  outputSize: [number, number];
  scaleFactor: number;
}

export interface UnsharpUniforms {
  strength: number;
  texelSize: [number, number];
}

export interface ColorUniforms {
  gamma: number;
  saturation: number;
  greenBias: number;
  brightness: number;
  contrast: number;
}

export interface CRTUniforms {
  scanlineStrength: number;
  pixelMaskStrength: number;
  bloomStrength: number;
  curvature: number;
  vignetteStrength: number;
  outputSize: [number, number];
}

export interface PipelineUniforms {
  upscale: UpscaleUniforms;
  unsharp: UnsharpUniforms;
  color: ColorUniforms;
  crt: CRTUniforms;
}
