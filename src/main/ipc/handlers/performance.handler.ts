/**
 * Performance IPC Handlers
 * Registers performance-related IPC routes.
 */

import type { App } from 'electron';
import type { Logger } from '@main/infrastructure/logging/logger.interface.js';
import IPC_CHANNELS from '@shared/ipc/channels.json';
import type { ProcessMetricsResponse } from '@shared/ipc/preload-api.contract.js';
import { defineIpcHandlers } from '../ipc-handler.descriptor.js';

export interface PerformanceHandlerDependencies {
  app: App;
  logger: Logger;
}

export const performanceHandlerDescriptors = defineIpcHandlers<PerformanceHandlerDependencies>([
  {
    channel: IPC_CHANNELS.PERFORMANCE.GET_METRICS,
    dependencyTokens: ['app', 'logger'],
    argumentSchema: [],
    responseMode: 'result-envelope',
    invoke({ app }: PerformanceHandlerDependencies): ProcessMetricsResponse {
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
    mapError: (error, { logger }) => {
      logger.error('Failed to get process metrics:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage } as ProcessMetricsResponse;
    }
  }
]);
