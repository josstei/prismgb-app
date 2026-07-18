/**
 * Presentation Mode Service
 *
 * Coordinates the imperative fullscreen side-effects (button + controls auto-hide) and the
 * streaming-mode coordination. The cinematic/minimalist/fullscreen body classes are driven
 * declaratively by PresentationModeStore bindings, not this service.
 */

import { injectable, inject } from 'inversify';
import { BaseService } from '@platform/core';
import type { LoggerFactoryLike } from '@platform/core';
import { TOKENS } from '@renderer/application/di/tokens.js';

type PresentationModeUiControllerLike = {
  setStreamingMode(enabled: boolean): void;
  updateFullscreenButton(active: boolean): void;
  enableControlsAutoHide(): void;
  disableControlsAutoHide(): void;
};

@injectable()
export class PresentationModeService extends BaseService {
  constructor(
    @inject(TOKENS.uiController) private readonly uiController: PresentationModeUiControllerLike,
    @inject(TOKENS.loggerFactory) loggerFactory: LoggerFactoryLike
  ) {
    super({ loggerFactory }, 'PresentationModeService');
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
