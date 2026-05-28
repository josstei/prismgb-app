import { Service } from '@prismgb/core';
import { BaseService } from '@prismgb/core';
import type { EventBusLike, LoggerFactoryLike } from '@prismgb/core';

const OperationType = {
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  REFRESH: 'refresh'
};

type DeviceOperationTargetService = {
  updateDeviceStatus(): Promise<unknown>;
  enumerateDevices(): Promise<unknown>;
};

type DeviceOperationSequencerDependencies = {
  deviceService: DeviceOperationTargetService;
  eventBus: EventBusLike;
  loggerFactory: LoggerFactoryLike;
};

@Service({
  "token": "deviceOperationSequencer",
  "disposal": "dispose"
})
export class DeviceOperationSequencerService extends BaseService {
  private readonly deviceService: DeviceOperationTargetService;
  private readonly eventBus: EventBusLike;
  private _operationQueue: Promise<void>;
  private _currentOperation: string | null;
  private _queueDepth: number;

  constructor(dependencies: DeviceOperationSequencerDependencies) {
    super(dependencies, ['deviceService', 'eventBus', 'loggerFactory'], 'DeviceOperationSequencerService');

    this.deviceService = dependencies.deviceService;
    this.eventBus = dependencies.eventBus;
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

  _enqueue(type: string, operation: () => Promise<void>): Promise<void> {
    this._queueDepth++;
    this.logger.debug(`Queuing ${type} operation (queue depth: ${this._queueDepth})`);

    this._operationQueue = this._operationQueue
      .then(async () => {
        this._currentOperation = type;
        this.logger.debug(`Executing ${type} operation`);

        try {
          await operation();
          this.logger.debug(`Completed ${type} operation`);
        } catch (error) {
          this.logger.error(`Error in ${type} operation:`, error);
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

  override async dispose(): Promise<void> {
    await this.flush();
    await super.dispose();
  }
}
