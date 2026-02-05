/**
 * USB device identifiers.
 */
export interface UsbIdentifier {
  vendorId: number;
  productId: number;
}

/**
 * Display configuration.
 */
export interface DisplayConfig {
  nativeWidth: number;
  nativeHeight: number;
  frameRate: number;
  aspectRatio: string;
}

/**
 * Media constraints for stream acquisition.
 */
export interface MediaConstraintConfig {
  width: { ideal: number };
  height: { ideal: number };
  frameRate: { ideal: number };
}

/**
 * Interface for device profiles.
 */
export interface IDeviceProfile {
  readonly name: string;
  readonly usbIdentifiers: UsbIdentifier[];
  readonly display: DisplayConfig;

  /**
   * Get media constraints for stream acquisition.
   */
  getMediaConstraints(): MediaConstraintConfig;

  /**
   * Check if this profile matches a USB device.
   */
  matchesUsb(vendorId: number, productId: number): boolean;

  /**
   * Check if this profile matches a device label.
   */
  matchesLabel(label: string): boolean;
}
