import { resolvePreset, getRendererDefaultPreset } from './catalog';
import { createGpuRenderer } from './renderer.service';
import { WorkerRendererClient } from '../worker/client';
import type {
  RenderBackend,
  RenderPreset,
  GpuVideoRendererStats,
  GpuVideoRendererError,
  RenderPipeline,
  RenderCapabilities,
  FrameDispositionOutcome,
  FrameRenderResult,
  WebGpuFrameRequestProxy,
  WebGpuLifecycleRequestProxy
} from '../domain/types';

export type GpuVideoFrameMeasurementContext = Readonly<{
  readonly sourceSequence: number;
  readonly measurementEpochId: string;
}>;

export type GpuVideoPerformanceObservation =
  | Readonly<{
    readonly kind: 'canvas-disposition';
    readonly context: GpuVideoFrameMeasurementContext;
    readonly outcome: FrameDispositionOutcome;
    readonly startedAt: number;
    readonly endedAt: number;
  }>
  | Readonly<{
    readonly kind: 'worker-frame-submitted';
    readonly context: GpuVideoFrameMeasurementContext;
    readonly frameToken: number;
  }>
  | Readonly<{
    readonly kind: 'worker-frame-timing';
    readonly context: GpuVideoFrameMeasurementContext;
    readonly frameToken: number;
    readonly diagnosticFrameId: number;
    readonly outcome: 'webgpu-queue-submit-completed';
    readonly workerRender: Readonly<{ readonly startedAt: number; readonly endedAt: number }>;
    readonly queueSubmit: Readonly<{ readonly startedAt: number; readonly endedAt: number }>;
    readonly frameRequestProxies: readonly WebGpuFrameRequestProxy[];
  }>
  | Readonly<{
    readonly kind: 'worker-lifecycle-requests';
    readonly lifecycleRequestProxies: readonly WebGpuLifecycleRequestProxy[];
  }>
  | Readonly<{
    readonly kind: 'worker-frame-acknowledged';
    readonly context: GpuVideoFrameMeasurementContext;
    readonly frameToken: number;
    readonly outcome: FrameDispositionOutcome;
  }>
  | Readonly<{
    readonly kind: 'worker-terminal-error';
    readonly context: GpuVideoFrameMeasurementContext;
    readonly frameToken: number;
  }>
  | Readonly<{
    readonly kind: 'bitmap-creation';
    readonly context: GpuVideoFrameMeasurementContext;
    readonly startedAt: number;
    readonly endedAt: number;
    readonly sourceWidth: number;
    readonly sourceHeight: number;
  }>
  | Readonly<{
    readonly kind: 'session-disposition';
    readonly context: GpuVideoFrameMeasurementContext;
    readonly disposition: 'session-inactive' | 'worker-not-ready' | 'backpressure' | 'no-current-data' | 'bitmap-creation-failed' | 'enqueue-failed';
  }>;

/**
 * Harness-control branch evidence intentionally omits timestamps and samples.
 * It lets the external fixture reconcile source opportunities and worker tokens
 * without making the non-instrumented build a diagnostics collector.
 */
export type GpuVideoHarnessObservation =
  | Readonly<{
    readonly kind: 'canvas-disposition';
    readonly context: GpuVideoFrameMeasurementContext;
    readonly outcome: FrameDispositionOutcome;
  }>
  | Readonly<{
    readonly kind: 'worker-frame-submitted';
    readonly context: GpuVideoFrameMeasurementContext;
    readonly frameToken: number;
  }>
  | Readonly<{
    readonly kind: 'worker-frame-acknowledged';
    readonly context: GpuVideoFrameMeasurementContext;
    readonly frameToken: number;
    readonly outcome: FrameDispositionOutcome;
  }>
  | Readonly<{
    readonly kind: 'worker-terminal-error';
    readonly context: GpuVideoFrameMeasurementContext;
    readonly frameToken: number;
  }>
  | Readonly<{
    readonly kind: 'bitmap-creation';
    readonly context: GpuVideoFrameMeasurementContext;
    readonly outcome: 'created' | 'failed';
  }>
  | Readonly<{
    readonly kind: 'session-disposition';
    readonly context: GpuVideoFrameMeasurementContext;
    readonly disposition: 'session-inactive' | 'worker-not-ready' | 'backpressure' | 'no-current-data' | 'bitmap-creation-failed' | 'enqueue-failed';
  }>;

