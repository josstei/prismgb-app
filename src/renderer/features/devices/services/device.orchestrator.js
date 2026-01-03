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

import { BaseOrchestrator } from '@shared/base/orchestrator.base.js';
import { EventChannels } from '@renderer/infrastructure/events/event-channels.config.js';

export class DeviceOrchestrator extends BaseOrchestrator {
  constructor(dependencies) {
    super(
      dependencies,
      ['deviceService', 'deviceIpcAdapter', 'eventBus', 'loggerFactory'],
      'DeviceOrchestrator'
    );
    // Store unsubscribe function for IPC adapter
    this._unsubscribeIPC = null;
  }

  /**
   * Initialize device orchestrator
   */
  async onInitialize() {
    // Set up device change listener
    this.deviceService.setupDeviceChangeListener();

    // Set up IPC event listeners for USB events via adapter
    this._unsubscribeIPC = this.deviceIpcAdapter.subscribe(
      () => this._handleDeviceConnectedIPC(),
      () => this._handleDeviceDisconnectedIPC()
    );

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
    // Cleanup IPC adapter listeners
    if (typeof this._unsubscribeIPC === 'function') {
      this._unsubscribeIPC();
      this._unsubscribeIPC = null;
    }
    this.logger.info('IPC device listeners removed');

    // Cleanup device service
    if (this.deviceService && typeof this.deviceService.dispose === 'function') {
      this.deviceService.dispose();
    }
  }
}
