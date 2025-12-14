/**
 * Shader Selector Component
 *
 * Panel component for selecting shader presets and toggling cinematic mode.
 * Includes fullscreen mouse activity tracking for toolbar opacity.
 */

import { createDomListenerManager } from '@shared/base/dom-listener.js';
import { CSSClasses } from '@shared/config/css-classes.js';
import { getPresetsForUI } from '@/features/streaming/rendering/presets/render.presets.js';
import { EventChannels } from '@/infrastructure/events/event-channels.js';

class ShaderSelectorComponent {
  constructor({ settingsService, eventBus, logger }) {
    this.settingsService = settingsService;
    this.eventBus = eventBus;
    this.logger = logger;
    this.isVisible = false;
    this.currentPresetId = null;

    // Toolbar elements
    this.cinematicToggle = null;
    this.toolbar = null;
    this._mouseActivityTimeout = null;

    // Track DOM listeners for cleanup
    this._domListeners = createDomListenerManager({ logger });
    this._eventSubscriptions = [];
  }

  /**
   * Initialize component with DOM elements
   * @param {Object} elements - DOM element references
   */
  initialize(elements) {
    this.button = elements.shaderBtn;
    this.dropdown = elements.shaderDropdown;
    this.cinematicToggle = elements.cinematicToggle;
    this.toolbar = elements.streamToolbar;

    if (!this.button || !this.dropdown) {
      this.logger?.warn('Shader selector elements not found');
      return;
    }

    this._loadCurrentPreset();
    this._renderPresetList();
    this._setupClickOutside();
    this._setupEscapeKey();
    this._setupCinematicToggle();
    this._setupFullscreenMouseActivity();
    this._subscribeToEvents();

    this.logger?.debug('ShaderSelectorComponent initialized');
  }

  /**
   * Load current preset from settings
   * @private
   */
  _loadCurrentPreset() {
    this.currentPresetId = this.settingsService.getRenderPreset();
  }

