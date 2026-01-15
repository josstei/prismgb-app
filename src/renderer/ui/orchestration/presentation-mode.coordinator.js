/**
 * Presentation Mode Coordinator
 *
 * Coordinates fullscreen, cinematic, and minimalist visual state.
 */

import { BaseService } from '@shared/base/service.base.js';

export class PresentationModeCoordinator extends BaseService {
  constructor(dependencies) {
    super(dependencies, ['uiController', 'appState', 'loggerFactory'], 'PresentationModeCoordinator');

    this._minimalistEnabled = false;
    this._cinematicEnabled = Boolean(this.appState?.cinematicModeEnabled);
    this._isFullscreenActive = Boolean(document.fullscreenElement);
    this._isStreamingActive = Boolean(this.appState?.isStreaming);
  }

  handleStreamingMode(enabled) {
    this._isStreamingActive = Boolean(enabled);
    this.uiController.setStreamingMode(enabled);
    this._updateCinematicVisual(enabled);
    this._updateMinimalistVisual();
  }

  handleFullscreenState(active) {
    this._isFullscreenActive = Boolean(active);
    this.uiController.updateFullscreenButton(active);
    this.uiController.updateFullscreenMode(active);
    this._updateMinimalistVisual();

    if (active) {
      this.uiController.enableControlsAutoHide();
    } else {
      this.uiController.disableControlsAutoHide();
    }
  }

  handleCinematicModeChanged(enabled) {
    this._cinematicEnabled = Boolean(enabled);
    this._updateCinematicVisual();
  }

  handleMinimalistFullscreenChanged(enabled) {
    this._minimalistEnabled = Boolean(enabled);
    this._updateMinimalistVisual();
  }

  _updateCinematicVisual(streamingOverride) {
    const streamingActive = streamingOverride !== undefined ? streamingOverride : this._isStreamingActive;
    const isActive = this._cinematicEnabled && streamingActive;
    this.uiController.updateCinematicMode(isActive);
  }

  _updateMinimalistVisual() {
    const shouldEnable = this._minimalistEnabled && this._isFullscreenActive && this._isStreamingActive;
    this.uiController.updateMinimalistFullscreen(shouldEnable);
  }
}