export type GpuVideoRendererSession = {
  readonly backend: RenderBackend;
  readonly isActive: boolean;
  readonly isCanvasTransferred: boolean;
  renderFrame(video: HTMLVideoElement, measurement?: GpuVideoFrameMeasurementContext): Promise<FrameRenderResult>;
  resize(width: number, height: number): void;
  setPreset(presetId: string): void;
  setBrightness(value: number): void;
  getTargetDimensions(): { width: number; height: number };
  captureFrame(): Promise<ImageBitmap>;
  release(): void;
  terminate(options?: { emitCanvasExpired?: boolean }): void;
  dispose(): void | Promise<void>;
};

export type GpuVideoRendererSessionOptions = {
  canvas: HTMLCanvasElement;
  nativeResolution: { width: number; height: number };
  preferredBackend?: RenderBackend;
  presetId?: string | null;
  brightness?: number;
  allowCanvas2D?: boolean;
  createWorker?: () => Worker;
  capabilities?: RenderCapabilities;
  onReady?: (event: { backend: RenderBackend }) => void;
  onStats?: (stats: GpuVideoRendererStats) => void;
  onError?: (error: GpuVideoRendererError) => void;
  onCanvasExpired?: () => void;
  onHarnessObservation?: (observation: GpuVideoHarnessObservation) => void;
  onPerformanceObservation?: (observation: GpuVideoPerformanceObservation) => void;
  logger?: Pick<Console, 'debug' | 'error' | 'info' | 'warn'>;
};

function isPerformanceHarnessBuild(): boolean {
  return typeof __PRISMGB_PERF_HARNESS__ !== 'undefined' && __PRISMGB_PERF_HARNESS__;
}

function isPerformanceInstrumentationBuild(): boolean {
  return (
    isPerformanceHarnessBuild() &&
    typeof __PRISMGB_PERF_INSTRUMENTATION__ !== 'undefined' &&
    __PRISMGB_PERF_INSTRUMENTATION__ &&
    typeof window !== 'undefined' &&
    window.prismgbPerformanceLaunchMarker !== undefined
  );
}

function harnessDisposition(outcome: FrameDispositionOutcome): FrameRenderResult {
  return isPerformanceHarnessBuild() ? { outcome } : undefined;
}

function cloneLifecycleRequestProxy(request: WebGpuLifecycleRequestProxy): WebGpuLifecycleRequestProxy {
  return 'textureDescriptor' in request
    ? { ...request, textureDescriptor: { ...request.textureDescriptor } }
    : { ...request };
}

class DefaultGpuVideoRendererSession implements GpuVideoRendererSession {
  readonly backend: RenderBackend;
  readonly isCanvasTransferred: boolean;
  private _isActive = true;

  private workerClient: WorkerRendererClient | null = null;
  private pendingFrames = 0;
  private imageBitmapOptions: ImageBitmapOptions;
  private nativeWidth: number;
  private nativeHeight: number;
  private targetWidth: number;
  private targetHeight: number;
  private scaleFactor = 1;
  private brightness = 1.0;
  private presetId: string;
  private currentPreset: RenderPreset;

  private localPipeline: RenderPipeline | null = null;

  private onReadyCb?: (event: { backend: RenderBackend }) => void;
  private onStatsCb?: (stats: GpuVideoRendererStats) => void;
  private onErrorCb?: (error: GpuVideoRendererError) => void;
  private onCanvasExpiredCb?: () => void;
  private onHarnessObservationCb?: (observation: GpuVideoHarnessObservation) => void;
  private onPerformanceObservationCb?: (observation: GpuVideoPerformanceObservation) => void;
  private logger: Pick<Console, 'debug' | 'error' | 'info' | 'warn'>;

