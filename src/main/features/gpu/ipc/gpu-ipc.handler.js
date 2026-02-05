/**
 * GPU IPC Handlers
 * Registers GPU policy-related IPC routes.
 */

import { channels as IPC_CHANNELS } from '@shared/ipc/channels.config.js';
import { getGpuPolicy } from '@main/infrastructure/platform/index.js';

export function registerGpuHandlers({ registerHandler, logger }) {
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
      return { success: false, error: error.message };
    }
  });
}
