/**
 * Performance Metrics Service
 *
 * Owns process metrics snapshot scheduling and logging.
 */

import { BaseService } from '@shared/base/service.base.js';
import type { LoggerLike } from '@shared/base/service.base.js';
import type { MemorySnapshotRequestPayload } from '@shared/events/event-payloads.js';
import type {
  ProcessMetricPayload,
  ProcessMetricsResponse
} from '@shared/ipc/preload-api.contract.js';

type ProcessMetricsErrorResponse = {
  success: false;
  error: string;
};

type LoggerFactoryLike = {
  create(name: string): LoggerLike;
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

export class PerformanceMetricsService extends BaseService {
  declare protected readonly logger: LoggerLike;
  declare protected readonly metricsAdapter: MetricsAdapterLike;

  _pendingTimeouts: Set<ReturnType<typeof setTimeout>>;
  _intervalId: ReturnType<typeof setInterval> | null;
  _timeoutId: ReturnType<typeof setTimeout> | null;
  _intervalMs: number;
  _initialDelayMs: number;

  constructor(dependencies: PerformanceMetricsDependencies) {
    super(dependencies, ['loggerFactory', 'metricsAdapter'], 'PerformanceMetricsService');

    this._pendingTimeouts = new Set();
    this._intervalId = null;
    this._timeoutId = null;
    this._intervalMs = 10000;
    this._initialDelayMs = 2000;
  }

  requestSnapshot(payload: MemorySnapshotRequestPayload | null | undefined = {}) {
    const request = typeof payload === 'object' && payload !== null ? payload : {};
    const label = typeof request.label === 'string' && request.label.length > 0
      ? request.label
      : 'snapshot';
    const delayMs = typeof request.delayMs === 'number' && Number.isFinite(request.delayMs)
      ? request.delayMs
      : 0;

    if (delayMs > 0) {
      const timeoutId = setTimeout(() => {
        this._pendingTimeouts.delete(timeoutId);
        this._logSnapshot(label);
      }, delayMs);
      this._pendingTimeouts.add(timeoutId);
      return;
    }

    this._logSnapshot(label);
  }

  startPeriodicSnapshots() {
    if (this._intervalId || this._timeoutId) {
      return;
    }

    this._timeoutId = setTimeout(() => {
      this._timeoutId = null;
      this._logSnapshot('periodic');
      this._intervalId = setInterval(() => this._logSnapshot('periodic'), this._intervalMs);
    }, this._initialDelayMs);
  }

  stopPeriodicSnapshots() {
    if (this._timeoutId) {
      clearTimeout(this._timeoutId);
      this._timeoutId = null;
    }

    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
  }

  clearPendingRequests() {
    this._pendingTimeouts.forEach((timeoutId: ReturnType<typeof setTimeout>) => clearTimeout(timeoutId));
    this._pendingTimeouts.clear();
  }

  /**
   * Cleanup all resources and stop all timers
   */
  dispose() {
    this.stopPeriodicSnapshots();
    this.clearPendingRequests();
  }

  _logSnapshot(label: string) {
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
