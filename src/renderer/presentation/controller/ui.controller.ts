import type { LoggerFactoryLike, LoggerLike, EventBusLike } from '@platform/core';
import { downloadFile } from '@renderer/lib/file-download.utils';
import {
  createDomBindings,
  type DomBindings,
  type DomBindingsFlat
} from '@renderer/presentation/primitives/dom-bindings.utils.js';
import {
  createTemplateComponentElements,
  createTemplateCoreComponentRegistryElements,
  type RendererTemplateDeferredComponentId
} from '@renderer/presentation/primitives/template-dom.contract.js';
import type {
  UIComponentRegistry
} from '@renderer/presentation/controller/component.registry.js';
import {
  type RendererUiComponentCatalog,
  type RendererUiComponentDependencies
} from '@renderer/presentation/controller/ui-component.catalog.js';

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

type UIControllerBodyClassManager = NonNullable<
  RendererUiComponentDependencies<'streamControlsComponent'>['bodyClassManager']
>;

export type UIControllerElements = DomBindingsFlat;



export interface UIControllerDependencies {
  uiComponentRegistry?: UIComponentRegistry<RendererUiComponentCatalog> | null;
  uiEffects?: UIEffectsLike | null;
  loggerFactory?: LoggerFactoryLike | null;
  bodyClassManager?: UIControllerBodyClassManager | null;
  eventBus?: EventBusLike | null;
  appState?: any | null;
}

class UIController {
  declare registry: UIComponentRegistry<RendererUiComponentCatalog> | null | undefined;
  declare effects: UIEffectsLike | null | undefined;
  declare bodyClassManager: UIControllerBodyClassManager | null | undefined;
  declare eventBus: EventBusLike | null | undefined;
  declare appState: any | null | undefined;
  declare logger: LoggerLike | null;
  declare elements: UIControllerElements;
  declare dom: DomBindings;

  constructor(dependencies: UIControllerDependencies = {}) {
    const { uiComponentRegistry, uiEffects, loggerFactory, bodyClassManager, eventBus, appState } = dependencies;

    this.registry = uiComponentRegistry;
    this.effects = uiEffects;
    this.bodyClassManager = bodyClassManager;
    this.eventBus = eventBus;
    this.appState = appState;
    this.logger = loggerFactory?.create('UIController') || null;
    this.elements = this.initializeElements();
  }

  initializeElements(): UIControllerElements {
    const bindings = createDomBindings(document);
    this.dom = bindings;
    return bindings.flat;
  }

  initializeComponents(): void {
    if (!this.registry) {
      return;
    }

    this.registry.initialize(
      createTemplateCoreComponentRegistryElements(this.dom),
      {
        bodyClassManager: this.bodyClassManager,
        eventBus: this.eventBus as any,
        appState: this.appState
      }
    );
  }

  initializeDeferredComponent<TId extends RendererTemplateDeferredComponentId>(
    id: TId,
    dependencies: RendererUiComponentDependencies<TId>
  ): void {
    if (this.registry) {
      this.registry.initializeComponent(id, {
        elements: createTemplateComponentElements(id, this.dom),
        dependencies
      });
    }
  }

  toggleSettingsMenu(): void {
    this.registry?.get('settingsMenuComponent')?.toggle();
  }

  toggleShaderSelector(): void {
    this.registry?.get('shaderSelectorComponent')?.toggle();
  }

  toggleNotesPanel(): void {
    this.registry?.get('notesPanelComponent')?.toggle();
  }

  get deviceStatus() {
    return this.registry?.get('deviceStatusComponent');
  }

  setStreamingMode(isStreaming: boolean): void {
    this.registry?.get('streamControlsComponent')?.setStreamingMode(isStreaming);
    if (isStreaming) {
      this.effects?.enableToolbarAutoHide(this.elements.streamToolbar);
      this.effects?.enableCursorAutoHide();
    } else {
      this.effects?.disableCursorAutoHide();
      this.effects?.disableToolbarAutoHide();
      this.registry?.get('shaderSelectorComponent')?.hide();
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
    const registry = this.registry;
    this.effects = null;
    this.registry = null;
    await effects?.dispose();
    await registry?.dispose();
  }
}

export { UIController };
