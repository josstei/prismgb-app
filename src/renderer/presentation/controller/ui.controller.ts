import type { LoggerFactoryLike, LoggerLike } from '@platform/core';
import { downloadFile } from '@renderer/lib/file-download.utils';
import type { DomBindings, DomBindingsFlat } from '@renderer/presentation/primitives/dom-bindings.utils.js';
import type { RendererTemplateDeferredComponentId } from '@renderer/presentation/primitives/template-dom.contract.js';
import type {
  UiComponentHost,
  RendererUiComponentInstanceMap
} from '@renderer/presentation/controller/ui-component.host.js';

interface UIEffectsLike {
  triggerShutterFlash(): void;
  triggerRecordButtonPop(): void;
  triggerRecordButtonPress(): void;
  triggerButtonFeedback(elementKey: string, className: string, duration: number): void;
  enableCursorAutoHide(): void;
  disableCursorAutoHide(): void;
  enableToolbarAutoHide(toolbarElement: HTMLElement | null): void;
  disableToolbarAutoHide(): void;
  setRecordingButtonState(recordButton: HTMLButtonElement, isActive: boolean): void;
  enableControlsAutoHide(controlsElement: HTMLElement | null): void;
  disableControlsAutoHide(): void;
  dispose(): void | Promise<void>;
}

export type UIControllerElements = DomBindingsFlat;

export interface UIControllerDependencies {
  uiComponentHost?: UiComponentHost<RendererUiComponentInstanceMap> | null;
  domBindings?: DomBindings | null;
  uiEffects?: UIEffectsLike | null;
  loggerFactory?: LoggerFactoryLike | null;
}

class UIController {
  declare host: UiComponentHost<RendererUiComponentInstanceMap> | null | undefined;
  declare effects: UIEffectsLike | null | undefined;
  declare logger: LoggerLike | null;
  declare elements: UIControllerElements;
  declare dom: DomBindings;

  constructor(dependencies: UIControllerDependencies = {}) {
    const { uiComponentHost, domBindings, uiEffects, loggerFactory } = dependencies;

    this.host = uiComponentHost;
    this.dom = domBindings as DomBindings;
    this.effects = uiEffects;
    this.logger = loggerFactory?.create('UIController') || null;
    this.elements = this.initializeElements();
  }

  initializeElements(): UIControllerElements {
    return this.dom.flat;
  }

  initializeComponents(): void {
    this.host?.touchCore();
  }

  initializeDeferredComponent<TId extends RendererTemplateDeferredComponentId>(id: TId): void {
    this.host?.get(id);
  }

  toggleSettingsMenu(): void {
    this.host?.get('settingsMenuComponent')?.toggle();
  }

  toggleShaderSelector(): void {
    this.host?.get('shaderSelectorComponent')?.toggle();
  }

  toggleNotesPanel(): void {
    this.host?.get('notesPanelComponent')?.toggle();
  }

  get deviceStatus() {
    return this.host?.get('deviceStatusComponent');
  }

  setStreamingMode(isStreaming: boolean): void {
    this.host?.get('streamControlsComponent')?.setStreamingMode(isStreaming);
    if (isStreaming) {
      this.effects?.enableToolbarAutoHide(this.elements.streamToolbar);
      this.effects?.enableCursorAutoHide();
    } else {
      this.effects?.disableCursorAutoHide();
      this.effects?.disableToolbarAutoHide();
      this.host?.get('shaderSelectorComponent')?.hide();
    }
  }


  updateFullscreenButton(isFullscreen: boolean): void {
    if (this.elements.fullscreenBtn) {
      this.elements.fullscreenBtn.title = isFullscreen ? 'Exit Fullscreen' : 'Fullscreen';
    }
  }

  triggerShutterFlash(): void {
    this.effects?.triggerShutterFlash();
  }

  triggerRecordButtonPop(): void {
    this.effects?.triggerRecordButtonPop();
  }

  triggerRecordButtonPress(): void {
    this.effects?.triggerRecordButtonPress();
  }

  triggerButtonFeedback(elementKey: string, className: string, duration: number): void {
    this.effects?.triggerButtonFeedback(elementKey, className, duration);
  }

  updateRecordingButtonState(isActive: boolean): void {
    const recordBtn = this.elements.recordBtn;
    if (recordBtn) {
      this.effects?.setRecordingButtonState(recordBtn, isActive);
    }
  }

  setRecordButtonDisabled(disabled: boolean): void {
    const recordBtn = this.elements.recordBtn;
    if (recordBtn) {
      recordBtn.disabled = disabled;
      if (disabled) {
        recordBtn.classList.add('disabled');
      } else {
        recordBtn.classList.remove('disabled');
      }
    }
  }

  enableControlsAutoHide(): void {
    this.effects?.enableControlsAutoHide(this.elements.fullscreenControls);
  }

  disableControlsAutoHide(): void {
    this.effects?.disableControlsAutoHide();
  }

  setStreamCanvas(canvas: HTMLCanvasElement): void {
    this.elements.streamCanvas = canvas;
    if (this.dom?.streaming) {
      this.dom.streaming.streamCanvas = canvas;
    }
  }

  triggerDownload(blob: Blob, filename: string): void {
    downloadFile(blob, filename);
  }

  async dispose(): Promise<void> {
    const effects = this.effects;
    const host = this.host;
    this.effects = null;
    this.host = null;
    await effects?.dispose();
    await host?.dispose();
  }
}

export { UIController };
