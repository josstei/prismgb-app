/**
 * Device Service (Main)
 * Handles device detection, connection, and disconnection
 * Integrates with ProfileRegistry for profile-based device matching
 */

import { BaseService } from '@prismgb/core';
import { formatDeviceInfo } from '@prismgb/core';
import { forEachDeviceWithModule } from '@prismgb/devices';
import { DeviceRegistry, type DeviceRegistryEntry } from '@prismgb/devices';
import { MainEventChannels } from '@main/infrastructure/events/event-channels.config.js';
import {
  createNodeUsbDeviceMonitor,
  createNoopUsbDeviceMonitor,
  type UsbDeviceInfo,
  type UsbDeviceMonitor
} from './usb-device-monitor.js';
import { UsbMonitoringController, type DeviceConnectionHandler } from './usb-monitoring.controller.js';
import type { DeviceProfileRegistry } from './device-profile.registry.js';
import type { EventBus } from '@main/infrastructure/events/event-bus.js';
import type { LoggerFactoryLike as LoggerFactory } from '@prismgb/core';
import type { DeviceProfile } from '@prismgb/devices';

interface DeviceMatch {
  matched: boolean;
  config: {
    deviceName: string;
    vendorId: number;
    productId: number;
  } | null;
  profile: DeviceProfile | null;
}

interface DeviceStatus {
  connected: boolean;
  device: ConnectedDeviceInfo | null;
}

interface ConnectedDeviceInfo extends UsbDeviceInfo {
  locationId?: number;
  vendorId: number;
  productId: number;
  deviceName?: string;
  manufacturer?: string;
  serialNumber?: string;
  deviceAddress?: number;
  configName: string;
}

type ProfileClass = new () => DeviceProfile;

interface DeviceServiceDependencies {
  profileRegistry: DeviceProfileRegistry;
  eventBus: EventBus;
  loggerFactory: LoggerFactory;
  usbMonitor?: UsbDeviceMonitor;
}

function isTestMode(): boolean {
  return process.argv.includes('--test-mode') || process.env.NODE_ENV === 'test';
}

class DeviceService extends BaseService implements DeviceConnectionHandler {

  private readonly profileRegistry: DeviceProfileRegistry;
  private readonly eventBus: EventBus;
  private isDeviceConnected: boolean;
  private connectedDeviceInfo: ConnectedDeviceInfo | null;
  private _areProfilesInitialized: boolean;
  private _initializationLock: Promise<void> | null;
  private _checkDeviceLock: Promise<boolean> | null;
  private readonly _profileClasses: Map<string, ProfileClass>;
  private readonly _usbMonitor: UsbDeviceMonitor;
  private readonly _usbMonitoringController: UsbMonitoringController;

  constructor(dependencies: DeviceServiceDependencies, profileClasses: Map<string, ProfileClass> = new Map()) {
    super(dependencies, 'DeviceService');
    this.profileRegistry = dependencies.profileRegistry;
    this.eventBus = dependencies.eventBus;
    this.isDeviceConnected = false;
    this.connectedDeviceInfo = null;
    this._areProfilesInitialized = false;
    this._initializationLock = null;
    this._checkDeviceLock = null;
    this._usbMonitor = dependencies.usbMonitor ?? (
      isTestMode() ? createNoopUsbDeviceMonitor() : createNodeUsbDeviceMonitor()
    );

    this._usbMonitoringController = new UsbMonitoringController({
      usbMonitor: this._usbMonitor,
      eventBus: this.eventBus,
      loggerFactory: dependencies.loggerFactory,
      connectionHandler: this
    });
    this.disposables.add(() => this._usbMonitoringController.dispose());

    // Profile classes registered via DI bootstrap
    this._profileClasses = profileClasses;
  }

