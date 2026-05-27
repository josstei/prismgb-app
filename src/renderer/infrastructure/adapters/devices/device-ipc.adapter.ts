import {
  createRendererPreloadEventBridge,
  RendererPreloadBridgeDescriptors
} from '@renderer/infrastructure/services/preload-event-bridge.factory';
import { DisposableBag } from '@shared/base/disposable-bag.js';

type DeviceEventHandler = (...args: unknown[]) => void;

export class DeviceIpcAdapter {
  _logger?: { warn?: (...args: unknown[]) => void };
  private readonly disposables = new DisposableBag();

  constructor({ logger }: { logger?: { warn?: (...args: unknown[]) => void } } = {}) {
    this._logger = logger;
  }

  subscribe(handleConnected: DeviceEventHandler, handleDisconnected: DeviceEventHandler) {
    if (typeof window === 'undefined' || !window.deviceAPI) {
      return () => {};
    }

    if (typeof handleConnected !== 'function' || typeof handleDisconnected !== 'function') {
      this._logger?.warn?.('DeviceIpcAdapter.subscribe: Invalid callbacks provided');
      return () => {};
    }

    const disposeBridge = this.disposables.add(createRendererPreloadEventBridge({
      api: window.deviceAPI,
      descriptor: RendererPreloadBridgeDescriptors.deviceAPI,
      logger: this._logger,
      handlers: {
        onDeviceConnected: handleConnected,
        onDeviceDisconnected: handleDisconnected
      }
    }));

    return () => { void disposeBridge(); };
  }

  dispose() {
    return this.disposables.clear();
  }
}
