import { Service } from '@shared/di/decorators.js';
/**
 * Presentation Mode Service
 *
 * Coordinates fullscreen, cinematic, and minimalist visual state.
 */

import { BaseService } from '@shared/base/service.base.js';
import type { LoggerFactoryLike } from '@shared/interfaces/infrastructure.types.js';

type PresentationModeUiControllerLike = {
  setStreamingMode(enabled: boolean): void;
  updateFullscreenButton(active: boolean): void;
  updateFullscreenMode(active: boolean): void;
  enableControlsAutoHide(): void;
  disableControlsAutoHide(): void;
  updateCinematicMode(active: boolean): void;
  updateMinimalistFullscreen(active: boolean): void;
};

type PresentationModeAppStateLike = {
  readonly isCinematicModeEnabled?: boolean;
  readonly isStreaming?: boolean;
};

type PresentationModeServiceDependencies = {
  uiController: PresentationModeUiControllerLike;
  appState: PresentationModeAppStateLike;
  loggerFactory: LoggerFactoryLike;
};

@Service({
  "token": "presentationModeService",
  "disposal": "dispose"
})
export class PresentationModeService extends BaseService {
  private readonly uiController: PresentationModeUiControllerLike;
  private readonly appState: PresentationModeAppStateLike;
  private _minimalistEnabled: boolean;
  private _cinematicEnabled: boolean;
  private _isFullscreenActive: boolean;
  private _isStreamingActive: boolean;

  constructor(dependencies: PresentationModeServiceDependencies) {
    super(dependencies, ['uiController', 'appState', 'loggerFactory'], 'PresentationModeService');

    this.uiController = dependencies.uiController;
    this.appState = dependencies.appState;
    this._minimalistEnabled = false;
    this._cinematicEnabled = Boolean(this.appState?.isCinematicModeEnabled);
    this._isFullscreenActive = Boolean(document.fullscreenElement);
    this._isStreamingActive = Boolean(this.appState?.isStreaming);
  }

  handleStreamingMode(enabled: boolean) {
    this._isStreamingActive = Boolean(enabled);
    this.uiController.setStreamingMode(enabled);
    this._updateCinematicVisual(enabled);
    this._updateMinimalistVisual();
  }

  handleFullscreenState(active: boolean) {
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

  handleCinematicModeChanged(enabled: boolean) {
    this._cinematicEnabled = Boolean(enabled);
    this._updateCinematicVisual();
  }

  handleMinimalistFullscreenChanged(enabled: boolean) {
    this._minimalistEnabled = Boolean(enabled);
    this._updateMinimalistVisual();
  }

  _updateCinematicVisual(streamingOverride?: boolean) {
    const streamingActive = streamingOverride !== undefined ? streamingOverride : this._isStreamingActive;
    const isActive = this._cinematicEnabled && streamingActive;
    this.uiController.updateCinematicMode(isActive);
  }

  _updateMinimalistVisual() {
    const shouldEnable = this._minimalistEnabled && this._isFullscreenActive && this._isStreamingActive;
    this.uiController.updateMinimalistFullscreen(shouldEnable);
  }
}
