/**
 * Presentation Mode Service
 *
 * Coordinates fullscreen, cinematic, and minimalist visual state.
 */

import { BaseService } from '@prismgb/core';

export class PresentationModeService extends BaseService {
  static readonly dependencies = ['uiController', 'uiEffects', 'appState', 'loggerFactory'] as const;

  constructor(dependencies) {
    super(dependencies, [...PresentationModeService.dependencies], 'PresentationModeService');

    this._minimalistEnabled = false;
    this._cinematicEnabled = Boolean(this.appState?.isCinematicModeEnabled);
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
    this.uiEffects?.setFullscreenMode(active);
    this._updateMinimalistVisual();

    if (active) {
      this.uiEffects?.enableControlsAutoHide(this.uiController.getFullscreenControls());
    } else {
      this.uiEffects?.disableControlsAutoHide();
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

  _updateCinematicVisual(streamingOverride?) {
    const streamingActive = streamingOverride !== undefined ? streamingOverride : this._isStreamingActive;
    const isActive = this._cinematicEnabled && streamingActive;
    this.uiEffects?.setCinematicMode(isActive);
  }

  _updateMinimalistVisual() {
    const shouldEnable = this._minimalistEnabled && this._isFullscreenActive && this._isStreamingActive;
    this.uiEffects?.setMinimalistFullscreen(shouldEnable);
  }
}
