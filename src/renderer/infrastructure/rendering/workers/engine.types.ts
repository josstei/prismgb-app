export interface RenderConfig {
  nativeWidth: number;
  nativeHeight: number;
  targetWidth: number;
  targetHeight: number;
  scaleFactor: number;
  api?: string;
  presetId?: string;
}

export interface RenderUniforms {
  unsharp: {
    enabled: boolean;
    strength: number;
  };
  color: {
    enabled: boolean;
    gamma: number;
    saturation: number;
    greenBias: number;
    brightness: number;
    contrast: number;
  };
  crt: {
    scanlineStrength: number;
    pixelMaskStrength: number;
    bloomStrength: number;
    curvature: number;
    vignetteStrength: number;
  };
}

export interface AdapterInfo {
  vendor: string;
  architecture: string;
  device: string;
  description: string;
}
