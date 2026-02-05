/**
 * Device IPC Adapter
 *
 * Wraps window.deviceAPI IPC communication to make DeviceOrchestrator
 * testable without IPC dependencies.
 *
 * Abstracts:
 * - onDeviceConnected IPC event
 * - onDeviceDisconnected IPC event
 */

export class DeviceIpcAdapter {
  constructor({ logger } = {}) {
    this._logger = logger;
    this._unsubscribeConnected = null;
    this._unsubscribeDisconnected = null;
  }

  /**
   * Subscribe to device connection/disconnection events
   * @param {Function} onConnected - Called when device is connected
   * @param {Function} onDisconnected - Called when device is disconnected
   * @returns {Function} Cleanup function to remove listeners
   */
  subscribe(onConnected, onDisconnected) {
    if (typeof window === 'undefined' || !window.deviceAPI) {
      // Gracefully handle missing deviceAPI (e.g., in tests or if preload fails)
      return () => {};
    }

    // Validate callbacks
    if (typeof onConnected !== 'function' || typeof onDisconnected !== 'function') {
      this._logger?.warn('DeviceIpcAdapter.subscribe: Invalid callbacks provided');
      return () => {};
    }

    // Subscribe to IPC events
    this._unsubscribeConnected = window.deviceAPI.onDeviceConnected(onConnected);
    this._unsubscribeDisconnected = window.deviceAPI.onDeviceDisconnected(onDisconnected);

    // Return cleanup function
    return () => this.dispose();
  }

  /**
   * Clean up event listeners
   */
  dispose() {
    if (typeof this._unsubscribeConnected === 'function') {
      this._unsubscribeConnected();
      this._unsubscribeConnected = null;
    }

    if (typeof this._unsubscribeDisconnected === 'function') {
      this._unsubscribeDisconnected();
      this._unsubscribeDisconnected = null;
    }
  }
}
