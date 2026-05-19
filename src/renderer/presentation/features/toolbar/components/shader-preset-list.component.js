/**
 * Shader Preset List Component
 *
 * Renders shader presets, handles selection, and responds to performance mode changes.
 */

import { createDomListenerManager } from '@shared/base/dom-listener.utils.js';
import { CSSClasses } from '@renderer/presentation/config/css-classes.config';
import { PresetRegistry } from '@prismgb/gpu';
import { EventChannels } from '@shared/events/event-channels.js';

class ShaderPresetListComponent {
  constructor({ settingsService, eventBus, logger }) {
    this.settingsService = settingsService;
    this.eventBus = eventBus;
    this.logger = logger;

    this.optionsContainer = null;
    this.unavailableMessage = null;

    this.currentPresetId = null;
    this._performanceModeEnabled = false;

    this._domListeners = createDomListenerManager({ logger });
    this._eventSubscriptions = [];
  }

  /**
   * Initialize component with DOM elements
   * @param {Object} elements
   * @param {HTMLElement} elements.optionsContainer
   * @param {HTMLElement} elements.unavailableMessage
   */
  initialize({ optionsContainer, unavailableMessage }) {
    this.optionsContainer = optionsContainer;
    this.unavailableMessage = unavailableMessage;

    if (!this.optionsContainer || !this.unavailableMessage) {
      this.logger?.warn('Shader preset list elements not found');
      return;
    }

    this._loadCurrentPreset();
    this._loadPerformanceModeState();
    this._renderPresetList();
    this._subscribeToEvents();

    this.logger?.debug('Shader preset list initialized');
  }

  _loadCurrentPreset() {
    this.currentPresetId = this.settingsService.getStringSetting('renderPreset');
  }

  _loadPerformanceModeState() {
    this._performanceModeEnabled = this.settingsService.getBooleanSetting('performanceMode');
    this._updateShaderListVisibility();
  }

  _renderPresetList() {
    if (!this.optionsContainer) return;

    this._domListeners.removeAll();
    this.optionsContainer.innerHTML = '';

    const presets = PresetRegistry.getForUI();
    presets.forEach((preset) => {
      if (preset.id === 'performance') return;

      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'shader-option';
      option.dataset.presetId = preset.id;

      if (preset.id === this.currentPresetId) {
        option.classList.add(CSSClasses.ACTIVE);
      }

      option.innerHTML = `<span class="shader-option-name">${preset.name}</span>`;

      this._domListeners.add(option, 'click', () => {
        if (!this._performanceModeEnabled) {
          this._selectPreset(preset.id);
        }
      });

      this.optionsContainer.appendChild(option);
    });
  }

  _selectPreset(presetId) {
    if (presetId === this.currentPresetId) {
      return;
    }

    this.currentPresetId = presetId;
    this.settingsService.setSetting('renderPreset', presetId);
    this._updateActiveState(true);

    this.logger?.debug(`Shader preset selected: ${presetId}`);
  }

  _updateActiveState(animate = false) {
    if (!this.optionsContainer) return;

    const options = this.optionsContainer.querySelectorAll('.shader-option');
    options.forEach(option => {
      option.classList.remove(CSSClasses.JUST_SELECTED);

      if (option.dataset.presetId === this.currentPresetId) {
        option.classList.add(CSSClasses.ACTIVE);
        if (animate) {
          option.classList.add(CSSClasses.JUST_SELECTED);
        }
      } else {
        option.classList.remove(CSSClasses.ACTIVE);
      }
    });
  }

  _updateShaderListVisibility() {
    if (!this.optionsContainer || !this.unavailableMessage) return;

    if (this._performanceModeEnabled) {
      this.optionsContainer.classList.add(CSSClasses.HIDDEN);
      this.unavailableMessage.classList.remove(CSSClasses.HIDDEN);
    } else {
      this.optionsContainer.classList.remove(CSSClasses.HIDDEN);
      this.unavailableMessage.classList.add(CSSClasses.HIDDEN);
    }
  }

  _subscribeToEvents() {
    const unsubscribePreset = this.eventBus.subscribe(
      EventChannels.SETTINGS.RENDER_PRESET_CHANGED,
      (presetId) => {
        if (presetId !== this.currentPresetId) {
          this.currentPresetId = presetId;
          this._updateActiveState();
        }
      }
    );
    this._eventSubscriptions.push(unsubscribePreset);

    const unsubscribePerf = this.eventBus.subscribe(
      EventChannels.PERFORMANCE.RENDER_MODE_CHANGED,
      (enabled) => {
        this._performanceModeEnabled = enabled;
        this._renderPresetList();
        this._updateShaderListVisibility();
        this.logger?.debug(`Performance mode ${enabled ? 'enabled' : 'disabled'} - shader options updated`);
      }
    );
    this._eventSubscriptions.push(unsubscribePerf);
  }

  dispose() {
    this._domListeners.removeAll();
    this._eventSubscriptions.forEach(unsubscribe => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    });
    this._eventSubscriptions = [];

    this.optionsContainer = null;
    this.unavailableMessage = null;
    this.settingsService = null;
    this.eventBus = null;
    this.logger = null;
  }
}

export { ShaderPresetListComponent };
