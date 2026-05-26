import {
  createDomListenerManager,
  type DomListenerLogger,
  type DomListenerManager
} from '@shared/base/dom-listener.utils.js';
import type { LoggerFactoryLike, LoggerLike } from '@shared/interfaces/infrastructure.types.js';
import { downloadFile } from '@renderer/presentation/lib/file-download.utils';
import {
  createDomBindings,
  type DomBindings,
  type DomBindingsFlat
} from '@renderer/presentation/primitives/dom-bindings.utils.js';
import type {
  UIComponentRegistry
} from '@renderer/presentation/controller/component.registry.js';
import type {
  RendererUiComponentCatalog,
  RendererUiComponentDependencies,
  RendererUiComponentElements
} from '@renderer/presentation/controller/ui-component.catalog.js';
import type { StreamInfoSettings } from '@renderer/presentation/features/streaming/streaming-controls.component.js';
import type { DeviceStatusPayloadLike } from '@renderer/presentation/shared/device-status.component.js';

interface UIEffectsLike {
  triggerShutterFlash(): void;
  triggerRecordButtonPop(): void;
  triggerRecordButtonPress(): void;
  triggerButtonFeedback(elementKey: string, className: string, duration: number): void;
  enableCursorAutoHide(): void;
  disableCursorAutoHide(): void;
  enableToolbarAutoHide(toolbarElement: HTMLElement | null): void;
  disableToolbarAutoHide(): void;
  setFullscreenMode(isActive: boolean): void;
  setRecordingButtonState(recordButton: HTMLButtonElement, isActive: boolean): void;
  setCinematicMode(isActive: boolean): void;
  setMinimalistFullscreen(isActive: boolean): void;
  enableControlsAutoHide(controlsElement: HTMLElement | null): void;
  disableControlsAutoHide(): void;
  dispose(): void;
}

type UIControllerBodyClassManager = NonNullable<
  RendererUiComponentDependencies<'streamControlsComponent'>['bodyClassManager']
>;

export type UIControllerElements = DomBindingsFlat;

function isDeviceStatusPayloadLike(status: unknown): status is DeviceStatusPayloadLike {
  if (typeof status !== 'object' || status === null) {
    return false;
  }

  return typeof (status as { connected?: unknown }).connected === 'boolean';
}

function toStreamInfoSettings(settings: unknown): StreamInfoSettings | null {
  if (typeof settings !== 'object' || settings === null) {
    return null;
  }

  const candidate = settings as Partial<StreamInfoSettings>;
  if (
    typeof candidate.width === 'number' &&
    typeof candidate.height === 'number' &&
    typeof candidate.frameRate === 'number'
  ) {
    return {
      width: candidate.width,
      height: candidate.height,
      frameRate: candidate.frameRate
    };
  }

  return null;
}

export interface UIControllerDependencies {
  uiComponentRegistry?: UIComponentRegistry<RendererUiComponentCatalog> | null;
  uiEffects?: UIEffectsLike | null;
  loggerFactory?: LoggerFactoryLike | null;
  bodyClassManager?: UIControllerBodyClassManager | null;
}

class UIController {
  declare registry: UIComponentRegistry<RendererUiComponentCatalog> | null | undefined;
  declare effects: UIEffectsLike | null | undefined;
  declare bodyClassManager: UIControllerBodyClassManager | null | undefined;
  declare logger: (LoggerLike & DomListenerLogger) | null;
  declare elements: UIControllerElements;
  declare dom: DomBindings;
  declare private _domListeners: DomListenerManager;

  constructor(dependencies: UIControllerDependencies = {}) {
    const { uiComponentRegistry, uiEffects, loggerFactory, bodyClassManager } = dependencies;

    this.registry = uiComponentRegistry;
    this.effects = uiEffects;
    this.bodyClassManager = bodyClassManager;
    this.logger = loggerFactory?.create('UIController') || null;
    this.elements = this.initializeElements();
    this._domListeners = createDomListenerManager({ logger: this.logger ?? undefined });
  }

  initializeElements(): UIControllerElements {
    const bindings = createDomBindings(document);
    this.dom = bindings;
    return bindings.flat;
  }

  initializeComponents(): void {
    if (this.registry) {
      this.registry.initialize(this.elements, { bodyClassManager: this.bodyClassManager });
    }
  }

