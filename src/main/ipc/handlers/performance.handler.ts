/**
 * Performance IPC Handlers
 * Registers performance-related IPC routes.
 */

import type { App } from 'electron';
import type { Logger } from '@main/infrastructure/logging/logger.interface.js';
import type { ProcessMetricsResponse } from '@prismgb/ipc';
import { defineManifestIpcHandlers } from '@prismgb/ipc';

export interface PerformanceHandlerDependencies {
  app: App;
  logger: Logger;
}

export const performanceHandlerDescriptors = defineManifestIpcHandlers<PerformanceHandlerDependencies>('metricsAPI', [
  {
    method: 'getProcessMetrics',
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