  private pendingCaptureResolve: ((result: ImageBitmap) => void) | null = null;
  private pendingCaptureReject: ((error: Error) => void) | null = null;
  private isWaitingForCapturedFrame = false;
  private captureTimeoutId: ReturnType<typeof setTimeout> | null = null;

  private messageUnsubscribers: Array<() => void> = [];
  private nextHarnessFrameToken = 0;
  private pendingHarnessFrameContexts = new Map<number, GpuVideoFrameMeasurementContext>();

  constructor(
    backend: RenderBackend,
    isCanvasTransferred: boolean,
    options: GpuVideoRendererSessionOptions
  ) {
    this.backend = backend;
    this.isCanvasTransferred = isCanvasTransferred;
    this.nativeWidth = options.nativeResolution.width;
    this.nativeHeight = options.nativeResolution.height;
    this.targetWidth = this.nativeWidth;
    this.targetHeight = this.nativeHeight;
    this.presetId = options.presetId || getRendererDefaultPreset().id;
    this.currentPreset = resolvePreset(this.presetId);
    this.brightness = options.brightness !== undefined ? options.brightness : 1.0;

    this.onReadyCb = options.onReady;
    this.onStatsCb = options.onStats;
    this.onErrorCb = options.onError;
    this.onCanvasExpiredCb = options.onCanvasExpired;
    if (isPerformanceHarnessBuild()) {
      this.onHarnessObservationCb = options.onHarnessObservation;
      this.onPerformanceObservationCb = options.onPerformanceObservation;
    }
    this.logger = options.logger || console;

    this.imageBitmapOptions = {
      resizeWidth: this.nativeWidth,
      resizeHeight: this.nativeHeight,
      resizeQuality: 'medium',
      colorSpaceConversion: 'none'
    };
  }

  get isActive(): boolean {
    return this._isActive;
  }

  async initialize(canvas: HTMLCanvasElement, options: GpuVideoRendererSessionOptions): Promise<void> {
    if (this.backend === 'canvas2d') {
      try {
        this.localPipeline = await createGpuRenderer({
          canvas,
          nativeWidth: this.nativeWidth,
          nativeHeight: this.nativeHeight,
          preferredBackend: 'canvas2d',
          preset: this.currentPreset,
          allowCanvas2D: true,
          capabilities: options.capabilities
        });
        this.localPipeline.setBrightness(this.brightness);
        this.onReadyCb?.({ backend: 'canvas2d' });
      } catch (err: unknown) {
        this.logger.error('Failed to initialize local Canvas2D pipeline:', err);
        const errorPayload: GpuVideoRendererError = {
          message: err instanceof Error ? err.message : String(err),
          code: 'INIT_FAILED'
        };
        this.onErrorCb?.(errorPayload);
        throw err;
      }
    } else {
      const createWorkerFn = options.createWorker || (() => {
        return new Worker(new URL('../worker-entry.js', import.meta.url), { type: 'module' });
      });

      this.workerClient = new WorkerRendererClient({
        createWorker: createWorkerFn,
        logger: this.logger
      });

      this.scaleFactor = this.calculateScale(canvas.clientWidth, canvas.clientHeight);
      this.targetWidth = this.nativeWidth * this.scaleFactor;
      this.targetHeight = this.nativeHeight * this.scaleFactor;

      const config = {
        nativeWidth: this.nativeWidth,
        nativeHeight: this.nativeHeight,
        targetWidth: this.targetWidth,
        targetHeight: this.targetHeight,
        scaleFactor: this.scaleFactor,
        backend: this.backend as 'webgpu',
        presetId: this.presetId
      };

      this.registerMessageHandlers();

      try {
        const initialized = await this.workerClient.initialize(canvas, config, 5000);
        if (!initialized) {
          throw new Error('Worker renderer client initialization returned false');
        }

        this.workerClient.setBrightness(this.brightness);
      } catch (err: unknown) {
        this.logger.error('Failed to initialize worker renderer:', err);
        this.unregisterMessageHandlers();
        const errorPayload: GpuVideoRendererError = {
          message: err instanceof Error ? err.message : String(err),
          code: 'INIT_FAILED'
        };
        this.onErrorCb?.(errorPayload);
        throw err;
      }
    }
  }

