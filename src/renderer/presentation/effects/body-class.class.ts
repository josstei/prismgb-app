import { TIMING } from '@renderer/presentation/config/constants.config';
import { CSSClasses } from '@renderer/presentation/config/css-classes.config';
import { PresentationComponent } from '@renderer/presentation/primitives/presentation-component.base';

const MINIMALIST_TRANSITION_TIMEOUT = Symbol('minimalist-transition-timeout');

const APP_CSS_CLASSES = Object.freeze({
  IDLE: 'app-idle',
  HIDDEN: 'app-hidden',
  ANIMATIONS_OFF: 'app-animations-off'
});

export class BodyClassManager extends PresentationComponent {
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
    this.cancelManaged(MINIMALIST_TRANSITION_TIMEOUT);

    document.body.classList.add(CSSClasses.MINIMALIST_TRANSITION);
    this.replaceTimeout(MINIMALIST_TRANSITION_TIMEOUT, () => {
      document.body.classList.remove(CSSClasses.MINIMALIST_TRANSITION);
    }, TIMING.MINIMALIST_TRANSITION_MS);
  }

  override dispose(): void | Promise<void> {
    const disposed = super.dispose();
    document.body.classList.remove(CSSClasses.MINIMALIST_TRANSITION);
    return disposed;
  }
}
