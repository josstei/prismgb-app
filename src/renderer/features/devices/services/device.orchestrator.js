/**
 * Device Orchestrator
 *
 * Coordinates device detection and status management across USB and WebRTC domains
 * Thin coordinator - delegates to DeviceService, does not contain business logic
 *
 * Responsibilities:
 * - Coordinate device status updates
 * - Handle USB IPC events
 * - Coordinate device enumeration
 * - Emit high-level device events
 */

import { BaseOrchestrator } from '@shared/base/orchestrator.js';
import { EventChannels } from '@infrastructure/events/event-channels.js';

export class DeviceOrchestrator extends BaseOrchestrator {
  constructor(dependencies) {
    super(
      dependencies,
      ['deviceService', 'eventBus', 'loggerFactory'],
      'DeviceOrchestrator'
    );
    // Store unsubscribe functions for IPC listeners
    this._ipcUnsubscribers = [];
  }

  /**
   * Initialize device orchestrator
   */
  async onInitialize() {
    // Set up device change listener
    this.deviceService.setupDeviceChangeListener();

    // Set up IPC event listeners for USB events
    this._setupIPCEventListeners();

    // Check initial device status
    await this.deviceService.updateDeviceStatus();
  }

  /**
   * Get current device connection status
   */
  isDeviceConnected() {
    return this.deviceService.isDeviceConnected();
  }

  /**
   * Set up IPC event listeners for USB device events
   * @private
   */
  _setupIPCEventListeners() {
    if (!window.deviceAPI) {
      this.logger.error('deviceAPI not available - preload script may have failed');
      return;
    }
    // Store unsubscribe functions returned by the preload API
    const unsubConnected = window.deviceAPI.onDeviceConnected(() => this._handleDeviceConnectedIPC());
    const unsubDisconnected = window.deviceAPI.onDeviceDisconnected(() => this._handleDeviceDisconnectedIPC());

    // Only track valid unsubscribe functions
    if (typeof unsubConnected === 'function') {
      this._ipcUnsubscribers.push(unsubConnected);
    }
    if (typeof unsubDisconnected === 'function') {
      this._ipcUnsubscribers.push(unsubDisconnected);
    }
  }

  /**
   * Refresh device information by updating status from main process
   * @private
   */
  async _refreshDeviceInfo() {
    await this.deviceService.updateDeviceStatus();
  }

  /**
   * Handle device connected IPC event
   * @private
   */
  async _handleDeviceConnectedIPC() {
    await this._refreshDeviceInfo();
  }

  /**
   * Handle device disconnected IPC event
   * @private
   */
  async _handleDeviceDisconnectedIPC() {
    await this._refreshDeviceInfo();

    // Publish high-level event for streaming orchestrator to handle
    this.eventBus.publish(EventChannels.DEVICE.DISCONNECTED_DURING_SESSION);
  }

  /**
   * Cleanup resources
   */
  async onCleanup() {
    // Cleanup IPC listeners using stored unsubscribe functions
    for (const unsubscribe of this._ipcUnsubscribers) {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    }
    this._ipcUnsubscribers = [];
    this.logger.info('IPC device listeners removed');

    // Cleanup device service
    if (this.deviceService && typeof this.deviceService.dispose === 'function') {
      this.deviceService.dispose();
    }
  }
}
