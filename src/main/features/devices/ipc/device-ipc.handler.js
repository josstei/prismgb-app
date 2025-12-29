/**
 * Device IPC Handlers
 * Registers device-related IPC routes.
 */

import { channels as IPC_CHANNELS } from '@shared/ipc/channels.js';

export function registerDeviceHandlers({ registerHandler, deviceService, logger }) {
  registerHandler(IPC_CHANNELS.DEVICE.GET_STATUS, async () => {
    try {
      const status = deviceService.getStatus();
      return status;
    } catch (error) {
      logger.error('Failed to get device status:', error);
      return { connected: false, error: error.message };
    }
  });
}
