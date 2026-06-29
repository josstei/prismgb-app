/**
 * Presentation Mode Service
 *
 * Coordinates the imperative fullscreen side-effects (button + controls auto-hide) and the
 * streaming-mode coordination. The cinematic/minimalist/fullscreen body classes are driven
 * declaratively by PresentationModeStore bindings, not this service.
 */

import { BaseService } from '@prismgb/core';
import type { LoggerFactoryLike } from '@prismgb/core';

type PresentationModeUiControllerLike = {
  setStreamingMode(enabled: boolean): void;
  updateFullscreenButton(active: boolean): void;
  enableControlsAutoHide(): void;
  disableControlsAutoHide(): void;
};

type PresentationModeServiceDependencies = {
  uiController: PresentationModeUiControllerLike;
  loggerFactory: LoggerFactoryLike;
};

export class PresentationModeService extends BaseService {
  private readonly uiController: PresentationModeUiControllerLike;

  constructor(dependencies: PresentationModeServiceDependencies) {
    super(dependencies, 'PresentationModeService');
    this.uiController = dependencies.uiController;
  }

  handleStreamingMode(enabled: boolean) {
    this.uiController.setStreamingMode(enabled);
  }

  handleFullscreenState(active: boolean) {
    this.uiController.updateFullscreenButton(active);

    if (active) {
      this.uiController.enableControlsAutoHide();
    } else {
      this.uiController.disableControlsAutoHide();
    }
  }
}
