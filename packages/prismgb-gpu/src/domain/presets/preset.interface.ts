export interface UpscaleConfig {
  enabled: boolean;
}

export interface UnsharpConfig {
  enabled: boolean;
  strength: number;
}

export interface ColorConfig {
  enabled: boolean;
  gamma: number;
  saturation: number;
  greenBias: number;
  brightness: number;
  contrast: number;
}

export interface CRTConfig {
  enabled: boolean;
  scanlineStrength: number;
  pixelMaskStrength: number;
  bloomStrength: number;
  curvature: number;
  vignetteStrength: number;
}

export interface IPreset {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly upscale: UpscaleConfig;
  readonly unsharp: UnsharpConfig;
  readonly color: ColorConfig;
  readonly crt: CRTConfig;
}
