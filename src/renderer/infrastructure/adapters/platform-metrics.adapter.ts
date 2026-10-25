/**
 * Metrics Adapter
 *
 * Wraps the main-process performance metrics tRPC query to provide a typed platform boundary,
 * isolating the PerformanceMetricsService from the transport client.
 */

import { trpcClient } from '@renderer/infrastructure/ipc/trpc-client';
import { callIpc, type CallIpcResult } from '@renderer/infrastructure/ipc/call-ipc.js';
import type { ProcessMetricsPayload } from '@platform/ipc';
import type { LoggerFactoryLike, LoggerLike } from '@platform/core';

type MetricsAdapterDependencies = {
  loggerFactory: LoggerFactoryLike;
};

export class MetricsAdapter {
  private readonly logger: LoggerLike;

  constructor({ loggerFactory }: MetricsAdapterDependencies) {
    this.logger = loggerFactory.create('MetricsAdapter');
  }

  isAvailable() {
    return true;
  }

  async getProcessMetrics(): Promise<CallIpcResult<ProcessMetricsPayload>> {
    return callIpc('performance.getProcessMetrics', () => trpcClient.performance.getProcessMetrics.query(), this.logger);
  }
}
