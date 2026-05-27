import { CSSClasses } from '@renderer/presentation/config/css-classes.config';
import { PresentationComponent } from '@renderer/presentation/primitives/presentation-component.base';

type ClassListLike = {
  add(...tokens: string[]): void;
  remove(...tokens: string[]): void;
  toggle(token: string, force?: boolean): boolean | void;
};

type TextElementLike = {
  textContent: string | null;
  classList: ClassListLike;
};

type OverlayElementLike = {
  classList: ClassListLike;
};

export interface DeviceStatusElements {
  statusIndicator?: { classList: ClassListLike } | null;
  statusText?: { textContent: string | null } | null;
  deviceStatusText?: TextElementLike | null;
  deviceName?: { textContent: string | null } | null;
  overlayMessage?: TextElementLike | null;
  streamOverlay?: OverlayElementLike | null;
}

export interface DeviceStatusPayloadLike {
  connected: boolean;
  device?: {
    deviceName?: string | null;
    configName?: string | null;
  } | null;
}

class DeviceStatusComponent extends PresentationComponent {
  declare elements: DeviceStatusElements;

  constructor(elements: DeviceStatusElements) {
    super();
    this.elements = elements;
  }

  updateStatus(status: DeviceStatusPayloadLike): void {
    const { connected, device } = status;
    const statusTextEl = this.elements.deviceStatusText;
    const deviceNameEl = this.elements.deviceName;

    if (connected) {
      this.elements.statusIndicator?.classList.add(CSSClasses.CONNECTED);
      this.elements.statusIndicator?.classList.remove(CSSClasses.DISCONNECTED);
      if (this.elements.statusText) this.elements.statusText.textContent = 'Device Connected';
      if (statusTextEl) {
        statusTextEl.textContent = 'Connected';
        statusTextEl.classList.add(CSSClasses.STATUS_STATE, CSSClasses.CONNECTED);
        statusTextEl.classList.remove(CSSClasses.DISCONNECTED);
      }
      if (deviceNameEl) deviceNameEl.textContent = device?.deviceName || device?.configName || 'Device';
    } else {
      this.elements.statusIndicator?.classList.remove(CSSClasses.CONNECTED);
      this.elements.statusIndicator?.classList.add(CSSClasses.DISCONNECTED);
      if (this.elements.statusText) this.elements.statusText.textContent = 'No Device';
      if (statusTextEl) {
        statusTextEl.textContent = 'Disconnected';
        statusTextEl.classList.add(CSSClasses.STATUS_STATE, CSSClasses.DISCONNECTED);
        statusTextEl.classList.remove(CSSClasses.CONNECTED);
      }
      if (deviceNameEl) deviceNameEl.textContent = '—';
    }
  }

  updateOverlayMessage(deviceConnected: boolean): void {
    const messageEl = this.elements.overlayMessage;
    if (!messageEl) return;

    messageEl.textContent = '';
    messageEl.classList.toggle(CSSClasses.OVERLAY_READY, !!deviceConnected);
    messageEl.classList.toggle(CSSClasses.WAITING, !deviceConnected);
  }

  showError(message: string): void {
    if (this.elements.overlayMessage) {
      this.elements.overlayMessage.textContent = `Error: ${message}`;
    }
    this.elements.streamOverlay?.classList.remove(CSSClasses.HIDDEN);
  }

  setOverlayVisible(visible: boolean): void {
    if (visible) {
      this.elements.streamOverlay?.classList.remove(CSSClasses.HIDDEN);
    } else {
      this.elements.streamOverlay?.classList.add(CSSClasses.HIDDEN);
    }
  }
}

export { DeviceStatusComponent };
