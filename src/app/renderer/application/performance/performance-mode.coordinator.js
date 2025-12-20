/**
 * Performance Mode Coordinator
 *
 * Fans out performance mode changes into UI and render-specific signals.
 * Keeps settings concerns separate from UI/render implementations.
 */

import { BaseOrchestrator } from '@shared/base/orchestrator.js';
import { EventChannels } from '@infrastructure/events/event-channels.js';

export class PerformanceModeCoordinator extends BaseOrchestrator {
  /**
   * @param {Object} dependencies
   * @param {EventBus} dependencies.eventBus
   * @param {Function} dependencies.loggerFactory
   */
  constructor(dependencies) {
    super(
      dependencies,
      ['eventBus', 'loggerFactory'],
      'PerformanceModeCoordinator'
    );

    this._performanceModeEnabled = false;
    this._weakGpuDetected = false;
  }

  async onInitialize() {
    this.subscribeWithCleanup({
      [EventChannels.SETTINGS.PERFORMANCE_MODE_CHANGED]: (enabled) => {
        this._performanceModeEnabled = Boolean(enabled);
        this.eventBus.publish(EventChannels.PERFORMANCE.RENDER_MODE_CHANGED, this._performanceModeEnabled);
        this._emitUiPerformanceState();
      },
      [EventChannels.RENDER.CAPABILITY_DETECTED]: (capabilities) => {
        this._weakGpuDetected = this._detectWeakGPU(capabilities);
        this._emitUiPerformanceState();
      }
    });
  }

  _emitUiPerformanceState() {
    this.eventBus.publish(EventChannels.PERFORMANCE.UI_MODE_CHANGED, {
      enabled: this._performanceModeEnabled,
      weakGpuDetected: this._weakGpuDetected
    });
  }

  _detectWeakGPU(capabilities) {
    if (!capabilities) {
      return false;
    }

    const noAcceleratedPath = !capabilities.webgpu && !capabilities.webgl2;
    const usingCanvasFallback = capabilities.preferredAPI === 'canvas2d';
    const lowTextureBudget = capabilities.maxTextureSize > 0 && capabilities.maxTextureSize < 2048;

    return noAcceleratedPath || usingCanvasFallback || lowTextureBudget;
  }
}
