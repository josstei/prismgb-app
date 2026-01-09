/**
 * Device IPC Handlers
 * Registers device-related IPC routes.
 */

import { channels as IPC_CHANNELS } from '@shared/ipc/channels.config.js';

/**
 * Check if running in test mode
 * @returns {boolean}
 */
function isTestMode() {
  return process.argv.includes('--test-mode') || process.env.NODE_ENV === 'test';
}

export function registerDeviceHandlers({ registerHandler, deviceService, logger }) {
  registerHandler(IPC_CHANNELS.DEVICE.GET_STATUS, async () => {
    try {
      // In test mode, check for mock status first
      if (isTestMode() && global.__testMockDeviceStatus) {
        logger.debug('Using mock device status for testing');
        return global.__testMockDeviceStatus;
      }

      const status = deviceService.getStatus();
      return status;
    } catch (error) {
      logger.error('Failed to get device status:', error);
      return { connected: false, error: error.message };
    }
  });
}
