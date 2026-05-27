/**
 * CaptureEffects - Handles visual feedback for capture actions
 *
 * Manages the shutter flash effect when taking screenshots.
 */

import { PresentationComponent } from '@renderer/presentation/primitives/presentation-component.base';

export class CaptureEffects extends PresentationComponent {
  /**
   * Trigger shutter flash effect
   */
  triggerShutterFlash() {
    this._createFlashOverlay('shutter-flash');
  }

  _createFlashOverlay(className: string) {
    const flash = document.createElement('div');
    flash.className = className;
    document.body.appendChild(flash);

    let disposeTimeout = () => {};
    let disposeAnimationEnd = () => {};
    let disposeLifecycle = () => {};
    let isCleanedUp = false;

    const cleanup = () => {
      if (isCleanedUp) {
        return;
      }

      isCleanedUp = true;
      disposeTimeout();
      disposeAnimationEnd();
      if (flash.parentNode) {
        flash.remove();
      }
      disposeLifecycle();
    };

    // Fallback timeout in case animation doesn't fire
    disposeTimeout = this.timeout(cleanup, 500);
    disposeAnimationEnd = this.listen(flash, 'animationend', cleanup, { once: true });
    disposeLifecycle = this.track(cleanup);
  }

  /**
   * Dispose any pending flash overlays.
   */
  override dispose(): void | Promise<void> {
    return super.dispose();
  }
}
