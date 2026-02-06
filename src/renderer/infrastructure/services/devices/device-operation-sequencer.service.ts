// @ts-nocheck
/**
 * Device Operation Sequencer Service
 *
 * Ensures device operations (status updates, enumeration) are executed
 * sequentially to prevent race conditions from rapid IPC events.
 *
 * Follows the operation promise pattern established in StreamingService.
 */

import { BaseService } from '@shared/base/service.base.js';

/**
 * Operation types for logging and debugging
 * @readonly
 * @enum {string}
 */
const OperationType = {
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  REFRESH: 'refresh'
};

export class DeviceOperationSequencerService extends BaseService {
  /**
   * @param {Object} dependencies - Injected dependencies
   * @param {DeviceService} dependencies.deviceService - Device service facade
   * @param {EventBus} dependencies.eventBus - Event publisher
   * @param {Function} dependencies.loggerFactory - Logger factory
   */
  constructor(dependencies) {
    super(dependencies, ['deviceService', 'eventBus', 'loggerFactory'], 'DeviceOperationSequencerService');

    /**
     * Promise chain for sequential operation execution
     * @private
     * @type {Promise<void>}
     */
    this._operationQueue = Promise.resolve();

    /**
     * Currently executing operation type (for debugging)
     * @private
     * @type {string|null}
     */
    this._currentOperation = null;

    /**
     * Count of queued operations (for metrics/debugging)
     * @private
     * @type {number}
     */
    this._queueDepth = 0;
  }

  /**
   * Queue a device connected operation
   * @returns {Promise<void>} Resolves when operation completes
   */
  queueConnected() {
    return this._enqueue(OperationType.CONNECTED, async () => {
      await this.deviceService.updateDeviceStatus();
      await this.deviceService.enumerateDevices();
    });
  }

  /**
   * Queue a device disconnected operation
   * @param {Function} [onComplete] - Callback after status update (for event publishing)
   * @returns {Promise<void>} Resolves when operation completes
   */
  queueDisconnected(onComplete) {
    return this._enqueue(OperationType.DISCONNECTED, async () => {
      await this.deviceService.updateDeviceStatus();
      if (typeof onComplete === 'function') {
        onComplete();
      }
    });
  }

  /**
   * Queue a device status refresh
   * @returns {Promise<void>} Resolves when operation completes
   */
  queueRefresh() {
    return this._enqueue(OperationType.REFRESH, async () => {
      await this.deviceService.updateDeviceStatus();
      await this.deviceService.enumerateDevices();
    });
  }

  /**
   * Get current queue depth (for testing/debugging)
   * @returns {number} Number of operations waiting
   */
  getQueueDepth() {
    return this._queueDepth;
  }

  /**
   * Enqueue an operation for sequential execution
   * @private
   * @param {string} type - Operation type for logging
   * @param {Function} operation - Async operation to execute
   * @returns {Promise<void>} Resolves when operation completes
   */
  _enqueue(type, operation) {
    this._queueDepth++;
    this.logger.debug(`Queuing ${type} operation (queue depth: ${this._queueDepth})`);

    // Chain onto existing queue
    this._operationQueue = this._operationQueue
      .then(async () => {
        this._currentOperation = type;
        this.logger.debug(`Executing ${type} operation`);

        try {
          await operation();
          this.logger.debug(`Completed ${type} operation`);
        } catch (error) {
          this.logger.error(`Error in ${type} operation:`, error);
          // Don't rethrow - allow queue to continue processing
        } finally {
          this._currentOperation = null;
          this._queueDepth--;
        }
      });

    return this._operationQueue;
  }

  /**
   * Wait for all queued operations to complete
   * Useful for testing and cleanup
   * @returns {Promise<void>}
   */
  async flush() {
    await this._operationQueue;
  }
}
