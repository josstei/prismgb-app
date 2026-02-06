import type { DeviceStatusPayload } from '@shared/ipc/preload-api.contract.js';

export class IDeviceStatusProvider {
  [key: string]: any;
  getDeviceStatus(): Promise<DeviceStatusPayload>;
}
