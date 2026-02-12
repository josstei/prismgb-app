import type { DeviceStatusPayload } from '@prismgb/ipc';

export class IDeviceStatusProvider {
  getDeviceStatus(): Promise<DeviceStatusPayload>;
}
