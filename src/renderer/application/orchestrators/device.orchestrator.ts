import { Service } from '@prismgb/core';
import { BaseOrchestrator } from '@prismgb/core';
import { EventChannels } from '@prismgb/events';
import type { EventBusLike, LoggerFactoryLike } from '@prismgb/core';

type Unsubscribe = () => void;

type DeviceServiceLike = {
  setupDeviceChangeListener(): void;
  isDeviceConnected(): boolean;
  dispose(): void | Promise<void>;
};

type DeviceIpcAdapterLike = {
  subscribe(): Unsubscribe;
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

const DEVICE_IPC_EVENTS_LIFECYCLE = Symbol('deviceIpcEventsLifecycle');

@Service({
  "token": "deviceOrchestrator",
  "dependencies": [
    "deviceService",
    "deviceIpcAdapter",
    "deviceOperationSequencer",
    "eventBus",
    "loggerFactory"
  ]
})
export class DeviceOrchestrator extends BaseOrchestrator {
  private readonly deviceService: DeviceServiceLike;
  private readonly deviceIpcAdapter: DeviceIpcAdapterLike;
  private readonly deviceOperationSequencer: DeviceOperationSequencerLike;

  constructor(dependencies: DeviceOrchestratorDependencies) {
    super(
      dependencies,
      'DeviceOrchestrator'
    );
    this.deviceService = dependencies.deviceService;
    this.deviceIpcAdapter = dependencies.deviceIpcAdapter;
    this.deviceOperationSequencer = dependencies.deviceOperationSequencer;
    this.eventBus = dependencies.eventBus;
  }

  /**
   * Initialize device orchestrator
   */
  async onInitialize(): Promise<void> {
    // Set up device change listener
    this.deviceService.setupDeviceChangeListener();

    this._subscribeDeviceIpcEvents();

    // Queue initial status check through sequencer
    try {
      await this.deviceOperationSequencer.queueRefresh();
    } catch (error) {
      await this.cancelManaged(DEVICE_IPC_EVENTS_LIFECYCLE);
      throw error;
    }
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

  _subscribeDeviceIpcEvents(): void {
    const disposers: Unsubscribe[] = [];
    const releaseLifecycle = this.replaceManaged(DEVICE_IPC_EVENTS_LIFECYCLE, () => {
      for (const dispose of [...disposers].reverse()) {
        dispose();
      }
      disposers.length = 0;
    });

    try {
      disposers.push(this.eventBus.subscribe(
        EventChannels.DEVICE.CONNECTED,
        () => this._handleDeviceConnectedIPC()
      ));
      disposers.push(this.eventBus.subscribe(
        EventChannels.DEVICE.DISCONNECTED,
        () => this._handleDeviceDisconnectedIPC()
      ));
      disposers.push(this.deviceIpcAdapter.subscribe());
    } catch (error) {
      releaseLifecycle();
      throw error;
    }
  }

  async onCleanup(): Promise<void> {
    await this.cancelManaged(DEVICE_IPC_EVENTS_LIFECYCLE);
    this.logger.info('IPC device listeners removed');

    await this.deviceOperationSequencer.flush();
  }
}
