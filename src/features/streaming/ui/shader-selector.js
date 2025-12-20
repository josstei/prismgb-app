/**
 * Shader Selector Component
 *
 * Panel component for selecting shader presets and toggling cinematic mode.
 * Includes fullscreen mouse activity tracking for toolbar opacity.
 */

import { createDomListenerManager } from '@shared/base/dom-listener.js';
import { CSSClasses } from '@shared/config/css-classes.js';
import { getPresetsForUI } from '@features/streaming/rendering/presets/render.presets.js';
import { EventChannels } from '@infrastructure/events/event-channels.js';

class ShaderSelectorComponent {
  constructor({ settingsService, appState, eventBus, logger }) {
    this.settingsService = settingsService;
    this.appState = appState;
    this.eventBus = eventBus;
    this.logger = logger;
    this.isVisible = false;
    this.currentPresetId = null;
    this.currentBrightness = 1.0;
    this.currentVolume = 70;

    // Performance mode state
    this._performanceModeEnabled = false;

    // Toolbar elements
    this.cinematicToggle = null;
    this.toolbar = null;
    this.brightnessSlider = null;
    this.brightnessPercentage = null;
    this.brightnessControl = null;
    this.volumeSlider = null;
    this.volumePercentage = null;
    this.streamVideo = null;
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
    this.brightnessSlider = elements.brightnessSlider;
    this.brightnessPercentage = elements.brightnessPercentage;
    this.brightnessControl = this.brightnessSlider?.closest('.brightness-control');
    this.volumeSlider = elements.volumeSlider;
    this.volumePercentage = elements.volumePercentage;
    this.streamVideo = elements.streamVideo;

    if (!this.button || !this.dropdown) {
      this.logger?.warn('Shader selector elements not found');
      return;
    }

    this._loadCurrentPreset();
    this._loadCurrentBrightness();
    this._loadCurrentVolume();
    this._loadPerformanceModeState();
    this._renderPresetList();
    this._setupClickOutside();
    this._setupEscapeKey();
    this._setupCinematicToggle();
    this._setupBrightnessSlider();
    this._setupVolumeSlider();
    this._setupFullscreenMouseActivity();
    this._subscribeToEvents();

    this.logger?.debug('ShaderSelectorComponent initialized');
  }

  /**
   * Load current performance mode state from settings
   * @private
   */
  _loadPerformanceModeState() {
    this._performanceModeEnabled = this.settingsService.getPerformanceMode();
    this._updateBrightnessControlVisibility();
  }

  /**
   * Update brightness control visibility based on performance mode
   * @private
   */
  _updateBrightnessControlVisibility() {
    if (!this.brightnessControl) return;

    if (this._performanceModeEnabled) {
      this.brightnessControl.classList.add('hidden');
    } else {
      this.brightnessControl.classList.remove('hidden');
    }
  }

  /**
   * Load current preset from settings
   * @private
   */
  _loadCurrentPreset() {
    this.currentPresetId = this.settingsService.getRenderPreset();
  }

  /**
   * Load current brightness from settings
   * @private
   */
  _loadCurrentBrightness() {
    this.currentBrightness = this.settingsService.getGlobalBrightness();
    if (this.brightnessSlider) {
      // Convert brightness (0.5-1.5) to slider value (0-100)
      this.brightnessSlider.value = Math.round((this.currentBrightness - 0.5) * 100);
    }
    this._updateBrightnessDisplay();
  }

