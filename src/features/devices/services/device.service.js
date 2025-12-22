/**
 * Device Service
 *
 * Handles device enumeration and status management
 * 100% UI-agnostic - emits events instead of calling UI directly
 *
 * Events emitted:
 * - 'device:status-changed' - Device connection status changed
 */

import { BaseService } from '@shared/base/service.js';
import { DeviceDetectionHelper } from '../shared/device-detection.js';
import { DeviceRegistry } from '../shared/device-registry.js';
import { TIMING } from '@shared/config/constants.js';
import { EventChannels } from '@infrastructure/events/event-channels.js';

/**
 * Generate device-specific storage key
 * @param {string|null} deviceType - Device type identifier (e.g., 'chromatic-mod-retro')
 * @returns {string} Storage key for device ID
 */
function getDeviceStorageKey(deviceType) {
  return `${deviceType || 'device'}_id`;
}

class DeviceService extends BaseService {
  /**
   * @param {Object} dependencies - Injected dependencies
   * @param {EventBus} dependencies.eventBus - Event publisher
   * @param {Function} dependencies.loggerFactory - Logger factory
   * @param {IDeviceStatusProvider} dependencies.deviceStatusProvider - USB device status provider
   * @param {StorageService} [dependencies.storageService] - Browser storage abstraction
   * @param {MediaDevicesService} [dependencies.mediaDevicesService] - Media devices abstraction
   */
  constructor(dependencies) {
    super(dependencies, ['eventBus', 'loggerFactory', 'deviceStatusProvider'], 'DeviceService');

    // Browser abstraction services (optional for backwards compat in tests)
    this.storageService = dependencies.storageService;
    this.mediaDevicesService = dependencies.mediaDevicesService;

    // State
    this.videoDevices = [];
    this.isConnected = false;
    this.hasMediaPermission = false;
    this._enumerateInFlight = null;
    this._lastEnumerateAt = 0;
    this._enumerateCooldownMs = TIMING.DEVICE_ENUMERATE_COOLDOWN_MS;
    this._lastEnumerateResult = null;
  }

