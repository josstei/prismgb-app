import type { MediaDeviceInfo } from '../adapters/media-adapter.interface';

/**
 * Device connection status.
 */
export interface DeviceConnectionStatus {
  connected: boolean;
  deviceId?: string;
  label?: string;
}

/**
 * Interface for device service.
 */
export interface IDeviceService {
  /**
   * Get current connection status.
   */
  getConnectionStatus(): Promise<DeviceConnectionStatus>;

  /**
   * Get available video input devices.
   */
  getVideoDevices(): Promise<MediaDeviceInfo[]>;

  /**
   * Get the currently selected device ID.
   */
  getSelectedDeviceId(): string | null;

  /**
   * Set the selected device ID.
   */
  setSelectedDeviceId(deviceId: string): void;

  /**
   * Check if a supported device is available.
   */
  hasSupportedDevice(): Promise<boolean>;
}