  /**
   * Load current volume from settings
   * @private
   */
  _loadCurrentVolume() {
    this.currentVolume = this.settingsService.getVolume();
    if (this.volumeSlider) {
      this.volumeSlider.value = this.currentVolume;
    }
    this._updateVolumeDisplay();
    this._applyVolumeToVideo();
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

      // When performance mode is enabled, only Performance preset is visible
      if (this._performanceModeEnabled) {
        if (preset.id === 'performance') {
          option.classList.add(CSSClasses.ACTIVE);
        } else {
          option.classList.add('hidden');
          return;
        }
      } else {
        // Normal mode - hide Performance preset, show user's selection
        if (preset.id === 'performance') {
          option.classList.add('hidden');
          return;
        }
        if (preset.id === this.currentPresetId) {
          option.classList.add(CSSClasses.ACTIVE);
        }
      }

      option.innerHTML = `<span class="shader-option-name">${preset.name}</span>`;

      this._domListeners.add(option, 'click', () => {
        if (!this._performanceModeEnabled) {
          this._selectPreset(preset.id);
        }
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
      return;
    }

    this.currentPresetId = presetId;
    this.settingsService.setRenderPreset(presetId);
    this._updateActiveState(true);

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

    // Listen for performance mode changes
    const unsubscribePerf = this.eventBus.subscribe(
      EventChannels.PERFORMANCE.RENDER_MODE_CHANGED,
      (enabled) => {
        this._performanceModeEnabled = enabled;
        this._renderPresetList();
        this._updateBrightnessControlVisibility();
        this.logger?.debug(`Performance mode ${enabled ? 'enabled' : 'disabled'} - shader options updated`);
      }
    );
    this._eventSubscriptions.push(unsubscribePerf);
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
      if (e.target.closest('.shader-panel') || e.target.closest('#shaderBtn')) {
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
   * Setup cinematic mode toggle (pill button)
   * @private
   */
  _setupCinematicToggle() {
    if (!this.cinematicToggle) return;

    // Initialize button state from appState
    const initialState = this.appState?.cinematicModeEnabled ?? true;
    this._updateCinematicPill(initialState);

    // Handle pill button click
    this._domListeners.add(this.cinematicToggle, 'click', () => {
      const isActive = this.cinematicToggle.classList.contains('active');
      const newState = !isActive;
      this._updateCinematicPill(newState);
      this.eventBus.publish(EventChannels.UI.CINEMATIC_MODE, {
        enabled: newState
      });
    });

    // Sync toggle with external cinematic mode changes
    const unsubscribe = this.eventBus.subscribe(
      EventChannels.UI.CINEMATIC_MODE,
      ({ enabled }) => {
        const isActive = this.cinematicToggle.classList.contains('active');
        if (isActive !== enabled) {
          this._updateCinematicPill(enabled);
        }
      }
    );
    this._eventSubscriptions.push(unsubscribe);

    this.logger?.debug('Cinematic toggle initialized');
  }

  /**
   * Update cinematic pill button state
   * @param {boolean} enabled - Whether cinematic mode is enabled
   * @private
   */
  _updateCinematicPill(enabled) {
    if (!this.cinematicToggle) return;

    const textElement = this.cinematicToggle.querySelector('.cinematic-pill-text');
    if (enabled) {
      this.cinematicToggle.classList.add('active');
      this.cinematicToggle.setAttribute('aria-pressed', 'true');
      if (textElement) textElement.textContent = 'Cinematic On';
    } else {
      this.cinematicToggle.classList.remove('active');
      this.cinematicToggle.setAttribute('aria-pressed', 'false');
      if (textElement) textElement.textContent = 'Cinematic Off';
    }
  }

  /**
   * Setup brightness slider
   * @private
   */
  _setupBrightnessSlider() {
    if (!this.brightnessSlider) return;

    // Handle slider input (real-time updates during drag)
    this._domListeners.add(this.brightnessSlider, 'input', () => {
      this._handleBrightnessChange(false);
    });

    // Handle slider change (save on release)
    this._domListeners.add(this.brightnessSlider, 'change', () => {
      this._handleBrightnessChange(true);
    });

    // Sync slider with external brightness changes
    const unsubscribe = this.eventBus.subscribe(
      EventChannels.SETTINGS.BRIGHTNESS_CHANGED,
      (brightness) => {
        if (Math.abs(brightness - this.currentBrightness) > 0.01) {
          this.currentBrightness = brightness;
          if (this.brightnessSlider) {
            // Convert brightness (0.5-1.5) to slider value (0-100)
            this.brightnessSlider.value = Math.round((brightness - 0.5) * 100);
          }
          this._updateBrightnessDisplay();
        }
      }
    );
    this._eventSubscriptions.push(unsubscribe);

    this.logger?.debug('Brightness slider initialized');
  }

  /**
   * Setup volume slider
   * @private
   */
  _setupVolumeSlider() {
    if (!this.volumeSlider) return;

    // Handle slider input (real-time updates during drag)
    this._domListeners.add(this.volumeSlider, 'input', () => {
      this._handleVolumeChange(false);
    });

    // Handle slider change (save on release)
    this._domListeners.add(this.volumeSlider, 'change', () => {
      this._handleVolumeChange(true);
    });

    // Sync slider with external volume changes
    const unsubscribe = this.eventBus.subscribe(
      EventChannels.SETTINGS.VOLUME_CHANGED,
      (volume) => {
        if (Math.abs(volume - this.currentVolume) > 0.5) {
          this.currentVolume = volume;
          if (this.volumeSlider) {
            this.volumeSlider.value = volume;
          }
          this._updateVolumeDisplay();
          this._applyVolumeToVideo();
        }
      }
    );
    this._eventSubscriptions.push(unsubscribe);

    this.logger?.debug('Volume slider initialized');
  }

  /**
   * Handle brightness slider change
   * @param {boolean} saveToSettings - Whether to persist to storage
   * @private
   */
  _handleBrightnessChange(saveToSettings) {
    // Convert slider value (0-100) to brightness multiplier (0.5-1.5)
    const sliderValue = parseInt(this.brightnessSlider.value);
    const brightness = (sliderValue / 100) + 0.5;

    this.currentBrightness = brightness;
    this._updateBrightnessDisplay();

    if (saveToSettings) {
      // Save to localStorage - setGlobalBrightness publishes the event
      this.settingsService.setGlobalBrightness(brightness);
    } else {
      // Real-time preview during drag - publish directly for immediate rendering
      this.eventBus.publish(EventChannels.SETTINGS.BRIGHTNESS_CHANGED, brightness);
    }
  }

  /**
   * Update brightness percentage display
   * @private
   */
  _updateBrightnessDisplay() {
    if (!this.brightnessPercentage) return;

    // Display shows 0-100% (slider value directly)
    const sliderValue = this.brightnessSlider ? parseInt(this.brightnessSlider.value) : 50;
    this.brightnessPercentage.textContent = `${sliderValue}%`;

    // Update fill gradient (slider range is 0-100)
    if (this.brightnessSlider) {
      const normalizedValue = sliderValue / 100; // 0 to 1

      // Calculate fill to match thumb center position
      // Thumb travels from thumbRadius to (trackHeight - thumbRadius)
      const thumbSize = 21;
      const thumbRadius = thumbSize / 2;
      const trackHeight = this.brightnessSlider.offsetHeight || 120;
      const travelDistance = trackHeight - thumbSize;
      const thumbCenter = thumbRadius + normalizedValue * travelDistance;
      this.brightnessSlider.style.setProperty('--fill-percent', `${thumbCenter}px`);
    }
  }

  /**
   * Handle volume slider change
   * @param {boolean} saveToSettings - Whether to persist to storage
   * @private
   */
  _handleVolumeChange(saveToSettings) {
    const sliderValue = parseInt(this.volumeSlider.value);
    this.currentVolume = sliderValue;
    this._updateVolumeDisplay();
    this._applyVolumeToVideo();

    if (saveToSettings) {
      this.settingsService.setVolume(sliderValue);
    } else {
      this.eventBus.publish(EventChannels.SETTINGS.VOLUME_CHANGED, sliderValue);
    }
  }

  /**
   * Update volume percentage display
   * @private
   */
  _updateVolumeDisplay() {
    if (!this.volumePercentage) return;

    const sliderValue = this.volumeSlider ? parseInt(this.volumeSlider.value) : 70;
    this.volumePercentage.textContent = `${sliderValue}%`;

    // Update fill gradient (slider range is 0-100)
    if (this.volumeSlider) {
      const normalizedValue = sliderValue / 100; // 0 to 1

      // Calculate fill to match thumb center position
      const thumbSize = 21;
      const thumbRadius = thumbSize / 2;
      const trackHeight = this.volumeSlider.offsetHeight || 120;
      const travelDistance = trackHeight - thumbSize;
      const thumbCenter = thumbRadius + normalizedValue * travelDistance;
      this.volumeSlider.style.setProperty('--fill-percent', `${thumbCenter}px`);
    }
  }

  /**
   * Apply volume to video element
   * @private
   */
  _applyVolumeToVideo() {
    if (this.streamVideo) {
      this.streamVideo.volume = this.currentVolume / 100;
    }
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

export { ShaderSelectorComponent };
