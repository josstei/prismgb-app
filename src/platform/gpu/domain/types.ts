export type RenderBackend = 'webgpu' | 'canvas2d';

export interface UnsharpConfig {
  readonly enabled: boolean;
  readonly strength: number;
}

export interface ColorConfig {
  readonly enabled: boolean;
  readonly gamma: number;
  readonly saturation: number;
  readonly greenBias: number;
  readonly brightness: number;
  readonly contrast: number;
}

export interface CRTConfig {
  readonly enabled: boolean;
  readonly scanlineStrength: number;
  readonly pixelMaskStrength: number;
  readonly bloomStrength: number;
  readonly curvature: number;
  readonly vignetteStrength: number;
}

export interface RenderPreset {
  readonly id: string;
  readonly name: string;
  readonly unsharp: UnsharpConfig;
  readonly color: ColorConfig;
  readonly crt: CRTConfig;
}

export interface WebGPULimits {
  maxTextureDimension2D: number;
  maxBindGroups: number;
}

export interface RenderCapabilities {
  webgpu: boolean;
  offscreenCanvas: boolean;
  transferControlToOffscreen: boolean;
  preferredBackend: RenderBackend;
  maxTextureSize: number;
  webgpuLimits?: WebGPULimits;
}
