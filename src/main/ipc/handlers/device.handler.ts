import type { IpcMainInvokeEvent } from 'electron';
import type { Logger } from '@main/infrastructure/logging/logger.interface.js';
import IPC_CHANNELS from '@shared/ipc/channels.json';
import type { DeviceStatusPayload } from '@shared/ipc/preload-api.contract.js';
import { defineIpcHandlers } from '../ipc-handler.descriptor.js';

interface DeviceService {
  getStatus(): DeviceStatusPayload;
}

export interface DeviceHandlerDependencies {
  deviceService: DeviceService;
  logger: Logger;
}

/**
 * Check if running in test mode
 */
function isTestMode(): boolean {
  return process.argv.includes('--test-mode') || process.env.NODE_ENV === 'test';
}

export const deviceHandlerDescriptors = defineIpcHandlers<DeviceHandlerDependencies>([
  {
    channel: IPC_CHANNELS.DEVICE.GET_STATUS,
    dependencyTokens: ['deviceService', 'logger'],
    argumentSchema: [],
    responseMode: 'bare',
    invoke({ deviceService, logger }: DeviceHandlerDependencies, _event: IpcMainInvokeEvent) {
      // In test mode, check for mock status first
      const testGlobal = global as typeof globalThis & { __testMockDeviceStatus?: DeviceStatusPayload };
      if (isTestMode() && testGlobal.__testMockDeviceStatus) {
        logger.debug('Using mock device status for testing');
        return testGlobal.__testMockDeviceStatus;
      }

      return deviceService.getStatus();
    },
    mapError: (error, { logger }) => {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to get device status:', error);
      return {
        connected: false,
        error: errorMessage
      } as DeviceStatusPayload;
    }
  }
]);
