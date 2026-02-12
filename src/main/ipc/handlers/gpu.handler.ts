/**
 * GPU IPC Handlers
 * Registers GPU policy-related IPC routes.
 */

import type { Logger } from '@main/infrastructure/logging/logger.interface.js';
import { channels as IPC_CHANNELS } from '@prismgb/ipc';
import { getGpuPolicy } from '@main/infrastructure/platform/index.js';
import type { GpuPolicyResponse } from '@prismgb/ipc';
import {
  getErrorMessage,
  registerWrappedHandler,
  type RegisterHandler
} from './handler-wrapper.utils.js';

export interface GpuHandlerDependencies {
  registerHandler: RegisterHandler;
  logger: Logger;
}

export function registerGpuHandlers({ registerHandler, logger }: GpuHandlerDependencies): void {
  registerWrappedHandler({
    registerHandler,
    channel: IPC_CHANNELS.GPU.GET_POLICY,
    logger,
    logMessage: 'Failed to get GPU policy:',
    handler: async () => {
      const policy = getGpuPolicy();
      return {
        success: true,
        skipWebGPU: policy.skipWebGPU,
        reason: policy.reason
      } as GpuPolicyResponse;
    },
    onError: (error) => {
      return { success: false, error: getErrorMessage(error) } as GpuPolicyResponse;
    }
  });
}
