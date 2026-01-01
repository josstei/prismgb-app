/**
 * Body Class Manager
 *
 * Owns toggling body CSS classes for application state.
 * Responsible for DOM mutations; business logic lives in AnimationPerformanceService.
 */

const APP_CSS_CLASSES = Object.freeze({
  STREAMING: 'app-streaming',
  IDLE: 'app-idle',
  HIDDEN: 'app-hidden',
  ANIMATIONS_OFF: 'app-animations-off'
});

export class BodyClassManager {
  /**
   * Set streaming state
   * @param {boolean} isStreaming - Whether the app is streaming
   */
  setStreaming(isStreaming) {
    if (isStreaming) {
      document.body.classList.add(APP_CSS_CLASSES.STREAMING);
      document.body.classList.remove(APP_CSS_CLASSES.IDLE);
    } else {
      document.body.classList.remove(APP_CSS_CLASSES.STREAMING);
    }
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
}
