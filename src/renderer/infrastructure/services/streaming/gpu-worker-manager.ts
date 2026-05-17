/**
 * GpuWorkerManager
 *
 * Manages the lifecycle of the GPU render worker.
 * Handles worker creation, message routing, capability detection,
 * and graceful termination.
 */

import {
  WorkerMessageType,
  WorkerResponseType,
  createWorkerMessage,
  isValidWorkerResponse
} from '@renderer/infrastructure/rendering/workers/worker-protocol.config';
import type {
  WorkerMessagePayloadMap,
  WorkerRendererConfig,
  WorkerResponsePayloadMap,
  WorkerResponseType as WorkerResponseTypeValue,
  WorkerResponse
} from '@renderer/infrastructure/rendering/workers/worker-protocol.config';

import type {
  LoggerFactoryLike,
  LoggerLike,
  EventBusLike
} from '@shared/interfaces/infrastructure.types.js';

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
  _readyTimeoutId: ReturnType<typeof setTimeout> | null;

  /**
   * @param {Object} dependencies
   * @param {Object} dependencies.loggerFactory - Logger factory
   * @param {Object} dependencies.eventBus - Event bus for publishing events
   */
  constructor({ loggerFactory, eventBus }: GpuWorkerManagerDependencies) {
    this._logger = loggerFactory?.create('GpuWorkerManager') ?? console;
    this._eventBus = eventBus;

    // Worker state
    this._worker = null;
    this._isReady = false;
    this._capabilities = null;

    // Canvas state
    this._canvas = null;
    this._offscreenCanvas = null;
    this._wasCanvasTransferred = false;

    // Message handlers registered by consumers
    this._messageHandlers = new Map();

    // Ready promise resolvers
    this._readyResolve = null;
    this._readyReject = null;
    this._readyTimeoutId = null;
  }

  /**
   * Check if worker is ready to receive commands
   * @returns {boolean}
   */
  isReady(): boolean {
    return this._isReady;
  }

  /**
   * Get detected GPU capabilities
   * @returns {Object|null}
   */
  getCapabilities(): WorkerCapabilities | null {
    return this._capabilities;
  }

  /**
   * Check if canvas control was transferred (irreversible)
   * @returns {boolean}
   */
  isCanvasTransferred(): boolean {
    return this._wasCanvasTransferred;
  }

  /**
   * Initialize the worker with a canvas
   * @param {HTMLCanvasElement} canvasElement - Canvas to render to
   * @param {Object} config - Renderer configuration
   * @param {number} [timeout=5000] - Initialization timeout in ms
   * @returns {Promise<boolean>} True if initialization successful
   */
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

    // Store canvas reference
    this._canvas = canvasElement;

    // Transfer canvas control to offscreen (irreversible)
    this._offscreenCanvas = canvasElement.transferControlToOffscreen();
    this._wasCanvasTransferred = true;

    // Create the render worker
    this._worker = new Worker(
      new URL('../../rendering/workers/render.worker.ts', import.meta.url),
      { type: 'module' }
    );

    // Set up message handlers
    this._worker.onmessage = (event) => this._handleMessage(event);
    this._worker.onerror = (error) => this._handleError(error);

    // Send init message
    const message = createWorkerMessage(WorkerMessageType.INIT, {
      canvas: this._offscreenCanvas,
      config
    });
    this._worker.postMessage(message, [this._offscreenCanvas]);

    // Wait for ready
    await this._waitForReady(timeout);

    this._logger?.info(`Worker initialized with ${config.api}`);
    return true;
  }

  /**
   * Reinitialize GPU resources without canvas transfer
   * @private
   */
  async _reinitialize(config: WorkerRendererConfig, timeout: number): Promise<boolean> {
    if (!this._worker) {
      throw new Error('Worker not available for reinitialization');
    }

    const message = createWorkerMessage(WorkerMessageType.INIT, { config });
    this._worker.postMessage(message);
    await this._waitForReady(timeout);
    return true;
  }

  /**
   * Wait for worker to report ready
   * @private
   */
  _waitForReady(timeout: number): Promise<void> {
    if (this._isReady) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      this._readyResolve = resolve;
      this._readyReject = reject;

      this._readyTimeoutId = setTimeout(() => {
        this._readyResolve = null;
        this._readyReject = null;
        this._readyTimeoutId = null;
        reject(new Error('Worker initialization timed out'));
      }, timeout);
    });
  }

  /**
   * Handle incoming worker messages
   * @private
   */
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

  /**
   * Handle worker errors
   * @private
   */
  _handleError(error: ErrorEvent): void {
    this._logger?.error('Worker error:', error.message);
    this._isReady = false;

    if (this._readyReject) {
      this._rejectReady(new Error(error.message));
    }
  }

  _rejectReady(error: Error): void {
    if (this._readyTimeoutId !== null) {
      clearTimeout(this._readyTimeoutId);
      this._readyTimeoutId = null;
    }

    if (this._readyReject) {
      this._readyReject(error);
    }

    this._readyResolve = null;
    this._readyReject = null;
  }

  /**
   * Resolve pending ready promise
   * @private
   */
  _resolveReady(): void {
    if (this._readyTimeoutId !== null) {
      clearTimeout(this._readyTimeoutId);
      this._readyTimeoutId = null;
    }

    if (this._readyResolve) {
      this._readyResolve();
      this._readyResolve = null;
      this._readyReject = null;
    }
  }

  /**
   * Send a command to the worker
   * @param {string} type - Message type from WorkerMessageType
   * @param {Object} payload - Message payload
   * @param {Transferable[]} [transferables] - Objects to transfer ownership
   */
  sendCommand<K extends WorkerMessageType>(
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

  /**
   * Register a handler for a specific message type
   * @param {string} type - Message type to handle
   * @param {Function} handler - Handler function receiving payload
   * @returns {Function} Unsubscribe function
   */
  onMessage<K extends WorkerResponseTypeValue>(
    type: K,
    handler: WorkerResponseHandler<K>
  ): () => void {
    this._messageHandlers.set(type, handler as AnyWorkerResponseHandler);

    return () => {
      this._messageHandlers.delete(type);
    };
  }

  /**
   * Release GPU resources while keeping worker alive
   * Allows reinit without canvas transfer
   */
  releaseResources(): void {
    if (!this._worker) {
      this._logger?.debug('releaseResources: No worker to release');
      return;
    }

    this._worker.postMessage(createWorkerMessage(WorkerMessageType.RELEASE));
    this._isReady = false;

    this._logger?.info('GPU resources released (worker kept alive)');
  }

  /**
   * Fully terminate the worker and reset all state.
   * Always resets the canvas transfer flag — a terminated worker
   * holds no canvas reference, so the flag would be dangling state.
   */
  terminate(): void {
    if (this._readyTimeoutId !== null) {
      clearTimeout(this._readyTimeoutId);
      this._readyTimeoutId = null;
    }

    this._readyResolve = null;
    this._readyReject = null;

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
}