  private calculateScale(clientWidth: number, clientHeight: number): number {
    if (clientWidth <= 0 || clientHeight <= 0) return 1;
    const scaleX = clientWidth / this.nativeWidth;
    const scaleY = clientHeight / this.nativeHeight;
    return Math.max(1, Math.floor(Math.min(scaleX, scaleY)));
  }

  private registerMessageHandlers(): void {
    if (!this.workerClient) return;

    this.messageUnsubscribers = [
      this.workerClient.onReady((payload) => {
        this.logger.info(`Render worker ready (backend: ${payload.backend})`);
        if (
          typeof __PRISMGB_PERF_HARNESS__ !== 'undefined' &&
          __PRISMGB_PERF_HARNESS__ &&
          typeof __PRISMGB_PERF_INSTRUMENTATION__ !== 'undefined' &&
          __PRISMGB_PERF_INSTRUMENTATION__ &&
          'lifecycleRequestProxies' in payload
        ) {
          this.recordPerformanceObservation({
            kind: 'worker-lifecycle-requests',
            lifecycleRequestProxies: payload.lifecycleRequestProxies.map(cloneLifecycleRequestProxy)
          });
        }
        this.onReadyCb?.({ backend: payload.backend });
      }),

      this.workerClient.onFrameRendered((payload) => {
        this.pendingFrames = Math.max(0, this.pendingFrames - 1);
        if (
          typeof __PRISMGB_PERF_HARNESS__ !== 'undefined' &&
          __PRISMGB_PERF_HARNESS__ &&
          payload !== undefined &&
          'frameToken' in payload &&
          'outcome' in payload
        ) {
          const context = this.pendingHarnessFrameContexts.get(payload.frameToken);
          this.pendingHarnessFrameContexts.delete(payload.frameToken);
          if (context) {
            this.recordHarnessObservation({
              kind: 'worker-frame-acknowledged',
              context,
              frameToken: payload.frameToken,
              outcome: payload.outcome
            });
            if (
              typeof __PRISMGB_PERF_INSTRUMENTATION__ !== 'undefined' &&
              __PRISMGB_PERF_INSTRUMENTATION__
            ) {
              this.recordPerformanceObservation({
                kind: 'worker-frame-acknowledged',
                context,
                frameToken: payload.frameToken,
                outcome: payload.outcome
              });
            }
          }
        }
        if (this.isWaitingForCapturedFrame) {
          this.isWaitingForCapturedFrame = false;
          this.workerClient?.requestCapturedFrame();
        }
      }),

      this.workerClient.onStats((payload) => {
        this.onStatsCb?.({
          fps: payload.fps,
          frameTime: typeof payload.frameTime === 'string' ? parseFloat(payload.frameTime) : payload.frameTime,
          gpuTime: payload.gpuTime,
          uploadTime: payload.uploadTime
        });
      }),

      this.workerClient.onError((payload) => {
        if (payload.code === 'DEVICE_LOST' && payload.message?.includes('destroyed')) {
          return;
        }
        this.logger.error('Render worker error:', payload.message);
        this.pendingFrames = 0;
        if (
          typeof __PRISMGB_PERF_HARNESS__ !== 'undefined' &&
          __PRISMGB_PERF_HARNESS__
        ) {
          for (const [frameToken, context] of this.pendingHarnessFrameContexts) {
            this.recordHarnessObservation({
              kind: 'worker-terminal-error',
              context,
              frameToken
            });
            if (
              typeof __PRISMGB_PERF_INSTRUMENTATION__ !== 'undefined' &&
              __PRISMGB_PERF_INSTRUMENTATION__
            ) {
              this.recordPerformanceObservation({
                kind: 'worker-terminal-error',
                context,
                frameToken
              });
            }
          }
          this.pendingHarnessFrameContexts.clear();
        }
        this.onErrorCb?.({
          message: payload.message,
          code: payload.code,
          stack: payload.stack
        });
        this.resolvePendingCapture(null, new Error(payload.message));
      }),

      this.workerClient.onCaptureReady((payload) => {
        this.resolvePendingCapture(payload.bitmap, null);
      })
    ];

    if (
      typeof __PRISMGB_PERF_HARNESS__ !== 'undefined' &&
      __PRISMGB_PERF_HARNESS__ &&
      typeof __PRISMGB_PERF_INSTRUMENTATION__ !== 'undefined' &&
      __PRISMGB_PERF_INSTRUMENTATION__
    ) {
      this.messageUnsubscribers.push(this.workerClient.onPerformanceFrameTiming((payload) => {
        const context = this.pendingHarnessFrameContexts.get(payload.frameToken);
        if (context === undefined) {
          return;
        }
        if (context.sourceSequence !== payload.diagnosticFrameId) {
          this.logger.error('Worker frame timing used a mismatched diagnostic frame ID');
          return;
        }
        this.recordPerformanceObservation({
          kind: 'worker-frame-timing',
          context,
          frameToken: payload.frameToken,
          diagnosticFrameId: payload.diagnosticFrameId,
          outcome: payload.outcome,
          workerRender: { ...payload.workerRender },
          queueSubmit: { ...payload.queueSubmit },
          frameRequestProxies: payload.frameRequestProxies.map((request) => ({ ...request }))
        });
      }));
      this.messageUnsubscribers.push(this.workerClient.onPerformanceLifecycleRequests((payload) => {
        this.recordPerformanceObservation({
          kind: 'worker-lifecycle-requests',
          lifecycleRequestProxies: payload.lifecycleRequestProxies.map(cloneLifecycleRequestProxy)
        });
      }));
    }
  }

