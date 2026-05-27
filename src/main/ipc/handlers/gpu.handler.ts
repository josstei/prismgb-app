/**
 * GPU IPC Handlers
 * Registers GPU policy-related IPC routes.
 */

import type { Logger } from '@main/infrastructure/logging/logger.interface.js';
import { getGpuPolicy } from '@main/infrastructure/platform/index.js';
import type { GpuPolicyResponse } from '@shared/ipc/preload-api.contract.js';
import { defineManifestIpcHandlers } from '../ipc-handler.descriptor.js';

export interface GpuHandlerDependencies {
  logger: Logger;
}

export const gpuHandlerDescriptors = defineManifestIpcHandlers<GpuHandlerDependencies>('gpuAPI', [
  {
    method: 'getPolicy',
    invoke(): GpuPolicyResponse {
      const policy = getGpuPolicy();
      return {
        success: true,
        skipWebGPU: policy.skipWebGPU,
        reason: policy.reason
      } as GpuPolicyResponse;
    },
    mapError: (error, { logger }) => {
      logger.error('Failed to get GPU policy:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage } as GpuPolicyResponse;
    }
  }
]);
