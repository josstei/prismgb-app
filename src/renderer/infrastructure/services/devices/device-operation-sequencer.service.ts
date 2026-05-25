/**
 * Device Operation Sequencer Service
 *
 * Ensures device operations (status updates, enumeration) are executed
 * sequentially to prevent race conditions from rapid IPC events.
 *
 * Follows the operation promise pattern established in StreamingService.
 */

import { BaseService } from '@shared/base/service.base.js';

const OperationType = {
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  REFRESH: 'refresh'
};

export class DeviceOperationSequencerService extends BaseService {

  constructor(dependencies: Record<string, unknown>) {
    super(dependencies, ['deviceService', 'eventBus', 'loggerFactory'], 'DeviceOperationSequencerService');

    this._operationQueue = Promise.resolve();

    this._currentOperation = null;

    this._queueDepth = 0;
  }

  queueConnected() {
    return this._enqueue(OperationType.CONNECTED, async () => {
      await this.deviceService.updateDeviceStatus();
      await this.deviceService.enumerateDevices();
    });
  }

  queueDisconnected(onComplete?: (() => void) | null) {
    return this._enqueue(OperationType.DISCONNECTED, async () => {
      await this.deviceService.updateDeviceStatus();
      if (typeof onComplete === 'function') {
        onComplete();
      }
    });
  }

  queueRefresh() {
    return this._enqueue(OperationType.REFRESH, async () => {
      await this.deviceService.updateDeviceStatus();
      await this.deviceService.enumerateDevices();
    });
  }

  getQueueDepth() {
    return this._queueDepth;
  }

  _enqueue(type: string, operation: () => Promise<void>) {
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

  async flush() {
    await this._operationQueue;
  }
}
