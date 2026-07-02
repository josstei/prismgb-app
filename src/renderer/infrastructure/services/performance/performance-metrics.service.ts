/**
 * Performance Metrics Service
 *
 * Owns process metrics snapshot scheduling and logging.
 */

import { BaseService } from '@platform/core';
import type { MemorySnapshotRequestPayload } from '@platform/events';
import type { LoggerFactoryLike } from '@platform/core';
import type {
  ProcessMetricPayload,
  ProcessMetricsResponse
} from '@platform/ipc';

type ProcessMetricsErrorResponse = {
  success: false;
  error: string;
};

type MetricsAdapterLike = {
  isAvailable: () => boolean;
  getProcessMetrics: () => Promise<ProcessMetricsResponse | ProcessMetricsErrorResponse>;
};

type PerformanceMetricsDependencies = {
  loggerFactory: LoggerFactoryLike;
  metricsAdapter: MetricsAdapterLike;
};

function hasProcessMetricsSnapshot(snapshot: unknown): snapshot is ProcessMetricsResponse {
  return (
    typeof snapshot === 'object' &&
    snapshot !== null &&
    (snapshot as ProcessMetricsResponse).success === true &&
    Array.isArray((snapshot as ProcessMetricsResponse).processes)
  );
}

function isMemorySnapshotRequestPayload(value: unknown): value is MemorySnapshotRequestPayload {
  return typeof value === 'object' && value !== null;
}

export class PerformanceMetricsService extends BaseService {
  protected readonly metricsAdapter: MetricsAdapterLike;

  private readonly _pendingSnapshotCancels: Set<() => void | Promise<void>>;
  private _periodicIntervalCancel: (() => void | Promise<void>) | null;
  private _periodicStartCancel: (() => void | Promise<void>) | null;
  private readonly _intervalMs: number;
  private readonly _initialDelayMs: number;

  constructor(dependencies: PerformanceMetricsDependencies) {
    super(dependencies, 'PerformanceMetricsService');

    this.metricsAdapter = dependencies.metricsAdapter;
    this._pendingSnapshotCancels = new Set();
    this._periodicIntervalCancel = null;
    this._periodicStartCancel = null;
    this._intervalMs = 10000;
    this._initialDelayMs = 2000;
  }

  requestSnapshot(payload: unknown = {}): void {
    const request: MemorySnapshotRequestPayload = isMemorySnapshotRequestPayload(payload)
      ? payload
      : {};
    const label = typeof request.label === 'string' && request.label.length > 0
      ? request.label
      : 'snapshot';
    const delayMs = typeof request.delayMs === 'number' && Number.isFinite(request.delayMs)
      ? request.delayMs
      : 0;

    if (delayMs > 0) {
      let cancelSnapshot: () => void | Promise<void> = () => {};
      cancelSnapshot = this.timeout(() => {
        this._pendingSnapshotCancels.delete(cancelSnapshot);
        void cancelSnapshot();
        this._logSnapshot(label);
      }, delayMs);
      this._pendingSnapshotCancels.add(cancelSnapshot);
      return;
    }

    this._logSnapshot(label);
  }

  startPeriodicSnapshots(): void {
    if (this._periodicIntervalCancel || this._periodicStartCancel) {
      return;
    }

    this._periodicStartCancel = this.timeout(() => {
      const cancelStart = this._periodicStartCancel;
      this._periodicStartCancel = null;
      void cancelStart?.();
      this._logSnapshot('periodic');
      this._periodicIntervalCancel = this.interval(() => this._logSnapshot('periodic'), this._intervalMs);
    }, this._initialDelayMs);
  }

  stopPeriodicSnapshots(): void {
    void this._periodicStartCancel?.();
    void this._periodicIntervalCancel?.();
    this._periodicStartCancel = null;
    this._periodicIntervalCancel = null;
  }

  clearPendingRequests(): void {
    this._pendingSnapshotCancels.forEach((cancel) => {
      void cancel();
    });
    this._pendingSnapshotCancels.clear();
  }

  /**
   * Cleanup all resources and stop all timers
   */
  override dispose(): void | Promise<void> {
    this.stopPeriodicSnapshots();
    this.clearPendingRequests();
    return super.dispose();
  }

  _logSnapshot(label: string): void {
    if (!this.metricsAdapter.isAvailable()) {
      this.logger.debug(`[Perf] ${label} - process metrics unavailable`);
      return;
    }

    this.metricsAdapter.getProcessMetrics()
      .then((snapshot: ProcessMetricsResponse | ProcessMetricsErrorResponse | null) => {
        if (!hasProcessMetricsSnapshot(snapshot)) {
          this.logger.debug(`[Perf] ${label} - process metrics error`);
          return;
        }

        const renderer = snapshot.processes.find((proc: ProcessMetricPayload) => proc.type === 'Renderer');
        const gpu = snapshot.processes.find((proc: ProcessMetricPayload) => proc.type === 'GPU');
        const rendererMem = renderer ? `${renderer.memoryMB} MB` : 'n/a';
        const gpuMem = gpu ? `${gpu.memoryMB} MB` : 'n/a';

        this.logger.debug(`[Perf] ${label} - total ${snapshot.totalMB} MB, renderer ${rendererMem}, gpu ${gpuMem}`);
      })
      .catch((error: unknown) => {
        this.logger.debug(`[Perf] ${label} - process metrics error`, error);
      });
  }
}
