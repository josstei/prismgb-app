import type { RenderPreset } from '../domain/types';
import {
  createWorkerMessage, isValidWorkerResponse,
  type WorkerMessage, type WorkerRendererConfig, type WorkerErrorPayload
} from './protocol';

type WorkerClientLogger = Pick<Console, 'error' | 'info'>;
type CaptureRequest = ReturnType<typeof Promise.withResolvers<ImageBitmap>> & {
  id: number;
  timeout: ReturnType<typeof setTimeout>;
};

/** Owns worker readiness, frame transfers and correlated capture for one canvas. */
export class WorkerRendererClient {
  private worker: Worker | null = null;
  private ready = false;
  private started = false;
  private readyWaiter: ReturnType<typeof Promise.withResolvers<void>> | null = null;
  private readyTimeout: ReturnType<typeof setTimeout> | null = null;
  private pendingFrames = 0;
  private imageBitmapOptions: ImageBitmapOptions = {};
  private captureSequence = 0;
  private capture: CaptureRequest | null = null;

  constructor(private readonly dependencies: { createWorker: () => Worker; logger: WorkerClientLogger }) {}

  async initialize(canvas: HTMLCanvasElement, config: WorkerRendererConfig, timeout = 5000): Promise<void> {
    if (this.started) throw new Error('Worker client is single-use');
    this.started = true;
    this.imageBitmapOptions = {
      resizeWidth: config.nativeWidth,
      resizeHeight: config.nativeHeight,
      resizeQuality: 'medium',
      colorSpaceConversion: 'none'
    };
    try {
      this.worker = this.dependencies.createWorker();
      this.worker.onmessage = (event) => this.handleMessage(event.data);
      this.worker.onerror = (event) => this.handleError({ message: event.message });
      const offscreen = canvas.transferControlToOffscreen();
      const waiter = Promise.withResolvers<void>();
      this.readyWaiter = waiter;
      void waiter.promise.catch(() => undefined);
      this.readyTimeout = setTimeout(() => this.handleError({ message: 'Worker initialization timed out' }), timeout);
      this.worker.postMessage(createWorkerMessage('init', { canvas: offscreen, config }), [offscreen]);
      await waiter.promise;
    } catch (error) {
      await this.dispose();
      throw error;
    }
  }

  private handleMessage(response: unknown): void {
    if (!isValidWorkerResponse(response)) {
      this.dependencies.logger.error('Invalid worker response:', response);
      return;
    }
    switch (response.type) {
      case 'ready':
        this.ready = true;
        this.settleReady();
        return;
      case 'frameRendered':
        this.pendingFrames = Math.max(0, this.pendingFrames - 1);
        return;
      case 'error':
        this.handleError(response.payload);
        return;
      case 'captureReady':
        if (response.payload.requestId === this.capture?.id) {
          this.settleCapture(response.payload.bitmap);
        } else {
          response.payload.bitmap.close();
        }
    }
  }

  private handleError(error: WorkerErrorPayload): void {
    this.dependencies.logger.error('Worker error:', error.message);
    if (error.requestId !== undefined) {
      if (error.requestId === this.capture?.id) this.settleCapture(null, new Error(error.message));
      return;
    }
    this.ready = false;
    this.pendingFrames = 0;
    this.settleReady(new Error(error.message));
    this.settleCapture(null, new Error(error.message));
  }

  private settleReady(error?: Error): void {
    if (this.readyTimeout !== null) clearTimeout(this.readyTimeout);
    this.readyTimeout = null;
    const waiter = this.readyWaiter;
    this.readyWaiter = null;
    if (error) waiter?.reject(error); else waiter?.resolve();
  }

  private send(message: WorkerMessage, transfer: Transferable[] = []): boolean {
    if (!this.ready || !this.worker) return false;
    this.worker.postMessage(message, transfer);
    return true;
  }

  async renderFrame(video: HTMLVideoElement): Promise<void> {
    if (!this.ready || this.pendingFrames >= 2) return;
    this.pendingFrames++;
    let bitmap: ImageBitmap | null = null;
    let transferred = false;
    try {
      bitmap = await createImageBitmap(video, this.imageBitmapOptions);
      transferred = this.send(createWorkerMessage('frame', { imageBitmap: bitmap }), [bitmap]);
    } catch (error) {
      this.dependencies.logger.error('Failed to render frame in worker:', error);
    } finally {
      if (!transferred) {
        bitmap?.close();
        this.pendingFrames = Math.max(0, this.pendingFrames - 1);
      }
    }
  }

  setBrightness(brightness: number): void { this.send(createWorkerMessage('setBrightness', { brightness })); }
  setPreset(preset: RenderPreset): void { this.send(createWorkerMessage('setPreset', { presetId: preset.id })); }
  resize(width: number, height: number): void { this.send(createWorkerMessage('resize', { width, height })); }

  async captureFrame(): Promise<ImageBitmap> {
    if (!this.ready) throw new Error('Worker renderer client not ready');
    if (this.capture) throw new Error('Capture already in progress');
    const deferred = Promise.withResolvers<ImageBitmap>();
    const id = ++this.captureSequence;
    this.capture = {
      ...deferred,
      id,
      timeout: setTimeout(() => this.settleCapture(null, new Error('Capture request timed out')), 1000)
    };
    try {
      if (!this.send(createWorkerMessage('capture', { requestId: id }))) {
        this.settleCapture(null, new Error('Worker renderer client not ready'));
      }
    } catch (error) {
      this.settleCapture(null, error instanceof Error ? error : new Error(String(error)));
    }
    return deferred.promise;
  }

  private settleCapture(bitmap: ImageBitmap | null, error?: Error): void {
    const capture = this.capture;
    this.capture = null;
    if (!capture) { bitmap?.close(); return; }
    clearTimeout(capture.timeout);
    if (error) capture.reject(error); else if (bitmap) capture.resolve(bitmap);
  }

  async dispose(): Promise<void> {
    this.ready = false;
    this.settleReady(new Error('Worker terminated before initialization completed'));
    this.settleCapture(null, new Error('Session terminated'));
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;
      this.worker.terminate();
      this.worker = null;
    }
  }
}
