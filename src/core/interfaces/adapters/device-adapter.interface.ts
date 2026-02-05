import type { IDisposable } from '../../base/disposable.interface';

/**
 * Device information passed to adapter initialization.
 */
export interface DeviceInfo {
  deviceId: string;
  groupId?: string;
  label?: string;
}

/**
 * Device capabilities returned by adapter.
 */
export interface DeviceCapabilities {
  maxWidth: number;
  maxHeight: number;
  maxFrameRate: number;
  supportedFormats?: string[];
}

/**
 * Device profile containing device-specific configuration.
 */
export interface IDeviceProfile {
  readonly name: string;
  readonly vendorId: number;
  readonly productId: number;
  readonly nativeWidth: number;
  readonly nativeHeight: number;
  readonly frameRate: number;
}

/**
 * Options for stream acquisition.
 */
export interface StreamOptions {
  width?: number;
  height?: number;
  frameRate?: number;
}

/**
 * Interface for device adapters.
 * Adapters handle device-specific stream acquisition and capabilities.
 */
export interface IDeviceAdapter extends IDisposable {
  /**
   * Initialize the adapter with device information.
   */
  initialize(deviceInfo: DeviceInfo): Promise<void>;

  /**
   * Get a media stream from the device.
   */
  getStream(options?: StreamOptions): Promise<MediaStream>;

  /**
   * Release the current stream.
   */
  releaseStream(stream: MediaStream): Promise<void>;

  /**
   * Get device capabilities.
   */
  getCapabilities(): DeviceCapabilities;

  /**
   * Get device profile.
   */
  getProfile(): IDeviceProfile;
}
