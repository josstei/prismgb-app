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
  [key: string]: any;

  constructor(dependencies) {
    super(
      dependencies,
      ['deviceService', 'deviceIpcAdapter', 'deviceOperationSequencer', 'eventBus', 'loggerFactory'],
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

    // Queue initial status check through sequencer
    await this.deviceOperationSequencer.queueRefresh();
  }

  /**
   * Get current device connection status
   */
  isDeviceConnected() {
    return this.deviceService.isDeviceConnected();
  }

  /**
   * Handle device connected IPC event
   * Fire-and-forget: sequencer handles ordering
   * @private
   */
  _handleDeviceConnectedIPC() {
    this.deviceOperationSequencer.queueConnected();
  }

  /**
   * Handle device disconnected IPC event
   * Fire-and-forget: sequencer handles ordering
   * Event is published after status update completes
   * @private
   */
  _handleDeviceDisconnectedIPC() {
    this.deviceOperationSequencer.queueDisconnected(() => {
      this.eventBus.publish(EventChannels.DEVICE.DISCONNECTED_DURING_SESSION);
    });
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

    // Wait for pending operations before cleanup
    await this.deviceOperationSequencer.flush();

    // Cleanup device service
    if (this.deviceService && typeof this.deviceService.dispose === 'function') {
      this.deviceService.dispose();
    }
  }
}
