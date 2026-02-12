/**
 * Device IPC Handlers
 * Registers device-related IPC routes.
 */

import type { Logger } from '@main/infrastructure/logging/logger.interface.js';
import { channels as IPC_CHANNELS } from '@prismgb/ipc';
import type { DeviceStatusPayload } from '@prismgb/ipc';
import {
  getErrorMessage,
  registerWrappedHandler,
  type RegisterHandler
} from './handler-wrapper.utils.js';

interface DeviceService {
  getStatus(): DeviceStatusPayload;
}

export interface DeviceHandlerDependencies {
  registerHandler: RegisterHandler;
  deviceService: DeviceService;
  logger: Logger;
}

/**
 * Check if running in test mode
 */
function isTestMode(): boolean {
  return process.argv.includes('--test-mode') || process.env.NODE_ENV === 'test';
}

export function registerDeviceHandlers({ registerHandler, deviceService, logger }: DeviceHandlerDependencies): void {
  registerWrappedHandler({
    registerHandler,
    channel: IPC_CHANNELS.DEVICE.GET_STATUS,
    logger,
    logMessage: 'Failed to get device status:',
    handler: async () => {
      // In test mode, check for mock status first
      const testGlobal = global as typeof globalThis & { __testMockDeviceStatus?: DeviceStatusPayload };
      if (isTestMode() && testGlobal.__testMockDeviceStatus) {
        logger.debug('Using mock device status for testing');
        return testGlobal.__testMockDeviceStatus;
      }

      const status = deviceService.getStatus();
      return status;
    },
    onError: (error) => {
      return { connected: false, error: getErrorMessage(error) };
    }
  });
}
