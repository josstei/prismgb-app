export type RenderBackend = 'webgpu' | 'webgl2' | 'canvas2d';

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

export interface ShaderPresetCatalog {
  readonly presets: readonly RenderPreset[];
  readonly packageDefaultPresetId: string;
  readonly rendererDefaultPresetId: string;
  readonly uiPresetIds: readonly string[];
}

export interface RenderPipelineConfig {
  canvas: RenderCanvas;
  nativeWidth: number;
  nativeHeight: number;
  preset?: RenderPreset;
  preferredBackend?: RenderBackend;
  allowCanvas2D?: boolean;
}

export interface WebGPULimits {
  maxTextureDimension2D: number;
  maxBindGroups: number;
}

export interface WebGL2Info {
  renderer: string;
  vendor: string;
  maxTextureSize: number;
}

export interface RenderCapabilities {
  webgpu: boolean;
  webgl2: boolean;
  offscreenCanvas: boolean;
  transferControlToOffscreen: boolean;
  preferredBackend: RenderBackend;
  maxTextureSize: number;
  webgpuLimits?: WebGPULimits;
  webgl2Info?: WebGL2Info;
}

export interface RenderStats {
  fps: number;
  frameTime: number;
  gpuTime?: number;
  framesRendered: number;
  framesDropped: number;
}

export interface GpuVideoRendererStats {
  fps: number;
  frameTime: number;
  gpuTime?: number;
  uploadTime?: number;
}

export interface GpuVideoRendererError {
  message: string;
  code?: string;
  stack?: string;
}

export interface RenderPipeline {
  readonly backend: RenderBackend;
  readonly isInitialized: boolean;
  readonly isActive: boolean;

  initialize(): Promise<void>;
  renderFrame(source: TexImageSource): void;
  resize(width: number, height: number): void;

  setPreset(preset: RenderPreset): void;
  getPreset(): RenderPreset;

  setBrightness(value: number): void;

  captureFrame(): Promise<ImageBitmap>;
  clearFrame(): void;

  pause(): void;
  resume(): void;

  getStats(): RenderStats;

  releaseResources(): void;
  dispose(): Promise<void>;
}
