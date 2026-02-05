import type { IDeviceProfile } from './device-profile.interface';
import { chromaticProfile } from './profiles/chromatic.profile';

/**
 * Registry of supported device profiles.
 */
export class DeviceRegistry {
  private static instance: DeviceRegistry;
  private readonly profiles: Map<string, IDeviceProfile> = new Map();

  private constructor() {
    this.register(chromaticProfile);
  }

  /**
   * Get singleton instance.
   */
  static getInstance(): DeviceRegistry {
    if (!DeviceRegistry.instance) {
      DeviceRegistry.instance = new DeviceRegistry();
    }
    return DeviceRegistry.instance;
  }

  /**
   * Register a device profile.
   */
  register(profile: IDeviceProfile): void {
    this.profiles.set(profile.name, profile);
  }

  /**
   * Get a profile by name.
   */
  get(name: string): IDeviceProfile | undefined {
    return this.profiles.get(name);
  }

  /**
   * Get all registered profiles.
   */
  getAll(): IDeviceProfile[] {
    return Array.from(this.profiles.values());
  }

  /**
   * Find a profile matching USB identifiers.
   */
  findByUsb(vendorId: number, productId: number): IDeviceProfile | undefined {
    for (const profile of this.profiles.values()) {
      if (profile.matchesUsb(vendorId, productId)) {
        return profile;
      }
    }
    return undefined;
  }

  /**
   * Find a profile matching device label.
   */
  findByLabel(label: string): IDeviceProfile | undefined {
    for (const profile of this.profiles.values()) {
      if (profile.matchesLabel(label)) {
        return profile;
      }
    }
    return undefined;
  }

  /**
   * Check if a USB device is supported.
   */
  isSupported(vendorId: number, productId: number): boolean {
    return this.findByUsb(vendorId, productId) !== undefined;
  }
}

/**
 * Default device registry instance.
 */
export const deviceRegistry = DeviceRegistry.getInstance();
