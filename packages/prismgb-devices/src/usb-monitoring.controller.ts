/**
 * USB Monitoring Controller (Main)
 *
 * Owns the orchestration of USB hot-plug monitoring: starting and stopping the
 * underlying {@link UsbDeviceMonitor} hardware adapter, registering
 * connect/disconnect listeners, scheduling the initial scan for already-connected
 * devices, and cleaning up listeners and timers. Device matching and
 * connection-state tracking are delegated to a {@link DeviceConnectionHandler}
 * (implemented by `DeviceService`).
 *
 * This split keeps monitoring orchestration out of the device-status service and
 * keeps the low-level hardware adapter free of device/business concerns. See
 * ADR-0003.
 */

import { BaseService } from '@prismgb/core';
import { appConfig } from '@prismgb/config';
import { MainEventChannels } from '@prismgb/events';
import type { UsbDeviceInfo, UsbDeviceMonitor } from './usb-device-monitor.js';
import type { DeviceMatch } from './device.service.js';
import type { DeviceEventBus as EventBus } from './device-host.contracts.js';
import type { LoggerFactoryLike as LoggerFactory } from '@prismgb/core';

const { USB_SCAN_DELAY } = appConfig;
const USB_ADD_LISTENER_LIFECYCLE = Symbol('usbAddListener');
const USB_REMOVE_LISTENER_LIFECYCLE = Symbol('usbRemoveListener');
const USB_INITIAL_SCAN_LIFECYCLE = Symbol('usbInitialScan');

interface DeviceConnectionHandler {
  matchDevice(device: UsbDeviceInfo): DeviceMatch;
  onDeviceConnected(device: UsbDeviceInfo): void;
  onDeviceDisconnected(device: UsbDeviceInfo): void;
}

interface UsbMonitoringControllerDependencies {
  usbMonitor: UsbDeviceMonitor;
  eventBus: EventBus;
  loggerFactory: LoggerFactory;
  connectionHandler: DeviceConnectionHandler;
}

class UsbMonitoringController extends BaseService {

  private readonly _usbMonitor: UsbDeviceMonitor;
  private readonly _events: EventBus;
  private readonly _handler: DeviceConnectionHandler;
  private _isMonitoring: boolean;

  constructor(dependencies: UsbMonitoringControllerDependencies) {
    super(dependencies, 'UsbMonitoringController');
    this._usbMonitor = dependencies.usbMonitor;
    this._events = dependencies.eventBus;
    this._handler = dependencies.connectionHandler;
    this._isMonitoring = false;
  }

  get isMonitoring(): boolean {
    return this._isMonitoring;
  }

  start(): boolean {
    if (this._isMonitoring) {
      this.logger.warn('USB monitoring already started');
      return true;
    }

    let monitoringStarted = false;
    try {
      this._cleanupListeners();

      this._usbMonitor.startMonitoring();
      monitoringStarted = true;

      this._usbMonitor.registerLifecycleListeners(
        (device: UsbDeviceInfo) => this._handler.onDeviceConnected(device),
        (device: UsbDeviceInfo) => this._handler.onDeviceDisconnected(device)
      );
      this.disposables.replace(USB_ADD_LISTENER_LIFECYCLE, () => this._usbMonitor.unregisterLifecycleListeners());

      const scanTimeoutId = setTimeout(() => {
        this.disposables.cancel(USB_INITIAL_SCAN_LIFECYCLE);
        void this._scanAlreadyConnectedDevices();
      }, USB_SCAN_DELAY);
      this.disposables.replace(USB_INITIAL_SCAN_LIFECYCLE, () => clearTimeout(scanTimeoutId));

      this._isMonitoring = true;
      this.logger.info('USB monitoring started');
      return true;
    } catch (error) {
      this.disposables.cancel(USB_INITIAL_SCAN_LIFECYCLE);
      this._cleanupListeners();
      if (monitoringStarted) {
        try {
          this._usbMonitor.stopMonitoring();
        } catch (stopError) {
          this.logger.warn('Failed to stop USB monitoring after startup failure', stopError);
        }
      }
      this._isMonitoring = false;

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to start USB monitoring', error);
      this._events.publish(MainEventChannels.DEVICE.CHECK_ERROR, {
        type: 'usb-monitoring-failed',
        error: errorMessage
      });
      return false;
    }
  }

  stop(): void {
    if (!this._isMonitoring) {
      return;
    }

    try {
      this.disposables.cancel(USB_INITIAL_SCAN_LIFECYCLE);
      this._cleanupListeners();
      this._usbMonitor.stopMonitoring();
      this._isMonitoring = false;
      this.logger.info('USB monitoring stopped');
    } catch (error) {
      this.logger.error('Failed to stop USB monitoring', error);
    }
  }

  private async _scanAlreadyConnectedDevices(): Promise<void> {
    try {
      this.logger.debug('Scanning for already-connected devices...');

      const devices = this._usbMonitor.find();

      if (devices.length === 0) {
        this.logger.debug('No devices found in initial scan');
        return;
      }

      this.logger.debug(`Found ${devices.length} device(s) in initial scan`);

      for (const device of devices) {
        const match = this._handler.matchDevice(device);
        if (match.matched) {
          this.logger.info('Triggering connection event for already-connected device');
          this._handler.onDeviceConnected(device);
        }
      }
    } catch (error) {
      this.logger.error('Failed to scan for already-connected devices:', error);
    }
  }

  private _cleanupListeners(): void {
    this._usbMonitor.unregisterLifecycleListeners();
    this.disposables.cancel(USB_ADD_LISTENER_LIFECYCLE);
    this.disposables.cancel(USB_REMOVE_LISTENER_LIFECYCLE);
  }
}

export { UsbMonitoringController };
export type { DeviceConnectionHandler, UsbMonitoringControllerDependencies };
