/**
 * GPU IPC Handlers
 * Registers GPU policy-related IPC routes.
 */

import type { LoggerLike as Logger } from '@prismgb/core';
import { getGpuPolicy } from '@main/infrastructure/gpu-policy.js';
import type { GpuPolicyResponse } from '@prismgb/ipc';
import { defineManifestIpcHandlers } from '@prismgb/ipc';

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
