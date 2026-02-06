/**
 * Device Service (Main)
 * Handles device detection, connection, and disconnection
 * Integrates with ProfileRegistry for profile-based device matching
 */

import { BaseService } from '@shared/base/service.base.js';
import usbDetection, { type Device as USBDetectionDevice } from 'usb-detection';
import { appConfig } from '@shared/config/config-loader.utils.js';
import { formatDeviceInfo } from '@shared/utils/formatters.utils.js';
import { forEachDeviceWithModule } from '@shared/features/devices/device-iterator.utils.js';
import { DeviceRegistry } from '@shared/features/devices/device.registry.js';
import { MainEventChannels } from '@main/infrastructure/events/event-channels.config.js';
import type { DeviceProfileRegistry } from './device-profile.registry.js';
import type { EventBus } from '@main/infrastructure/events/event-bus.js';
import type { LoggerFactory } from '@main/infrastructure/logging/logger.interface.js';
import type { DeviceProfile } from '@shared/features/devices/device-profile.base.js';

const { USB_SCAN_DELAY } = appConfig;

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
  device: any;
}

interface ConnectedDeviceInfo {
  locationId: number;
  vendorId: number;
  productId: number;
  deviceName: string;
  manufacturer: string;
  serialNumber: string;
  deviceAddress: number;
  configName: string;
}

type ProfileClass = new () => DeviceProfile;
type USBDetectionEvent = 'add' | 'remove';

type USBDetectionWithLegacyOff = typeof usbDetection & {
  off?: (event: USBDetectionEvent, callback: (device: USBDetectionDevice) => void) => void;
  removeListener?: (event: USBDetectionEvent, callback: (device: USBDetectionDevice) => void) => void;
};

interface DeviceServiceDependencies {
  profileRegistry: DeviceProfileRegistry;
  eventBus: EventBus;
  loggerFactory: LoggerFactory;
}

class DeviceService extends BaseService {

  private readonly profileRegistry: DeviceProfileRegistry;
  private readonly eventBus: EventBus;
  private isDeviceConnected: boolean;
  private connectedDeviceInfo: ConnectedDeviceInfo | null;
  private isUsbMonitoring: boolean;
  private _scanTimeoutId: NodeJS.Timeout | null;
  private _areProfilesInitialized: boolean;
  private _initializationLock: Promise<void> | null;
  private _checkDeviceLock: Promise<boolean> | null;
  private readonly _profileClasses: Map<string, ProfileClass>;
  private _onDeviceAdd: ((device: USBDetectionDevice) => void) | null;
  private _onDeviceRemove: ((device: USBDetectionDevice) => void) | null;
  private readonly _usbDetection: USBDetectionWithLegacyOff;

