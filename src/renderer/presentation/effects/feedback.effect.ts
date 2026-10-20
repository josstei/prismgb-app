import type { DisposableFunction } from '@platform/core';
import { TIMING } from '@renderer/lib/timing.config';
import { CSSClasses } from '@renderer/presentation/config/css-classes.config';
import { PresentationComponent } from '@renderer/presentation/primitives/presentation-component.base';
import type { DomStreamingBindings } from '@renderer/presentation/primitives/dom-bindings.utils';

type FeedbackElements = Pick<DomStreamingBindings, 'screenshotBtn' | 'recordBtn'>;

// Fallback for when the flash animation never reports animationend.
const SHUTTER_FLASH_FALLBACK_MS = 500;

export class FeedbackEffect extends PresentationComponent {
  constructor(private readonly elements: FeedbackElements) {
    super();
  }

  shutterFlash(): void {
    const flash = document.createElement('div');
    flash.className = 'shutter-flash';
    document.body.appendChild(flash);

    const releases: DisposableFunction[] = [];
    let removed = false;
    const remove = () => {
      if (removed) return;
      removed = true;
      releases.forEach((release) => void release());
      flash.remove();
    };

    releases.push(
      this.disposables.timeout(remove, SHUTTER_FLASH_FALLBACK_MS),
      this.disposables.listen(flash, 'animationend', remove, { once: true }),
      this.disposables.add(remove)
    );
  }

  screenshotFeedback(): void {
    this.pulse(this.elements.screenshotBtn, 'capturing', TIMING.BUTTON_FEEDBACK_MS);
  }

  recordButtonPop(): void {
    this.pulse(this.elements.recordBtn, 'btn-pop', TIMING.UI_TIMEOUT_MS);
  }

  recordButtonPress(): void {
    this.pulse(this.elements.recordBtn, 'btn-press', TIMING.UI_TIMEOUT_MS);
  }

  setRecording(active: boolean): void {
    this.elements.recordBtn?.classList.toggle(CSSClasses.RECORDING, active);
  }

  setRecordButtonDisabled(disabled: boolean): void {
    if (this.elements.recordBtn) {
      this.elements.recordBtn.disabled = disabled;
    }
  }

  // Re-triggering restarts the class: the forced reflow lets its CSS animation replay.
  private pulse(element: HTMLElement | null, className: string, durationMs: number): void {
    if (!element) return;

    const key = `pulse:${className}`;
    this.disposables.cancel(key);
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);

    const clearTimer = this.disposables.timeout(() => void this.disposables.cancel(key), durationMs);
    this.disposables.replace(key, () => {
      void clearTimer();
      element.classList.remove(className);
    });
  }
}
