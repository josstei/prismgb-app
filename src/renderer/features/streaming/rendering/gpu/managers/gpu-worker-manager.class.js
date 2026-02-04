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
} from '../../workers/streaming-worker-protocol.config.js';

export class GpuWorkerManager {
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
}