  /**
   * @param dependencies - Service dependencies
   * @param profileClasses - Map of device type IDs to profile classes (injected via DI)
   */
  constructor(dependencies: DeviceServiceDependencies, profileClasses: Map<string, ProfileClass> = new Map()) {
    super(dependencies, ['profileRegistry', 'eventBus', 'loggerFactory'], 'DeviceService');
    this.profileRegistry = dependencies.profileRegistry;
    this.eventBus = dependencies.eventBus;
    this.isDeviceConnected = false;
    this.connectedDeviceInfo = null;
    this.isUsbMonitoring = false;
    this._scanTimeoutId = null;
    this._areProfilesInitialized = false;
    this._initializationLock = null;
    this._checkDeviceLock = null;
    this._onDeviceAdd = null;
    this._onDeviceRemove = null;
    this._usbDetection = usbDetection as USBDetectionWithLegacyOff;

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
      const devices: Array<{ id: string; name: string }> = [];
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

      const requiredProfileIds = new Set(['chromatic-mod-retro']);
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

  /**
   * Initialize USB monitoring
   * Publishes DEVICE.CHECK_ERROR event if monitoring fails to start
   * @returns True if monitoring started successfully, false otherwise
   */
  startUSBMonitoring(): boolean {
    if (this.isUsbMonitoring) {
      this.logger.warn('USB monitoring already started');
      return true;
    }

    try {
      // Clean up any existing listeners before creating new ones
      // This prevents duplicate listeners if monitoring was stopped improperly
      this._cleanupUSBListeners();

      // Start monitoring
      this._usbDetection.startMonitoring();
      this.isUsbMonitoring = true;

      // Set up event listeners - store references for cleanup
      // Note: Handler reassignment is intentional. If startUSBMonitoring() is called
      // while monitoring is already active, we skip (see guard at top). The handlers
      // are cleaned up in _cleanupUSBListeners() which is called before creating new ones.
      this._onDeviceAdd = (device: USBDetectionDevice) => this.onDeviceConnected(device);
      this._onDeviceRemove = (device: USBDetectionDevice) => this.onDeviceDisconnected(device);
      this._usbDetection.on('add', this._onDeviceAdd);
      this._usbDetection.on('remove', this._onDeviceRemove);

      // Trigger initial scan for already-connected devices
      // This works around usb-detection.find() not working reliably on Linux
      this._scanTimeoutId = setTimeout(() => this._scanAlreadyConnectedDevices(), USB_SCAN_DELAY);

      this.logger.info('USB monitoring started');
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to start USB monitoring', error);
      this.eventBus.publish(MainEventChannels.DEVICE.CHECK_ERROR, {
        type: 'usb-monitoring-failed',
        error: errorMessage
      });
      return false;
    }
  }

  /**
   * Scan for already-connected devices and manually trigger connection events
   */
  private async _scanAlreadyConnectedDevices(): Promise<void> {
    try {
      this.logger.debug('Scanning for already-connected devices...');

      // Try to get device list
      const devicesObj = await new Promise<USBDetectionDevice[] | Record<string, USBDetectionDevice>>((resolve) => {
        try {
          this._usbDetection.find((error, devices) => {
            if (error) {
              this.logger.warn('find() callback error:', error.message);
              resolve([]);
            } else {
              resolve(devices || []);
            }
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          this.logger.warn('find() async attempt failed, trying synchronous version:', errorMessage);
          // Synchronous version
          try {
            const result = this._usbDetection.find();
            resolve(Object.values(result || {}));
          } catch (syncErr) {
            const syncErrorMessage = syncErr instanceof Error ? syncErr.message : 'Unknown error';
            this.logger.warn('find() failed:', syncErrorMessage);
            resolve([]);
          }
        }
      });

      const devices = Array.isArray(devicesObj) ? devicesObj : Object.values(devicesObj || {});

      if (devices.length === 0) {
        this.logger.debug('No devices found in initial scan');
        return;
      }

      this.logger.debug(`Found ${devices.length} device(s) in initial scan`);

      // Trigger connection events for matching devices
      // Note: matchDevice and onDeviceConnected are synchronous, no await needed
      for (const device of devices) {
        const match = this.matchDevice(device);
        if (match.matched) {
          this.logger.info('Triggering connection event for already-connected device');
          this.onDeviceConnected(device);
        }
      }
    } catch (error) {
      this.logger.error('Failed to scan for already-connected devices:', error);
    }
  }

  /**
   * Clean up USB event listeners
   */
  private _cleanupUSBListeners(): void {
    if (this._onDeviceAdd) {
      if (typeof this._usbDetection.off === 'function') {
        this._usbDetection.off('add', this._onDeviceAdd);
      } else if (typeof this._usbDetection.removeListener === 'function') {
        this._usbDetection.removeListener('add', this._onDeviceAdd);
      }
      this._onDeviceAdd = null;
    }
    if (this._onDeviceRemove) {
      if (typeof this._usbDetection.off === 'function') {
        this._usbDetection.off('remove', this._onDeviceRemove);
      } else if (typeof this._usbDetection.removeListener === 'function') {
        this._usbDetection.removeListener('remove', this._onDeviceRemove);
      }
      this._onDeviceRemove = null;
    }
  }

  /**
   * Stop USB monitoring
   */
  stopUSBMonitoring(): void {
    if (!this.isUsbMonitoring) {
      return;
    }

    try {
      // Cancel pending scan timeout
      if (this._scanTimeoutId) {
        clearTimeout(this._scanTimeoutId);
        this._scanTimeoutId = null;
      }

      // Remove event listeners to prevent memory leaks
      this._cleanupUSBListeners();

      this._usbDetection.stopMonitoring();
      this.isUsbMonitoring = false;
      this.logger.info('USB monitoring stopped');
    } catch (error) {
      this.logger.error('Failed to stop USB monitoring', error);
    }
  }

  /**
   * Check if device matches configured devices via ProfileRegistry
   * @param device - USB device object
   * @returns Match result with matched flag, config, and profile
   */
  matchDevice(device: USBDetectionDevice): DeviceMatch {
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
      // Get list of all connected USB devices
      let devicesObj: any;
      try {
        devicesObj = this._usbDetection.find();
        this.logger.debug(`find() returned ${devicesObj ? Object.keys(devicesObj).length : 0} device(s)`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(`USB detection find() failed: ${errorMessage}`);
        devicesObj = null;
      }

      // Convert object to array - usb-detection returns { deviceId: device, ... }
      let devices: USBDetectionDevice[] = [];
      if (devicesObj && typeof devicesObj === 'object') {
        devices = Object.values(devicesObj);
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
  onDeviceConnected(device: USBDetectionDevice): void {
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
  onDeviceDisconnected(device: USBDetectionDevice): void {
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
