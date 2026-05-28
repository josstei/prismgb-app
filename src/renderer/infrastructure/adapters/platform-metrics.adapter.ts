import { Service } from '@prismgb/core';
/**
 * Metrics Adapter
 *
 * Wraps the preload-exposed metricsAPI to provide a clean DI boundary.
 * This adapter isolates the PerformanceMetricsService from direct global access.
 */

import type { ProcessMetricsResponse } from '@prismgb/ipc';

type MetricsApiLike = {
  getProcessMetrics: () => Promise<ProcessMetricsResponse>;
};

@Service({
  "token": "metricsAdapter"
})
export class MetricsAdapter {
  _metricsAPI?: MetricsApiLike;

  constructor() {
    this._metricsAPI = (globalThis.metricsAPI || window.metricsAPI) as MetricsApiLike | undefined;
  }

  isAvailable() {
    return !!(this._metricsAPI && typeof this._metricsAPI.getProcessMetrics === 'function');
  }

  async getProcessMetrics(): Promise<ProcessMetricsResponse | { success: false; error: string }> {
    if (!this.isAvailable()) {
      return { success: false, error: 'Metrics API not available' };
    }

    const metricsApi = this._metricsAPI;
    if (!metricsApi) {
      return { success: false, error: 'Metrics API not available' };
    }

    try {
      return await metricsApi.getProcessMetrics();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  }
}
