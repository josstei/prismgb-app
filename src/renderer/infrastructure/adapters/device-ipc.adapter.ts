import { createTrpcEventBridge } from '@renderer/infrastructure/services/platform/trpc-event-bridge.factory';
import { trpcClient } from '@renderer/infrastructure/ipc/trpc-client';
import { EventChannels } from '@prismgb/events';
import { DisposableBag } from '@prismgb/core';
import type { EventBusLike } from '@prismgb/core';

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
    const disposeBridge = this.disposables.add(createTrpcEventBridge('DeviceIpcAdapter', [
      () => trpcClient.device.onConnected.subscribe(undefined, {
        onData: (device) => this.eventBus.publish(EventChannels.DEVICE.CONNECTED, device)
      }),
      () => trpcClient.device.onDisconnected.subscribe(undefined, {
        onData: (device) => this.eventBus.publish(EventChannels.DEVICE.DISCONNECTED, device)
      })
    ], this._logger));

    return () => { void disposeBridge(); };
  }

  dispose() {
    return this.disposables.clear();
  }
}
