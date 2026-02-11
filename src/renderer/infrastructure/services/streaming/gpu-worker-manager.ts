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
  createWorkerMessage
} from '@renderer/infrastructure/rendering/workers/worker-protocol.config';

import type { LoggerLike, EventBusLike } from '@shared/interfaces/infrastructure.types.js';

export type WorkerCapabilities = Record<string, unknown>;

export class GpuWorkerManager {
  static readonly dependencies = ['loggerFactory', 'eventBus'] as const;

  _logger: LoggerLike;
  _eventBus: EventBusLike;
  _worker: Worker | null;
  _isReady: boolean;
  _capabilities: WorkerCapabilities | null;
  _canvas: HTMLCanvasElement | null;
  _offscreenCanvas: OffscreenCanvas | null;
  _wasCanvasTransferred: boolean;
  _messageHandlers: Map<string, (payload: Record<string, unknown>) => void>;
  _readyResolve: ((value?: unknown) => void) | null;
  _readyReject: ((error: Error) => void) | null;
  _readyTimeoutId: ReturnType<typeof setTimeout> | null;

  /**
   * @param {Object} dependencies
   * @param {Object} dependencies.loggerFactory - Logger factory
   * @param {Object} dependencies.eventBus - Event bus for publishing events
   */
  constructor({ loggerFactory, eventBus }) {
    this._logger = loggerFactory?.create('GpuWorkerManager');
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
  isReady() {
    return this._isReady;
  }

  /**
   * Get detected GPU capabilities
   * @returns {Object|null}
   */
  getCapabilities() {
    return this._capabilities;
  }

  /**
   * Check if canvas control was transferred (irreversible)
   * @returns {boolean}
   */
  isCanvasTransferred() {
    return this._wasCanvasTransferred;
  }

  /**
   * Initialize the worker with a canvas
   * @param {HTMLCanvasElement} canvasElement - Canvas to render to
   * @param {Object} config - Renderer configuration
   * @param {number} [timeout=5000] - Initialization timeout in ms
   * @returns {Promise<boolean>} True if initialization successful
   */
  async initialize(canvasElement, config, timeout = 5000) {
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
  async _reinitialize(config, timeout) {
    const message = createWorkerMessage(WorkerMessageType.INIT, { config });
    this._worker.postMessage(message);
    await this._waitForReady(timeout);
    return true;
  }

  /**
   * Wait for worker to report ready
   * @private
   */
  _waitForReady(timeout) {
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
  _handleMessage(event) {
    const { type, payload } = event.data;

    switch (type) {
      case WorkerResponseType.READY:
        this._isReady = true;
        this._capabilities = payload;
        this._resolveReady();
        this._logger?.info(`Worker ready (API: ${payload.api})`);
        break;

      case WorkerResponseType.ERROR:
        this._logger?.error('Worker error:', payload.message);
        this._isReady = false;
        if (this._readyReject) {
          this._readyReject(new Error(payload.message));
          this._readyResolve = null;
          this._readyReject = null;
          if (this._readyTimeoutId !== null) {
            clearTimeout(this._readyTimeoutId);
            this._readyTimeoutId = null;
          }
        }
        break;

      default: {
        // Forward to registered handlers
        const handler = this._messageHandlers.get(type);
        if (handler) {
          handler(payload);
        }
      }
    }
  }

  /**
   * Handle worker errors
   * @private
   */
  _handleError(error) {
    this._logger?.error('Worker error:', error.message);
    this._isReady = false;

    if (this._readyReject) {
      this._readyReject(new Error(error.message));
      this._readyResolve = null;
      this._readyReject = null;
      if (this._readyTimeoutId !== null) {
        clearTimeout(this._readyTimeoutId);
        this._readyTimeoutId = null;
      }
    }
  }

  /**
   * Resolve pending ready promise
   * @private
   */
  _resolveReady() {
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
  sendCommand(type, payload = {}, transferables = []) {
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
  onMessage(type, handler) {
    this._messageHandlers.set(type, handler);

    return () => {
      this._messageHandlers.delete(type);
    };
  }

  /**
   * Release GPU resources while keeping worker alive
   * Allows reinit without canvas transfer
   */
  releaseResources() {
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
  terminate() {
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
