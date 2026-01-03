/**
 * Performance Metrics Service
 *
 * Owns process metrics snapshot scheduling and logging.
 */

import { BaseService } from '@shared/base/service.base.js';

export class PerformanceMetricsService extends BaseService {
  constructor(dependencies) {
    super(dependencies, ['loggerFactory', 'metricsAdapter'], 'PerformanceMetricsService');

    this._pendingTimeouts = new Set();
    this._intervalId = null;
    this._timeoutId = null;
    this._intervalMs = 10000;
    this._initialDelayMs = 2000;
  }

  requestSnapshot(payload) {
    const label = payload?.label || 'snapshot';
    const delayMs = Number(payload?.delayMs) || 0;

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
    this._pendingTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
    this._pendingTimeouts.clear();
  }

  _logSnapshot(label) {
    if (!this.metricsAdapter.isAvailable()) {
      this.logger.debug(`[Perf] ${label} - process metrics unavailable`);
      return;
    }

    this.metricsAdapter.getProcessMetrics()
      .then((snapshot) => {
        if (!snapshot?.success) {
          this.logger.debug(`[Perf] ${label} - process metrics error`);
          return;
        }

        const renderer = snapshot.processes?.find(proc => proc.type === 'Renderer');
        const gpu = snapshot.processes?.find(proc => proc.type === 'GPU');
        const rendererMem = renderer ? `${renderer.memoryMB} MB` : 'n/a';
        const gpuMem = gpu ? `${gpu.memoryMB} MB` : 'n/a';

        this.logger.debug(`[Perf] ${label} - total ${snapshot.totalMB} MB, renderer ${rendererMem}, gpu ${gpuMem}`);
      })
      .catch((error) => {
        this.logger.debug(`[Perf] ${label} - process metrics error`, error);
      });
  }
}