  /**
   * Render preset list into panel
   * @private
   */
  _renderPresetList() {
    if (!this.dropdown) return;

    const optionsContainer = this.dropdown.querySelector('.shader-options');
    if (!optionsContainer) return;

    const presets = getPresetsForUI();
    optionsContainer.innerHTML = '';

    presets.forEach((preset) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'shader-option';
      option.dataset.presetId = preset.id;

      if (preset.id === this.currentPresetId) {
        option.classList.add(CSSClasses.ACTIVE);
      }

      option.innerHTML = `<span class="shader-option-name">${preset.name}</span>`;

      this._domListeners.add(option, 'click', () => {
        this._selectPreset(preset.id);
      });

      optionsContainer.appendChild(option);
    });
  }

  /**
   * Select a preset
   * @param {string} presetId - Preset ID to select
   * @private
   */
  _selectPreset(presetId) {
    if (presetId === this.currentPresetId) {
      this.hide();
      return;
    }

    this.currentPresetId = presetId;
    this.settingsService.setRenderPreset(presetId);
    this._updateActiveState(true);

    // Brief delay before hiding to show selection animation
    setTimeout(() => this.hide(), 150);

    this.logger?.debug(`Shader preset selected: ${presetId}`);
  }

  /**
   * Update active state on preset options
   * @param {boolean} animate - Whether to animate the selection
   * @private
   */
  _updateActiveState(animate = false) {
    if (!this.dropdown) return;

    const options = this.dropdown.querySelectorAll('.shader-option');
    options.forEach(option => {
      option.classList.remove('just-selected');

      if (option.dataset.presetId === this.currentPresetId) {
        option.classList.add(CSSClasses.ACTIVE);
        if (animate) {
          option.classList.add('just-selected');
        }
      } else {
        option.classList.remove(CSSClasses.ACTIVE);
      }
    });
  }

  /**
   * Subscribe to external events
   * @private
   */
  _subscribeToEvents() {
    // Listen for preset changes from other sources
    const unsubscribe = this.eventBus.subscribe(
      EventChannels.SETTINGS.RENDER_PRESET_CHANGED,
      (presetId) => {
        if (presetId !== this.currentPresetId) {
          this.currentPresetId = presetId;
          this._updateActiveState();
        }
      }
    );
    this._eventSubscriptions.push(unsubscribe);
  }

  /**
   * Toggle dropdown visibility
   */
  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Show panel
   */
  show() {
    if (!this.dropdown) return;

    this.dropdown.classList.add(CSSClasses.VISIBLE);
    this.button?.classList.add('panel-open');
    this.button?.setAttribute('aria-expanded', 'true');
    this.isVisible = true;

    this.logger?.debug('Shader panel shown');
  }

  /**
   * Hide panel
   */
  hide() {
    if (!this.dropdown) return;

    this.dropdown.classList.remove(CSSClasses.VISIBLE);
    this.button?.classList.remove('panel-open');
    this.button?.setAttribute('aria-expanded', 'false');
    this.isVisible = false;

    this.logger?.debug('Shader panel hidden');
  }

  /**
   * Setup click-outside-to-close behavior
   * @private
   */
  _setupClickOutside() {
    this._domListeners.add(document, 'click', (e) => {
      if (!this.isVisible) return;

      // Don't close if clicking inside the panel or on the toggle button
      if (e.target.closest('.shader-panel') || e.target.closest('.shader-dropdown') || e.target.closest('#shaderBtn')) {
        return;
      }

      this.hide();
    });
  }

  /**
   * Setup escape key to close dropdown
   * @private
   */
  _setupEscapeKey() {
    this._domListeners.add(document, 'keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible) {
        this.hide();
      }
    });
  }

  /**
   * Setup cinematic mode toggle
   * @private
   */
  _setupCinematicToggle() {
    if (!this.cinematicToggle) return;

    // Handle toggle changes
    this._domListeners.add(this.cinematicToggle, 'change', () => {
      this.eventBus.publish(EventChannels.UI.CINEMATIC_MODE, {
        enabled: this.cinematicToggle.checked
      });
    });

    // Sync toggle with external cinematic mode changes
    const unsubscribe = this.eventBus.subscribe(
      EventChannels.UI.CINEMATIC_MODE,
      ({ enabled }) => {
        if (this.cinematicToggle.checked !== enabled) {
          this.cinematicToggle.checked = enabled;
        }
      }
    );
    this._eventSubscriptions.push(unsubscribe);

    this.logger?.debug('Cinematic toggle initialized');
  }

  /**
   * Setup mouse activity tracking for toolbar fade
   * Toolbar fades after 10 seconds of mouse inactivity
   * @private
   */
  _setupFullscreenMouseActivity() {
    if (!this.toolbar) return;

    // Show toolbar on any mouse movement
    this._domListeners.add(document, 'mousemove', () => {
      this._showToolbar();
      this._resetMouseActivityTimeout();
    });

    // Also show on mouse click
    this._domListeners.add(document, 'mousedown', () => {
      this._showToolbar();
      this._resetMouseActivityTimeout();
    });

    // Start the initial fade timeout
    this._resetMouseActivityTimeout();

    this.logger?.debug('Mouse activity tracking initialized');
  }

  /**
   * Show toolbar (remove faded class)
   * @private
   */
  _showToolbar() {
    this.toolbar?.classList.remove('faded');
  }

  /**
   * Reset mouse activity timeout
   * @private
   */
  _resetMouseActivityTimeout() {
    if (this._mouseActivityTimeout) {
      clearTimeout(this._mouseActivityTimeout);
    }

    this._mouseActivityTimeout = setTimeout(() => {
      // Don't fade if panel is open
      if (!this.isVisible) {
        this.toolbar?.classList.add('faded');
      }
    }, 10000); // 10 seconds
  }

  /**
   * Dispose and cleanup event listeners
   */
  dispose() {
    if (this._mouseActivityTimeout) {
      clearTimeout(this._mouseActivityTimeout);
      this._mouseActivityTimeout = null;
    }
    this._domListeners.removeAll();
    this._eventSubscriptions.forEach(unsubscribe => unsubscribe());
    this._eventSubscriptions = [];
  }
}

// Export for ESM
export { ShaderSelectorComponent };
