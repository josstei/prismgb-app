import {
  createManifestPreloadEventBridge,
  RendererPreloadBridgeDescriptors,
  type PreloadEventBridge
} from '@renderer/infrastructure/services/preload-event-bridge.factory';

type DeviceEventHandler = (...args: unknown[]) => void;

export class DeviceIpcAdapter {
  _logger?: { warn?: (...args: unknown[]) => void };
  _eventBridge: PreloadEventBridge | null = null;
  _eventBridges = new Set<PreloadEventBridge>();

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

    this._eventBridge = createManifestPreloadEventBridge({
      api: window.deviceAPI,
      descriptor: RendererPreloadBridgeDescriptors.deviceAPI,
      bridgeName: 'DeviceIpcAdapter',
      logger: this._logger,
      handlers: {
        onDeviceConnected: handleConnected,
        onDeviceDisconnected: handleDisconnected
      }
    });

    const eventBridge = this._eventBridge;
    this._eventBridges.add(eventBridge);

    return () => this._disposeBridge(eventBridge);
  }

  _disposeBridge(eventBridge: PreloadEventBridge) {
    if (!this._eventBridges.delete(eventBridge)) {
      return;
    }

    eventBridge.dispose();

    if (this._eventBridge === eventBridge) {
      this._eventBridge = [...this._eventBridges].pop() ?? null;
    }
  }

  dispose() {
    for (const eventBridge of this._eventBridges) eventBridge.dispose();

    this._eventBridges.clear();
    this._eventBridge = null;
  }
}
