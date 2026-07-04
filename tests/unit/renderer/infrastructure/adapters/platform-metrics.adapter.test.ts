/**
 * MetricsAdapter Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@renderer/infrastructure/ipc/trpc-client', async () => ({
  trpcClient: (await import('../../../../support/mocks/trpc-client.mock')).createTrpcClientMock()
}));

import { MetricsAdapter } from '@renderer/infrastructure/adapters/platform-metrics.adapter';
import { trpcClient } from '@renderer/infrastructure/ipc/trpc-client';
import { createProcessMetricsMock } from '../../../../factories/index.js';
import { createInjectableHarness } from '../../../../support/di/injectable.harness.js';
import type { ProcessMetricsPayload } from '@platform/ipc';

describe('MetricsAdapter', () => {
  let adapter;
  let loggerFactory;

  beforeEach(() => {
    const h = createInjectableHarness(MetricsAdapter);
    adapter = h.subject;
    ({ loggerFactory } = h.deps);
  });

  describe('constructor', () => {
    it('should construct without throwing', () => {
      expect(() => new MetricsAdapter(loggerFactory)).not.toThrow();
    });
  });

  describe('isAvailable', () => {
    it('should return true unconditionally', () => {
      expect(adapter.isAvailable()).toBe(true);
    });
  });

  describe('getProcessMetrics', () => {
    it('should query performance.getProcessMetrics and return an ok result carrying the payload', async () => {
      const mockMetrics = createProcessMetricsMock({
        totalMB: '150.0',
        processes: [{ type: 'Renderer', memoryMB: '80.0' }]
      });

      vi.mocked(trpcClient.performance.getProcessMetrics.query).mockResolvedValue(mockMetrics as ProcessMetricsPayload);

      const result = await adapter.getProcessMetrics();

      expect(trpcClient.performance.getProcessMetrics.query).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ status: 'ok', value: mockMetrics });
    });

    it('should return successful metrics data', async () => {
      const mockMetrics = createProcessMetricsMock({
        totalMB: '200.5',
        processes: [
          { type: 'Renderer', memoryMB: '100.0' },
          { type: 'GPU', memoryMB: '80.0' },
          { type: 'Browser', memoryMB: '20.5' }
        ]
      });

      vi.mocked(trpcClient.performance.getProcessMetrics.query).mockResolvedValue(mockMetrics as ProcessMetricsPayload);

      const result = await adapter.getProcessMetrics();

      expect(result.status).toBe('ok');
      expect(result.value.totalMB).toBe('200.5');
      expect(result.value.processes).toHaveLength(3);
    });

    it('should map a rejected query to a failure result', async () => {
      vi.mocked(trpcClient.performance.getProcessMetrics.query).mockRejectedValue(new Error('IPC error'));

      const result = await adapter.getProcessMetrics();

      expect(result.status).toBe('error');
      expect(result.error).toBe('IPC error');
    });

    it('should map a non-Error rejection to a failure result', async () => {
      vi.mocked(trpcClient.performance.getProcessMetrics.query).mockRejectedValue('string error');

      const result = await adapter.getProcessMetrics();

      expect(result.status).toBe('error');
      expect(result.error).toBeDefined();
    });
  });
});
