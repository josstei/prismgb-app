import type { DeviceStatusPayload } from '@prismgb/ipc';
import type { IpcPushBridge } from './event-bridge.js';

export const TEST_CONTROL_CHANNELS = Object.freeze({
  SET_DEVICE_STATUS: 'prismgb:test-control:set-device-status',
  CLEAR_DEVICE_STATUS: 'prismgb:test-control:clear-device-status',
  EMIT_PUSH: 'prismgb:test-control:emit-push'
});

export interface MainProcessTestControlPort {
  getDeviceStatusOverride(): DeviceStatusPayload | null;
  setDeviceStatusOverride(payload: DeviceStatusPayload | null): void;
  emitPush(channel: string, payload?: unknown): void;
}

export class MainProcessTestControl implements MainProcessTestControlPort {
  private readonly enabled: boolean;
  private readonly ipcPushBridge: IpcPushBridge;
  private deviceStatusOverride: DeviceStatusPayload | null = null;

  constructor(dependencies: { enabled?: boolean; ipcPushBridge: IpcPushBridge }) {
    this.enabled = dependencies.enabled ?? false;
    this.ipcPushBridge = dependencies.ipcPushBridge;
  }

  getDeviceStatusOverride(): DeviceStatusPayload | null {
    return this.enabled ? this.deviceStatusOverride : null;
  }

  setDeviceStatusOverride(payload: DeviceStatusPayload | null): void {
    if (!this.enabled) {
      return;
    }

    this.deviceStatusOverride = payload;
  }

  emitPush(channel: string, payload?: unknown): void {
    if (!this.enabled) {
      return;
    }

    this.ipcPushBridge.emit(channel, payload);
  }
}
