import { resolvePreset, getRendererDefaultPreset } from './catalog';
import { createGpuRenderer } from './renderer.service';
import { WorkerRendererClient } from '../worker/client';
import type {
  RenderBackend,
  RenderPreset,
  GpuVideoRendererStats,
  GpuVideoRendererError,
  RenderPipeline,
  RenderCapabilities
} from '../domain/types';

export type GpuVideoRendererSession = {
  readonly backend: RenderBackend;
  readonly isActive: boolean;
  readonly isCanvasTransferred: boolean;
  renderFrame(video: HTMLVideoElement): Promise<void>;
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
  logger?: Pick<Console, 'debug' | 'error' | 'info' | 'warn'>;
};

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
  private logger: Pick<Console, 'debug' | 'error' | 'info' | 'warn'>;

  private pendingCaptureResolve: ((result: ImageBitmap) => void) | null = null;
  private pendingCaptureReject: ((error: Error) => void) | null = null;
  private isWaitingForCapturedFrame = false;
  private captureTimeoutId: ReturnType<typeof setTimeout> | null = null;

  private messageUnsubscribers: Array<() => void> = [];

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
        this.onReadyCb?.({ backend: payload.backend });
      }),

      this.workerClient.onFrameRendered(() => {
        this.pendingFrames = Math.max(0, this.pendingFrames - 1);
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
  }

  private unregisterMessageHandlers(): void {
    for (const unsub of this.messageUnsubscribers) {
      unsub();
    }
    this.messageUnsubscribers = [];
  }

  async renderFrame(video: HTMLVideoElement): Promise<void> {
    if (!this._isActive) return;

    if (this.backend === 'canvas2d') {
      if (this.localPipeline && video.readyState >= video.HAVE_CURRENT_DATA) {
        this.localPipeline.renderFrame(video);
      }
    } else {
      if (!this.workerClient || !this.workerClient.isReady() || this.pendingFrames >= 2) {
        return;
      }

      if (video.readyState < video.HAVE_CURRENT_DATA) {
        return;
      }

      let imageBitmap: ImageBitmap | null = null;
      try {
        imageBitmap = await createImageBitmap(video, this.imageBitmapOptions);
        this.pendingFrames++;

        if (this.workerClient.renderFrame(imageBitmap)) {
          imageBitmap = null;
        } else {
          this.pendingFrames = Math.max(0, this.pendingFrames - 1);
          imageBitmap.close();
        }
      } catch (err: unknown) {
        this.logger.error('Failed to render frame in worker:', err);
        if (imageBitmap) {
          imageBitmap.close();
        }
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
    if (this.backend === 'canvas2d') {
      this.localPipeline?.releaseResources();
    } else {
      this.workerClient?.releaseResources();
    }
  }

  terminate(options?: { emitCanvasExpired?: boolean }): void {
    this._isActive = false;
    this.unregisterMessageHandlers();
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
