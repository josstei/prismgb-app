import { ipcMain } from 'electron';
import type { DeviceStatusPayload } from '@platform/devices';
import type { IpcPushBridge } from './ipc-push.bridge';

/** tests/e2e/helpers/device-ipc.helper.js emits on these strings verbatim. */
export const TEST_CONTROL_CHANNELS = Object.freeze({
  SET_DEVICE_STATUS: 'prismgb:test-control:set-device-status',
  CLEAR_DEVICE_STATUS: 'prismgb:test-control:clear-device-status',
  EMIT_PUSH: 'prismgb:test-control:emit-push'
});

export interface TestControl {
  readonly deviceStatusOverride: DeviceStatusPayload | null;
  dispose(): void;
}

/** E2E hooks; installed only when the Playwright fixture sets PRISMGB_E2E_TEST_CONTROL=1. */
export function installTestControl(push: IpcPushBridge): TestControl | null {
  if (process.env.PRISMGB_E2E_TEST_CONTROL !== '1') {
    return null;
  }

  let deviceStatusOverride: DeviceStatusPayload | null = null;
  const listeners = {
    [TEST_CONTROL_CHANNELS.SET_DEVICE_STATUS]: (_event: unknown, payload: DeviceStatusPayload) => {
      deviceStatusOverride = payload;
    },
    [TEST_CONTROL_CHANNELS.CLEAR_DEVICE_STATUS]: () => {
      deviceStatusOverride = null;
    },
    [TEST_CONTROL_CHANNELS.EMIT_PUSH]: (_event: unknown, payload: { channel: string; data?: unknown }) => {
      push.emit(payload.channel, payload.data);
    }
  };

  for (const [channel, listener] of Object.entries(listeners)) {
    ipcMain.on(channel, listener);
  }

  return {
    get deviceStatusOverride() {
      return deviceStatusOverride;
    },
    dispose() {
      for (const [channel, listener] of Object.entries(listeners)) {
        ipcMain.off(channel, listener);
      }
    }
  };
}
