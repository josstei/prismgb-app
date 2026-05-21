import type { DeviceStatusPayload } from '@shared/ipc/preload-api.contract.js';

export class IDeviceStatusProvider {
  async getDeviceStatus(): Promise<DeviceStatusPayload> {
    throw new Error('Not implemented');
  }
}
