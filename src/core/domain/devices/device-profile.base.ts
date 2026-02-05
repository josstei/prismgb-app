import type {
  IDeviceProfile,
  UsbIdentifier,
  DisplayConfig,
  MediaConstraintConfig
} from './device-profile.interface';

/**
 * Configuration for creating a device profile.
 */
export interface DeviceProfileConfig {
  name: string;
  usbIdentifiers: UsbIdentifier[];
  display: DisplayConfig;
  labelPatterns?: RegExp[];
}

/**
 * Base implementation of device profile.
 */
export abstract class DeviceProfile implements IDeviceProfile {
  readonly name: string;
  readonly usbIdentifiers: UsbIdentifier[];
  readonly display: DisplayConfig;
  protected readonly labelPatterns: RegExp[];

  constructor(config: DeviceProfileConfig) {
    this.name = config.name;
    this.usbIdentifiers = config.usbIdentifiers;
    this.display = config.display;
    this.labelPatterns = config.labelPatterns ?? [];
  }

  getMediaConstraints(): MediaConstraintConfig {
    return {
      width: { ideal: this.display.nativeWidth },
      height: { ideal: this.display.nativeHeight },
      frameRate: { ideal: this.display.frameRate }
    };
  }

  matchesUsb(vendorId: number, productId: number): boolean {
    return this.usbIdentifiers.some(
      (id) => id.vendorId === vendorId && id.productId === productId
    );
  }

  matchesLabel(label: string): boolean {
    if (!label) return false;
    const normalizedLabel = label.toLowerCase();
    return this.labelPatterns.some((pattern) => pattern.test(normalizedLabel));
  }
}
