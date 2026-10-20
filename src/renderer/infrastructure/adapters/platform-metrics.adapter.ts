/**
 * Metrics Adapter
 *
 * Wraps the main-process performance metrics tRPC query to provide a clean DI boundary,
 * isolating the PerformanceMetricsService from the transport client.
 */

import { injectable, inject } from 'inversify';
import { trpcClient } from '@renderer/infrastructure/ipc/trpc-client';
import { callIpc, type CallIpcResult } from '@renderer/infrastructure/ipc/call-ipc';
import type { ProcessMetricsPayload } from '@platform/ipc';
import type { LoggerFactory, Logger } from '@platform/core';
import { TOKENS } from '@renderer/application/di/tokens';

@injectable()
export class MetricsAdapter {
  private readonly logger: Logger;

  constructor(@inject(TOKENS.loggerFactory) loggerFactory: LoggerFactory) {
    this.logger = loggerFactory.create('MetricsAdapter');
  }

  isAvailable() {
    return true;
  }

  async getProcessMetrics(): Promise<CallIpcResult<ProcessMetricsPayload>> {
    return callIpc('performance.getProcessMetrics', () => trpcClient.performance.getProcessMetrics.query(), this.logger);
  }
}
