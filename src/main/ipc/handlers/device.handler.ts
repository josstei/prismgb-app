/**
 * Device IPC Handlers
 * Registers device-related IPC routes.
 */

import type { IpcMainInvokeEvent } from 'electron';
import type { Logger } from '@main/infrastructure/logging/logger.interface.js';
import { channels as IPC_CHANNELS } from '@shared/ipc/channels.config.js';
import type { DeviceStatusPayload } from '@shared/ipc/preload-api.contract.js';

interface DeviceService {
  getStatus(): DeviceStatusPayload;
}

interface RegisterHandler {
  (channel: string, handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown> | unknown): void;
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
  registerHandler(IPC_CHANNELS.DEVICE.GET_STATUS, async () => {
    try {
      // In test mode, check for mock status first
      const testGlobal = global as typeof globalThis & { __testMockDeviceStatus?: DeviceStatusPayload };
      if (isTestMode() && testGlobal.__testMockDeviceStatus) {
        logger.debug('Using mock device status for testing');
        return testGlobal.__testMockDeviceStatus;
      }

      const status = deviceService.getStatus();
      return status;
    } catch (error) {
      logger.error('Failed to get device status:', error);
      return { connected: false, error: (error as Error).message };
    }
  });
}