  private unregisterMessageHandlers(): void {
    for (const unsub of this.messageUnsubscribers) {
      unsub();
    }
    this.messageUnsubscribers = [];
  }

  private recordPerformanceObservation(observation: GpuVideoPerformanceObservation): void {
    if (isPerformanceInstrumentationBuild()) {
      this.onPerformanceObservationCb?.(observation);
    }
  }

  private recordHarnessObservation(observation: GpuVideoHarnessObservation): void {
    if (isPerformanceHarnessBuild()) {
      this.onHarnessObservationCb?.(observation);
    }
  }

  async renderFrame(
    video: HTMLVideoElement,
    measurement?: GpuVideoFrameMeasurementContext
  ): Promise<FrameRenderResult> {
    if (!this._isActive) {
      if (typeof __PRISMGB_PERF_HARNESS__ !== 'undefined' && __PRISMGB_PERF_HARNESS__) {
        this.recordSessionDisposition(measurement, 'session-inactive');
      }
      return harnessDisposition('skipped-inactive');
    }

    if (this.backend === 'canvas2d') {
      if (!this.localPipeline) {
        if (typeof __PRISMGB_PERF_HARNESS__ !== 'undefined' && __PRISMGB_PERF_HARNESS__) {
          this.recordSessionDisposition(measurement, 'session-inactive');
        }
        return harnessDisposition('skipped-inactive');
      }
      if (video.readyState < video.HAVE_CURRENT_DATA) {
        if (typeof __PRISMGB_PERF_HARNESS__ !== 'undefined' && __PRISMGB_PERF_HARNESS__) {
          this.recordSessionDisposition(measurement, 'no-current-data');
        }
        return harnessDisposition('skipped-inactive');
      }

      const startedAt = performance.now();
      try {
        const disposition = this.localPipeline.renderFrame(video);
        const endedAt = performance.now();
        if (
          measurement &&
          disposition &&
          typeof __PRISMGB_PERF_HARNESS__ !== 'undefined' &&
          __PRISMGB_PERF_HARNESS__
        ) {
          this.recordHarnessObservation({
            kind: 'canvas-disposition',
            context: measurement,
            outcome: disposition.outcome
          });
          if (
            typeof __PRISMGB_PERF_INSTRUMENTATION__ !== 'undefined' &&
            __PRISMGB_PERF_INSTRUMENTATION__
          ) {
            this.recordPerformanceObservation({
              kind: 'canvas-disposition',
              context: measurement,
              outcome: disposition.outcome,
              startedAt,
              endedAt
            });
          }
        }
        return disposition;
      } catch (error: unknown) {
        this.logger.error('Failed to render frame in Canvas2D pipeline:', error);
        if (
          measurement &&
          typeof __PRISMGB_PERF_HARNESS__ !== 'undefined' &&
          __PRISMGB_PERF_HARNESS__
        ) {
          this.recordHarnessObservation({
            kind: 'canvas-disposition',
            context: measurement,
            outcome: 'failed'
          });
          if (
            typeof __PRISMGB_PERF_INSTRUMENTATION__ !== 'undefined' &&
            __PRISMGB_PERF_INSTRUMENTATION__
          ) {
            this.recordPerformanceObservation({
              kind: 'canvas-disposition',
              context: measurement,
              outcome: 'failed',
              startedAt,
              endedAt: performance.now()
            });
          }
        }
        return harnessDisposition('failed');
      }
    }

    if (!this.workerClient || !this.workerClient.isReady()) {
      if (typeof __PRISMGB_PERF_HARNESS__ !== 'undefined' && __PRISMGB_PERF_HARNESS__) {
        this.recordSessionDisposition(measurement, 'worker-not-ready');
      }
      return harnessDisposition('skipped-inactive');
    }
    if (this.pendingFrames >= 2) {
      if (typeof __PRISMGB_PERF_HARNESS__ !== 'undefined' && __PRISMGB_PERF_HARNESS__) {
        this.recordSessionDisposition(measurement, 'backpressure');
      }
      return harnessDisposition('skipped-inactive');
    }
    if (video.readyState < video.HAVE_CURRENT_DATA) {
      if (typeof __PRISMGB_PERF_HARNESS__ !== 'undefined' && __PRISMGB_PERF_HARNESS__) {
        this.recordSessionDisposition(measurement, 'no-current-data');
      }
      return harnessDisposition('skipped-inactive');
    }

    const bitmapStartedAt = performance.now();
    let imageBitmap: ImageBitmap;
    let bitmapOwnershipTransferred = false;
    try {
      imageBitmap = await createImageBitmap(video, this.imageBitmapOptions);
    } catch (error: unknown) {
      this.logger.error('Failed to create image bitmap for worker frame:', error);
      if (
        measurement &&
        typeof __PRISMGB_PERF_HARNESS__ !== 'undefined' &&
        __PRISMGB_PERF_HARNESS__
      ) {
        this.recordHarnessObservation({
          kind: 'bitmap-creation',
          context: measurement,
          outcome: 'failed'
        });
      }
      if (typeof __PRISMGB_PERF_HARNESS__ !== 'undefined' && __PRISMGB_PERF_HARNESS__) {
        this.recordSessionDisposition(measurement, 'bitmap-creation-failed');
      }
      return harnessDisposition('failed');
    }

    const bitmapEndedAt = performance.now();
    if (
      measurement &&
      typeof __PRISMGB_PERF_HARNESS__ !== 'undefined' &&
      __PRISMGB_PERF_HARNESS__
    ) {
      this.recordHarnessObservation({
        kind: 'bitmap-creation',
        context: measurement,
        outcome: 'created'
      });
      if (
        typeof __PRISMGB_PERF_INSTRUMENTATION__ !== 'undefined' &&
        __PRISMGB_PERF_INSTRUMENTATION__
      ) {
        this.recordPerformanceObservation({
          kind: 'bitmap-creation',
          context: measurement,
          startedAt: bitmapStartedAt,
          endedAt: bitmapEndedAt,
          sourceWidth: video.videoWidth,
          sourceHeight: video.videoHeight
        });
      }
    }

    const frameToken = isPerformanceHarnessBuild() ? ++this.nextHarnessFrameToken : undefined;
    this.pendingFrames++;
    try {
      const submitted = (
        measurement && isPerformanceInstrumentationBuild()
          ? this.workerClient.renderFrame(imageBitmap, frameToken, measurement.sourceSequence)
          : this.workerClient.renderFrame(imageBitmap, frameToken)
      );
      if (!submitted) {
        this.pendingFrames = Math.max(0, this.pendingFrames - 1);
        imageBitmap.close();
        if (typeof __PRISMGB_PERF_HARNESS__ !== 'undefined' && __PRISMGB_PERF_HARNESS__) {
          this.recordSessionDisposition(measurement, 'enqueue-failed');
        }
        return harnessDisposition('failed');
      }

      bitmapOwnershipTransferred = true;
      if (
        measurement &&
        frameToken !== undefined &&
        typeof __PRISMGB_PERF_HARNESS__ !== 'undefined' &&
        __PRISMGB_PERF_HARNESS__
      ) {
        this.pendingHarnessFrameContexts.set(frameToken, measurement);
        this.recordHarnessObservation({
          kind: 'worker-frame-submitted',
          context: measurement,
          frameToken
        });
        if (
          typeof __PRISMGB_PERF_INSTRUMENTATION__ !== 'undefined' &&
          __PRISMGB_PERF_INSTRUMENTATION__
        ) {
          this.recordPerformanceObservation({
            kind: 'worker-frame-submitted',
            context: measurement,
            frameToken
          });
        }
      }
      return undefined;
    } catch (error: unknown) {
      this.pendingFrames = Math.max(0, this.pendingFrames - 1);
      this.logger.error('Failed to render frame in worker:', error);
      if (!bitmapOwnershipTransferred) {
        imageBitmap.close();
      }
      if (typeof __PRISMGB_PERF_HARNESS__ !== 'undefined' && __PRISMGB_PERF_HARNESS__) {
        this.recordSessionDisposition(measurement, 'enqueue-failed');
      }
      return harnessDisposition('failed');
    }
  }

