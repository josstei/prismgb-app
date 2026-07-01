import {
  WorkerMessageType,
  WorkerResponseType,
  createWorkerMessage,
  isValidWorkerResponse,
  type FramePayload,
  type PresetPayload,
  type ResizePayload,
  type WorkerMessagePayloadMap,
  type WorkerMessageTypeValue,
  type WorkerRendererConfig,
  type WorkerResponse,
  type WorkerResponsePayloadMap,
  type WorkerResponseTypeValue
} from './protocol';

export type WorkerClientLogger = Pick<Console, 'debug' | 'error' | 'info'>;

export type WorkerRendererClientDependencies = {
  createWorker: () => Worker;
  logger?: WorkerClientLogger;
};

type WorkerResponseHandler<K extends WorkerResponseTypeValue> = (
  payload: WorkerResponsePayloadMap[K]
) => void;

type AnyWorkerResponseHandler = (
  payload: WorkerResponsePayloadMap[WorkerResponseTypeValue]
) => void;

export class WorkerRendererClient {
  private readonly createWorker: () => Worker;
  private readonly logger: WorkerClientLogger;
  private worker: Worker | null = null;
  private isWorkerReady = false;
  private canvas: HTMLCanvasElement | null = null;
  private offscreenCanvas: OffscreenCanvas | null = null;
  private wasCanvasTransferred = false;
  private readonly messageHandlers = new Map<WorkerResponseTypeValue, AnyWorkerResponseHandler>();
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
    config: WorkerRendererConfig,
    timeout = 5000
  ): Promise<boolean> {
    if (this.canvas === canvasElement && this.wasCanvasTransferred) {
      if (this.worker && this.isWorkerReady) {
        this.logger.info('Reusing existing worker setup');
        return true;
      }

      if (this.worker && !this.isWorkerReady) {
        return this.reinitialize(config, timeout);
      }

      this.logger.error('Canvas was transferred but worker terminated');
      return false;
    }

    this.canvas = canvasElement;
    this.offscreenCanvas = canvasElement.transferControlToOffscreen();
    this.wasCanvasTransferred = true;

    this.worker = this.createWorker();
    this.worker.onmessage = (event) => this.handleMessage(event);
    this.worker.onerror = (error) => this.handleError(error);

    this.worker.postMessage(createWorkerMessage(WorkerMessageType.INIT, {
      canvas: this.offscreenCanvas,
      config
    }), [this.offscreenCanvas]);

    await this.waitForReady(timeout);

    this.logger.info(`Worker initialized with ${config.backend}`);
    return true;
  }

  private async reinitialize(config: WorkerRendererConfig, timeout: number): Promise<boolean> {
    if (!this.worker) {
      throw new Error('Worker not available for reinitialization');
    }

    this.worker.postMessage(createWorkerMessage(WorkerMessageType.INIT, { config }));
    await this.waitForReady(timeout);
    return true;
  }

  private waitForReady(timeout: number): Promise<void> {
    if (this.isWorkerReady) {
      return Promise.resolve();
    }

    if (this.readyReject) {
      this.rejectReady(new Error('Worker initialization superseded'));
    }

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

  private handleMessage(event: MessageEvent<unknown>): void {
    const response = event.data;
    if (!isValidWorkerResponse(response)) {
      this.logger.error('Invalid worker response:', response);
      return;
    }

    switch (response.type) {
      case WorkerResponseType.READY:
        this.isWorkerReady = true;
        this.resolveReady();
        this.logger.info(`Worker ready (backend: ${response.payload.backend})`);
        this.dispatchMessage(response);
        break;

      case WorkerResponseType.ERROR:
        this.logger.error('Worker error:', response.payload.message);
        this.isWorkerReady = false;
        if (this.readyReject) {
          this.rejectReady(new Error(response.payload.message));
        }
        this.dispatchMessage(response);
        break;

      default:
        this.dispatchMessage(response);
    }
  }

  private dispatchMessage<K extends WorkerResponseTypeValue>(response: WorkerResponse<K>): void {
    const handler = this.messageHandlers.get(response.type);
    handler?.(response.payload);
  }

  private handleError(error: ErrorEvent): void {
    this.logger.error('Worker error:', error.message);
    this.isWorkerReady = false;

    if (this.readyReject) {
      this.rejectReady(new Error(error.message));
    }
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

  sendCommand<K extends WorkerMessageTypeValue>(
    type: K,
    payload?: WorkerMessagePayloadMap[K],
    transferables: Transferable[] = []
  ): boolean {
    if (!this.isWorkerReady || !this.worker) {
      return false;
    }

    const message = createWorkerMessage(type, payload);

    if (transferables.length > 0) {
      this.worker.postMessage(message, transferables);
    } else {
      this.worker.postMessage(message);
    }

    return true;
  }

  renderFrame(imageBitmap: ImageBitmap, uniforms: FramePayload['uniforms']): boolean {
    return this.sendCommand(WorkerMessageType.FRAME, { imageBitmap, uniforms }, [imageBitmap]);
  }

  setPreset(presetId: string, preset: PresetPayload['preset']): boolean {
    return this.sendCommand(WorkerMessageType.SET_PRESET, { presetId, preset });
  }

  resize(width: number, height: number, scaleFactor: number): boolean {
    const payload: ResizePayload = { width, height, scaleFactor };
    return this.sendCommand(WorkerMessageType.RESIZE, payload);
  }

  requestCapture(): boolean {
    return this.sendCommand(WorkerMessageType.REQUEST_CAPTURE);
  }

  requestCapturedFrame(): boolean {
    return this.sendCommand(WorkerMessageType.CAPTURE);
  }

  onMessage<K extends WorkerResponseTypeValue>(
    type: K,
    handler: WorkerResponseHandler<K>
  ): () => void {
    this.messageHandlers.set(type, handler as AnyWorkerResponseHandler);

    return () => {
      this.messageHandlers.delete(type);
    };
  }

  onReady(handler: WorkerResponseHandler<typeof WorkerResponseType.READY>): () => void {
    return this.onMessage(WorkerResponseType.READY, handler);
  }

  onFrameRendered(handler: WorkerResponseHandler<typeof WorkerResponseType.FRAME_RENDERED>): () => void {
    return this.onMessage(WorkerResponseType.FRAME_RENDERED, handler);
  }

  onStats(handler: WorkerResponseHandler<typeof WorkerResponseType.STATS>): () => void {
    return this.onMessage(WorkerResponseType.STATS, handler);
  }

  onError(handler: WorkerResponseHandler<typeof WorkerResponseType.ERROR>): () => void {
    return this.onMessage(WorkerResponseType.ERROR, handler);
  }

  onCaptureRequested(handler: WorkerResponseHandler<typeof WorkerResponseType.CAPTURE_REQUESTED>): () => void {
    return this.onMessage(WorkerResponseType.CAPTURE_REQUESTED, handler);
  }

  onCaptureReady(handler: WorkerResponseHandler<typeof WorkerResponseType.CAPTURE_READY>): () => void {
    return this.onMessage(WorkerResponseType.CAPTURE_READY, handler);
  }

  onReleased(handler: WorkerResponseHandler<typeof WorkerResponseType.RELEASED>): () => void {
    return this.onMessage(WorkerResponseType.RELEASED, handler);
  }

  onDestroyed(handler: WorkerResponseHandler<typeof WorkerResponseType.DESTROYED>): () => void {
    return this.onMessage(WorkerResponseType.DESTROYED, handler);
  }

  releaseResources(): void {
    if (!this.worker) {
      this.logger.debug('releaseResources: No worker to release');
      return;
    }

    this.worker.postMessage(createWorkerMessage(WorkerMessageType.RELEASE));
    this.isWorkerReady = false;

    this.logger.info('GPU resources released (worker kept alive)');
  }

  terminate(): void {
    this.rejectReady(new Error('Worker terminated before initialization completed'));

    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;

      this.worker.postMessage(createWorkerMessage(WorkerMessageType.DESTROY));
      this.worker.terminate();
      this.worker = null;
    }

    this.isWorkerReady = false;
    this.messageHandlers.clear();
    this.canvas = null;
    this.offscreenCanvas = null;
    this.wasCanvasTransferred = false;

    this.logger.info('Worker terminated');
  }

  dispose(): void {
    this.terminate();
  }
}
