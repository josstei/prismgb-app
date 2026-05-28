import type { DeviceStatusPayload } from '@prismgb/ipc';

export type RendererDeviceStatus = Omit<DeviceStatusPayload, 'connected'> & {
  connected: boolean;
};

export interface DeviceStatusProvider {
  getDeviceStatus(): Promise<RendererDeviceStatus>;
}
