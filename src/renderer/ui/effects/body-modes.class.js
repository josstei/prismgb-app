/**
 * BodyModes - Manages global body class state for display modes
 *
 * Controls body CSS classes for cinematic, minimalist fullscreen, and fullscreen modes.
 * These are global states that affect the entire application layout.
 */

import { TIMING } from '@shared/config/constants.config.js';
import { CSSClasses } from '@shared/config/css-classes.config.js';

export class BodyModes {
  constructor() {
    this._minimalistTransitionTimer = null;
  }

  /**
   * Set cinematic mode body class
   * @param {boolean} isActive - Whether cinematic mode should be visually active
   */
  setCinematicMode(isActive) {
    if (isActive) {
      document.body.classList.add(CSSClasses.CINEMATIC_ACTIVE);
    } else {
      document.body.classList.remove(CSSClasses.CINEMATIC_ACTIVE);
    }
  }

  /**
   * Set minimalist fullscreen body class
   * @param {boolean} isActive - Whether minimalist fullscreen should be active
   */
  setMinimalistFullscreen(isActive) {
    const currentlyActive = document.body.classList.contains(CSSClasses.MINIMALIST_FULLSCREEN);
    if (currentlyActive === isActive) return;

    this._setMinimalistTransitionActive();
    document.body.classList.toggle(CSSClasses.MINIMALIST_FULLSCREEN, isActive);
  }

  /**
   * Apply transition class for minimalist mode changes
   * @private
   */
  _setMinimalistTransitionActive() {
    if (this._minimalistTransitionTimer) {
      clearTimeout(this._minimalistTransitionTimer);
      this._minimalistTransitionTimer = null;
    }

    document.body.classList.add(CSSClasses.MINIMALIST_TRANSITION);
    this._minimalistTransitionTimer = setTimeout(() => {
      document.body.classList.remove(CSSClasses.MINIMALIST_TRANSITION);
      this._minimalistTransitionTimer = null;
    }, TIMING.MINIMALIST_TRANSITION_MS);
  }

  /**
   * Set fullscreen mode body class
   * @param {boolean} isActive - Whether fullscreen mode is active
   */
  setFullscreenMode(isActive) {
    if (isActive) {
      document.body.classList.add(CSSClasses.FULLSCREEN_ACTIVE);
    } else {
      document.body.classList.remove(CSSClasses.FULLSCREEN_ACTIVE);
    }
  }

  /**
   * Dispose and cleanup resources
   */
  dispose() {
    if (this._minimalistTransitionTimer) {
      clearTimeout(this._minimalistTransitionTimer);
      this._minimalistTransitionTimer = null;
    }
    document.body.classList.remove(CSSClasses.MINIMALIST_TRANSITION);
  }
}
