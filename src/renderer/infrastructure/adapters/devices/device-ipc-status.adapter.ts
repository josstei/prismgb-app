import { IDeviceStatusProvider } from '@shared/interfaces/device-status-provider.interface.js';
import type { DeviceStatusPayload } from '@prismgb/ipc';

export class DeviceIpcStatusAdapter extends IDeviceStatusProvider {
  static readonly dependencies = ['ipcClient'] as const;

  ipcClient: { getDeviceStatus: () => Promise<DeviceStatusPayload> };

  constructor(
    dependencies:
      | { ipcClient: { getDeviceStatus: () => Promise<DeviceStatusPayload> } }
      | { getDeviceStatus: () => Promise<DeviceStatusPayload> }
  ) {
    super();
    this.ipcClient = 'ipcClient' in dependencies ? dependencies.ipcClient : dependencies;
  }

  async getDeviceStatus(): Promise<DeviceStatusPayload> {
    return this.ipcClient.getDeviceStatus();
  }
}
