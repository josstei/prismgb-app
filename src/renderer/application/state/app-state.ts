import { EventChannels } from '@prismgb/events';
import { DisposableBag, type EventBusLike } from '@prismgb/core';
import { signal, type Signal, type ReadonlySignal } from '@prismgb/ui-base/reactive';

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

  private readonly _isCinematicModeEnabled = signal(true);
  readonly _streamCache = signal<MediaStream | null>(null);
  readonly _capabilitiesCache = signal<unknown>(null);
  private readonly _isStreamingSignal: Signal<boolean>;
  private readonly _deviceConnectedSignal: Signal<boolean>;
  private readonly _bag = new DisposableBag();

  constructor(dependencies: AppStateDependencies = {}) {
    const { streamingService, deviceService, eventBus } = dependencies;

    this.streamingService = streamingService;
    this.deviceService = deviceService;
    this.eventBus = eventBus;

    this._isStreamingSignal = signal(streamingService?.isStreaming ?? false);
    this._deviceConnectedSignal = signal(deviceService?.isConnected ?? false);

    if (this.eventBus) {
      this._setupEventSubscriptions();
    }
  }

  _setupEventSubscriptions() {
    this._bag.add(
      this.eventBus!.subscribe(EventChannels.STREAM.STARTED, (...args: unknown[]) => {
        const data = args[0] as { stream: MediaStream; capabilities: unknown };
        this._streamCache.value = data?.stream ?? null;
        this._capabilitiesCache.value = data?.capabilities ?? null;
        this._isStreamingSignal.value = true;
      })
    );

    this._bag.add(
      this.eventBus!.subscribe(EventChannels.STREAM.STOPPED, () => {
        this._streamCache.value = null;
        this._capabilitiesCache.value = null;
        this._isStreamingSignal.value = false;
      })
    );

    this._bag.add(
      this.eventBus!.subscribe(EventChannels.DEVICE.STATUS_CHANGED, (...args: unknown[]) => {
        const data = args[0] as { connected: boolean };
        if (data && typeof data.connected === 'boolean') {
          this._deviceConnectedSignal.value = data.connected;
        }
      })
    );
  }

  get isCinematicModeEnabled(): boolean {
    return this._isCinematicModeEnabled.value;
  }

  get cinematicModeSignal(): ReadonlySignal<boolean> {
    return this._isCinematicModeEnabled;
  }

  get isStreaming() {
    return this.streamingService?.isStreaming ?? false;
  }

  get isStreamingSignal(): ReadonlySignal<boolean> {
    return this._isStreamingSignal;
  }

  get deviceConnected() {
    return this.deviceService?.isConnected ?? false;
  }

  get deviceConnectedSignal(): ReadonlySignal<boolean> {
    return this._deviceConnectedSignal;
  }

  get currentStream() {
    return this._streamCache.value ?? this.streamingService?.getStream?.() ?? null;
  }

  get streamSignal(): ReadonlySignal<MediaStream | null> {
    return this._streamCache;
  }

  get currentCapabilities() {
    return this._capabilitiesCache.value ?? this.streamingService?.currentCapabilities ?? null;
  }

  get capabilitiesSignal(): ReadonlySignal<unknown> {
    return this._capabilitiesCache;
  }

  setCinematicMode(enabled: boolean) {
    this._isCinematicModeEnabled.value = enabled;
  }

  dispose() {
    this._bag.dispose();
    this._streamCache.value = null;
    this._capabilitiesCache.value = null;
  }
}

export { AppState };
