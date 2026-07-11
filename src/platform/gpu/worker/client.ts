import * as Comlink from 'comlink';
import {
  CANVAS_HANDOFF_MESSAGE,
  WorkerMessageType,
  WorkerResponseType,
  createWorkerMessage,
  isControlPortMessage,
  isFrameToken,
  isFrameErrorResponse,
  isFrameRenderedResponse,
  isPerformanceHarnessBuild,
  isStatsResponse,
  type PresetPayload,
  type WorkerControlApi,
  type WorkerRendererConfig,
  type WorkerResponsePayloadMap,
  type WorkerResponseTypeValue,
  type WorkerStatsPayload
} from './protocol';

export type WorkerClientLogger = Pick<Console, 'debug' | 'error' | 'info'>;

export type WorkerRendererClientDependencies = {
  createWorker: () => Worker;
  logger?: WorkerClientLogger;
};

type WorkerResponseHandler<K extends WorkerResponseTypeValue> = (
  payload: WorkerResponsePayloadMap[K]
) => void;

type AnyHandler = (payload: unknown) => void;

export class WorkerRendererClient {
  private readonly createWorker: () => Worker;
  private readonly logger: WorkerClientLogger;
  private worker: Worker | null = null;
  private control: Comlink.Remote<WorkerControlApi> | null = null;
  private isWorkerReady = false;
  private canvas: HTMLCanvasElement | null = null;
  private offscreenCanvas: OffscreenCanvas | null = null;
  private wasCanvasTransferred = false;
  private readonly messageHandlers = new Map<WorkerResponseTypeValue, AnyHandler>();
  private controlPortPromise: Promise<Comlink.Remote<WorkerControlApi>> | null = null;
  private readonly pendingHarnessFrameTokens = new Set<number>();
  private lastHarnessFrameToken = 0;

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
    if (this.canvas === canvasElement && this.wasCanvasTransferred && this.worker && this.control) {
      return this.runInitialize(config, timeout);
    }

    this.canvas = canvasElement;
    this.offscreenCanvas = canvasElement.transferControlToOffscreen();
    this.wasCanvasTransferred = true;

    this.worker = this.createWorker();
    this.worker.onmessage = (event) => this.handleMainMessage(event);
    this.worker.onerror = (error) => this.handleError(error);

    this.controlPortPromise = new Promise<Comlink.Remote<WorkerControlApi>>((resolve) => {
      this.resolveControlPort = resolve;
    });

    this.worker.postMessage(
      { channel: CANVAS_HANDOFF_MESSAGE, canvas: this.offscreenCanvas },
      [this.offscreenCanvas]
    );