  private recordSessionDisposition(
    measurement: GpuVideoFrameMeasurementContext | undefined,
    disposition: Extract<GpuVideoPerformanceObservation, { readonly kind: 'session-disposition' }>['disposition']
  ): void {
    if (
      measurement &&
      typeof __PRISMGB_PERF_HARNESS__ !== 'undefined' &&
      __PRISMGB_PERF_HARNESS__
    ) {
      this.recordHarnessObservation({
        kind: 'session-disposition',
        context: measurement,
        disposition
      });
      if (
        typeof __PRISMGB_PERF_INSTRUMENTATION__ !== 'undefined' &&
        __PRISMGB_PERF_INSTRUMENTATION__
      ) {
        this.recordPerformanceObservation({
          kind: 'session-disposition',
          context: measurement,
          disposition
        });
      }
    }
  }

  resize(width: number, height: number): void {
    if (this.backend === 'canvas2d') {
      if (this.localPipeline) {
        const dpr = window.devicePixelRatio || 1;
        const backingWidth = Math.round(width * dpr);
        const backingHeight = Math.round(height * dpr);
        this.localPipeline.resize(backingWidth, backingHeight);
      }
    } else {
      this.scaleFactor = this.calculateScale(width, height);
      this.targetWidth = this.nativeWidth * this.scaleFactor;
      this.targetHeight = this.nativeHeight * this.scaleFactor;

      if (this.workerClient && this.workerClient.isReady()) {
        this.workerClient.resize(this.targetWidth, this.targetHeight, this.scaleFactor);
      }
    }
  }

