/**
 * Shader Slider Controls Component
 *
 * Handles brightness and volume sliders with live updates and persistence.
 */

import { createDomListenerManager } from '@renderer/presentation/primitives/dom-listener.utils.js';
import { CSSClasses } from '@renderer/presentation/config/css-classes.config';
import { sliderToBrightness, brightnessToSlider } from '@renderer/presentation/lib/brightness.utils';
import { EventChannels } from '@renderer/application/config/event-channels';
import { cleanupCallbacks } from '@renderer/presentation/lib/event-subscriptions.utils';

class ShaderSliderControlsComponent {
  constructor({ settingsService, eventBus, logger }) {
    this.settingsService = settingsService;
    this.eventBus = eventBus;
    this.logger = logger;

    this.brightnessSlider = null;
    this.brightnessPercentage = null;
    this.brightnessControl = null;
    this.volumeSlider = null;
    this.volumePercentage = null;
    this.streamVideo = null;

    this.currentBrightness = 1.0;
    this.currentVolume = 70;
    this._performanceModeEnabled = false;

    this._domListeners = createDomListenerManager({ logger });
    this._eventSubscriptions = [];
  }

  /**
   * Initialize component with DOM elements
   * @param {Object} elements
   * @param {HTMLInputElement} elements.brightnessSlider
   * @param {HTMLElement} elements.brightnessPercentage
   * @param {HTMLElement} elements.brightnessControl
   * @param {HTMLInputElement} elements.volumeSlider
   * @param {HTMLElement} elements.volumePercentage
   * @param {HTMLVideoElement} elements.streamVideo
   */
  initialize({
    brightnessSlider,
    brightnessPercentage,
    brightnessControl,
    volumeSlider,
    volumePercentage,
    streamVideo
  }) {
    this.brightnessSlider = brightnessSlider;
    this.brightnessPercentage = brightnessPercentage;
    this.brightnessControl = brightnessControl;
    this.volumeSlider = volumeSlider;
    this.volumePercentage = volumePercentage;
    this.streamVideo = streamVideo;

    if (!this.brightnessSlider && !this.volumeSlider) {
      this.logger?.warn('Shader slider elements not found');
      return;
    }

    this._loadCurrentBrightness();
    this._loadCurrentVolume();
    this._loadPerformanceModeState();
    this._setupBrightnessSlider();
    this._setupVolumeSlider();
    this._subscribeToEvents();

    this.logger?.debug('Shader slider controls initialized');
  }

  _loadCurrentBrightness() {
    if (!this.brightnessSlider) return;

    this.currentBrightness = this.settingsService.getGlobalBrightness();
    this.brightnessSlider.value = brightnessToSlider(this.currentBrightness);
    this._updateBrightnessDisplay();
  }

  _loadCurrentVolume() {
    if (!this.volumeSlider) return;

    this.currentVolume = this.settingsService.getVolume();
    this.volumeSlider.value = this.currentVolume;
    this._updateVolumeDisplay();
    this._applyVolumeToVideo();
  }

  _loadPerformanceModeState() {
    this._performanceModeEnabled = this.settingsService.getPerformanceMode();
    this._updateBrightnessControlVisibility();
  }

  _updateBrightnessControlVisibility() {
    if (!this.brightnessControl) return;

    if (this._performanceModeEnabled) {
      this.brightnessControl.classList.add(CSSClasses.HIDDEN);
    } else {
      this.brightnessControl.classList.remove(CSSClasses.HIDDEN);
    }
  }

  _setupBrightnessSlider() {
    if (!this.brightnessSlider) return;

    this._domListeners.add(this.brightnessSlider, 'input', () => {
      this._handleBrightnessChange(false);
    });

    this._domListeners.add(this.brightnessSlider, 'change', () => {
      this._handleBrightnessChange(true);
    });
  }

  _setupVolumeSlider() {
    if (!this.volumeSlider) return;

    this._domListeners.add(this.volumeSlider, 'input', () => {
      this._handleVolumeChange(false);
    });

    this._domListeners.add(this.volumeSlider, 'change', () => {
      this._handleVolumeChange(true);
    });
  }

