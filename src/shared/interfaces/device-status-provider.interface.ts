import type { DeviceStatusPayload } from '@shared/ipc/preload-api.contract.js';

export type RendererDeviceStatus = Omit<DeviceStatusPayload, 'connected'> & {
  connected: boolean;
};

export interface DeviceStatusProvider {
  getDeviceStatus(): Promise<RendererDeviceStatus>;
}
