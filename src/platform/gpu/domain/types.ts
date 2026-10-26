export type RenderBackend = 'webgpu' | 'canvas2d';

export interface RenderCanvas {
  width: number;
  height: number;
  getContext(...args: readonly unknown[]): unknown;
}

export interface UpscaleConfig {
  readonly enabled: boolean;
}

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
  readonly description: string;
  readonly upscale: UpscaleConfig;
  readonly unsharp: UnsharpConfig;
  readonly color: ColorConfig;
  readonly crt: CRTConfig;
}

export type RenderPresetSummary = Pick<RenderPreset, 'id' | 'name' | 'description'>;

export interface RenderPipelineConfig {
  canvas: RenderCanvas;
  nativeWidth: number;
  nativeHeight: number;
  preset: RenderPreset;
  backend: RenderBackend;
}

export interface RenderCapabilities {
  webgpu: boolean;
  transferControlToOffscreen: boolean;
}

export interface RenderPipeline {
  readonly isActive: boolean;

  initialize(): Promise<void>;
  renderFrame(source: TexImageSource): void;
  resize(width: number, height: number): void;

  setPreset(preset: RenderPreset): void;

  setBrightness(value: number): void;

  captureFrame(): Promise<ImageBitmap>;

  dispose(): Promise<void>;
}
