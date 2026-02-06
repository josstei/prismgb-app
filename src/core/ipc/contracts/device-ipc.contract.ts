/**
 * Device status returned by GET_STATUS channel.
 */
export interface DeviceStatusResponse {
  connected: boolean;
  vendorId?: number;
  productId?: number;
  deviceName?: string;
}

/**
 * Device connected event payload.
 */
export interface DeviceConnectedPayload {
  vendorId: number;
  productId: number;
  deviceName: string;
}

/**
 * Device disconnected event payload.
 */
export interface DeviceDisconnectedPayload {
  vendorId: number;
  productId: number;
}
