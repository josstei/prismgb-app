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

  setIdle(isIdle: boolean) {
    document.body.classList.toggle(APP_CSS_CLASSES.IDLE, isIdle);
  }

  setHidden(isHidden: boolean) {
    document.body.classList.toggle(APP_CSS_CLASSES.HIDDEN, isHidden);
  }

  setAnimationsOff(animationsOff: boolean) {
    document.body.classList.toggle(APP_CSS_CLASSES.ANIMATIONS_OFF, animationsOff);
  }

  areAnimationsOff() {
    return document.body.classList.contains(APP_CSS_CLASSES.ANIMATIONS_OFF);
  }

  setStreamingMode(isStreaming: boolean) {
    document.body.classList.toggle(CSSClasses.STREAMING_MODE, isStreaming);
  }

  setCinematicMode(isActive: boolean) {
    document.body.classList.toggle(CSSClasses.CINEMATIC_ACTIVE, isActive);
  }

  setMinimalistFullscreen(isActive: boolean) {
    const currentlyActive = document.body.classList.contains(CSSClasses.MINIMALIST_FULLSCREEN);
    if (currentlyActive === isActive) return;

    this._setMinimalistTransitionActive();
    document.body.classList.toggle(CSSClasses.MINIMALIST_FULLSCREEN, isActive);
  }

  setFullscreenMode(isActive: boolean) {
    document.body.classList.toggle(CSSClasses.FULLSCREEN_ACTIVE, isActive);
  }

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
