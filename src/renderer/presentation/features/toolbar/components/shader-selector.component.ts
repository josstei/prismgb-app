import { CSSClasses } from '@renderer/presentation/config/css-classes.config';
import { DisclosureController } from '@renderer/presentation/primitives/disclosure.class.js';
import { PresentationComponent } from '@renderer/presentation/primitives/presentation-component.base';
import { CinematicToggleComponent, type CinematicToggleAppState } from './cinematic-toggle.component.js';
import {
  ShaderPresetListComponent,
  type ShaderPresetSettingsService
} from './shader-preset-list.component.js';
import {
  ShaderSliderControlsComponent,
  type ShaderSliderSettingsService
} from './shader-slider-controls.component.js';
import type { TypedEventBusLike } from '@shared/events/event-payloads.js';
import type { LoggerLike } from '@shared/interfaces/infrastructure.types.js';

export interface ShaderSelectorElements {
  shaderBtn?: HTMLElement | null;
  shaderDropdown?: HTMLElement | null;
  cinematicToggle?: HTMLElement | null;
  cinematicPillText?: HTMLElement | null;
  shaderOptions?: HTMLElement | null;
  shaderUnavailableMessage?: HTMLElement | null;
  brightnessSlider?: HTMLInputElement | null;
  brightnessPercentage?: HTMLElement | null;
  brightnessControl?: HTMLElement | null;
  volumeSlider?: HTMLInputElement | null;
  volumePercentage?: HTMLElement | null;
  streamVideo?: HTMLVideoElement | null;
}

export interface ShaderSelectorComponentOptions {
  settingsService: ShaderSelectorSettingsService;
  appState?: CinematicToggleAppState | null;
  eventBus: TypedEventBusLike;
  logger?: LoggerLike | null;
}

export interface ShaderSelectorSettingsService
  extends ShaderPresetSettingsService,
    ShaderSliderSettingsService {}

class ShaderSelectorComponent extends PresentationComponent {
  declare settingsService: ShaderSelectorSettingsService;
  declare appState: CinematicToggleAppState | null | undefined;
  declare eventBus: TypedEventBusLike;
  declare logger: LoggerLike | null | undefined;
  declare isVisible: boolean;
  declare _panelDisclosure: DisclosureController | null;
  declare _presetList: ShaderPresetListComponent;
  declare _sliderControls: ShaderSliderControlsComponent;
  declare _cinematicToggle: CinematicToggleComponent;
  declare button: HTMLElement | null | undefined;
  declare dropdown: HTMLElement | null | undefined;

  constructor({ settingsService, appState, eventBus, logger }: ShaderSelectorComponentOptions) {
    super();

    this.settingsService = settingsService;
    this.appState = appState;
    this.eventBus = eventBus;
    this.logger = logger;
    this.isVisible = false;

    this._panelDisclosure = null;
    this._presetList = new ShaderPresetListComponent({ settingsService, eventBus, logger });
    this._sliderControls = new ShaderSliderControlsComponent({ settingsService, eventBus, logger });
    this._cinematicToggle = new CinematicToggleComponent({ eventBus, appState, logger });

    this.button = null;
    this.dropdown = null;
  }

  initialize(elements: ShaderSelectorElements): void {
    void this.dispose();
    this.button = elements.shaderBtn;
    this.dropdown = elements.shaderDropdown;

    if (!this.button || !this.dropdown) {
      this.logger?.warn('Shader selector elements not found');
      return;
    }

    this._setupPanelDisclosure();
    this._cinematicToggle.initialize({
      toggleElement: elements.cinematicToggle,
      textElement: elements.cinematicPillText
    });
    this._presetList.initialize({
      optionsContainer: elements.shaderOptions,
      unavailableMessage: elements.shaderUnavailableMessage
    });
    this._sliderControls.initialize({
      brightnessSlider: elements.brightnessSlider,
      brightnessPercentage: elements.brightnessPercentage,
      brightnessControl: elements.brightnessControl,
      volumeSlider: elements.volumeSlider,
      volumePercentage: elements.volumePercentage,
      streamVideo: elements.streamVideo
    });

    this.logger?.debug('ShaderSelectorComponent initialized');
  }

  toggle(): void {
    this._panelDisclosure?.toggle();
  }

  show(): void {
    this._panelDisclosure?.show();
  }

  hide(): void {
    this._panelDisclosure?.hide();
  }

  _setupPanelDisclosure(): void {
    if (!this.button || !this.dropdown) return;

    this._panelDisclosure = new DisclosureController({
      toggleElement: this.button,
      panelElement: this.dropdown,
      visibleClass: CSSClasses.VISIBLE,
      toggleOpenClass: CSSClasses.PANEL_OPEN,
      logger: this.logger,
      onShow: () => {
        this.isVisible = true;
        this.logger?.debug('Shader panel shown');
      },
      onHide: () => {
        this.isVisible = false;
        this.logger?.debug('Shader panel hidden');
      }
    });

    this._panelDisclosure.initialize();
  }

  override async dispose(): Promise<void> {
    const panelDisclosure = this._panelDisclosure;
    this._panelDisclosure = null;
    this.button = null;
    this.dropdown = null;
    this.isVisible = false;

    const childDisposals = [
      this._presetList?.dispose(),
      this._sliderControls?.dispose(),
      this._cinematicToggle?.dispose(),
      panelDisclosure?.dispose()
    ];
    await super.dispose();
    await Promise.all(childDisposals);
  }
}

export { ShaderSelectorComponent };
