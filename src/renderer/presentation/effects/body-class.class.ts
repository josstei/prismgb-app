/**
 * Body Class Manager
 *
 * Owns toggling body CSS classes for application and UI state.
 * Responsible for DOM mutations; business logic lives in services/orchestrators.
 */

import { TIMING } from '@renderer/presentation/config/constants.config';
import { CSSClasses } from '@renderer/presentation/config/css-classes.config';

const APP_CSS_CLASSES = Object.freeze({
  IDLE: 'app-idle',
  HIDDEN: 'app-hidden',
  ANIMATIONS_OFF: 'app-animations-off'
});

export class BodyClassManager {
  _minimalistTransitionTimer: ReturnType<typeof setTimeout> | null;

  constructor() {
    this._minimalistTransitionTimer = null;
  }

  /**
   * Set idle state
   * @param {boolean} isIdle - Whether the app is idle
   */
  setIdle(isIdle) {
    document.body.classList.toggle(APP_CSS_CLASSES.IDLE, isIdle);
  }

  /**
   * Set hidden state
   * @param {boolean} isHidden - Whether the app is hidden
   */
  setHidden(isHidden) {
    document.body.classList.toggle(APP_CSS_CLASSES.HIDDEN, isHidden);
  }

  /**
   * Set animations off state
   * @param {boolean} animationsOff - Whether animations should be suppressed
   */
  setAnimationsOff(animationsOff) {
    document.body.classList.toggle(APP_CSS_CLASSES.ANIMATIONS_OFF, animationsOff);
  }

  /**
   * Check if animations are disabled (performance mode)
   * @returns {boolean}
   */
  areAnimationsOff() {
    return document.body.classList.contains(APP_CSS_CLASSES.ANIMATIONS_OFF);
  }

  /**
   * Set streaming mode body class
   * @param {boolean} isStreaming - Whether streaming mode is active
   */
  setStreamingMode(isStreaming) {
    document.body.classList.toggle(CSSClasses.STREAMING_MODE, isStreaming);
  }

  /**
   * Set cinematic mode body class
   * @param {boolean} isActive - Whether cinematic mode should be visually active
   */
  setCinematicMode(isActive) {
    document.body.classList.toggle(CSSClasses.CINEMATIC_ACTIVE, isActive);
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
   * Set fullscreen mode body class
   * @param {boolean} isActive - Whether fullscreen mode is active
   */
  setFullscreenMode(isActive) {
    document.body.classList.toggle(CSSClasses.FULLSCREEN_ACTIVE, isActive);
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
