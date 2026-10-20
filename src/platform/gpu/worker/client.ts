import type { RenderWorkerConfig, RenderWorkerRequest, RenderWorkerResponse } from './render-worker.contract';

export type WorkerClientLogger = Pick<Console, 'debug' | 'error' | 'info'>;

export type WorkerRendererClientDependencies = {
  createWorker: () => Worker;
  logger?: WorkerClientLogger;
};

type ResponseType = RenderWorkerResponse['type'];

type ResponseHandler<K extends ResponseType> = (response: Extract<RenderWorkerResponse, { type: K }>) => void;

export class WorkerRendererClient {
  private readonly createWorker: () => Worker;
  private readonly logger: WorkerClientLogger;
  private worker: Worker | null = null;
  private isWorkerReady = false;
  private wasCanvasTransferred = false;
  private readonly messageHandlers = new Map<ResponseType, (response: RenderWorkerResponse) => void>();
  private readyResolve: (() => void) | null = null;
  private readyReject: ((error: Error) => void) | null = null;
  private readyTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor({ createWorker, logger = console }: WorkerRendererClientDependencies) {
    this.createWorker = createWorker;
    this.logger = logger;
  }

  isReady(): boolean {
    return this.isWorkerReady;
  }

  isCanvasTransferred(): boolean {
    return this.wasCanvasTransferred;
  }

  async initialize(
    canvasElement: HTMLCanvasElement,
    config: RenderWorkerConfig,
    timeout = 5000
  ): Promise<void> {
    const offscreenCanvas = canvasElement.transferControlToOffscreen();
    this.wasCanvasTransferred = true;

    this.worker = this.createWorker();
    this.worker.onmessage = (event: MessageEvent<RenderWorkerResponse>) => this.handleMessage(event.data);
    this.worker.onerror = (error) => this.handleError(error);

    const init: RenderWorkerRequest = { type: 'init', canvas: offscreenCanvas, config };
    this.worker.postMessage(init, [offscreenCanvas]);
    await this.waitForReady(timeout);

    this.logger.info('Worker initialized with webgpu');
  }

  private waitForReady(timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
      this.readyTimeoutId = setTimeout(() => {
        const rejectReady = this.readyReject;
        this.readyResolve = null;
        this.readyReject = null;
        this.readyTimeoutId = null;
        rejectReady?.(new Error('Worker initialization timed out'));
      }, timeout);
    });
  }

  private handleMessage(response: RenderWorkerResponse): void {
    if (response.type === 'ready') {
      this.isWorkerReady = true;
      this.resolveReady();
      this.logger.info('Worker ready (backend: webgpu)');
    } else if (response.type === 'error') {
      this.logger.error('Worker error:', response.message);
      this.isWorkerReady = false;
      this.rejectReady(new Error(response.message));
    }

    this.messageHandlers.get(response.type)?.(response);
  }

  private handleError(error: ErrorEvent): void {
    this.logger.error('Worker error:', error.message);
    this.isWorkerReady = false;
    this.rejectReady(new Error(error.message));
  }

  private rejectReady(error: Error): void {
    this.clearReadyTimeout();
    const rejectReady = this.readyReject;

    this.readyResolve = null;
    this.readyReject = null;
    rejectReady?.(error);
  }

  private resolveReady(): void {
    this.clearReadyTimeout();

    this.readyResolve?.();
    this.readyResolve = null;
    this.readyReject = null;
  }

  private clearReadyTimeout(): void {
    if (this.readyTimeoutId) {
      clearTimeout(this.readyTimeoutId);
      this.readyTimeoutId = null;
    }
  }

  private send(request: RenderWorkerRequest, transfer: Transferable[] = []): boolean {
    if (!this.isWorkerReady || !this.worker) {
      return false;
    }

    this.worker.postMessage(request, transfer);
    return true;
  }

  renderFrame(bitmap: ImageBitmap): boolean {
    return this.send({ type: 'frame', bitmap }, [bitmap]);
  }

  setBrightness(brightness: number): boolean {
    return this.send({ type: 'setBrightness', brightness });
  }

  setPreset(presetId: string): boolean {
    return this.send({ type: 'setPreset', presetId });
  }

  resize(width: number, height: number): boolean {
    return this.send({ type: 'resize', width, height });
  }

  requestCapture(): boolean {
    return this.send({ type: 'capture' });
  }

  onMessage<K extends ResponseType>(type: K, handler: ResponseHandler<K>): () => void {
    this.messageHandlers.set(type, handler as (response: RenderWorkerResponse) => void);

    return () => {
      this.messageHandlers.delete(type);
    };
  }

  terminate(): void {
    this.rejectReady(new Error('Worker terminated before initialization completed'));

    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;
      this.worker.terminate();
      this.worker = null;
    }

    this.isWorkerReady = false;
    this.messageHandlers.clear();
    this.wasCanvasTransferred = false;

    this.logger.info('Worker terminated');
  }
}