  /**
   * Initialize the device service (must be called after construction)
   * Loads device profiles from the registry
   * Uses mutex to prevent concurrent initialization
   */
  async initialize(): Promise<void> {
    // Return existing initialization if in progress
    if (this._initializationLock) {
      return this._initializationLock;
    }

    if (this._areProfilesInitialized) {
      this.logger.warn('DeviceService already initialized');
      return;
    }

    this._initializationLock = this._performInitialization();

    try {
      await this._initializationLock;
    } finally {
      this._initializationLock = null;
    }
  }

  /**
   * Perform actual initialization work
   */
  private async _performInitialization(): Promise<void> {
    await this._initializeProfiles();
    this._areProfilesInitialized = true;
  }

  /**
   * Initialize device profiles and register them
   * Dynamically loads profiles from the device registry
   */
  private async _initializeProfiles(): Promise<void> {
    try {
      let registeredCount = 0;
      let firstProfileId: string | null = null;
      const failedProfiles: Array<{ id: string; reason: string }> = [];

      // Register profile classes with DeviceRegistry (injected via DI bootstrap)
      for (const [deviceId, ProfileClass] of this._profileClasses) {
        DeviceRegistry.registerProfileClass(deviceId, ProfileClass);
      }

      // Load profiles from registry using shared iterator
      const devices: DeviceRegistryEntry[] = [];
      forEachDeviceWithModule('profileModule', (device) => {
        devices.push(device);
      }, { logger: this.logger });

      // Load profiles from registry
      for (const device of devices) {
        try {
          // Get profile class from DeviceRegistry
          const ProfileClass = DeviceRegistry.getProfileClass(device.id) as ProfileClass | null;

          if (!ProfileClass) {
            this.logger.error(`No profile class found for device: ${device.id}`);
            failedProfiles.push({ id: device.id, reason: 'No profile class found' });
            continue;
          }

          // Create and register profile instance
          const profileInstance = new ProfileClass();
          this.profileRegistry.registerProfile(profileInstance);

          registeredCount++;

          // Track first profile for default
          if (!firstProfileId) {
            firstProfileId = device.id;
          }

          this.logger.info(`Registered profile for ${device.name} (${device.id})`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(`Failed to load profile for ${device.id}:`, error);
          failedProfiles.push({ id: device.id, reason: errorMessage });
        }
      }

      // Set default profile to the first registered one
      if (firstProfileId) {
        this.profileRegistry.setDefaultProfile(firstProfileId);
      }

      this.logger.info(`Registered ${registeredCount} device profile(s) from registry`);

      // Log summary warning if any profiles failed to load
      if (failedProfiles.length > 0) {
        const failedIds = failedProfiles.map(p => p.id).join(', ');
        this.logger.warn(`Failed to initialize ${failedProfiles.length} device profile(s): ${failedIds}`);
      }

      const requiredProfileIds = new Set(devices.filter(device => device.enabled !== false).map(device => device.id));
      const failedRequiredProfiles = failedProfiles.filter(profile => requiredProfileIds.has(profile.id));

      if (registeredCount === 0) {
        throw new Error('No device profiles were successfully initialized');
      }

      if (failedRequiredProfiles.length > 0) {
        const requiredIds = failedRequiredProfiles.map(profile => profile.id).join(', ');
        throw new Error(`Required device profile(s) failed to initialize: ${requiredIds}`);
      }
    } catch (error) {
      this.logger.error('Failed to initialize device profiles', error);
      throw error; // Re-throw to indicate initialization failure
    }
  }

  startUSBMonitoring(): boolean {
    return this._usbMonitoringController.start();
  }

  stopUSBMonitoring(): void {
    this._usbMonitoringController.stop();
  }

  get isUsbMonitoring(): boolean {
    return this._usbMonitoringController.isMonitoring;
  }

  matchDevice(device: UsbDeviceInfo): DeviceMatch {
    // Match via ProfileRegistry (profile-based)
    const detectionResult = this.profileRegistry.detectDevice(device);
    if (detectionResult.matched && detectionResult.profile) {
      this.logger.info(`Profile matched: ${detectionResult.profile.name}`);
      return {
        matched: true,
        config: {
          deviceName: detectionResult.profile.name,
          vendorId: device.vendorId,
          productId: device.productId
        },
        profile: detectionResult.profile
      };
    }

    return { matched: false, config: null, profile: null };
  }

  /**
   * Refresh device connection status
   * Uses mutex to prevent concurrent device checks
   */
  async refreshDeviceStatus(): Promise<boolean> {
    // Return existing check if in progress
    if (this._checkDeviceLock) {
      return this._checkDeviceLock;
    }

    this._checkDeviceLock = this._performDeviceCheck();

    try {
      return await this._checkDeviceLock;
    } finally {
      this._checkDeviceLock = null;
    }
  }

  /**
   * Perform actual device check
   */
  private async _performDeviceCheck(): Promise<boolean> {
    try {
      let devices: UsbDeviceInfo[] = [];
      try {
        devices = this._usbMonitor.find();
        this.logger.debug(`find() returned ${devices.length} device(s)`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(`USB device scan failed: ${errorMessage}`);
      }

      // Handle undefined/null/empty
      if (!devices || devices.length === 0) {
        this.logger.info('No USB devices found');
        this.isDeviceConnected = false;
        this.connectedDeviceInfo = null;
        return false;
      }

      this.logger.info(`Scanning ${devices.length} USB device(s)...`);

      // Try to match devices via ProfileRegistry
      for (const device of devices) {
        const match = this.matchDevice(device);
        if (match.matched && match.config) {
          const formatted = formatDeviceInfo(device);
          this.logger.info(`Device found: ${match.config.deviceName}`, { device: formatted });
          this.isDeviceConnected = true;
          this.connectedDeviceInfo = { ...device, configName: match.config.deviceName };
          return true;
        }
      }

      this.isDeviceConnected = false;
      this.connectedDeviceInfo = null;
      return false;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Error checking for device', error);
      this.eventBus.publish(MainEventChannels.DEVICE.CHECK_ERROR, {
        error: errorMessage
      });
      return false;
    }
  }

  /**
   * Handle device connection
   */
  onDeviceConnected(device: UsbDeviceInfo): void {
    const formatted = formatDeviceInfo(device);
    this.logger.info('Device connected', { device: formatted });

    const match = this.matchDevice(device);

    if (match.matched && match.config) {
      this.logger.info(`Configured device detected: ${match.config.deviceName}`);

      this.isDeviceConnected = true;
      this.connectedDeviceInfo = { ...device, configName: match.config.deviceName };

      this.eventBus.publish(MainEventChannels.DEVICE.CONNECTION_CHANGED, this.getStatus());
    } else {
      this.logger.info('Device ignored (not a configured device)');
    }
  }

  /**
   * Handle device disconnection
   */
  onDeviceDisconnected(device: UsbDeviceInfo): void {
    const formatted = formatDeviceInfo(device);
    this.logger.info('Device disconnected', { device: formatted });

    // Check if this was a tracked device
    const match = this.matchDevice(device);

    if (match.matched && match.profile) {
      this.logger.info(`Device disconnected: ${match.profile.name}`);

      this.isDeviceConnected = false;
      this.connectedDeviceInfo = null;

      this.eventBus.publish(MainEventChannels.DEVICE.CONNECTION_CHANGED, this.getStatus());
    }
  }

  /**
   * Get current device connection status
   */
  getStatus(): DeviceStatus {
    return {
      connected: this.isDeviceConnected,
      device: this.connectedDeviceInfo
    };
  }

  /**
   * Check if device is connected
   */
  isConnected(): boolean {
    return this.isDeviceConnected;
  }

  /**
   * Get connected device info
   */
  getConnectedDevice(): ConnectedDeviceInfo | null {
    return this.connectedDeviceInfo;
  }
}

export { DeviceService };
export type { DeviceServiceDependencies, DeviceMatch, DeviceStatus, ConnectedDeviceInfo, ProfileClass };
