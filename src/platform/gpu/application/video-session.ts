import { resolvePreset } from './catalog';
import { createGpuRenderer } from './renderer.service';
import { WorkerRendererClient } from '../worker/client';
import type { RenderBackend, RenderPipeline } from '../domain/types';

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
  terminate(): void;
};

type GpuVideoRendererSessionOptions = {
  canvas: HTMLCanvasElement;
  nativeResolution: { width: number; height: number };
  backend: RenderBackend;
  presetId?: string | null;
  brightness?: number;
  createWorker?: () => Worker;
  signal?: AbortSignal;
  logger?: Pick<Console, 'error' | 'info'>;
};

class DefaultGpuVideoRendererSession implements GpuVideoRendererSession {
  readonly backend: RenderBackend;
  private active = true;
  private pipeline: RenderPipeline | WorkerRendererClient | null = null;
  private targetWidth: number;
  private targetHeight: number;
  private readonly logger: Pick<Console, 'error' | 'info'>;

  constructor(private readonly options: GpuVideoRendererSessionOptions) {
    this.backend = options.backend;
    this.targetWidth = options.nativeResolution.width;
    this.targetHeight = options.nativeResolution.height;
    this.logger = options.logger ?? console;
  }

  get isActive(): boolean { return this.active; }
  get isCanvasTransferred(): boolean { return this.backend === 'webgpu'; }

  async initialize(): Promise<void> {
    const { canvas, nativeResolution, presetId, brightness = 1 } = this.options;
    const preset = resolvePreset(presetId);
    try {
      if (this.backend === 'canvas2d') {
        this.pipeline = await createGpuRenderer({
          canvas,
          nativeWidth: nativeResolution.width,
          nativeHeight: nativeResolution.height,
          backend: 'canvas2d',
          preset
        });
      } else {
        const worker = new WorkerRendererClient({
          createWorker: this.options.createWorker ?? (() => new Worker(new URL('../worker-entry.js', import.meta.url), { type: 'module' })),
          logger: this.logger
        });
        this.pipeline = worker;
        this.updateTargetDimensions(canvas.clientWidth, canvas.clientHeight);
        await worker.initialize(canvas, {
          nativeWidth: nativeResolution.width,
          nativeHeight: nativeResolution.height,
          targetWidth: this.targetWidth,
          targetHeight: this.targetHeight,
          presetId: preset.id
        });
        this.logger.info('Render worker ready (backend: webgpu)');
      }
      this.pipeline?.setBrightness(brightness);
    } catch (error) {
      this.logger.error(`Failed to initialize ${this.backend} renderer:`, error);
      throw error;
    }
  }

  private updateTargetDimensions(width: number, height: number): void {
    const native = this.options.nativeResolution;
    const scale = width <= 0 || height <= 0 ? 1 : Math.max(1, Math.floor(Math.min(width / native.width, height / native.height)));
    this.targetWidth = native.width * scale;
    this.targetHeight = native.height * scale;
  }

  async renderFrame(video: HTMLVideoElement): Promise<void> {
    if (this.active && video.readyState >= video.HAVE_CURRENT_DATA) await this.pipeline?.renderFrame(video);
  }

  resize(width: number, height: number): void {
    if (this.backend === 'canvas2d') {
      const dpr = window.devicePixelRatio || 1;
      this.pipeline?.resize(Math.round(width * dpr), Math.round(height * dpr));
    } else {
      this.updateTargetDimensions(width, height);
      this.pipeline?.resize(this.targetWidth, this.targetHeight);
    }
  }

  setPreset(presetId: string): void { this.pipeline?.setPreset(resolvePreset(presetId)); }
  setBrightness(value: number): void { this.pipeline?.setBrightness(value); }
  getTargetDimensions(): { width: number; height: number } { return { width: this.targetWidth, height: this.targetHeight }; }

  async captureFrame(): Promise<ImageBitmap> {
    if (!this.active || !this.pipeline) throw new Error('Session is not active');
    return this.pipeline.captureFrame();
  }

  terminate(): void {
    this.active = false;
    void this.pipeline?.dispose().catch((error) => this.logger.error('Failed to dispose renderer:', error));
    this.pipeline = null;
  }
}

export async function createGpuVideoRendererSession(options: GpuVideoRendererSessionOptions): Promise<GpuVideoRendererSession> {
  const session = new DefaultGpuVideoRendererSession(options);
  const abort = () => session.terminate();
  options.signal?.addEventListener('abort', abort, { once: true });
  try {
    options.signal?.throwIfAborted();
    await session.initialize();
    options.signal?.throwIfAborted();
    return session;
  } catch (error) {
    session.terminate();
    throw error;
  } finally {
    options.signal?.removeEventListener('abort', abort);
  }
}
