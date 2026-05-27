import { createChromaticUsbDeviceInfo } from '../../support/chromatic-device-specs.js';
import { IPC_CHANNELS } from '../../support/ipc-channels.js';

export async function setMockDeviceStatus(app, mockStatus) {
  await app.evaluate(
    async (_, status) => {
      global.__testMockDeviceStatus = status;
    },
    mockStatus
  );
}

export async function clearMockDeviceStatus(app) {
  await app.evaluate(async () => {
    delete global.__testMockDeviceStatus;
  });
}

export async function injectDeviceConnectedEvent(app, deviceInfo = {}) {
  const device = createChromaticUsbDeviceInfo(deviceInfo);

  await app.evaluate(
    async ({ BrowserWindow }, payload) => {
      const windows = BrowserWindow.getAllWindows();
      const mainWindow = windows[0];
      if (mainWindow?.webContents) {
        mainWindow.webContents.send(payload.channel, payload.device);
      }
    },
    { channel: IPC_CHANNELS.DEVICE.CONNECTED, device }
  );
}

export async function injectDeviceDisconnectedEvent(app) {
  await app.evaluate(
    async ({ BrowserWindow }, payload) => {
      const windows = BrowserWindow.getAllWindows();
      const mainWindow = windows[0];
      if (mainWindow?.webContents) {
        mainWindow.webContents.send(payload.channel);
      }
    },
    { channel: IPC_CHANNELS.DEVICE.DISCONNECTED }
  );
}