  setPreset(presetId: string): void {
    const preset = resolvePreset(presetId);
    this.presetId = preset.id;
    this.currentPreset = preset;

    if (this.backend === 'canvas2d') {
      this.localPipeline?.setPreset(preset);
    } else {
      if (this.workerClient && this.workerClient.isReady()) {
        this.workerClient.setPreset(presetId, preset);
      }
    }
  }

  setBrightness(value: number): void {
    this.brightness = value;
    if (this.backend === 'canvas2d') {
      this.localPipeline?.setBrightness(value);
    } else {
      if (this.workerClient && this.workerClient.isReady()) {
        this.workerClient.setBrightness(value);
      }
    }
  }

  getTargetDimensions(): { width: number; height: number } {
    return { width: this.targetWidth, height: this.targetHeight };
  }

  async captureFrame(): Promise<ImageBitmap> {
    if (!this._isActive) {
      throw new Error('Session is not active');
    }

    if (this.backend === 'canvas2d') {
      if (!this.localPipeline) {
        throw new Error('Canvas2D pipeline not initialized');
      }
      return this.localPipeline.captureFrame();
    } else {
      if (!this.workerClient || !this.workerClient.isReady()) {
        throw new Error('Worker renderer client not ready');
      }
      if (this.pendingCaptureResolve) {
        throw new Error('Capture already in progress');
      }

      return new Promise((resolve, reject) => {
        this.pendingCaptureResolve = resolve;
        this.pendingCaptureReject = reject;

        if (!this.workerClient?.requestCapture()) {
          this.resolvePendingCapture(null, new Error('GPU renderer not ready'));
          return;
        }

        this.isWaitingForCapturedFrame = true;

        this.captureTimeoutId = setTimeout(() => {
          this.isWaitingForCapturedFrame = false;
          this.resolvePendingCapture(null, new Error('Capture request timed out'));
        }, 1000);
      });
    }
  }

