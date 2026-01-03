import { IDeviceStatusProvider } from '@shared/interfaces/device-status-provider.interface.js';

export class DeviceIpcStatusAdapter extends IDeviceStatusProvider {
  constructor(ipcClient) {
    super();
    this.ipcClient = ipcClient;
  }

  async getDeviceStatus() {
    return this.ipcClient.getDeviceStatus();
  }
}
