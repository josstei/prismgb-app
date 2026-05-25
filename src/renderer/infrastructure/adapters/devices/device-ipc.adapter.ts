import {
  createManifestPreloadEventBridge,
  type PreloadEventBridge
} from '@renderer/infrastructure/services/preload-event-bridge.factory';

type DeviceEventHandler = (...args: unknown[]) => void;
type DeviceApiLike = Record<string, (handler: DeviceEventHandler) => () => void>;

export class DeviceIpcAdapter {
  _logger?: { warn?: (...args: unknown[]) => void };
  _eventBridge: PreloadEventBridge | null;

  constructor({ logger }: { logger?: { warn?: (...args: unknown[]) => void } } = {}) {
    this._logger = logger;
    this._eventBridge = null;
  }

  subscribe(handleConnected: DeviceEventHandler, handleDisconnected: DeviceEventHandler) {
    if (typeof window === 'undefined' || !window.deviceAPI) {
      return () => {};
    }

    if (typeof handleConnected !== 'function' || typeof handleDisconnected !== 'function') {
      this._logger?.warn?.('DeviceIpcAdapter.subscribe: Invalid callbacks provided');
      return () => {};
    }

    this._eventBridge?.dispose();
    this._eventBridge = createManifestPreloadEventBridge({
      api: window.deviceAPI as unknown as DeviceApiLike,
      apiName: 'deviceAPI',
      bridgeName: 'DeviceIpcAdapter',
      logger: this._logger,
      handlers: {
        onDeviceConnected: handleConnected,
        onDeviceDisconnected: handleDisconnected
      }
    });

    return () => this.dispose();
  }
  dispose() {
    this._eventBridge?.dispose();
    this._eventBridge = null;
  }
}
