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

import { BaseOrchestrator } from '@prismgb/core';
import { EventChannels } from '@renderer/application/config/event-channels';

export class DeviceOrchestrator extends BaseOrchestrator {
  static readonly dependencies = [
    'deviceMediaService',
    'deviceIpcAdapter',
    'deviceOperationSequencer',
    'eventBus',
    'loggerFactory'
  ] as const;

  constructor(dependencies) {
    super(
      dependencies,
      [...DeviceOrchestrator.dependencies],
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
    this.deviceMediaService.setupDeviceChangeListener(async () => {
      await this.deviceOperationSequencer.queueRefresh();
    });

    // Set up IPC event listeners for USB events via adapter
    this._unsubscribeIPC = this.deviceIpcAdapter.subscribe(
      () => this._handleDeviceConnectedIPC(),
      () => this._handleDeviceDisconnectedIPC()
    );

    // Queue initial status check through sequencer
    await this.deviceOperationSequencer.queueRefresh();
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
    if (this.deviceMediaService && typeof this.deviceMediaService.dispose === 'function') {
      this.deviceMediaService.dispose();
    }
  }
}
