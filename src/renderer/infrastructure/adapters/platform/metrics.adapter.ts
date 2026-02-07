/**
 * Metrics Adapter
 *
 * Wraps the preload-exposed metricsAPI to provide a clean DI boundary.
 * This adapter isolates the PerformanceMetricsService from direct global access.
 */

import type { ProcessMetricsResponse } from '@shared/ipc/preload-api.contract.js';

type MetricsApiLike = {
  getProcessMetrics: () => Promise<ProcessMetricsResponse>;
};

export class MetricsAdapter {
  _metricsAPI?: MetricsApiLike;

  constructor() {
    this._metricsAPI = (globalThis.metricsAPI || window.metricsAPI) as MetricsApiLike | undefined;
  }

  /**
   * Check if metrics API is available
   * @returns {boolean} True if metrics API is available
   */
  isAvailable() {
    return !!(this._metricsAPI && typeof this._metricsAPI.getProcessMetrics === 'function');
  }

  /**
   * Get process metrics from main process
   * @returns {Promise<Object>} Process metrics snapshot
   */
  async getProcessMetrics() {
    if (!this.isAvailable()) {
      return { success: false, error: 'Metrics API not available' };
    }

    try {
      return await this._metricsAPI.getProcessMetrics();
    } catch (error) {
      return { success: false, error: error.message || String(error) };
    }
  }
}
