/**
 * Media device information.
 */
export interface MediaDeviceInfo {
  deviceId: string;
  groupId: string;
  kind: 'videoinput' | 'audioinput' | 'audiooutput';
  label: string;
}

/**
 * Interface for browser media API adapters.
 */
export interface IMediaAdapter {
  /**
   * Enumerate available media devices.
   */
  enumerateDevices(): Promise<MediaDeviceInfo[]>;

  /**
   * Get user media stream with constraints.
   */
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;

  /**
   * Check if getUserMedia is supported.
   */
  isSupported(): boolean;
}
