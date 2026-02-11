/**
 * Performance IPC Handlers
 * Registers performance-related IPC routes.
 */

import type { App } from 'electron';
import type { Logger } from '@main/infrastructure/logging/logger.interface.js';
import { channels as IPC_CHANNELS } from '@shared/ipc/channels.config.js';
import type { ProcessMetricsResponse } from '@shared/ipc/preload-api.contract.js';
import {
  getErrorMessage,
  registerWrappedHandler,
  type RegisterHandler
} from './handler-wrapper.utils.js';

export interface PerformanceHandlerDependencies {
  registerHandler: RegisterHandler;
  app: App;
  logger: Logger;
}

export function registerPerformanceHandlers({ registerHandler, app, logger }: PerformanceHandlerDependencies): void {
  registerWrappedHandler({
    registerHandler,
    channel: IPC_CHANNELS.PERFORMANCE.GET_METRICS,
    logger,
    logMessage: 'Failed to get process metrics:',
    handler: async () => {
      const metrics = app.getAppMetrics();
      const totalKB = metrics.reduce((sum, proc) => sum + proc.memory.workingSetSize, 0);

      return {
        success: true,
        timestamp: Date.now(),
        totalKB,
        totalMB: (totalKB / 1024).toFixed(1),
        processCount: metrics.length,
        processes: metrics.map(proc => ({
          type: proc.type,
          pid: proc.pid,
          memoryKB: proc.memory.workingSetSize,
          memoryMB: (proc.memory.workingSetSize / 1024).toFixed(1),
          peakMemoryKB: proc.memory.peakWorkingSetSize,
          peakMemoryMB: (proc.memory.peakWorkingSetSize / 1024).toFixed(1),
          cpuPercent: proc.cpu.percentCPUUsage
        }))
      } as ProcessMetricsResponse;
    },
    onError: (error) => {
      return { success: false, error: getErrorMessage(error) } as ProcessMetricsResponse;
    }
  });
}
