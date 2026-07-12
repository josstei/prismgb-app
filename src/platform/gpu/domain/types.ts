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

export interface RenderCapabilities {
  webgpu: boolean;
  offscreenCanvas: boolean;
  transferControlToOffscreen: boolean;
  preferredBackend: RenderBackend;
  maxTextureSize: number;
  webgpuLimits?: WebGPULimits;
}

export type BrowserCapabilityProbeError = Readonly<{
  name: string;
  message: string;
}>;

export type WebGpuCapabilityProbeResult =
  | Readonly<{ status: 'available' }>
  | Readonly<{ status: 'api-unavailable' }>
  | Readonly<{ status: 'adapter-unavailable' }>
  | Readonly<{ status: 'adapter-error'; error: BrowserCapabilityProbeError }>
  | Readonly<{ status: 'device-error'; error: BrowserCapabilityProbeError }>;

export type OffscreenCanvasTransferProbeResult =
  | Readonly<{ status: 'available' }>
  | Readonly<{ status: 'api-unavailable' }>
  | Readonly<{ status: 'method-unavailable' }>
  | Readonly<{ status: 'allowlisted-not-supported' }>
  | Readonly<{ status: 'unexpected-error'; error: BrowserCapabilityProbeError }>;

export type BrowserCapabilityProbeResult = Readonly<{
  webgpu: WebGpuCapabilityProbeResult;
  transferControlToOffscreen: OffscreenCanvasTransferProbeResult;
}>;

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

export type FrameDispositionOutcome =
  | 'canvas-draw-completed'
  | 'webgpu-queue-submit-completed'
  | 'skipped-inactive'
  | 'failed';

/**
 * Harness-only evidence of the synchronous renderer boundary reached for one
 * frame. This is not GPU completion or display completion.
 */
export interface FrameDisposition {
  readonly outcome: FrameDispositionOutcome;
}

/**
 * Optional in-process hook for the instrumented worker build. It observes the
 * CPU boundary around WebGPU queue submission without claiming GPU completion.
 */
export interface WebGpuQueueSubmitTimingObserver {
  recordWebGpuQueueSubmitTiming(startedAt: number, endedAt: number): void;
}

export type FrameRenderResult = FrameDisposition | undefined;

export interface RenderPipeline {
  readonly backend: RenderBackend;
  readonly isInitialized: boolean;
  readonly isActive: boolean;

  initialize(): Promise<void>;
  renderFrame(source: TexImageSource, timingObserver?: WebGpuQueueSubmitTimingObserver): FrameRenderResult;
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
