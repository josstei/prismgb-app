import { BaseOrchestrator } from '@shared/base/orchestrator.base.js';
import { EventChannels } from '@shared/events/event-channels.js';
import type { EventBusLike, LoggerFactoryLike } from '@shared/interfaces/infrastructure.types.js';

type Unsubscribe = () => void;

type DeviceServiceLike = {
  setupDeviceChangeListener(): void;
  isDeviceConnected(): boolean;
  dispose(): void | Promise<void>;
};

type DeviceIpcAdapterLike = {
  subscribe(handleConnected: () => void, handleDisconnected: () => void): Unsubscribe;
};

type DeviceOperationSequencerLike = {
  queueRefresh(): Promise<void>;
  queueConnected(): void;
  queueDisconnected(onDisconnected: () => void): void;
  flush(): Promise<void>;
};

type DeviceOrchestratorDependencies = {
  deviceService: DeviceServiceLike;
  deviceIpcAdapter: DeviceIpcAdapterLike;
  deviceOperationSequencer: DeviceOperationSequencerLike;
  eventBus: EventBusLike;
  loggerFactory: LoggerFactoryLike;
};

export class DeviceOrchestrator extends BaseOrchestrator {
  private readonly deviceService: DeviceServiceLike;
  private readonly deviceIpcAdapter: DeviceIpcAdapterLike;
  private readonly deviceOperationSequencer: DeviceOperationSequencerLike;
  private _unsubscribeIPC: Unsubscribe | null;

  constructor(dependencies: DeviceOrchestratorDependencies) {
    super(
      dependencies,
      ['deviceService', 'deviceIpcAdapter', 'deviceOperationSequencer', 'eventBus', 'loggerFactory'],
      'DeviceOrchestrator'
    );
    this.deviceService = dependencies.deviceService;
    this.deviceIpcAdapter = dependencies.deviceIpcAdapter;
    this.deviceOperationSequencer = dependencies.deviceOperationSequencer;
    this.eventBus = dependencies.eventBus;
    // Store unsubscribe function for IPC adapter
    this._unsubscribeIPC = null;
  }

  /**
   * Initialize device orchestrator
   */
  async onInitialize(): Promise<void> {
    // Set up device change listener
    this.deviceService.setupDeviceChangeListener();

    // Set up IPC event listeners for USB events via adapter
    this._unsubscribeIPC = this.deviceIpcAdapter.subscribe(
      () => this._handleDeviceConnectedIPC(),
      () => this._handleDeviceDisconnectedIPC()
    );

    // Queue initial status check through sequencer
    await this.deviceOperationSequencer.queueRefresh();
  }

  /**
   * Get current device connection status
   */
  isDeviceConnected(): boolean {
    return this.deviceService.isDeviceConnected();
  }

  _handleDeviceConnectedIPC(): void {
    this.deviceOperationSequencer.queueConnected();
  }

  _handleDeviceDisconnectedIPC(): void {
    this.deviceOperationSequencer.queueDisconnected(() => {
      this.eventBus.publish(EventChannels.DEVICE.DISCONNECTED_DURING_SESSION);
    });
  }

  async onCleanup(): Promise<void> {
    if (typeof this._unsubscribeIPC === 'function') {
      this._unsubscribeIPC();
      this._unsubscribeIPC = null;
    }
    this.logger.info('IPC device listeners removed');

    await this.deviceOperationSequencer.flush();
  }
}
