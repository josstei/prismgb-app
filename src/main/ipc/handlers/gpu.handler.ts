/**
 * GPU IPC Handlers
 * Registers GPU policy-related IPC routes.
 */

import type { IpcMainInvokeEvent } from 'electron';
import type { Logger } from '@main/infrastructure/logging/logger.interface.js';
import { channels as IPC_CHANNELS } from '@shared/ipc/channels.config.js';
import { getGpuPolicy } from '@main/infrastructure/platform/index.js';

interface RegisterHandler {
  (channel: string, handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown> | unknown): void;
}

export interface GpuHandlerDependencies {
  registerHandler: RegisterHandler;
  logger: Logger;
}

export function registerGpuHandlers({ registerHandler, logger }: GpuHandlerDependencies): void {
  registerHandler(IPC_CHANNELS.GPU.GET_POLICY, async () => {
    try {
      const policy = getGpuPolicy();
      return {
        success: true,
        skipWebGPU: policy.skipWebGPU,
        reason: policy.reason
      };
    } catch (error) {
      logger.error('Failed to get GPU policy:', error);
      return { success: false, error: (error as Error).message };
    }
  });
}
