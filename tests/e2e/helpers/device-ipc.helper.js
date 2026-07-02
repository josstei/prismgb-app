import { createChromaticDeviceInfoPayload } from './chromatic-media-environment.helper.js';
import { IPC_CHANNELS } from './ipc-channels.js';

const TEST_CONTROL_CHANNELS = Object.freeze({
  SET_DEVICE_STATUS: 'prismgb:test-control:set-device-status',
  CLEAR_DEVICE_STATUS: 'prismgb:test-control:clear-device-status',
  EMIT_PUSH: 'prismgb:test-control:emit-push',
});

export async function setTestDeviceStatus(app, status) {
  await app.evaluate(
    async ({ ipcMain }, payload) => {
      ipcMain.emit(payload.channel, {}, payload.status);
    },
    { channel: TEST_CONTROL_CHANNELS.SET_DEVICE_STATUS, status }
  );
}

export async function clearTestDeviceStatus(app) {
  await app.evaluate(
    async ({ ipcMain }, channel) => {
      ipcMain.emit(channel, {});
    },
    TEST_CONTROL_CHANNELS.CLEAR_DEVICE_STATUS
  );
}

export async function injectDeviceConnectedEvent(app, deviceInfo = {}) {
  const device = createChromaticDeviceInfoPayload(deviceInfo);

  await app.evaluate(
    async ({ ipcMain }, payload) => {
      ipcMain.emit(payload.testControlChannel, {}, {
        channel: payload.channel,
        data: payload.device,
      });
    },
    {
      testControlChannel: TEST_CONTROL_CHANNELS.EMIT_PUSH,
      channel: IPC_CHANNELS.DEVICE.CONNECTED,
      device
    }
  );
}

export async function injectDeviceDisconnectedEvent(app) {
  await app.evaluate(
    async ({ ipcMain }, payload) => {
      ipcMain.emit(payload.testControlChannel, {}, {
        channel: payload.channel
      });
    },
    {
      testControlChannel: TEST_CONTROL_CHANNELS.EMIT_PUSH,
      channel: IPC_CHANNELS.DEVICE.DISCONNECTED
    }
  );
}
