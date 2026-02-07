import type { DeviceStatusPayload } from '@shared/ipc/preload-api.contract.js';

export class IDeviceStatusProvider {
  getDeviceStatus(): Promise<DeviceStatusPayload>;
}