  _subscribeToEvents() {
    const unsubscribeBrightness = this.eventBus.subscribe(
      EventChannels.SETTINGS.BRIGHTNESS_CHANGED,
      (brightness) => {
        if (!this.brightnessSlider) return;
        if (Math.abs(brightness - this.currentBrightness) > 0.01) {
          this.currentBrightness = brightness;
          this.brightnessSlider.value = brightnessToSlider(brightness);
          this._updateBrightnessDisplay();
        }
      }
    );
    this._eventSubscriptions.push(unsubscribeBrightness);

    const unsubscribeVolume = this.eventBus.subscribe(
      EventChannels.SETTINGS.VOLUME_CHANGED,
      (volume) => {
        if (!this.volumeSlider) return;
        if (Math.abs(volume - this.currentVolume) > 0.5) {
          this.currentVolume = volume;
          this.volumeSlider.value = volume;
          this._updateVolumeDisplay();
          this._applyVolumeToVideo();
        }
      }
    );
    this._eventSubscriptions.push(unsubscribeVolume);

    const unsubscribePerf = this.eventBus.subscribe(
      EventChannels.PERFORMANCE.RENDER_MODE_CHANGED,
      (enabled) => {
        this._performanceModeEnabled = enabled;
        this._updateBrightnessControlVisibility();
      }
    );
    this._eventSubscriptions.push(unsubscribePerf);
  }

  _handleBrightnessChange(saveToSettings) {
    if (!this.brightnessSlider) return;

    const sliderValue = parseInt(this.brightnessSlider.value, 10);
    const brightness = sliderToBrightness(sliderValue);

    this.currentBrightness = brightness;
    this._updateBrightnessDisplay();

    if (saveToSettings) {
      this.settingsService.setGlobalBrightness(brightness);
    } else {
      this.eventBus.publish(EventChannels.SETTINGS.BRIGHTNESS_CHANGED, brightness);
    }
  }

  _updateBrightnessDisplay() {
    if (!this.brightnessPercentage) return;

    const sliderValue = this.brightnessSlider ? parseInt(this.brightnessSlider.value, 10) : 50;
    this.brightnessPercentage.textContent = `${sliderValue}%`;

    if (this.brightnessSlider) {
      const normalizedValue = sliderValue / 100;
      const thumbSize = 21;
      const thumbRadius = thumbSize / 2;
      const trackHeight = this.brightnessSlider.offsetHeight || 120;
      const travelDistance = trackHeight - thumbSize;
      const thumbCenter = thumbRadius + normalizedValue * travelDistance;
      this.brightnessSlider.style.setProperty('--fill-percent', `${thumbCenter}px`);
    }
  }

  _handleVolumeChange(saveToSettings) {
    if (!this.volumeSlider) return;

    const sliderValue = parseInt(this.volumeSlider.value, 10);
    this.currentVolume = sliderValue;
    this._updateVolumeDisplay();
    this._applyVolumeToVideo();

    if (saveToSettings) {
      this.settingsService.setVolume(sliderValue);
    } else {
      this.eventBus.publish(EventChannels.SETTINGS.VOLUME_CHANGED, sliderValue);
    }
  }

  _updateVolumeDisplay() {
    if (!this.volumePercentage) return;

    const sliderValue = this.volumeSlider ? parseInt(this.volumeSlider.value, 10) : 70;
    this.volumePercentage.textContent = `${sliderValue}%`;

    if (this.volumeSlider) {
      const normalizedValue = sliderValue / 100;
      const thumbSize = 21;
      const thumbRadius = thumbSize / 2;
      const trackHeight = this.volumeSlider.offsetHeight || 120;
      const travelDistance = trackHeight - thumbSize;
      const thumbCenter = thumbRadius + normalizedValue * travelDistance;
      this.volumeSlider.style.setProperty('--fill-percent', `${thumbCenter}px`);
    }
  }

  _applyVolumeToVideo() {
    if (this.streamVideo) {
      this.streamVideo.volume = this.currentVolume / 100;
    }
  }

  dispose() {
    this._domListeners.removeAll();
    cleanupCallbacks(this._eventSubscriptions);
    this._eventSubscriptions = [];
  }
}

export { ShaderSliderControlsComponent };
