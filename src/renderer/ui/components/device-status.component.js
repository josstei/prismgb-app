/**
 * DeviceStatusComponent
 *
 * Manages device connection status display and overlay messages.
 * Handles all UI elements related to device connection state.
 */

import { CSSClasses } from '@shared/config/css-classes.js';

class DeviceStatusComponent {
  /**
   * Create device status component
   * @param {Object} elements - DOM elements
   */
  constructor(elements) {
    this.elements = elements;
  }

  /**
   * Update device connection status
   * @param {Object} status - { connected: boolean, device?: { deviceName: string } }
   */
  updateStatus(status) {
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

  /**
   * Update overlay message based on device state
   * @param {boolean} deviceConnected - Is device connected
   */
  updateOverlayMessage(deviceConnected) {
    const messageEl = this.elements.overlayMessage;
    if (!messageEl) return;

    // Keep stateful classes for visuals but avoid showing textual prompts
    // The ready/waiting classes drive CSS animations via :has() selectors
    messageEl.textContent = '';
    messageEl.classList.toggle(CSSClasses.OVERLAY_READY, !!deviceConnected);
    messageEl.classList.toggle(CSSClasses.WAITING, !deviceConnected);
  }

  /**
   * Show error overlay
   * @param {string} message - Error message
   */
  showError(message) {
    if (this.elements.overlayMessage) {
      this.elements.overlayMessage.textContent = `Error: ${message}`;
    }
    this.elements.streamOverlay?.classList.remove(CSSClasses.HIDDEN);
  }

  /**
   * Show/hide overlay
   * @param {boolean} visible - Show overlay
   */
  setOverlayVisible(visible) {
    if (visible) {
      this.elements.streamOverlay?.classList.remove(CSSClasses.HIDDEN);
    } else {
      this.elements.streamOverlay?.classList.add(CSSClasses.HIDDEN);
    }
  }
}

export { DeviceStatusComponent };
