import { Service } from '@prismgb/core';
/**
 * Metrics Adapter
 *
 * Wraps the main-process performance metrics tRPC query to provide a clean DI boundary,
 * isolating the PerformanceMetricsService from the transport client.
 */

import { trpcClient } from '@renderer/infrastructure/ipc/trpc-client';
import type { ProcessMetricsResponse } from '@prismgb/ipc';

@Service({
  "token": "metricsAdapter"
})
export class MetricsAdapter {
  isAvailable() {
    return true;
  }

  async getProcessMetrics(): Promise<ProcessMetricsResponse | { success: false; error: string }> {
    try {
      return await trpcClient.performance.getProcessMetrics.query();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  }
}
