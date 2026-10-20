import { signal, computed, type ReadonlySignal } from '@preact/signals-core';
import { EventChannels } from '@renderer/lib/events/event-channels';
import type { EventBus } from '@renderer/lib/events/event-bus';
import { PresentationComponent } from '@renderer/presentation/primitives/presentation-component.base';

export class DeviceStatusStore extends PresentationComponent {
  private readonly _connected = signal(false);
  private readonly _deviceName = signal('—');
  private readonly _overlayVisible = signal(true);
  private readonly _overlayMessage = signal('');
  private readonly _overlayReady = signal(false);
  private readonly _overlayWaiting = signal(true);

  readonly statusText = computed(() => this._connected.value ? 'Device Connected' : 'No Device');
  readonly deviceStatusText = computed(() => this._connected.value ? 'Connected' : 'Disconnected');
  readonly streamOverlayHidden = computed(() => !this._overlayVisible.value);

  constructor({ eventBus }: { eventBus: EventBus }) {
    super();

    this.disposables.add(eventBus.subscribe(EventChannels.DEVICE.STATUS_CHANGED, (status) => {
      this._connected.value = status.connected;
      this._deviceName.value = status.connected ? (status.device?.name || 'Device') : '—';
    }));

    this.disposables.add(eventBus.subscribe(EventChannels.UI.OVERLAY_MESSAGE, ({ deviceConnected }) => {
      this._overlayMessage.value = '';
      this._overlayReady.value = deviceConnected;
      this._overlayWaiting.value = !deviceConnected;
    }));

    this.disposables.add(eventBus.subscribe(EventChannels.UI.OVERLAY_VISIBLE, ({ visible }) => {
      this._overlayVisible.value = visible;
    }));

    this.disposables.add(eventBus.subscribe(EventChannels.UI.OVERLAY_ERROR, ({ message }) => {
      this._overlayMessage.value = message ? `Error: ${message}` : '';
      this._overlayVisible.value = true;
    }));
  }

  get connected(): ReadonlySignal<boolean> { return this._connected; }
  get deviceName(): ReadonlySignal<string> { return this._deviceName; }
  get overlayMessage(): ReadonlySignal<string> { return this._overlayMessage; }
  get overlayReady(): ReadonlySignal<boolean> { return this._overlayReady; }
  get overlayWaiting(): ReadonlySignal<boolean> { return this._overlayWaiting; }
}
