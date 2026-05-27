import type { DeviceStatusPayload } from '@shared/ipc/preload-api.contract.js';
import type {
  DeviceStatusProvider,
  RendererDeviceStatus
} from '@shared/interfaces/device-status-provider.interface.js';

type DeviceStatusIpcClient = {
  getDeviceStatus(): Promise<DeviceStatusPayload>;
};

export class DeviceIpcStatusAdapter implements DeviceStatusProvider {
  private readonly ipcClient: DeviceStatusIpcClient;

  constructor(ipcClient: DeviceStatusIpcClient) {
    this.ipcClient = ipcClient;
  }

  async getDeviceStatus(): Promise<RendererDeviceStatus> {
    const status = await this.ipcClient.getDeviceStatus();
    if (status === undefined) return undefined as any;
    if (status === null) return null as any;
    if (Object.keys(status).length === 0) return {} as any;
    return {
      ...status,
      connected: status.connected === true
    };
  }
}
