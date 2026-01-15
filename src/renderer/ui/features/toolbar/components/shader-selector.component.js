/**
 * Shader Selector Component
 *
 * Panel component for selecting shader presets and toggling cinematic mode.
 */

import { CSSClasses } from '@shared/config/css-classes.config.js';
import { DisclosureController } from '@renderer/ui/primitives/disclosure.js';
import { CinematicToggleComponent } from './cinematic-toggle.component.js';
import { ShaderPresetListComponent } from './shader-preset-list.component.js';
import { ShaderSliderControlsComponent } from './shader-slider-controls.component.js';

class StreamingShaderSelectorComponent {
  constructor({ settingsService, appState, eventBus, logger }) {
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

  /**
   * Initialize component with DOM elements
   * @param {Object} elements - DOM element references
   */
  initialize(elements) {
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

    this.logger?.debug('StreamingShaderSelectorComponent initialized');
  }

  /**
   * Toggle dropdown visibility
   */
  toggle() {
    this._panelDisclosure?.toggle();
  }

  /**
   * Show panel
   */
  show() {
    this._panelDisclosure?.show();
  }

  /**
   * Hide panel
   */
  hide() {
    this._panelDisclosure?.hide();
  }

  /**
   * Setup panel disclosure behavior
   * @private
   */
  _setupPanelDisclosure() {
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

  /**
   * Dispose and cleanup event listeners
   */
  dispose() {
    this._presetList?.dispose();
    this._sliderControls?.dispose();
    this._cinematicToggle?.dispose();
    this._panelDisclosure?.dispose();
    this._panelDisclosure = null;
  }
}

export { StreamingShaderSelectorComponent };
