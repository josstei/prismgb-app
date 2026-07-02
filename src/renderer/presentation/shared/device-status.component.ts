import { CSSClasses } from '@renderer/presentation/config/css-classes.config';
import { PresentationComponent, bindText, bindClass, computed } from '@platform/ui-base';
import type { DeviceStatusStore } from '@renderer/presentation/state/device-status.store.js';

export interface DeviceStatusElements {
  statusIndicator?: { classList: any } | null;
  statusText?: { textContent: string | null } | null;
  deviceStatusText?: { textContent: string | null; classList: any } | null;
  deviceName?: { textContent: string | null } | null;
  overlayMessage?: { textContent: string | null; classList: any } | null;
  streamOverlay?: { classList: any } | null;
}

export interface DeviceStatusComponentOptions {
  elements: DeviceStatusElements;
  store: DeviceStatusStore;
}

class DeviceStatusComponent extends PresentationComponent {
  constructor({ elements, store }: DeviceStatusComponentOptions) {
    super();
    this.track(store);

    const ind = elements.statusIndicator ?? null;
    this.track(bindClass(ind, CSSClasses.CONNECTED, store.connected));
    this.track(bindClass(ind, CSSClasses.DISCONNECTED, computed(() => !store.connected.value)));

    this.track(bindText(elements.statusText ?? null, store.statusText));

    const statusTextEl = elements.deviceStatusText ?? null;
    this.track(bindText(statusTextEl, store.deviceStatusText));
    if (statusTextEl) {
      statusTextEl.classList.add(CSSClasses.STATUS_STATE);
    }
    this.track(bindClass(statusTextEl, CSSClasses.CONNECTED, store.connected));
    this.track(bindClass(statusTextEl, CSSClasses.DISCONNECTED, computed(() => !store.connected.value)));

    this.track(bindText(elements.deviceName ?? null, store.deviceName));

    const overlayMsg = elements.overlayMessage ?? null;
    this.track(bindText(overlayMsg, store.overlayMessage));
    this.track(bindClass(overlayMsg, CSSClasses.OVERLAY_READY, store.overlayReady));
    this.track(bindClass(overlayMsg, CSSClasses.WAITING, store.overlayWaiting));

    const overlay = elements.streamOverlay ?? null;
    this.track(bindClass(overlay, CSSClasses.HIDDEN, store.streamOverlayHidden));
  }
}

export { DeviceStatusComponent };
