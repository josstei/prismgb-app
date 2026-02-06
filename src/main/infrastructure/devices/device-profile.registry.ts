/**
 * ProfileRegistry - Central registry for device profiles
 *
 * Manages registration, discovery, and matching of device profiles.
 * Acts as the single source of truth for all supported devices.
 */

import { formatDeviceInfo } from '@shared/utils/formatters.utils.js';
import type { DeviceProfile } from '@shared/features/devices/device-profile.class.js';
import type { Logger, LoggerFactory } from '@main/infrastructure/logging/logger.interface.js';

interface USBDevice {
  vendorId: number;
  productId: number;
  locationId?: number;
  deviceName?: string;
  manufacturer?: string;
  serialNumber?: string;
  deviceAddress?: number;
}

interface DetectionResult {
  matched: boolean;
  profile: DeviceProfile | null;
  method: string | null;
  confidence?: number;
}

interface DeviceProfileRegistryDependencies {
  loggerFactory: LoggerFactory;
}

class DeviceProfileRegistry {
  private readonly logger: Logger;
  private readonly profiles: Map<string, DeviceProfile>;
  private readonly usbIndex: Map<string, DeviceProfile>;
  private defaultProfileId: string | null;

  constructor({ loggerFactory }: DeviceProfileRegistryDependencies) {
    this.logger = loggerFactory.create('DeviceProfileRegistry');
    this.profiles = new Map();
    this.usbIndex = new Map();
    this.defaultProfileId = null;
  }

  /**
   * Register a device profile
   * @param profile - Profile to register
   * @throws Error if profile is invalid or already registered
   */
  registerProfile(profile: DeviceProfile): void {
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
   * @param profileId - Profile ID to unregister
   * @returns True if profile was unregistered
   */
  unregisterProfile(profileId: string): boolean {
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
   */
  private _indexUSBIdentifiers(profile: DeviceProfile): void {
    for (const identifier of profile.usbIdentifiers) {
      const key = this._makeUSBKey(identifier.vendorId, identifier.productId);
      this.usbIndex.set(key, profile);
    }
  }

  /**
   * Remove USB identifiers from index
   */
  private _removeFromUSBIndex(profile: DeviceProfile): void {
    for (const identifier of profile.usbIdentifiers) {
      const key = this._makeUSBKey(identifier.vendorId, identifier.productId);
      this.usbIndex.delete(key);
    }
  }

  /**
   * Create USB lookup key
   */
  private _makeUSBKey(vendorId: number, productId: number): string {
    return `${vendorId}:${productId}`;
  }

  /**
   * Get all registered profiles
   * @returns All profiles
   */
  getAllProfiles(): DeviceProfile[] {
    return Array.from(this.profiles.values());
  }

  /**
   * Get profile by ID
   * @param profileId - Profile ID
   * @returns Profile or null if not found
   */
  getProfileById(profileId: string): DeviceProfile | null {
    return this.profiles.get(profileId) || null;
  }

  /**
   * Get profile by USB VID/PID
   * @param vendorId - USB Vendor ID
   * @param productId - USB Product ID
   * @returns Matching profile or null
   */
  getProfileByUSB(vendorId: number, productId: number): DeviceProfile | null {
    const key = this._makeUSBKey(vendorId, productId);
    return this.usbIndex.get(key) || null;
  }

  /**
   * Detect device and return matching profile
   * @param usbDevice - USB device object with vendorId, productId
   * @returns Detection result
   */
  detectDevice(usbDevice: USBDevice): DetectionResult {
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
   * @param profileId - Profile ID to set as default
   * @returns True if set successfully
   */
  setDefaultProfile(profileId: string): boolean {
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
   * @returns Default profile or null
   */
  getDefaultProfile(): DeviceProfile | null {
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
  clear(): void {
    this.profiles.clear();
    this.usbIndex.clear();
    this.defaultProfileId = null;
    this.logger.info('Registry cleared');
  }
}

export { DeviceProfileRegistry };
export type { DeviceProfileRegistryDependencies, USBDevice, DetectionResult };
