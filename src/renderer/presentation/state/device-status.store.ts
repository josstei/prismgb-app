import { signal, computed, type ReadonlySignal } from '@platform/ui-base/reactive';
import { EventChannels } from '@platform/events';
import type { EventBusLike } from '@platform/core';
import { ReactiveStore } from './reactive-store.base.js';

export interface DeviceStatusPayloadLike {
  connected: boolean;
  device?: {
    name?: string | null;
  } | null;
}

export interface DeviceStatusStoreDependencies {
  eventBus: EventBusLike;
  deviceConnectedSignal: ReadonlySignal<boolean>;
}

export class DeviceStatusStore extends ReactiveStore {
  private readonly _connected = signal(false);
  private readonly _deviceName = signal('—');
  private readonly _overlayVisible = signal(true);
  private readonly _overlayMessage = signal('');
  private readonly _overlayReady = signal(false);
  private readonly _overlayWaiting = signal(true);

  constructor(private readonly dependencies: DeviceStatusStoreDependencies) {
    super();

    // Initial values
    this._connected.value = this.dependencies.deviceConnectedSignal.value;

    const bus = this.dependencies.eventBus;

    this.track(
      bus.subscribe(EventChannels.UI.DEVICE_STATUS, (payload: unknown) => {
        const data = typeof payload === 'object' && payload !== null ? (payload as { status?: unknown }).status : null;
        if (data && typeof data === 'object' && 'connected' in data) {
          const status = data as DeviceStatusPayloadLike;
          this._connected.value = status.connected;
          this._deviceName.value = status.connected
            ? (status.device?.name || 'Device')
            : '—';
        } else {
          this._connected.value = false;
          this._deviceName.value = '—';
        }
      })
    );

    this.track(
      bus.subscribe(EventChannels.UI.OVERLAY_MESSAGE, (payload: unknown) => {
        const data = typeof payload === 'object' && payload !== null ? (payload as { deviceConnected?: unknown }) : {};
        const deviceConnected = typeof data.deviceConnected === 'boolean' ? data.deviceConnected : false;
        this._overlayMessage.value = '';
        this._overlayReady.value = deviceConnected;
        this._overlayWaiting.value = !deviceConnected;
      })
    );

    this.track(
      bus.subscribe(EventChannels.UI.OVERLAY_VISIBLE, (payload: unknown) => {
        const data = typeof payload === 'object' && payload !== null ? (payload as { visible?: unknown }) : {};
        if (typeof data.visible === 'boolean') {
          this._overlayVisible.value = data.visible;
        }
      })
    );

    this.track(
      bus.subscribe(EventChannels.UI.OVERLAY_ERROR, (payload: unknown) => {
        const data = typeof payload === 'object' && payload !== null ? (payload as { message?: unknown }) : {};
        const message = typeof data.message === 'string' ? data.message : '';
        this._overlayMessage.value = message ? `Error: ${message}` : '';
        this._overlayVisible.value = true;
      })
    );
  }

  get connected(): ReadonlySignal<boolean> { return this._connected; }
  get deviceName(): ReadonlySignal<string> { return this._deviceName; }
  get overlayVisible(): ReadonlySignal<boolean> { return this._overlayVisible; }
  get overlayMessage(): ReadonlySignal<string> { return this._overlayMessage; }
  get overlayReady(): ReadonlySignal<boolean> { return this._overlayReady; }
  get overlayWaiting(): ReadonlySignal<boolean> { return this._overlayWaiting; }

  // Computed composites for bindings
  readonly statusText = computed(() => this._connected.value ? 'Device Connected' : 'No Device');
  readonly deviceStatusText = computed(() => this._connected.value ? 'Connected' : 'Disconnected');
  readonly streamOverlayHidden = computed(() => !this._overlayVisible.value);

}
