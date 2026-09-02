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

export type BrowserGpuAdapterIdentity = Readonly<{
  vendor: string | null;
  architecture: string | null;
  device: string | null;
  description: string | null;
}>;

export type BrowserGpuQualificationLimits = Readonly<{
  maxTextureDimension2D: number;
  maxBindGroups: number;
}>;

export type BrowserGpuStrictSelection = Readonly<{
  requestedBackend: 'webgpu';
  powerPreference: 'low-power';
  forceFallbackAdapter: false;
}>;

export type WebGpuBackendExecutionIdentity = Readonly<{
  backend: 'webgpu';
  driver: 'webgpu-driver-v1';
  workerProtocol: 'webgpu-worker-ready-v1';
  adapterIdentity: BrowserGpuAdapterIdentity;
  limits: BrowserGpuQualificationLimits;
  isFallbackAdapter: boolean;
  powerPreference: 'low-power' | 'high-performance';
}>;

export type WebGpuCapabilityProbeResult =
  | Readonly<{
    status: 'available';
    adapterIdentity: BrowserGpuAdapterIdentity;
    limits: BrowserGpuQualificationLimits;
    isFallbackAdapter: boolean;
    strictSelection: BrowserGpuStrictSelection;
  }>
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

export type WebGpuFrameRequestProxy =
  | Readonly<{
    readonly operationId: 'uniform-float32-array';
    readonly sourceLocationId: 'webgpu-driver:uniform-float32-array';
    readonly outcome: 'success' | 'failed';
    readonly byteKind: 'requested-byte-length';
    readonly byteValue: number;
    readonly requestedByteLength: number;
  }>
  | Readonly<{
    readonly operationId: 'bind-group-create';
    readonly sourceLocationId: 'webgpu-driver:create-bind-group';
    readonly outcome: 'success' | 'failed';
    readonly byteKind: 'count-only-unavailable';
    readonly byteValue: null;
  }>
  | Readonly<{
    readonly operationId: 'render-pass-plan-materialization';
    readonly sourceLocationId: 'webgpu-driver:materialize-render-plan';
    readonly outcome: 'success' | 'failed';
    readonly byteKind: 'count-only-unavailable';
    readonly byteValue: null;
  }>;

/**
 * Harness-only evidence of a native WebGPU resource request made outside a
 * source-frame cohort. The descriptor values are request proxies, never a
 * claim about physical GPU allocation or lifetime.
 */
export type WebGpuLifecycleRequestProxy =
  | Readonly<{
    readonly lifecyclePhase: 'startup';
    readonly operationId: 'gpu-buffer-request';
    readonly sourceLocationId: 'webgpu-driver:create-buffer';
    readonly outcome: 'success' | 'failed';
    readonly byteKind: 'descriptor-size';
    readonly byteValue: number;
    readonly descriptorSize: number;
  }>
  | Readonly<{
    readonly lifecyclePhase: 'startup' | 'resize';
    readonly operationId: 'gpu-texture-request';
    readonly sourceLocationId: 'webgpu-driver:create-texture';
    readonly outcome: 'success' | 'failed';
    readonly byteKind: 'logical-texel-footprint';
    readonly byteValue: number;
    readonly textureDescriptor: Readonly<{
      readonly width: number;
      readonly height: number;
      readonly depth: number;
      readonly format: string;
      readonly usage: string;
      readonly logicalTexelFootprint: number;
    }>;
  }>;

/**
 * Optional in-process hook for the instrumented worker build. It observes CPU
 * boundaries and request-proxy invocations without claiming GPU allocation or
 * completion.
 */
export interface WebGpuFrameInstrumentationObserver {
  recordWebGpuQueueSubmitTiming(startedAt: number, endedAt: number): void;
  recordWebGpuFrameRequestProxy(request: WebGpuFrameRequestProxy): void;
}

export interface WebGpuLifecycleInstrumentationObserver {
  recordWebGpuLifecycleRequestProxy(request: WebGpuLifecycleRequestProxy): void;
}

export type FrameRenderResult = FrameDisposition | undefined;

export interface RenderPipeline {
  readonly backend: RenderBackend;
  readonly isInitialized: boolean;
  readonly isActive: boolean;
  getBackendExecutionIdentity(): WebGpuBackendExecutionIdentity | null;

  initialize(lifecycleInstrumentationObserver?: WebGpuLifecycleInstrumentationObserver): Promise<void>;
  renderFrame(source: TexImageSource, instrumentationObserver?: WebGpuFrameInstrumentationObserver): FrameRenderResult;
  resize(width: number, height: number, lifecycleInstrumentationObserver?: WebGpuLifecycleInstrumentationObserver): void;

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
