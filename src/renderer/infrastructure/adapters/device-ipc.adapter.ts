import {
  createRendererPreloadEventBridge,
  RendererPreloadBridgeDescriptors
} from '@renderer/infrastructure/services/platform/preload-event-bridge.factory';
import { DisposableBag } from '@prismgb/core';
import type { EventBusLike } from '@prismgb/core';
import type { DeviceInfoPayload } from '@prismgb/ipc';

type DeviceIpcLogger = { warn?: (...args: unknown[]) => void; error?: (...args: unknown[]) => void };
type DeviceIpcAdapterDependencies = {
  eventBus: EventBusLike;
  logger?: DeviceIpcLogger;
};

export class DeviceIpcAdapter {
  private readonly eventBus: EventBusLike;
  _logger?: DeviceIpcLogger;
  private readonly disposables = new DisposableBag();

  constructor({ eventBus, logger }: DeviceIpcAdapterDependencies) {
    this.eventBus = eventBus;
    this._logger = logger;
  }

  subscribe() {
    if (typeof window === 'undefined' || !window.deviceAPI) {
      return () => {};
    }

    const disposeBridge = this.disposables.add(createRendererPreloadEventBridge({
      api: window.deviceAPI,
      descriptor: RendererPreloadBridgeDescriptors.deviceAPI,
      logger: this._logger,
      handlers: {
        onDeviceConnected: (device: DeviceInfoPayload) => {
          this.eventBus.publish(RendererPreloadBridgeDescriptors.deviceAPI.events.onDeviceConnected, device);
        },
        onDeviceDisconnected: (device: DeviceInfoPayload | null | undefined) => {
          this.eventBus.publish(RendererPreloadBridgeDescriptors.deviceAPI.events.onDeviceDisconnected, device);
        }
      }
    }));

    return () => { void disposeBridge(); };
  }

  dispose() {
    return this.disposables.clear();
  }
}
