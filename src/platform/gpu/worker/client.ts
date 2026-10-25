import {
  WorkerMessageType, WorkerResponseType, createWorkerMessage, isValidWorkerResponse,
  type PresetPayload, type WorkerMessage, type WorkerRendererConfig, type WorkerResponse,
  type WorkerResponsePayloadMap, type WorkerResponseTypeValue
} from './protocol';

export type WorkerClientLogger = Pick<Console, 'debug' | 'error' | 'info'>;
export type WorkerRendererClientDependencies = { createWorker: () => Worker; logger?: WorkerClientLogger };
type Handler<K extends WorkerResponseTypeValue> = (payload: WorkerResponsePayloadMap[K]) => void;

/** One client owns one transferred canvas and one worker for their entire lifetime. */
export class WorkerRendererClient {
  private worker: Worker | null = null;
  private ready = false;
  private started = false;
  private readonly handlers = new Map<WorkerResponseTypeValue, (payload: unknown) => void>();
  private readyWaiter: ReturnType<typeof Promise.withResolvers<void>> | null = null;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private readonly createWorker: () => Worker;
  private readonly logger: WorkerClientLogger;

  constructor({ createWorker, logger = console }: WorkerRendererClientDependencies) {
    this.createWorker = createWorker;
    this.logger = logger;
  }
  isReady(): boolean { return this.ready; }

  async initialize(canvas: HTMLCanvasElement, config: WorkerRendererConfig, timeout = 5000): Promise<void> {
    if (this.started) throw new Error('Worker client is single-use');
    this.started = true;
    try {
      this.worker = this.createWorker();
      this.worker.onmessage = (event) => this.handleMessage(event.data);
      this.worker.onerror = (event) => this.handleError({ message: event.message, code: 'WORKER_FAILED' });
      const offscreen = canvas.transferControlToOffscreen();
      const waiter = Promise.withResolvers<void>();
      this.readyWaiter = waiter;
      void waiter.promise.catch(() => undefined);
      this.timeout = setTimeout(() => this.handleError({ message: 'Worker initialization timed out', code: 'INIT_FAILED' }), timeout);
      this.worker.postMessage(createWorkerMessage(WorkerMessageType.INIT, { canvas: offscreen, config }), [offscreen]);
      await waiter.promise;
    } catch (error) {
      this.terminate();
      throw error;
    }
  }

  private handleMessage(response: unknown): void {
    if (!isValidWorkerResponse(response)) {
      this.logger.error('Invalid worker response:', response);
      return;
    }
    if (response.type === WorkerResponseType.READY) {
      this.ready = true;
      this.settleReady();
    } else if (response.type === WorkerResponseType.ERROR) {
      this.handleError(response.payload);
      return;
    }
    this.dispatch(response);
  }
  private handleError(error: WorkerResponsePayloadMap['error']): void {
    this.logger.error('Worker error:', error.message);
    if (error.requestId === undefined) this.ready = false;
    this.settleReady(new Error(error.message));
    this.handlers.get(WorkerResponseType.ERROR)?.(error);
  }
  private settleReady(error?: Error): void {
    if (this.timeout !== null) clearTimeout(this.timeout);
    this.timeout = null;
    const waiter = this.readyWaiter;
    this.readyWaiter = null;
    if (error) waiter?.reject(error); else waiter?.resolve();
  }
  private dispatch(response: WorkerResponse): void { this.handlers.get(response.type)?.(response.payload); }
  private send(message: WorkerMessage, transfer: Transferable[] = []): boolean {
    if (!this.ready || !this.worker) return false;
    this.worker.postMessage(message, transfer);
    return true;
  }
  renderFrame(imageBitmap: ImageBitmap): boolean { return this.send(createWorkerMessage(WorkerMessageType.FRAME, { imageBitmap }), [imageBitmap]); }
  setBrightness(brightness: number): boolean { return this.send(createWorkerMessage(WorkerMessageType.SET_BRIGHTNESS, { brightness })); }
  setPreset(preset: PresetPayload['preset']): boolean { return this.send(createWorkerMessage(WorkerMessageType.SET_PRESET, { preset })); }
  resize(width: number, height: number): boolean { return this.send(createWorkerMessage(WorkerMessageType.RESIZE, { width, height })); }
  requestCapture(requestId: number): boolean { return this.send(createWorkerMessage(WorkerMessageType.CAPTURE, { requestId })); }
  onMessage<K extends WorkerResponseTypeValue>(type: K, handler: Handler<K>): () => void {
    this.handlers.set(type, handler as (payload: unknown) => void);
    return () => this.handlers.delete(type);
  }
  onFrameRendered(handler: Handler<'frameRendered'>): () => void { return this.onMessage('frameRendered', handler); }
  onError(handler: Handler<'error'>): () => void { return this.onMessage('error', handler); }
  onCaptureReady(handler: Handler<'captureReady'>): () => void { return this.onMessage('captureReady', handler); }
  terminate(): void {
    this.settleReady(new Error('Worker terminated before initialization completed'));
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;
      this.worker.terminate();
      this.worker = null;
    }
    this.ready = false;
    this.handlers.clear();
  }
}
