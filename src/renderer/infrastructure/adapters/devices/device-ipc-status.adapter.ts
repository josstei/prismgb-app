import { IDeviceStatusProvider } from '@shared/interfaces/device-status-provider.interface.js';
import type { DeviceStatusPayload } from '@shared/ipc/preload-api.contract.js';

export class DeviceIpcStatusAdapter extends IDeviceStatusProvider {
  ipcClient: { getDeviceStatus: () => Promise<DeviceStatusPayload> };

  constructor(ipcClient: { getDeviceStatus: () => Promise<DeviceStatusPayload> }) {
    super();
    this.ipcClient = ipcClient;
  }

  async getDeviceStatus(): Promise<DeviceStatusPayload> {
    return this.ipcClient.getDeviceStatus();
  }
}
