import { Service } from '@prismgb/core';
import {
  WorkerMessageType,
  WorkerResponseType,
  createWorkerMessage,
  isValidWorkerResponse
} from '@renderer/infrastructure/rendering/workers/worker-protocol.config';
import { DisposableBag } from '@prismgb/core';
import type {
  WorkerMessageTypeValue,
  WorkerMessagePayloadMap,
  WorkerRendererConfig,
  WorkerResponsePayloadMap,
  WorkerResponseTypeValue,
  WorkerResponse
} from '@renderer/infrastructure/rendering/workers/worker-protocol.config';

import type {
  LoggerFactoryLike,
  LoggerLike,
  EventBusLike
} from '@prismgb/core';

export type WorkerCapabilities = Record<string, unknown>;

type GpuWorkerManagerDependencies = {
  loggerFactory?: LoggerFactoryLike;
  eventBus: EventBusLike;
};

type WorkerResponseHandler<K extends WorkerResponseTypeValue> = (
  payload: WorkerResponsePayloadMap[K]
) => void;

type AnyWorkerResponseHandler = (
  payload: WorkerResponsePayloadMap[WorkerResponseTypeValue]
) => void;

const READY_TIMEOUT_LIFECYCLE = Symbol('gpuWorkerReadyTimeout');

@Service({
  "token": "gpuWorkerManager",
  "disposal": "dispose"
})
export class GpuWorkerManager {
  _logger: LoggerLike;
  _eventBus: EventBusLike;
  _worker: Worker | null;
  _isReady: boolean;
  _capabilities: WorkerCapabilities | null;
  _canvas: HTMLCanvasElement | null;
  _offscreenCanvas: OffscreenCanvas | null;
  _wasCanvasTransferred: boolean;
  _messageHandlers: Map<WorkerResponseTypeValue, AnyWorkerResponseHandler>;
  _readyResolve: (() => void) | null;
  _readyReject: ((error: Error) => void) | null;
  private readonly _disposables: DisposableBag;

  constructor({ loggerFactory, eventBus }: GpuWorkerManagerDependencies) {
    this._logger = loggerFactory?.create('GpuWorkerManager') ?? console;
    this._eventBus = eventBus;

    this._worker = null;
    this._isReady = false;
    this._capabilities = null;

    this._canvas = null;
    this._offscreenCanvas = null;
    this._wasCanvasTransferred = false;

    this._messageHandlers = new Map();

    this._readyResolve = null;
    this._readyReject = null;
    this._disposables = new DisposableBag();
  }

  isReady(): boolean {
    return this._isReady;
  }

  getCapabilities(): WorkerCapabilities | null {
    return this._capabilities;
  }

  isCanvasTransferred(): boolean {
    return this._wasCanvasTransferred;
  }

  async initialize(
    canvasElement: HTMLCanvasElement,
    config: WorkerRendererConfig,
    timeout = 5000
  ): Promise<boolean> {
    // Check if we can reuse existing setup
    if (this._canvas === canvasElement && this._wasCanvasTransferred) {
      if (this._worker && this._isReady) {
        this._logger?.info('Reusing existing worker setup');
        return true;
      }

      if (this._worker && !this._isReady) {
        // Worker exists but not ready - send reinit
        return this._reinitialize(config, timeout);
      }

      // Canvas transferred but worker gone - unrecoverable
      this._logger?.error('Canvas was transferred but worker terminated');
      return false;
    }

    this._canvas = canvasElement;
    this._offscreenCanvas = canvasElement.transferControlToOffscreen();
    this._wasCanvasTransferred = true;

    this._worker = new Worker(
      new URL('../../rendering/workers/render.worker.ts', import.meta.url),
      { type: 'module' }
    );

    this._worker.onmessage = (event) => this._handleMessage(event);
    this._worker.onerror = (error) => this._handleError(error);

    const message = createWorkerMessage(WorkerMessageType.INIT, {
      canvas: this._offscreenCanvas,
      config
    });
    this._worker.postMessage(message, [this._offscreenCanvas]);

    await this._waitForReady(timeout);

    this._logger?.info(`Worker initialized with ${config.api}`);
    return true;
  }

  async _reinitialize(config: WorkerRendererConfig, timeout: number): Promise<boolean> {
    if (!this._worker) {
      throw new Error('Worker not available for reinitialization');
    }

    const message = createWorkerMessage(WorkerMessageType.INIT, { config });
    this._worker.postMessage(message);
    await this._waitForReady(timeout);
    return true;
  }

