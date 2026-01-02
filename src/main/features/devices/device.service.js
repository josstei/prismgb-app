/**
 * Device Service (Main)
 * Handles device detection, connection, and disconnection
 * Integrates with ProfileRegistry for profile-based device matching
 */

import { BaseService } from '@shared/base/service.base.js';
import usbDetection from 'usb-detection';
import { appConfig } from '@shared/config/config-loader.utils.js';
import { formatDeviceInfo } from '@shared/utils/formatters.utils.js';
import { forEachDeviceWithModule } from '@shared/features/devices/device-iterator.utils.js';
import { DeviceRegistry } from '@shared/features/devices/device.registry.js';
import { ChromaticProfile } from '@shared/features/devices/profiles/chromatic/chromatic.profile.js';
import { MainEventChannels } from '@main/infrastructure/events/event-channels.config.js';

const { USB_SCAN_DELAY } = appConfig;

class DeviceService extends BaseService {
  constructor(dependencies) {
    super(dependencies, ['profileRegistry', 'eventBus', 'loggerFactory'], 'DeviceService');
    this.isDeviceConnected = false;
    this.connectedDeviceInfo = null;
    this.usbMonitoring = false;
    this._scanTimeoutId = null;
    this._profilesInitialized = false;
    this._initializationLock = null;
    this._checkDeviceLock = null;
  }

