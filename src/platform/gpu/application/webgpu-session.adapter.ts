import { resolvePreset } from '../domain/presets.definitions';
import { calculateScaleFactor } from '../domain/scale.utils';
import type { RenderWorkerRequest, RenderWorkerResponse } from '../worker/render-worker.contract';
import type { GpuVideoRendererSession, GpuVideoRendererSessionOptions } from './video-session.factory';

const WORKER_INIT_TIMEOUT_MS = 5000;
const CAPTURE_TIMEOUT_MS = 1000;
const MAX_PENDING_FRAMES = 2;

type Pending<T> = {
  resolve(value: T): void;
  reject(error: Error): void;
  timeoutId: ReturnType<typeof setTimeout>;
};

function settle<T>(pending: Pending<T> | null, result: T | Error): void {
  if (!pending) return;

  clearTimeout(pending.timeoutId);
  if (result instanceof Error) {
    pending.reject(result);
  } else {
    pending.resolve(result);
  }
}

function createRenderWorker(): Worker {
  return new Worker(new URL('../worker-entry.js', import.meta.url), { type: 'module' });
}

export class WebGpuSessionAdapter implements GpuVideoRendererSession {
  readonly backend = 'webgpu' as const;
  readonly isCanvasTransferred = true;

  private active = true;
  private ready = false;
  private worker: Worker | null = null;
  private pendingFrames = 0;
  private pendingReady: Pending<void> | null = null;
  private pendingCapture: Pending<ImageBitmap> | null = null;
  private readonly nativeWidth: number;
  private readonly nativeHeight: number;
  private targetWidth: number;
  private targetHeight: number;
  private readonly imageBitmapOptions: ImageBitmapOptions;
  private readonly logger: Pick<Console, 'error' | 'info'>;
  private readonly onReady: GpuVideoRendererSessionOptions['onReady'];
  private readonly onError: GpuVideoRendererSessionOptions['onError'];
  private readonly onCanvasExpired: GpuVideoRendererSessionOptions['onCanvasExpired'];

  private constructor(options: GpuVideoRendererSessionOptions) {
    this.nativeWidth = options.nativeResolution.width;
    this.nativeHeight = options.nativeResolution.height;
    this.targetWidth = this.nativeWidth;
    this.targetHeight = this.nativeHeight;
    this.imageBitmapOptions = {
      resizeWidth: this.nativeWidth,
      resizeHeight: this.nativeHeight,
      resizeQuality: 'medium',
      colorSpaceConversion: 'none'
    };
    this.logger = options.logger ?? console;
    this.onReady = options.onReady;
    this.onError = options.onError;
    this.onCanvasExpired = options.onCanvasExpired;
  }

  static async create(options: GpuVideoRendererSessionOptions): Promise<WebGpuSessionAdapter> {
    const session = new WebGpuSessionAdapter(options);
    await session.initialize(options);
    return session;
  }

  get isActive(): boolean {
    return this.active;
  }