    this.control = await this.withTimeout(this.controlPortPromise, timeout);
    return this.runInitialize(config, timeout);
  }

  private resolveControlPort: ((proxy: Comlink.Remote<WorkerControlApi>) => void) | null = null;

  private async withTimeout<T>(operation: Promise<T>, timeout: number): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timer = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Worker initialization timed out')), timeout);
    });
    try {
      return await Promise.race([operation, timer]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  private async runInitialize(config: WorkerRendererConfig, timeout: number): Promise<boolean> {
    if (!this.control) {
      throw new Error('Worker control channel not available');
    }
    this.resetHarnessFrameTokens();
    try {
      const ready = await this.withTimeout(this.control.initialize(config), timeout);
      this.isWorkerReady = true;
      this.dispatch(WorkerResponseType.READY, ready);
      this.logger.info(`Worker initialized with ${ready.backend}`);
      return true;
    } catch (error) {
      this.isWorkerReady = false;
      const err = error instanceof Error ? error : new Error(String(error));
      this.dispatch(WorkerResponseType.ERROR, { message: err.message });
      throw err;
    }
  }

  private resetHarnessFrameTokens(): void {
    this.pendingHarnessFrameTokens.clear();
    this.lastHarnessFrameToken = 0;
  }

  private handleMainMessage(event: MessageEvent<unknown>): void {
    const data = event.data;
    if (isControlPortMessage(data)) {
      const proxy = Comlink.wrap<WorkerControlApi>(data.port);
      this.resolveControlPort?.(proxy);
      this.resolveControlPort = null;
      return;
    }
    if (isFrameRenderedResponse(data)) {
      if (isPerformanceHarnessBuild) {
        const acknowledgement = data.payload;
        if (!acknowledgement || !this.pendingHarnessFrameTokens.delete(acknowledgement.frameToken)) {
          this.logger.error('Worker frame acknowledgement used an unknown frame token');
          return;
        }
        this.dispatch(WorkerResponseType.FRAME_RENDERED, acknowledgement);
        return;
      }
      this.dispatch(WorkerResponseType.FRAME_RENDERED, undefined);
      return;
    }
    if (
      isPerformanceHarnessBuild &&
      typeof data === 'object' &&
      data !== null &&
      (data as { type?: unknown }).type === WorkerResponseType.FRAME_RENDERED
    ) {
      this.logger.error('Worker frame acknowledgement did not match the harness protocol');
      return;
    }
    if (isStatsResponse(data)) {
      this.dispatch(WorkerResponseType.STATS, data.payload as WorkerStatsPayload);
      return;
    }
    if (isFrameErrorResponse(data)) {
      this.dispatch(WorkerResponseType.ERROR, data.payload);
    }
  }

  private handleError(error: ErrorEvent): void {
    this.logger.error('Worker error:', error.message);
    this.isWorkerReady = false;
    this.dispatch(WorkerResponseType.ERROR, { message: error.message });
  }

  private dispatch(type: WorkerResponseTypeValue, payload: unknown): void {
    this.messageHandlers.get(type)?.(payload);
  }

  private fireAndForget(operation: Promise<unknown>): void {
    operation.catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Worker control error:', message);
      this.dispatch(WorkerResponseType.ERROR, { message });
    });
  }

  renderFrame(imageBitmap: ImageBitmap, frameToken?: number): boolean {
    if (!this.isWorkerReady || !this.worker) {
      return false;
    }

    if (isPerformanceHarnessBuild) {
      if (
        !isFrameToken(frameToken) ||
        frameToken <= this.lastHarnessFrameToken ||
        this.pendingHarnessFrameTokens.has(frameToken)
      ) {
        this.logger.error('Worker frame token must be a new positive monotonic value');
        return false;
      }

      this.pendingHarnessFrameTokens.add(frameToken);
      try {
        this.worker.postMessage(
          createWorkerMessage(WorkerMessageType.FRAME, { imageBitmap, frameToken }),
          [imageBitmap]
        );
      } catch (error) {
        this.pendingHarnessFrameTokens.delete(frameToken);
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error('Worker frame post failed:', message);
        return false;
      }
      this.lastHarnessFrameToken = frameToken;
      return true;
    }

    this.worker.postMessage(createWorkerMessage(WorkerMessageType.FRAME, { imageBitmap }), [imageBitmap]);
    return true;
  }

  setBrightness(brightness: number): boolean {
    if (!this.isWorkerReady || !this.control) return false;
    this.fireAndForget(this.control.setBrightness(brightness));
    return true;
  }

  setPreset(presetId: string, preset: PresetPayload['preset']): boolean {
    if (!this.isWorkerReady || !this.control) return false;
    this.fireAndForget(this.control.setPreset({ presetId, preset }));
    return true;
  }

  resize(width: number, height: number, scaleFactor: number): boolean {
    if (!this.isWorkerReady || !this.control) return false;
    this.fireAndForget(this.control.resize({ width, height, scaleFactor }));
    return true;
  }

  requestCapture(): boolean {
    if (!this.isWorkerReady || !this.control) return false;
    this.fireAndForget(this.control.requestCapture());
    return true;
  }

  requestCapturedFrame(): boolean {
    if (!this.isWorkerReady || !this.control) return false;
    this.control
      .getCapturedFrame()
      .then((result) => this.dispatch(WorkerResponseType.CAPTURE_READY, result))
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.dispatch(WorkerResponseType.ERROR, { message });
      });
    return true;
  }

  onMessage<K extends WorkerResponseTypeValue>(type: K, handler: WorkerResponseHandler<K>): () => void {
    this.messageHandlers.set(type, handler as AnyHandler);
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
    if (!this.control) {
      this.logger.debug('releaseResources: No worker to release');
      return;
    }
    this.fireAndForget(this.control.release());
    this.resetHarnessFrameTokens();
    this.isWorkerReady = false;
    this.logger.info('GPU resources released (worker kept alive)');
  }

  terminate(): void {
    if (this.control) {
      this.fireAndForget(this.control.destroy());
      this.control[Comlink.releaseProxy]?.();
      this.control = null;
    }
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;
      this.worker.terminate();
      this.worker = null;
    }
    this.isWorkerReady = false;
    this.resetHarnessFrameTokens();
    this.messageHandlers.clear();
    this.canvas = null;
    this.offscreenCanvas = null;
    this.wasCanvasTransferred = false;
    this.controlPortPromise = null;
    this.logger.info('Worker terminated');
  }

  dispose(): void {
    this.terminate();
  }
}
