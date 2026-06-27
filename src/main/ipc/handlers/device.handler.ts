import type { IpcMainInvokeEvent } from 'electron';
import type { LoggerLike as Logger } from '@prismgb/core';
import type { DeviceStatusPayload } from '@prismgb/ipc';
import { defineManifestIpcHandlers } from '@prismgb/ipc';

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

export const deviceHandlerDescriptors = defineManifestIpcHandlers<DeviceHandlerDependencies>('deviceAPI', [
  {
    method: 'getDeviceStatus',
    invoke({ deviceService, logger }: DeviceHandlerDependencies, _event: IpcMainInvokeEvent) {
      // In test mode, check for mock status first
      const testGlobal = global as typeof globalThis & { __testMockDeviceStatus?: DeviceStatusPayload };
      if (isTestMode() && testGlobal.__testMockDeviceStatus) {
        logger.debug('Using mock device status for testing');
        return {
          ...testGlobal.__testMockDeviceStatus,
          success: true
        } as DeviceStatusPayload;
      }

      const status = deviceService.getStatus();
      return {
        ...status,
        success: true
      } as DeviceStatusPayload;
    },
    mapError: (error, { logger }) => {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to get device status:', error);
      return {
        connected: false,
        error: errorMessage,
        success: false
      } as DeviceStatusPayload;
    }
  }
]);
