import { computed } from '@preact/signals-core';
import { CSSClasses } from '@renderer/presentation/config/css-classes.config';
import { PresentationComponent } from '@renderer/presentation/primitives/presentation-component.base';
import { bindText, bindClass } from '@renderer/presentation/primitives/signal-bindings.utils';
import type { DeviceStatusStore } from '@renderer/presentation/shell/device-status.store';

export interface DeviceStatusElements {
  statusIndicator?: HTMLElement | null;
  statusText?: HTMLElement | null;
  deviceStatusText?: HTMLElement | null;
  deviceName?: HTMLElement | null;
  overlayMessage?: HTMLElement | null;
  streamOverlay?: HTMLElement | null;
}

export interface DeviceStatusComponentOptions {
  elements: DeviceStatusElements;
  store: DeviceStatusStore;
}

export class DeviceStatusComponent extends PresentationComponent {
  constructor({ elements, store }: DeviceStatusComponentOptions) {
    super();
    this.disposables.add(store);

    const disconnected = computed(() => !store.connected.value);

    const indicator = elements.statusIndicator ?? null;
    this.disposables.add(bindClass(indicator, CSSClasses.CONNECTED, store.connected));
    this.disposables.add(bindClass(indicator, CSSClasses.DISCONNECTED, disconnected));

    this.disposables.add(bindText(elements.statusText ?? null, store.statusText));

    const deviceStatusText = elements.deviceStatusText ?? null;
    this.disposables.add(bindText(deviceStatusText, store.deviceStatusText));
    this.disposables.add(bindClass(deviceStatusText, CSSClasses.CONNECTED, store.connected));
    this.disposables.add(bindClass(deviceStatusText, CSSClasses.DISCONNECTED, disconnected));

    this.disposables.add(bindText(elements.deviceName ?? null, store.deviceName));

    const overlayMessage = elements.overlayMessage ?? null;
    this.disposables.add(bindText(overlayMessage, store.overlayMessage));
    this.disposables.add(bindClass(overlayMessage, CSSClasses.OVERLAY_READY, store.overlayReady));
    this.disposables.add(bindClass(overlayMessage, CSSClasses.WAITING, store.overlayWaiting));

    this.disposables.add(bindClass(elements.streamOverlay ?? null, CSSClasses.HIDDEN, store.streamOverlayHidden));
  }
}