  _waitForReady(timeout: number): Promise<void> {
    if (this._isReady) {
      return Promise.resolve();
    }

    if (this._readyReject) {
      this._rejectReady(new Error('Worker initialization superseded'));
    }

    return new Promise((resolve, reject) => {
      this._readyResolve = resolve;
      this._readyReject = reject;

      const readyTimeoutId = setTimeout(() => {
        this._disposables.cancel(READY_TIMEOUT_LIFECYCLE);
        const rejectReady = this._readyReject;
        this._readyResolve = null;
        this._readyReject = null;
        rejectReady?.(new Error('Worker initialization timed out'));
      }, timeout);
      this._disposables.replace(READY_TIMEOUT_LIFECYCLE, () => clearTimeout(readyTimeoutId));
    });
  }

  _handleMessage(event: MessageEvent<unknown>): void {
    const response = event.data;
    if (!isValidWorkerResponse(response)) {
      this._logger?.error('Invalid worker response:', response);
      return;
    }

    switch (response.type) {
      case WorkerResponseType.READY:
        this._isReady = true;
        this._capabilities = response.payload;
        this._resolveReady();
        this._logger?.info(`Worker ready (API: ${response.payload.api})`);
        this._dispatchMessage(response);
        break;

      case WorkerResponseType.ERROR:
        this._logger?.error('Worker error:', response.payload.message);
        this._isReady = false;
        if (this._readyReject) {
          this._rejectReady(new Error(response.payload.message));
        }
        this._dispatchMessage(response);
        break;

      default:
        this._dispatchMessage(response);
    }
  }

  _dispatchMessage<K extends WorkerResponseTypeValue>(response: WorkerResponse<K>): void {
    const handler = this._messageHandlers.get(response.type);
    if (handler) {
      handler(response.payload);
    }
  }

  _handleError(error: ErrorEvent): void {
    this._logger?.error('Worker error:', error.message);
    this._isReady = false;

    if (this._readyReject) {
      this._rejectReady(new Error(error.message));
    }
  }

  _rejectReady(error: Error): void {
    this._disposables.cancel(READY_TIMEOUT_LIFECYCLE);

    const rejectReady = this._readyReject;

    this._readyResolve = null;
    this._readyReject = null;
    rejectReady?.(error);
  }

  _resolveReady(): void {
    this._disposables.cancel(READY_TIMEOUT_LIFECYCLE);

    if (this._readyResolve) {
      this._readyResolve();
      this._readyResolve = null;
      this._readyReject = null;
    }
  }

  sendCommand<K extends WorkerMessageTypeValue>(
    type: K,
    payload?: WorkerMessagePayloadMap[K],
    transferables: Transferable[] = []
  ): void {
    if (!this._isReady || !this._worker) {
      throw new Error('Worker not ready');
    }

    const message = createWorkerMessage(type, payload);

    if (transferables.length > 0) {
      this._worker.postMessage(message, transferables);
    } else {
      this._worker.postMessage(message);
    }
  }

  onMessage<K extends WorkerResponseTypeValue>(
    type: K,
    handler: WorkerResponseHandler<K>
  ): () => void {
    this._messageHandlers.set(type, handler as AnyWorkerResponseHandler);

    return () => {
      this._messageHandlers.delete(type);
    };
  }

  releaseResources(): void {
    if (!this._worker) {
      this._logger?.debug('releaseResources: No worker to release');
      return;
    }

    this._worker.postMessage(createWorkerMessage(WorkerMessageType.RELEASE));
    this._isReady = false;

    this._logger?.info('GPU resources released (worker kept alive)');
  }

  terminate(): void {
    this._rejectReady(new Error('Worker terminated before initialization completed'));

    if (this._worker) {
      this._worker.onmessage = null;
      this._worker.onerror = null;

      this._worker.postMessage(createWorkerMessage(WorkerMessageType.DESTROY));
      this._worker.terminate();
      this._worker = null;
    }

    this._isReady = false;
    this._messageHandlers.clear();
    this._canvas = null;
    this._offscreenCanvas = null;
    this._wasCanvasTransferred = false;

    this._logger?.info('Worker terminated');
  }

  async dispose(): Promise<void> {
    this.terminate();
    await this._disposables.clear();
  }
}
