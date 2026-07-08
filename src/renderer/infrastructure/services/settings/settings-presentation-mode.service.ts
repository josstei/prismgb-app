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

type UIEffectsLike = {
  enableCursorAutoHide(): void;
  disableCursorAutoHide(): void;
  enableToolbarAutoHide(toolbarElement: HTMLElement | null): void;
  disableToolbarAutoHide(): void;
  enableControlsAutoHide(controlsElement: HTMLElement | null): void;
  disableControlsAutoHide(): void;
};

type PresentationModeComponentHostLike = {
  get(id: 'streamControlsComponent'): { setStreamingMode(enabled: boolean): void } | null | undefined;
  get(id: 'shaderSelectorComponent'): { hide(): void } | null | undefined;
};

type PresentationModeDomBindingsLike = {
  flat: {
    streamToolbar: HTMLElement | null;
    fullscreenBtn: HTMLButtonElement | null;
    fullscreenControls: HTMLElement | null;
  };
};

@injectable()
export class PresentationModeService extends BaseService {
  constructor(
    @inject(TOKENS.uiComponentHost) private readonly uiComponentHost: PresentationModeComponentHostLike,
    @inject(TOKENS.uiEffects) private readonly uiEffects: UIEffectsLike,
    @inject(TOKENS.domBindings) private readonly domBindings: PresentationModeDomBindingsLike,
    @inject(TOKENS.loggerFactory) loggerFactory: LoggerFactoryLike
  ) {
    super({ loggerFactory }, 'PresentationModeService');
  }

  handleStreamingMode(enabled: boolean) {
    this.uiComponentHost.get('streamControlsComponent')?.setStreamingMode(enabled);
    if (enabled) {
      this.uiEffects.enableToolbarAutoHide(this.domBindings.flat.streamToolbar);
      this.uiEffects.enableCursorAutoHide();
    } else {
      this.uiEffects.disableCursorAutoHide();
      this.uiEffects.disableToolbarAutoHide();
      this.uiComponentHost.get('shaderSelectorComponent')?.hide();
    }
  }

  handleFullscreenState(active: boolean) {
    const fullscreenBtn = this.domBindings.flat.fullscreenBtn;
    if (fullscreenBtn) {
      fullscreenBtn.title = active ? 'Exit Fullscreen' : 'Fullscreen';
    }

    if (active) {
      this.uiEffects.enableControlsAutoHide(this.domBindings.flat.fullscreenControls);
    } else {
      this.uiEffects.disableControlsAutoHide();
    }
  }
}