  /**
   * Initialize the device service (must be called after construction)
   * Loads device profiles from the registry
   * Uses mutex to prevent concurrent initialization
   * @returns {Promise<void>}
   */
  async initialize() {
    // Return existing initialization if in progress
    if (this._initializationLock) {
      return this._initializationLock;
    }

    if (this._profilesInitialized) {
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
   * @private
   * @returns {Promise<void>}
   */
  async _performInitialization() {
    await this._initializeProfiles();
    this._profilesInitialized = true;
  }

  /**
   * Initialize device profiles and register them
   * Dynamically loads profiles from the device registry
   * @private
   */
  async _initializeProfiles() {
    try {
      let registeredCount = 0;
      let firstProfileId = null;
      const failedProfiles = [];

      // Register ProfileClasses with DeviceRegistry (main process responsibility)
      DeviceRegistry.registerProfileClass('chromatic-mod-retro', ChromaticProfile);

      // Load profiles from registry using shared iterator
      const devices = [];
      forEachDeviceWithModule('profileModule', (device) => {
        devices.push(device);
      }, { logger: this.logger });

      // Load profiles from registry
      for (const device of devices) {
        try {
          // Get profile class from DeviceRegistry
          const ProfileClass = DeviceRegistry.getProfileClass(device.id);

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
          this.logger.error(`Failed to load profile for ${device.id}:`, error);
          failedProfiles.push({ id: device.id, reason: error.message });
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
   * @returns {boolean} True if monitoring started successfully, false otherwise
   */
  startUSBMonitoring() {
    if (this.usbMonitoring) {
      this.logger.warn('USB monitoring already started');
      return true;
    }

    try {
      // Clean up any existing listeners before creating new ones
      // This prevents duplicate listeners if monitoring was stopped improperly
      this._cleanupUSBListeners();

      // Start monitoring
      usbDetection.startMonitoring();
      this.usbMonitoring = true;

      // Set up event listeners - store references for cleanup
      // Note: Handler reassignment is intentional. If startUSBMonitoring() is called
      // while monitoring is already active, we skip (see guard at top). The handlers
      // are cleaned up in _cleanupUSBListeners() which is called before creating new ones.
      this._onDeviceAdd = (device) => this.onDeviceConnected(device);
      this._onDeviceRemove = (device) => this.onDeviceDisconnected(device);
      usbDetection.on('add', this._onDeviceAdd);
      usbDetection.on('remove', this._onDeviceRemove);

      // Trigger initial scan for already-connected devices
      // This works around usb-detection.find() not working reliably on Linux
      this._scanTimeoutId = setTimeout(() => this._scanAlreadyConnectedDevices(), USB_SCAN_DELAY);

      this.logger.info('USB monitoring started');
      return true;
    } catch (error) {
      this.logger.error('Failed to start USB monitoring', error);
      this.eventBus.publish(MainEventChannels.DEVICE.CHECK_ERROR, {
        type: 'usb-monitoring-failed',
        error: error.message || 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Scan for already-connected devices and manually trigger connection events
   * @private
   */
  async _scanAlreadyConnectedDevices() {
    try {
      this.logger.debug('Scanning for already-connected devices...');

      // Try to get device list
      const devicesObj = await new Promise((resolve) => {
        try {
          usbDetection.find((error, devices) => {
            if (error) {
              this.logger.warn('find() callback error:', error.message);
              resolve([]);
            } else {
              resolve(devices || []);
            }
          });
        } catch (error) {
          this.logger.warn('find() async attempt failed, trying synchronous version:', error.message);
          // Synchronous version
          try {
            const result = usbDetection.find();
            resolve(Object.values(result || {}));
          } catch (syncErr) {
            this.logger.warn('find() failed:', syncErr.message);
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

      // Manually trigger connection events for matching devices
      for (const device of devices) {
        const match = this.matchDevice(device);
        if (match.matched) {
          this.logger.info('Triggering connection event for already-connected device');
          await this.onDeviceConnected(device);
        }
      }
    } catch (error) {
      this.logger.error('Failed to scan for already-connected devices:', error);
    }
  }

  /**
   * Clean up USB event listeners
   * @private
   */
  _cleanupUSBListeners() {
    if (this._onDeviceAdd) {
      usbDetection.off('add', this._onDeviceAdd);
      this._onDeviceAdd = null;
    }
    if (this._onDeviceRemove) {
      usbDetection.off('remove', this._onDeviceRemove);
      this._onDeviceRemove = null;
    }
  }

  /**
   * Stop USB monitoring
   */
  stopUSBMonitoring() {
    if (!this.usbMonitoring) {
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

      usbDetection.stopMonitoring();
      this.usbMonitoring = false;
      this.logger.info('USB monitoring stopped');
    } catch (error) {
      this.logger.error('Failed to stop USB monitoring', error);
    }
  }

  /**
   * Check if device matches configured devices via ProfileRegistry
   * @param {Object} device - USB device object
   * @returns {Object} Match result with matched flag, config, and profile
   */
  matchDevice(device) {
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
   * Check if a supported device is currently connected
   * Uses mutex to prevent concurrent device checks
   */
  async checkForDevice() {
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
   * @private
   * @returns {Promise<boolean>}
   */
  async _performDeviceCheck() {
    try {
      // Get list of all connected USB devices
      let devicesObj;
      try {
        devicesObj = usbDetection.find();
        this.logger.debug(`find() returned ${devicesObj ? Object.keys(devicesObj).length : 0} device(s)`);
      } catch (error) {
        this.logger.warn(`USB detection find() failed: ${error.message}`);
        devicesObj = null;
      }

      // Convert object to array - usb-detection returns { deviceId: device, ... }
      let devices = [];
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
        if (match.matched) {
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
      this.logger.error('Error checking for device', error);
      this.eventBus.publish(MainEventChannels.DEVICE.CHECK_ERROR, {
        error: error.message || 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Handle device connection
   */
  onDeviceConnected(device) {
    const formatted = formatDeviceInfo(device);
    this.logger.info('Device connected', { device: formatted });

    const match = this.matchDevice(device);

    if (match.matched) {
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
  onDeviceDisconnected(device) {
    const formatted = formatDeviceInfo(device);
    this.logger.info('Device disconnected', { device: formatted });

    // Check if this was a tracked device
    const match = this.matchDevice(device);

    if (match.matched) {
      this.logger.info(`Device disconnected: ${match.profile.name}`);

      this.isDeviceConnected = false;
      this.connectedDeviceInfo = null;

      this.eventBus.publish(MainEventChannels.DEVICE.CONNECTION_CHANGED, this.getStatus());
    }
  }

  /**
   * Get current device connection status
   */
  getStatus() {
    return {
      connected: this.isDeviceConnected,
      device: this.connectedDeviceInfo
    };
  }

  /**
   * Check if device is connected
   */
  isConnected() {
    return this.isDeviceConnected;
  }

  /**
   * Get connected device info
   */
  getConnectedDevice() {
    return this.connectedDeviceInfo;
  }
}

export { DeviceService };
