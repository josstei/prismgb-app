/**
 * Display Mode Orchestrator
 *
 * Coordinates display mode services (fullscreen + cinematic mode).
 */

import { BaseOrchestrator } from '@shared/base/orchestrator.js';
export class DisplayModeOrchestrator extends BaseOrchestrator {
  constructor(dependencies) {
    super(
      dependencies,
      ['fullscreenService', 'cinematicModeService', 'loggerFactory'],
      'DisplayModeOrchestrator'
    );
  }

  /**
   * Initialize the orchestrator - setup fullscreen listeners
   */
  async onInitialize() {
    this.fullscreenService.initialize();
  }

  /**
   * Cleanup - remove fullscreen listeners
   */
  async onCleanup() {
    this.fullscreenService.dispose();
  }

  /**
   * Toggle fullscreen mode
   */
  toggleFullscreen() {
    this.fullscreenService.toggleFullscreen();
  }

  /**
   * Toggle cinematic mode
   */
  toggleCinematicMode() {
    this.cinematicModeService.toggleCinematicMode();
  }
}