  initSettingsMenu(dependencies: RendererUiComponentDependencies<'settingsMenuComponent'>): void {
    if (this.registry) {
      const settingsElements: RendererUiComponentElements<'settingsMenuComponent'> = {
        ...this.dom?.settings,
        ...this.dom?.updates
      };
      this.registry.initializeComponent('settingsMenuComponent', {
        elements: settingsElements,
        dependencies
      });
    }
  }

  toggleSettingsMenu(): void {
    this.registry?.get('settingsMenuComponent')?.toggle();
  }

  initShaderSelector(
    dependencies: RendererUiComponentDependencies<'shaderSelectorComponent'>,
    elements: RendererUiComponentElements<'shaderSelectorComponent'>
  ): void {
    if (this.registry) {
      this.registry.initializeComponent('shaderSelectorComponent', { elements, dependencies });
    }
  }

  toggleShaderSelector(): void {
    this.registry?.get('shaderSelectorComponent')?.toggle();
  }

  initNotesPanel(
    dependencies: RendererUiComponentDependencies<'notesPanelComponent'>,
    elements: RendererUiComponentElements<'notesPanelComponent'>
  ): void {
    if (this.registry) {
      this.registry.initializeComponent('notesPanelComponent', { elements, dependencies });
    }
  }

  toggleNotesPanel(): void {
    this.registry?.get('notesPanelComponent')?.toggle();
  }

  updateStatusMessage(message: string, type = 'info'): void {
    this.registry?.get('statusNotificationComponent')?.show(message, type);
  }

  updateDeviceStatus(status: unknown): void {
    if (!isDeviceStatusPayloadLike(status)) {
      this.logger?.warn('Ignoring invalid device status payload');
      return;
    }

    this.registry?.get('deviceStatusComponent')?.updateStatus(status);
  }

  updateOverlayMessage(deviceConnected: boolean): void {
    this.registry?.get('deviceStatusComponent')?.updateOverlayMessage(deviceConnected);
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

  updateStreamInfo(settings: unknown): void {
    const streamControls = this.registry?.get('streamControlsComponent');
    if (!streamControls) {
      return;
    }

    if (settings === undefined || settings === null) {
      streamControls.updateStreamInfo(null);
      return;
    }

    const streamInfo = toStreamInfoSettings(settings);
    if (!streamInfo) {
      this.logger?.warn('Ignoring invalid stream info payload');
      return;
    }

    streamControls.updateStreamInfo(streamInfo);
  }

  showErrorOverlay(message: string): void {
    this.registry?.get('deviceStatusComponent')?.showError(message);
  }

  updateFullscreenButton(isFullscreen: boolean): void {
    if (this.elements.fullscreenBtn) {
      this.elements.fullscreenBtn.title = isFullscreen ? 'Exit Fullscreen' : 'Fullscreen';
    }
  }

  updateFullscreenMode(isActive: boolean): void {
    this.effects?.setFullscreenMode(isActive);
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

  updateCinematicMode(isActive: boolean): void {
    this.effects?.setCinematicMode(isActive);
  }

  updateMinimalistFullscreen(isActive: boolean): void {
    this.effects?.setMinimalistFullscreen(isActive);
  }

  enableControlsAutoHide(): void {
    this.effects?.enableControlsAutoHide(this.elements.fullscreenControls);
  }

  disableControlsAutoHide(): void {
    this.effects?.disableControlsAutoHide();
  }

  getFullscreenControls(): HTMLElement | null {
    return this.elements.fullscreenControls;
  }

  getStreamCanvas(): HTMLCanvasElement | null {
    return this.elements.streamCanvas;
  }

  setStreamCanvas(canvas: HTMLCanvasElement): void {
    this.elements.streamCanvas = canvas;
    if (this.dom?.streaming) {
      this.dom.streaming.streamCanvas = canvas;
    }
  }

  getStreamVideo(): HTMLVideoElement | null {
    return this.elements.streamVideo;
  }

  triggerDownload(blob: Blob, filename: string): void {
    downloadFile(blob, filename);
  }

  on(
    elementKey: keyof UIControllerElements & string,
    event: string,
    handler: EventListenerOrEventListenerObject
  ): void {
    const element = this.elements[elementKey];
    if (element) {
      this._domListeners.add(element, event, handler);
    } else {
      this.logger?.warn(`Element not found: ${elementKey}`);
    }
  }

  dispose(): void {
    this.effects?.dispose();
    this.registry?.dispose();
    this._domListeners.removeAll();
  }
}

export { UIController };
