import { EventChannels } from '@prismgb/events';
import type { EventBusLike } from '@prismgb/core';

interface StreamingServiceLike {
  readonly isStreaming: boolean;
  readonly currentCapabilities: unknown;
  getStream(): MediaStream | null;
}

interface DeviceServiceLike {
  readonly isConnected: boolean;
}

type AppStateDependencies = {
  streamingService?: StreamingServiceLike;
  deviceService?: DeviceServiceLike;
  eventBus?: EventBusLike;
};

class AppState {
  streamingService: StreamingServiceLike | undefined;
  deviceService: DeviceServiceLike | undefined;
  eventBus: EventBusLike | undefined;
  isCinematicModeEnabled: boolean;
  _streamCache: MediaStream | null;
  _capabilitiesCache: unknown;
  _subscriptions: Array<() => void>;

  constructor(dependencies: AppStateDependencies = {}) {
    const { streamingService, deviceService, eventBus } = dependencies;

    this.streamingService = streamingService;
    this.deviceService = deviceService;
    this.eventBus = eventBus;
    this.isCinematicModeEnabled = true;
    this._streamCache = null;
    this._capabilitiesCache = null;
    this._subscriptions = [];

    if (this.eventBus) {
      this._setupEventSubscriptions();
    }
  }

  _setupEventSubscriptions() {
    const streamStartedUnsub = this.eventBus!.subscribe(EventChannels.STREAM.STARTED, (...args: unknown[]) => {
      const data = args[0] as { stream: MediaStream; capabilities: unknown };
      this._streamCache = data.stream;
      this._capabilitiesCache = data.capabilities;
    });
    this._subscriptions.push(streamStartedUnsub);

    const streamStoppedUnsub = this.eventBus!.subscribe(EventChannels.STREAM.STOPPED, () => {
      this._streamCache = null;
      this._capabilitiesCache = null;
    });
    this._subscriptions.push(streamStoppedUnsub);
  }

  get isStreaming() {
    return this.streamingService?.isStreaming ?? false;
  }

  get deviceConnected() {
    return this.deviceService?.isConnected ?? false;
  }

  get currentStream() {
    if (this._streamCache) {
      return this._streamCache;
    }
    return this.streamingService?.getStream?.() ?? null;
  }

  get currentCapabilities() {
    if (this._capabilitiesCache) {
      return this._capabilitiesCache;
    }
    return this.streamingService?.currentCapabilities ?? null;
  }

  setCinematicMode(enabled: boolean) {
    this.isCinematicModeEnabled = enabled;
  }

  dispose() {
    if (this._subscriptions) {
      this._subscriptions.forEach(unsubscribe => {
        if (typeof unsubscribe === 'function') {
          unsubscribe();
        }
      });
      this._subscriptions = [];
    }

    this._streamCache = null;
    this._capabilitiesCache = null;
  }
}

export { AppState };
