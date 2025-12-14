/**
 * Volume Control UI Helper
 * Centralized volume icon and UI management
 */

import { createDomListenerManager } from '@shared/base/dom-listener.js';
import { CSSClasses } from '@shared/config/css-classes.js';

class VolumeControl {
  constructor(elements) {
    this.elements = elements;
    this.volumeWave1 = elements.volumeWave1;
    this.volumeWave2 = elements.volumeWave2;
    this.volumeButton = elements.volumeButton;
    this._domListeners = createDomListenerManager();
  }

  /**
   * Update volume icon based on volume level
   * @param {number} volume - Volume level (0-100)
   */
  updateIcon(volume) {
    if (!this.volumeWave1 || !this.volumeWave2) {
      return;
    }

    if (volume === 0) {
      // Muted
      this.volumeWave1.classList.add(CSSClasses.HIDDEN);
      this.volumeWave2.classList.add(CSSClasses.HIDDEN);
    } else if (volume < 50) {
      // Low volume
      this.volumeWave1.classList.remove(CSSClasses.HIDDEN);
      this.volumeWave2.classList.add(CSSClasses.HIDDEN);
    } else {
      // High volume
      this.volumeWave1.classList.remove(CSSClasses.HIDDEN);
      this.volumeWave2.classList.remove(CSSClasses.HIDDEN);
    }
  }

  /**
   * Update volume display
   * @param {number} volume - Volume level (0-100)
   */
  updateDisplay(volume) {
    this.elements.volumeSlider.value = volume;
    this.elements.volumePercentage.textContent = `${volume}%`;
    this.updateIcon(volume);
  }

  /**
   * Apply volume to video element
   * @param {number} volume - Volume level (0-100)
   */
  applyToVideo(volume) {
    if (this.elements.streamVideo) {
      this.elements.streamVideo.volume = volume / 100;
    }
  }

  /**
   * Set volume (updates display and applies to video)
   * @param {number} volume - Volume level (0-100)
   */
  setVolume(volume) {
    this.updateDisplay(volume);
    this.applyToVideo(volume);
  }

  /**
   * Hide slider
   */
  hideSlider() {
    if (!this.elements.volumeSliderContainer) {
      return;
    }
    this.elements.volumeSliderContainer.classList.remove(CSSClasses.VISIBLE);
    this.volumeButton?.setAttribute('aria-expanded', 'false');
  }

  /**
   * Show slider
   */
  showSlider() {
    if (!this.elements.volumeSliderContainer) {
      return;
    }
    this.elements.volumeSliderContainer.classList.add(CSSClasses.VISIBLE);
    this.volumeButton?.setAttribute('aria-expanded', 'true');
  }

  /**
   * Setup click-outside-to-close behavior
   */
  setupClickOutside() {
    this._domListeners.add(document, 'click', (e) => {
      if (!e.target.closest('.volume-control')) {
        this.hideSlider();
      }
    });
  }

  /**
   * Dispose and cleanup event listeners
   */
  dispose() {
    this._domListeners.removeAll();
  }
}

// Export for ESM
export { VolumeControl };
