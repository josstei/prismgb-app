/**
 * Device IPC Handlers
 * Registers device-related IPC routes.
 */

import IPC_CHANNELS from '@infrastructure/ipc/channels.js';

export function registerDeviceHandlers({ registerHandler, deviceServiceMain, logger }) {
  registerHandler(IPC_CHANNELS.DEVICE.GET_STATUS, async () => {
    try {
      const status = deviceServiceMain.getStatus();
      return status;
    } catch (error) {
      logger.error('Failed to get device status:', error);
      return { connected: false, error: error.message };
    }
  });
}
