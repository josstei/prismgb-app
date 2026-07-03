/**
 * Metrics Adapter
 *
 * Wraps the main-process performance metrics tRPC query to provide a clean DI boundary,
 * isolating the PerformanceMetricsService from the transport client.
 */

import { injectable } from 'inversify';
import { trpcClient } from '@renderer/infrastructure/ipc/trpc-client';
import type { ProcessMetricsResponse } from '@platform/ipc';
import { getErrorMessage } from '@platform/core';

@injectable()
export class MetricsAdapter {
  isAvailable() {
    return true;
  }

  async getProcessMetrics(): Promise<ProcessMetricsResponse | { success: false; error: string }> {
    try {
      return await trpcClient.performance.getProcessMetrics.query();
    } catch (error) {
      const message = getErrorMessage(error);
      return { success: false, error: message };
    }
  }
}
