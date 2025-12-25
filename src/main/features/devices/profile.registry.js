/**
 * ProfileRegistry - Central registry for device profiles
 *
 * Manages registration, discovery, and matching of device profiles.
 * Acts as the single source of truth for all supported devices.
 */

import { formatDeviceInfo } from '@shared/utils/formatters.js';

class ProfileRegistry {
  constructor({ loggerFactory }) {
    this.logger = loggerFactory.create('ProfileRegistry');
    this.profiles = new Map(); // profileId -> DeviceProfile
    this.usbIndex = new Map();  // "vendorId:productId" -> DeviceProfile
    this.defaultProfileId = null;
  }

  /**
   * Register a device profile
   * @param {DeviceProfile} profile - Profile to register
   * @throws {Error} If profile is invalid or already registered
   */
  registerProfile(profile) {
    if (!profile || !profile.id) {
      throw new Error('ProfileRegistry: Invalid profile');
    }

    // Check for duplicate registration
    if (this.profiles.has(profile.id)) {
      this.logger.warn(`Profile already registered: ${profile.id}`);
      return;
    }

    // Register profile
    this.profiles.set(profile.id, profile);

    // Index USB identifiers for fast lookup
    this._indexUSBIdentifiers(profile);

    this.logger.info(`Registered profile: ${profile.name} (${profile.id})`);
    this.logger.info(`  USB identifiers: ${profile.usbIdentifiers.length}`);
    this.logger.info(`  Resolution: ${profile.display.nativeResolution.width}x${profile.display.nativeResolution.height}`);
    this.logger.info(`  Capabilities: ${Array.from(profile.capabilities).join(', ')}`);
  }

  /**
   * Unregister a device profile
   * @param {string} profileId - Profile ID to unregister
   * @returns {boolean} True if profile was unregistered
   */
  unregisterProfile(profileId) {
    const profile = this.profiles.get(profileId);
    if (!profile) {
      return false;
    }

    // Remove from USB index
    this._removeFromUSBIndex(profile);

    // Remove from registry
    this.profiles.delete(profileId);

    // Clear default if it was the default
    if (this.defaultProfileId === profileId) {
      this.defaultProfileId = null;
    }

    this.logger.info(`Unregistered profile: ${profileId}`);
    return true;
  }

  /**
   * Index USB identifiers for fast lookup
   * @private
   */
  _indexUSBIdentifiers(profile) {
    for (const identifier of profile.usbIdentifiers) {
      const key = this._makeUSBKey(identifier.vendorId, identifier.productId);
      this.usbIndex.set(key, profile);
    }
  }

  /**
   * Remove USB identifiers from index
   * @private
   */
  _removeFromUSBIndex(profile) {
    for (const identifier of profile.usbIdentifiers) {
      const key = this._makeUSBKey(identifier.vendorId, identifier.productId);
      this.usbIndex.delete(key);
    }
  }

  /**
   * Create USB lookup key
   * @private
   */
  _makeUSBKey(vendorId, productId) {
    return `${vendorId}:${productId}`;
  }

  /**
   * Get all registered profiles
   * @returns {Array<DeviceProfile>} All profiles
   */
  getAllProfiles() {
    return Array.from(this.profiles.values());
  }

  /**
   * Get profile by ID
   * @param {string} profileId - Profile ID
   * @returns {DeviceProfile|null} Profile or null if not found
   */
  getProfileById(profileId) {
    return this.profiles.get(profileId) || null;
  }

  /**
   * Get profile by USB VID/PID
   * @param {number} vendorId - USB Vendor ID
   * @param {number} productId - USB Product ID
   * @returns {DeviceProfile|null} Matching profile or null
   */
  getProfileByUSB(vendorId, productId) {
    const key = this._makeUSBKey(vendorId, productId);
    return this.usbIndex.get(key) || null;
  }

  /**
   * Detect device and return matching profile
   * @param {Object} usbDevice - USB device object with vendorId, productId
   * @returns {DetectionResult} Detection result
   */
  detectDevice(usbDevice) {
    if (!usbDevice || !usbDevice.vendorId || !usbDevice.productId) {
      return {
        matched: false,
        profile: null,
        method: null
      };
    }

    // Try USB VID/PID match first (fastest)
    const profile = this.getProfileByUSB(usbDevice.vendorId, usbDevice.productId);

    if (profile) {
      const formatted = formatDeviceInfo(usbDevice);
      this.logger.info(`Device matched: ${profile.name}`, { device: formatted });

      return {
        matched: true,
        profile: profile,
        method: 'usb-vid-pid',
        confidence: 1.0
      };
    }

    // No match found
    return {
      matched: false,
      profile: null,
      method: null
    };
  }

  /**
   * Set default profile
   * @param {string} profileId - Profile ID to set as default
   * @returns {boolean} True if set successfully
   */
  setDefaultProfile(profileId) {
    if (!this.profiles.has(profileId)) {
      this.logger.warn(`Cannot set default: profile not found: ${profileId}`);
      return false;
    }

    this.defaultProfileId = profileId;
    this.logger.info(`Default profile set: ${profileId}`);
    return true;
  }

  /**
   * Get default profile
   * @returns {DeviceProfile|null} Default profile or null
   */
  getDefaultProfile() {
    if (this.defaultProfileId) {
      return this.getProfileById(this.defaultProfileId);
    }

    // If no default set, return first registered profile
    const profiles = this.getAllProfiles();
    return profiles.length > 0 ? profiles[0] : null;
  }

  /**
   * Clear all profiles
   */
  clear() {
    this.profiles.clear();
    this.usbIndex.clear();
    this.defaultProfileId = null;
    this.logger.info('Registry cleared');
  }
}

export { ProfileRegistry };
