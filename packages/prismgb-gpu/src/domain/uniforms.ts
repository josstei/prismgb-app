export interface UpscaleUniforms {
  inputSize: [number, number];
  outputSize: [number, number];
  scaleFactor: number;
}

export interface UnsharpUniforms {
  enabled: boolean;
  texelSize: [number, number];
  strength: number;
  scaleFactor: number;
}

export interface ColorUniforms {
  enabled: boolean;
  gamma: number;
  saturation: number;
  greenBias: number;
  brightness: number;
  contrast: number;
}

export interface CRTUniforms {
  enabled: boolean;
  resolution: [number, number];
  scaleFactor: number;
  scanlineStrength: number;
  pixelMaskStrength: number;
  bloomStrength: number;
  curvature: number;
  vignetteStrength: number;
}

export interface PipelineUniforms {
  upscale: UpscaleUniforms;
  unsharp: UnsharpUniforms;
  color: ColorUniforms;
  crt: CRTUniforms;
}
