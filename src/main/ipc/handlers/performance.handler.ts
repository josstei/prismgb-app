/**
 * Performance IPC Handlers
 * Registers performance-related IPC routes.
 */

import type { App, IpcMainInvokeEvent } from 'electron';
import type { Logger } from '@main/infrastructure/logging/logger.interface.js';
import { channels as IPC_CHANNELS } from '@shared/ipc/channels.config.js';

interface RegisterHandler {
  (channel: string, handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown> | unknown): void;
}

export interface PerformanceHandlerDependencies {
  registerHandler: RegisterHandler;
  app: App;
  logger: Logger;
}

export function registerPerformanceHandlers({ registerHandler, app, logger }: PerformanceHandlerDependencies): void {
  registerHandler(IPC_CHANNELS.PERFORMANCE.GET_METRICS, async () => {
    try {
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
      };
    } catch (error) {
      logger.error('Failed to get process metrics:', error);
      return { success: false, error: (error as Error).message };
    }
  });
}