  private resolvePendingCapture(result: ImageBitmap | null, error: Error | null): void {
    if (this.captureTimeoutId) {
      clearTimeout(this.captureTimeoutId);
      this.captureTimeoutId = null;
    }

    if (error && this.pendingCaptureReject) {
      this.pendingCaptureReject(error);
    } else if (result && this.pendingCaptureResolve) {
      this.pendingCaptureResolve(result);
    }

    this.pendingCaptureResolve = null;
    this.pendingCaptureReject = null;
  }

  release(): void {
    this.pendingFrames = 0;
    this.pendingHarnessFrameContexts.clear();
    this.nextHarnessFrameToken = 0;
    if (this.backend === 'canvas2d') {
      this.localPipeline?.releaseResources();
    } else {
      this.workerClient?.releaseResources();
    }
  }

  terminate(options?: { emitCanvasExpired?: boolean }): void {
    this._isActive = false;
    this.unregisterMessageHandlers();
    this.pendingHarnessFrameContexts.clear();
    this.nextHarnessFrameToken = 0;
    this.resolvePendingCapture(null, new Error('Session terminated'));

    if (this.backend === 'canvas2d') {
      if (this.localPipeline) {
        this.localPipeline.dispose().catch(() => {});
        this.localPipeline = null;
      }
    } else {
      if (this.workerClient) {
        this.workerClient.terminate();
        this.workerClient = null;
      }
    }

    if (options?.emitCanvasExpired) {
      this.onCanvasExpiredCb?.();
    }
  }

  dispose(): void | Promise<void> {
    this.terminate();
  }
}

export async function createGpuVideoRendererSession(
  options: GpuVideoRendererSessionOptions
): Promise<GpuVideoRendererSession> {
  const capabilities = options.capabilities ?? await (async () => {
    const { detectBrowserGpuCapabilities } = await import('../infrastructure/capabilities.browser');
    return detectBrowserGpuCapabilities();
  })();

  const allowCanvas2D = options.allowCanvas2D !== false;

  const canUseWebgpu =
    capabilities.webgpu &&
    capabilities.transferControlToOffscreen &&
    options.preferredBackend !== 'canvas2d';

  if (!canUseWebgpu && !allowCanvas2D) {
    throw new Error('No accelerated render backend available');
  }

  const backend: RenderBackend = canUseWebgpu ? 'webgpu' : 'canvas2d';

  const session = new DefaultGpuVideoRendererSession(backend, canUseWebgpu, options);

  await session.initialize(options.canvas, options);
  return session;
}
