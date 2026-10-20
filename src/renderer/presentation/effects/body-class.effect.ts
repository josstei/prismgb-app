import { effect } from '@preact/signals-core';
import { TIMING } from '@renderer/lib/timing.config';
import { CSSClasses } from '@renderer/presentation/config/css-classes.config';
import { PresentationComponent } from '@renderer/presentation/primitives/presentation-component.base';
import { bindClass } from '@renderer/presentation/primitives/signal-bindings.utils';
import type { PresentationModeStore } from '@renderer/presentation/state/presentation-mode.store';

const MINIMALIST_TRANSITION_TIMEOUT = Symbol('minimalist-transition-timeout');

/**
 * Owns the app-level classes on document.body. The presentation-mode composites from the store
 * become class bindings; minimalist fullscreen also runs the timed transition class on change.
 */
export class BodyClassEffect extends PresentationComponent {
  constructor(presentationMode: PresentationModeStore) {
    super();
    this.disposables.add(presentationMode);
    this.disposables.add(bindClass(document.body, CSSClasses.CINEMATIC_ACTIVE, presentationMode.cinematicActive));
    this.disposables.add(bindClass(document.body, CSSClasses.FULLSCREEN_ACTIVE, presentationMode.fullscreenActive));
    this.disposables.add(effect(() => this.setMinimalistFullscreen(presentationMode.minimalistActive.value)));
  }

  setIdle(isIdle: boolean): void {
    document.body.classList.toggle(CSSClasses.APP_IDLE, isIdle);
  }

  setHidden(isHidden: boolean): void {
    document.body.classList.toggle(CSSClasses.APP_HIDDEN, isHidden);
  }

  setAnimationsOff(animationsOff: boolean): void {
    document.body.classList.toggle(CSSClasses.APP_ANIMATIONS_OFF, animationsOff);
  }

  areAnimationsOff(): boolean {
    return document.body.classList.contains(CSSClasses.APP_ANIMATIONS_OFF);
  }

  setStreamingMode(isStreaming: boolean): void {
    document.body.classList.toggle(CSSClasses.STREAMING_MODE, isStreaming);
  }

  override dispose(): void | Promise<void> {
    const disposed = super.dispose();
    document.body.classList.remove(CSSClasses.MINIMALIST_TRANSITION);
    return disposed;
  }

  private setMinimalistFullscreen(isActive: boolean): void {
    if (document.body.classList.contains(CSSClasses.MINIMALIST_FULLSCREEN) === isActive) return;

    this.startMinimalistTransition();
    document.body.classList.toggle(CSSClasses.MINIMALIST_FULLSCREEN, isActive);
  }

  private startMinimalistTransition(): void {
    document.body.classList.add(CSSClasses.MINIMALIST_TRANSITION);
    this.disposables.schedule(MINIMALIST_TRANSITION_TIMEOUT, () => {
      document.body.classList.remove(CSSClasses.MINIMALIST_TRANSITION);
    }, TIMING.MINIMALIST_TRANSITION_MS);
  }
}
