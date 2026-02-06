// @ts-nocheck
/**
 * ButtonFeedback - Handles button animation feedback
 *
 * Manages button press/pop animations and recording state display.
 */

import { TIMING } from '@renderer/presentation/config/constants.config';
import { CSSClasses } from '@renderer/presentation/config/css-classes.config';

export class ButtonFeedback {
  constructor(dependencies = {}) {
    const { elements } = dependencies;
    this.elements = elements;
    this._activeTimeouts = new Set();
  }

  /**
   * Trigger record button pop effect (for recording start)
   */
  triggerRecordButtonPop() {
    this.triggerButtonFeedback('recordBtn', 'btn-pop', TIMING.UI_TIMEOUT_MS);
  }

  /**
   * Trigger record button press effect (for recording stop)
   */
  triggerRecordButtonPress() {
    this.triggerButtonFeedback('recordBtn', 'btn-press', TIMING.UI_TIMEOUT_MS);
  }

  /**
   * Trigger button feedback animation
   * @param {string} elementKey - Key of the button element
   * @param {string} className - CSS class to add temporarily
   * @param {number} duration - Duration in ms before removing class
   */
  triggerButtonFeedback(elementKey, className, duration) {
    const element = this.elements?.[elementKey];
    if (!element) return;

    // Remove class first in case of rapid clicks
    element.classList.remove(className);

    // Force reflow to restart animation
    void element.offsetWidth;

    element.classList.add(className);

    const timeoutId = setTimeout(() => {
      element.classList.remove(className);
      this._activeTimeouts.delete(timeoutId);
    }, duration);
    this._activeTimeouts.add(timeoutId);
  }

  /**
   * Set recording button state
   * @param {HTMLElement} element - The record button element
   * @param {boolean} isActive - Whether recording is active
   */
  setRecordingButtonState(element, isActive) {
    if (!element) return;

    if (isActive) {
      element.classList.add(CSSClasses.RECORDING);
    } else {
      element.classList.remove(CSSClasses.RECORDING);
    }
  }

  /**
   * Dispose and cleanup resources
   */
  dispose() {
    for (const timeoutId of this._activeTimeouts) {
      clearTimeout(timeoutId);
    }
    this._activeTimeouts.clear();
    this.elements = null;
  }
}