  /**
   * Get stored device ID from storage
   * Used to target a specific device during permission requests
   * @private
   * @param {string|null} deviceType - Device type identifier (e.g., 'chromatic-mod-retro')
   * @returns {string|null}
   */
  _getStoredDeviceId(deviceType) {
    try {
      const key = getDeviceStorageKey(deviceType);
      return this.storageService?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Store device ID in storage
   * @private
   * @param {string} deviceId
   * @param {string|null} deviceType - Device type identifier (e.g., 'chromatic-mod-retro')
   */
  _storeDeviceId(deviceId, deviceType) {
    try {
      const key = getDeviceStorageKey(deviceType);
      this.storageService?.setItem(key, deviceId);
    } catch {
      // Storage not available (e.g., in tests)
    }
  }


  /**
   * Get stored device IDs for all registered devices
   * @private
   * @returns {string[]} Stored device IDs (unique)
   */
  _getRegisteredStoredDeviceIds() {
    const registeredIds = DeviceRegistry.getAll().map(device => device.id);
    const storedIds = registeredIds
      .map(id => this._getStoredDeviceId(id))
      .filter(Boolean);
    return Array.from(new Set(storedIds));
  }

  /**
   * Get stored device IDs for registered devices
   * @returns {string[]} Stored device IDs (unique)
   */
  getRegisteredStoredDeviceIds() {
    return this._getRegisteredStoredDeviceIds();
  }

  /**
   * Check if a device label matches a supported device
   * Delegates to DeviceDetectionHelper for consistent detection across the codebase
   * @private
   * @param {string} label - Device label
   * @returns {string|null} Device type ID if matched, null otherwise
   */
  _isMatchingDevice(label) {
    return DeviceDetectionHelper.matchesByLabel(label);
  }

  /**
   * Get selected device ID for streaming
   * Returns first matching supported device from enumerated devices.
   * @returns {string|null} Device ID or null if no supported device found
   */
  getSelectedDeviceId() {
    const matchedDevice = this.videoDevices.find(device =>
      this._isMatchingDevice(device.label)
    );
    return matchedDevice ? matchedDevice.deviceId : null;
  }

  /**
   * Invalidate the enumeration cache
   * Call this when device status changes to prevent stale data
   * @private
   */
  _invalidateEnumerationCache() {
    this._lastEnumerateResult = null;
    this._lastEnumerateAt = 0;
    this.logger.debug('Enumeration cache invalidated');
  }

  /**
   * Update device connection status from main process
   * Invalidates enumeration cache if connection state changed.
   * @returns {Promise<Object>} Device status with connected boolean
   * @throws {Error} If status check fails
   */
  async updateDeviceStatus() {
    try {
      const status = await this.deviceStatusProvider.getDeviceStatus();
      const connected = status.connected;

      // Invalidate cache if connection state changed
      if (this.isConnected !== connected) {
        this._invalidateEnumerationCache();
      }

      // Update state
      this.isConnected = connected;

      this.logger.info(`Device status: ${connected ? 'CONNECTED' : 'DISCONNECTED'}`);

      // Emit event
      this.eventBus.publish(EventChannels.DEVICE.STATUS_CHANGED, status);

      return status;
    } catch (error) {
      this.logger.error('Error updating device status:', error);
      throw error;
    }
  }

  /**
   * Get current connection status
   * @returns {boolean} True if device is connected
   */
  isDeviceConnected() {
    return this.isConnected;
  }

  /**
   * Enumerate available webcam devices
   * Implements deduplication and caching to prevent burst calls.
   * @returns {Promise<Object>} Result with devices array and connected boolean
   */
  async enumerateDevices() {
    // Deduplicate bursts of enumerate calls from devicechange/IPCs
    if (this._enumerateInFlight) {
      this.logger.debug('Device enumeration already in flight, reusing promise');
      return this._enumerateInFlight;
    }

    const now = Date.now();
    if (this._lastEnumerateResult && (now - this._lastEnumerateAt) < this._enumerateCooldownMs) {
      this.logger.debug('Returning cached enumeration result (cooldown window)');
      return this._lastEnumerateResult;
    }

    this._enumerateInFlight = (async () => {
      try {
        // Get authoritative device status from main process (USB detection)
        const deviceStatus = await this.deviceStatusProvider.getDeviceStatus();
        const connected = deviceStatus.connected;

        this.logger.info(`Main process device status: ${connected ? 'CONNECTED' : 'NOT CONNECTED'}`);

        // Update state
        this.isConnected = connected;

        let videoDevices = [];
        try {
          const devices = await this.mediaDevicesService.enumerateDevices();
          const allVideos = devices.filter(device => device.kind === 'videoinput');

          this.logger.info(`Found ${allVideos.length} total webcam(s)`);

          videoDevices = allVideos.filter(device =>
            this._isMatchingDevice(device.label)
          );

          this.logger.info(`Filtered to ${videoDevices.length} supported device(s)`);

          if (videoDevices.length > 0) {
            this.hasMediaPermission = true;
            const deviceType = DeviceDetectionHelper.detectDeviceType(videoDevices[0]);
            this._storeDeviceId(videoDevices[0].deviceId, deviceType);
          } else if (allVideos.length > 0 && allVideos.every(d => !d.label)) {
            this.logger.debug('Devices found but no labels - permission pending');
          }
        } catch (error) {
          this.logger.warn('Could not enumerate webcams:', error?.message || error);
          this.eventBus.publish(EventChannels.DEVICE.ENUMERATION_FAILED, {
            error: error?.message || 'Enumeration failed',
            reason: 'webcam_access'
          });
        }

        // Store devices
        this.videoDevices = videoDevices;

        const result = {
          devices: videoDevices,
          connected
        };

        // Skip cache when connected but no devices found (webcam label race)
        if (videoDevices.length > 0 || !connected) {
          this._lastEnumerateResult = result;
          this._lastEnumerateAt = Date.now();
        }
        return result;
      } catch (error) {
        this.logger.error('Error enumerating devices:', error);
        throw error;
      } finally {
        this._enumerateInFlight = null;
      }
    })();

    return this._enumerateInFlight;
  }

  /**
   * Discover and return a supported device
   * Attempts to find device using stored IDs, then falls back to permission request.
   * @returns {Promise<MediaDeviceInfo|null>} Supported device or null if not found
   */
  async discoverSupportedDevice() {
    const deviceStatus = await this.deviceStatusProvider.getDeviceStatus();
    if (!deviceStatus.connected) {
      return null;
    }

    const storedIds = this._getRegisteredStoredDeviceIds();
    if (storedIds.length > 0 && this.hasMediaPermission && this.videoDevices.length > 0) {
      const device = this.videoDevices.find(d => storedIds.includes(d.deviceId));
      if (device) return device;
    }

    const allDevices = await this.mediaDevicesService.enumerateDevices();
    const videoDevices = allDevices.filter(d => d.kind === 'videoinput');

    // Check devices with existing labels
    for (const device of videoDevices) {
      if (device.label && this._isMatchingDevice(device.label)) {
        return this._cacheAndReturnDevice(device);
      }
    }

    // Try stored IDs first (preferred - avoids poking unknown cameras)
    for (const deviceId of storedIds) {
      const matchedDevice = await this._tryGetPermissionForDevice(deviceId);
      if (matchedDevice) return matchedDevice;
    }

    this.logger.warn('No supported device found');
    return null;
  }

  /**
   * Try to get permission for a specific device and find supported device
   * @private
   */
  async _tryGetPermissionForDevice(deviceId) {
    let tempStream = null;
    try {
      tempStream = await this.mediaDevicesService.getUserMedia({
        video: { deviceId: { exact: deviceId } }
      });
      tempStream.getTracks().forEach(track => track.stop());
      tempStream = null;

      const devicesWithLabels = await this.mediaDevicesService.enumerateDevices();
      const matchedDevice = devicesWithLabels
        .filter(d => d.kind === 'videoinput')
        .find(d => this._isMatchingDevice(d.label));

      if (matchedDevice) {
        return this._cacheAndReturnDevice(matchedDevice);
      }
    } catch {
      // Device not accessible, try next
    } finally {
      tempStream?.getTracks().forEach(track => track.stop());
    }
    return null;
  }

  /**
   * Cache device info and return
   * @private
   */
  _cacheAndReturnDevice(device) {
    if (!this.cacheSupportedDevice(device)) {
      return null;
    }
    return device;
  }

  /**
   * Cache a supported device after successful stream start
   * @param {MediaDeviceInfo} device
   * @returns {boolean} True if cached
   */
  cacheSupportedDevice(device) {
    const deviceType = DeviceDetectionHelper.detectDeviceType(device);
    if (!deviceType || !device?.deviceId) {
      this.logger.warn('Could not cache device - unsupported or missing deviceId');
      return false;
    }

    this._storeDeviceId(device.deviceId, deviceType);
    this.hasMediaPermission = true;
    this.videoDevices = [device];
    return true;
  }

  /**
   * Set up listener for device connection changes
   * Listens to navigator.mediaDevices 'devicechange' events.
   */
  setupDeviceChangeListener() {
    this._deviceChangeHandler = async () => {
      this.logger.info('Device change detected');
      await this.updateDeviceStatus();
    };
    this.mediaDevicesService.addEventListener('devicechange', this._deviceChangeHandler);
    this.logger.info('Device change listener set up');
  }

  /**
   * Dispose and cleanup event listeners
   */
  dispose() {
    if (this._deviceChangeHandler) {
      this.mediaDevicesService.removeEventListener('devicechange', this._deviceChangeHandler);
      this._deviceChangeHandler = null;
    }
  }
}

export { DeviceService };