  private async initialize(options: GpuVideoRendererSessionOptions): Promise<void> {
    const { canvas } = options;
    this.updateTargetDimensions(canvas.clientWidth, canvas.clientHeight);

    try {
      const offscreenCanvas = canvas.transferControlToOffscreen();
      const worker = (options.createWorker ?? createRenderWorker)();
      this.worker = worker;
      worker.onmessage = ({ data }: MessageEvent<RenderWorkerResponse>) => this.handleResponse(data);
      worker.onerror = (event) => {
        this.logger.error('Render worker error:', event.message);
        this.ready = false;
        this.settleReady(new Error(event.message));
      };

      const init: RenderWorkerRequest = {
        type: 'init',
        canvas: offscreenCanvas,
        config: {
          nativeWidth: this.nativeWidth,
          nativeHeight: this.nativeHeight,
          targetWidth: this.targetWidth,
          targetHeight: this.targetHeight,
          presetId: resolvePreset(options.presetId).id,
          brightness: options.brightness ?? 1.0
        }
      };
      worker.postMessage(init, [offscreenCanvas]);

      await new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          this.settleReady(new Error('Worker initialization timed out'));
        }, WORKER_INIT_TIMEOUT_MS);
        this.pendingReady = { resolve, reject, timeoutId };
      });
    } catch (error) {
      this.logger.error('Failed to initialize worker renderer:', error);
      this.onError?.({
        message: error instanceof Error ? error.message : String(error),
        code: 'INIT_FAILED'
      });
      this.terminate();
      throw error;
    }
  }

  private handleResponse(response: RenderWorkerResponse): void {
    switch (response.type) {
      case 'ready':
        this.ready = true;
        this.settleReady();
        this.logger.info('Render worker ready (backend: webgpu)');
        this.onReady?.({ backend: 'webgpu' });
        break;
      case 'frameRendered':
        this.pendingFrames = Math.max(0, this.pendingFrames - 1);
        break;
      case 'captured':
        this.settleCapture(response.bitmap);
        break;
      case 'error':
        this.logger.error('Render worker error:', response.message);
        this.ready = false;
        this.pendingFrames = 0;
        this.onError?.({ message: response.message });
        this.settleReady(new Error(response.message));
        this.settleCapture(new Error(response.message));
        break;
    }
  }

  private settleReady(error?: Error): void {
    const pending = this.pendingReady;
    this.pendingReady = null;
    settle(pending, error);
  }

  private settleCapture(result: ImageBitmap | Error): void {
    const pending = this.pendingCapture;
    this.pendingCapture = null;
    settle(pending, result);
  }

  private post(request: RenderWorkerRequest, transfer: Transferable[] = []): boolean {
    if (!this.ready || !this.worker) {
      return false;
    }

    this.worker.postMessage(request, transfer);
    return true;
  }

  private updateTargetDimensions(clientWidth: number, clientHeight: number): void {
    const scaleFactor = calculateScaleFactor(this.nativeWidth, this.nativeHeight, clientWidth, clientHeight);
    this.targetWidth = this.nativeWidth * scaleFactor;
    this.targetHeight = this.nativeHeight * scaleFactor;
  }

  async renderFrame(video: HTMLVideoElement): Promise<void> {
    if (!this.active || !this.ready || this.pendingFrames >= MAX_PENDING_FRAMES) return;
    if (video.readyState < video.HAVE_CURRENT_DATA) return;

    let bitmap: ImageBitmap | null = null;
    try {
      bitmap = await createImageBitmap(video, this.imageBitmapOptions);
      this.pendingFrames++;

      if (this.post({ type: 'frame', bitmap }, [bitmap])) {
        bitmap = null;
      } else {
        this.pendingFrames = Math.max(0, this.pendingFrames - 1);
        bitmap.close();
      }
    } catch (error) {
      this.logger.error('Failed to render frame in worker:', error);
      bitmap?.close();
    }
  }

  resize(width: number, height: number): void {
    this.updateTargetDimensions(width, height);
    this.post({ type: 'resize', width: this.targetWidth, height: this.targetHeight });
  }

  setPreset(presetId: string): void {
    this.post({ type: 'setPreset', presetId: resolvePreset(presetId).id });
  }

  setBrightness(value: number): void {
    this.post({ type: 'setBrightness', brightness: value });
  }

  getTargetDimensions(): { width: number; height: number } {
    return { width: this.targetWidth, height: this.targetHeight };
  }

  async captureFrame(): Promise<ImageBitmap> {
    if (!this.active) {
      throw new Error('Session is not active');
    }
    if (!this.ready) {
      throw new Error('Worker renderer client not ready');
    }
    if (this.pendingCapture) {
      throw new Error('Capture already in progress');
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.settleCapture(new Error('Capture request timed out'));
      }, CAPTURE_TIMEOUT_MS);
      this.pendingCapture = { resolve, reject, timeoutId };
      this.post({ type: 'capture' });
    });
  }

  terminate(options?: { emitCanvasExpired?: boolean }): void {
    this.active = false;
    this.ready = false;
    this.settleReady(new Error('Session terminated'));
    this.settleCapture(new Error('Session terminated'));

    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;
      this.worker.terminate();
      this.worker = null;
      this.logger.info('Render worker terminated');
    }

    if (options?.emitCanvasExpired) {
      this.onCanvasExpired?.();
    }
  }
}
